import sharp, { type Metadata } from "sharp";

export type InputImageFormat = "jpeg" | "png" | "webp";
export type OutputMimeType = "image/webp";

export interface SanitizedImageResult {
  format: "webp";
  inputFormat: InputImageFormat;
  mimeType: OutputMimeType;
  strippedBuffer: Buffer;
  dataUrl: string;
  width: number;
  height: number;
  originalBytes: number;
  sanitizedBytes: number;
  metadataStripped: boolean;
}

export const MAX_INPUT_BYTES = 2 * 1024 * 1024; // 2 MB upload limit
export const MAX_IMAGE_WIDTH = 4096;
export const MAX_IMAGE_HEIGHT = 4096;
export const MAX_DECODED_PIXELS = 16_000_000; // 16 MP limit against pixel bombs
export const THUMBNAIL_MAX_DIMENSION = 640;
export const MAX_FIRESTORE_THUMBNAIL_BYTES = 56 * 1024; // Keeps base64 dataUrl under 80 KB Firestore bound

export function detectImageFormat(buf: Buffer): InputImageFormat | null {
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

function hasAnimatedContainerMarkers(
  buf: Buffer,
  format: InputImageFormat
): boolean {
  if (format === "webp") {
    let offset = 12;
    while (offset + 8 <= buf.length) {
      const fourCc = buf.subarray(offset, offset + 4).toString("ascii");
      const size = buf.readUInt32LE(offset + 4);
      if (fourCc === "ANIM" || fourCc === "ANMF") {
        return true;
      }
      if (fourCc === "VP8X" && offset + 12 <= buf.length) {
        const flags = buf[offset + 8];
        if ((flags & 0x02) !== 0) return true; // WebP Animation bit
      }
      const padded = size + (size % 2);
      if (padded < 0 || offset + 8 + padded > buf.length) break;
      offset += 8 + padded;
    }
  } else if (format === "png") {
    let offset = 8;
    while (offset + 12 <= buf.length) {
      const length = buf.readUInt32BE(offset);
      const type = buf.subarray(offset + 4, offset + 8).toString("ascii");
      if (type === "acTL") {
        return true; // Animated PNG chunk
      }
      if (offset + 12 + length > buf.length) break;
      offset += 12 + length;
      if (type === "IEND") break;
    }
  }
  return false;
}

function detectPolyglotTrailer(buf: Buffer, format: InputImageFormat): void {
  if (format === "png") {
    let offset = 8;
    while (offset + 12 <= buf.length) {
      const length = buf.readUInt32BE(offset);
      const type = buf.subarray(offset + 4, offset + 8).toString("ascii");
      const end = offset + 12 + length;
      if (end > buf.length) {
        throw new Error("Malformed PNG chunk structure.");
      }
      offset = end;
      if (type === "IEND") {
        if (buf.length - offset > 0) {
          throw new Error(
            "Polyglot or trailing data detected after PNG image end."
          );
        }
        return;
      }
    }
    throw new Error("Malformed PNG stream missing IEND terminator.");
  }

  if (format === "webp") {
    const riffPayloadSize = buf.readUInt32LE(4);
    const expectedTotal = 8 + riffPayloadSize + (riffPayloadSize % 2);
    if (expectedTotal < 12 || expectedTotal > buf.length) {
      throw new Error("Malformed WebP RIFF container size.");
    }
    if (buf.length - expectedTotal > 0) {
      throw new Error(
        "Polyglot or trailing data detected after WebP container."
      );
    }
  }
}

export async function verifyAndSanitizeImage(
  base64OrDataUrl: string
): Promise<SanitizedImageResult> {
  const trimmed = base64OrDataUrl.trim();
  if (trimmed.includes(",")) {
    const prefix = trimmed.slice(0, trimmed.indexOf(",")).toLowerCase();
    if (!/^data:image\/(jpeg|jpg|png|webp);base64$/.test(prefix)) {
      throw new Error(
        "Invalid image data URL header. Only JPEG, PNG, and WebP base64 images are permitted."
      );
    }
  }

  const rawPayload = trimmed.includes(",")
    ? trimmed.slice(trimmed.indexOf(",") + 1)
    : trimmed;

  const cleanBase64 = rawPayload.replace(/\s+/g, "");
  if (
    !cleanBase64 ||
    cleanBase64.length % 4 === 1 ||
    !/^[A-Za-z0-9+/=]+$/.test(cleanBase64)
  ) {
    throw new Error("Invalid base64 image encoding.");
  }

  const buf = Buffer.from(cleanBase64, "base64");
  if (buf.length === 0 || buf.length > MAX_INPUT_BYTES) {
    throw new Error("Image must be between 1 byte and 2 MB.");
  }

  const detectedFormat = detectImageFormat(buf);
  if (!detectedFormat) {
    throw new Error(
      "Unsupported file signature. Only verified JPEG, PNG, and WebP images are permitted."
    );
  }

  detectPolyglotTrailer(buf, detectedFormat);

  if (hasAnimatedContainerMarkers(buf, detectedFormat)) {
    throw new Error("Animated images are not permitted.");
  }

  const probe = sharp(buf, {
    limitInputPixels: MAX_DECODED_PIXELS,
    failOn: "error",
    animated: true,
  });

  let metadata: Metadata;
  try {
    metadata = await probe.metadata();
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Decode error";
    if (msg.toLowerCase().includes("pixel limit")) {
      throw new Error(
        `Image exceeds maximum decoded pixel count (${MAX_DECODED_PIXELS.toLocaleString()} pixels).`,
        { cause: err }
      );
    }
    throw new Error("Image failed binary decoding validation.", { cause: err });
  }

  if (
    metadata.format !== "jpeg" &&
    metadata.format !== "png" &&
    metadata.format !== "webp"
  ) {
    throw new Error(
      "Decoded image format is unsupported. Only JPEG, PNG, and WebP are permitted."
    );
  }

  if ((metadata.pages ?? 1) > 1) {
    throw new Error("Animated images are not permitted.");
  }

  const origWidth = metadata.width ?? 0;
  const origHeight = metadata.height ?? 0;
  if (origWidth <= 0 || origHeight <= 0) {
    throw new Error("Decoded image dimensions are invalid.");
  }
  if (origWidth > MAX_IMAGE_WIDTH || origHeight > MAX_IMAGE_HEIGHT) {
    throw new Error(
      `Image dimensions (${origWidth}x${origHeight}) exceed maximum ${MAX_IMAGE_WIDTH}x${MAX_IMAGE_HEIGHT} px.`
    );
  }
  if (origWidth * origHeight > MAX_DECODED_PIXELS) {
    throw new Error(
      `Image exceeds maximum decoded pixel count (${MAX_DECODED_PIXELS.toLocaleString()} pixels).`
    );
  }

  const encodePlans = [
    { maxDim: THUMBNAIL_MAX_DIMENSION, quality: 78 },
    { maxDim: THUMBNAIL_MAX_DIMENSION, quality: 64 },
    { maxDim: 480, quality: 58 },
    { maxDim: 360, quality: 52 },
  ];

  let finalBuffer: Buffer | null = null;
  let finalWidth = origWidth;
  let finalHeight = origHeight;

  for (const plan of encodePlans) {
    const rendered = await sharp(buf, {
      limitInputPixels: MAX_DECODED_PIXELS,
      failOn: "error",
    })
      .rotate() // Applies EXIF orientation before stripping all metadata
      .resize({
        width: plan.maxDim,
        height: plan.maxDim,
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: plan.quality, effort: 4 }) // Re-encodes cleanly; drops EXIF/GPS/XMP/IPTC/ICC by default
      .toBuffer({ resolveWithObject: true });

    if (rendered.data.length <= MAX_FIRESTORE_THUMBNAIL_BYTES) {
      finalBuffer = rendered.data;
      finalWidth = rendered.info.width;
      finalHeight = rendered.info.height;
      break;
    }
  }

  if (!finalBuffer) {
    throw new Error(
      "Re-encoded thumbnail exceeds 56 KB compact storage limit. Please upload a smaller image."
    );
  }

  const mimeType: OutputMimeType = "image/webp";
  const dataUrl = `data:${mimeType};base64,${finalBuffer.toString("base64")}`;

  return {
    format: "webp",
    inputFormat: metadata.format,
    mimeType,
    strippedBuffer: finalBuffer,
    dataUrl,
    width: finalWidth,
    height: finalHeight,
    originalBytes: buf.length,
    sanitizedBytes: finalBuffer.length,
    metadataStripped: true,
  };
}
