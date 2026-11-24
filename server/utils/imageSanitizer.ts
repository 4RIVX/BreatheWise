export type VerifiedImageFormat = "jpeg" | "png" | "webp";

export interface SanitizedImageResult {
  format: VerifiedImageFormat;
  mimeType: "image/jpeg" | "image/png" | "image/webp";
  strippedBuffer: Buffer;
  dataUrl: string;
  originalBytes: number;
  sanitizedBytes: number;
  metadataStripped: boolean;
}

const MAX_INPUT_BYTES = 2 * 1024 * 1024; // 2 MB upload limit
const MAX_FIRESTORE_THUMBNAIL_BYTES = 56 * 1024; // Keeps base64 dataUrl under 80KB Firestore bound

export function detectImageFormat(buf: Buffer): VerifiedImageFormat | null {
  if (buf.length < 12) return null;

  // JPEG magic: FF D8 FF
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return "jpeg";
  }

  // PNG magic: 89 50 4E 47 0D 0A 1A 0A
  if (
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47 &&
    buf[4] === 0x0d &&
    buf[5] === 0x0a &&
    buf[6] === 0x1a &&
    buf[7] === 0x0a
  ) {
    return "png";
  }

  // WebP magic: RIFF....WEBP
  if (
    buf.subarray(0, 4).toString("ascii") === "RIFF" &&
    buf.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return "webp";
  }

  return null;
}

/**
 * Strips APP1 (EXIF/GPS/XMP), APP13 (IPTC), and COM (Comment) segments from JPEG binaries.
 */
export function stripJpegMetadata(buf: Buffer): {
  buffer: Buffer;
  stripped: boolean;
} {
  if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) {
    throw new Error("Invalid JPEG binary stream.");
  }

  const chunks: Buffer[] = [buf.subarray(0, 2)]; // SOI
  let offset = 2;
  let stripped = false;

  while (offset < buf.length) {
    if (buf[offset] !== 0xff) {
      throw new Error("Malformed JPEG marker structure.");
    }

    // Skip fill bytes 0xFF
    while (offset < buf.length && buf[offset] === 0xff) {
      offset += 1;
    }
    if (offset >= buf.length) break;

    const marker = buf[offset];
    offset += 1;

    // SOS (Start of Scan, 0xDA) or EOI (0xD9): copy remainder of compressed scan data
    if (marker === 0xda) {
      chunks.push(Buffer.from([0xff, marker]));
      chunks.push(buf.subarray(offset));
      break;
    }
    if (marker === 0xd9) {
      chunks.push(Buffer.from([0xff, marker]));
      break;
    }

    // Standalone markers without length
    if (
      marker === 0x00 ||
      marker === 0x01 ||
      (marker >= 0xd0 && marker <= 0xd7)
    ) {
      chunks.push(Buffer.from([0xff, marker]));
      continue;
    }

    if (offset + 2 > buf.length) {
      throw new Error("Truncated JPEG segment length.");
    }
    const segLen = buf.readUInt16BE(offset);
    if (segLen < 2 || offset + segLen > buf.length) {
      throw new Error("Invalid JPEG segment length.");
    }

    // Strip APP1 (EXIF/GPS/XMP = 0xE1), APP2-APP13 metadata (0xE2-0xED except ICC? keep APP0 JFIF & APP14 Adobe), COM (0xFE)
    const shouldStrip =
      marker === 0xe1 || (marker >= 0xe3 && marker <= 0xed) || marker === 0xfe;

    if (shouldStrip) {
      stripped = true;
    } else {
      chunks.push(Buffer.from([0xff, marker]));
      chunks.push(buf.subarray(offset, offset + segLen));
    }

    offset += segLen;
  }

  return { buffer: Buffer.concat(chunks), stripped };
}

/**
 * Strips eXIf, tEXt, zTXt, iTXt, tIME chunks from PNG binaries while preserving image & IHDR/IDAT/IEND.
 */
