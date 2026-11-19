import "server-only";
import sharp from "sharp";

export const passportPhotoLimits = {
  maxUploadBytes: 4 * 1024 * 1024,
  minWidth: 300,
  minHeight: 300,
  maxWidth: 6000,
  maxHeight: 6000,
  maxPixels: 36_000_000,
  acceptedFormats: ["jpeg", "png", "webp"] as const,
} as const;

/** Decode, validate and normalize bytes; never trust the filename or browser MIME type. */
export async function normalizePassportPhoto(input: Buffer): Promise<Buffer> {
  if (input.byteLength === 0 || input.byteLength > passportPhotoLimits.maxUploadBytes) {
    throw new Error("photo_invalid");
  }
  try {
    const source = sharp(input, {
      failOn: "error",
      limitInputPixels: passportPhotoLimits.maxPixels,
      animated: true,
    });
    const metadata = await source.metadata();
    if (
      !metadata.format ||
      !passportPhotoLimits.acceptedFormats.includes(
        metadata.format as (typeof passportPhotoLimits.acceptedFormats)[number],
      ) ||
      !metadata.width ||
      !metadata.height ||
      metadata.width < passportPhotoLimits.minWidth ||
      metadata.height < passportPhotoLimits.minHeight ||
      metadata.width > passportPhotoLimits.maxWidth ||
      metadata.height > passportPhotoLimits.maxHeight ||
      metadata.width * metadata.height > passportPhotoLimits.maxPixels ||
      (metadata.pages ?? 1) !== 1
    ) {
      throw new Error("photo_invalid");
    }
    const normalized = await source.rotate().jpeg({ quality: 85, mozjpeg: true }).toBuffer();
    if (normalized.byteLength > passportPhotoLimits.maxUploadBytes) {
      throw new Error("photo_invalid");
    }
    return normalized;
  } catch {
    throw new Error("photo_invalid");
  }
}
