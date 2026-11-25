import {
  Router,
  type Request,
  type RequestHandler,
  type Response,
} from "express";
import { z } from "zod";
import { verifyAndSanitizeImage } from "../utils/imageSanitizer.ts";

const UploadPhotoSchema = z.object({
  imageDataUrl: z.string().min(20).max(3_200_000),
});

export function createUploadRouter(params: {
  verifyTokenFn: (
    authHeader?: string
  ) => Promise<{ uid: string; email_verified?: boolean } | null>;
  apiLimiter: RequestHandler;
}): Router {
  const { verifyTokenFn, apiLimiter } = params;
  const router = Router();

  // Protected route: verifies Firebase ID token, binary-decodes via sharp, strips EXIF/GPS & re-encodes to WebP
  router.post("/", apiLimiter, async (req: Request, res: Response) => {
    const decoded = await verifyTokenFn(req.headers.authorization);
    if (!decoded) {
      res.status(401).json({
        error:
          "Authentication required. Please sign in with Google to attach a photo.",
      });
      return;
    }
    if (decoded.email_verified !== true) {
      res.status(403).json({
        error:
          "A verified email account is required to upload observation photos.",
      });
      return;
    }

    const parsed = UploadPhotoSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: "Invalid photo upload payload.",
      });
      return;
    }

    try {
      const sanitized = await verifyAndSanitizeImage(parsed.data.imageDataUrl);
      res.json({
        photoDataUrl: sanitized.dataUrl,
        format: sanitized.format,
        mimeType: sanitized.mimeType,
        width: sanitized.width,
        height: sanitized.height,
        sanitizedBytes: sanitized.sanitizedBytes,
        metadataStripped: sanitized.metadataStripped,
      });
    } catch (err) {
      res.status(400).json({
        error:
          err instanceof Error
            ? err.message
            : "Photo failed binary safety validation.",
      });
    }
  });

  return router;
}