export function stripPngMetadata(buf: Buffer): {
  buffer: Buffer;
  stripped: boolean;
} {
  const sig = buf.subarray(0, 8);
  const chunks: Buffer[] = [sig];
  let offset = 8;
  let stripped = false;
  const METADATA_CHUNKS = new Set(["eXIf", "tEXt", "zTXt", "iTXt", "tIME"]);

  while (offset + 12 <= buf.length) {
    const length = buf.readUInt32BE(offset);
    const type = buf.subarray(offset + 4, offset + 8).toString("ascii");
    const totalChunkSize = 12 + length;

    if (offset + totalChunkSize > buf.length) {
      throw new Error("Truncated PNG chunk.");
    }

    if (METADATA_CHUNKS.has(type)) {
      stripped = true;
    } else {
      chunks.push(buf.subarray(offset, offset + totalChunkSize));
    }

    offset += totalChunkSize;
    if (type === "IEND") break;
  }

  return { buffer: Buffer.concat(chunks), stripped };
}

/**
 * Strips EXIF and XMP RIFF chunks from WebP binaries and updates RIFF container length.
 */
export function stripWebpMetadata(buf: Buffer): {
  buffer: Buffer;
  stripped: boolean;
} {
  const chunks: Buffer[] = [];
  let offset = 12;
  let stripped = false;
  const STRIP_CHUNKS = new Set(["EXIF", "XMP "]);

  while (offset + 8 <= buf.length) {
    const fourCc = buf.subarray(offset, offset + 4).toString("ascii");
    const chunkSize = buf.readUInt32LE(offset + 4);
    const paddedSize = chunkSize + (chunkSize % 2);
    const end = offset + 8 + paddedSize;

    if (end > buf.length) {
      throw new Error("Truncated WebP chunk.");
    }

    if (STRIP_CHUNKS.has(fourCc)) {
      stripped = true;
    } else {
      chunks.push(buf.subarray(offset, end));
    }
    offset = end;
  }

  const body = Buffer.concat(chunks);
  const header = Buffer.alloc(12);
  header.write("RIFF", 0, "ascii");
  header.writeUInt32LE(4 + body.length, 4);
  header.write("WEBP", 8, "ascii");
  return { buffer: Buffer.concat([header, body]), stripped };
}

export function verifyAndSanitizeImage(
  base64OrDataUrl: string
): SanitizedImageResult {
  const rawPayload = base64OrDataUrl.includes(",")
    ? base64OrDataUrl.slice(base64OrDataUrl.indexOf(",") + 1)
    : base64OrDataUrl;

  const cleanBase64 = rawPayload.replace(/\s+/g, "");
  if (!/^[A-Za-z0-9+/=]+$/.test(cleanBase64)) {
    throw new Error("Invalid base64 image encoding.");
  }

  const buf = Buffer.from(cleanBase64, "base64");
  if (buf.length === 0 || buf.length > MAX_INPUT_BYTES) {
    throw new Error("Image must be between 1 byte and 2 MB.");
  }

  const format = detectImageFormat(buf);
  if (!format) {
    throw new Error(
      "Unsupported file signature. Only verified JPEG, PNG, and WebP images are permitted."
    );
  }

  let strippedResult: { buffer: Buffer; stripped: boolean };
  if (format === "jpeg") {
    strippedResult = stripJpegMetadata(buf);
  } else if (format === "png") {
    strippedResult = stripPngMetadata(buf);
  } else {
    strippedResult = stripWebpMetadata(buf);
  }

  if (strippedResult.buffer.length > MAX_FIRESTORE_THUMBNAIL_BYTES) {
    throw new Error(
      "Sanitized image exceeds 56 KB compact storage limit. Please resize or compress the photo before uploading."
    );
  }

  const mimeType =
    format === "jpeg"
      ? "image/jpeg"
      : format === "png"
        ? "image/png"
        : "image/webp";

  const dataUrl = `data:${mimeType};base64,${strippedResult.buffer.toString("base64")}`;

  return {
    format,
    mimeType,
    strippedBuffer: strippedResult.buffer,
    dataUrl,
    originalBytes: buf.length,
    sanitizedBytes: strippedResult.buffer.length,
    metadataStripped: strippedResult.stripped,
  };
}
