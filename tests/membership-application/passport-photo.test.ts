import { describe, expect, it } from "vitest";
import sharp from "sharp";
import {
  normalizePassportPhoto,
  passportPhotoLimits,
} from "@/modules/membership-application/infrastructure/passport-photo";

describe("passport photograph validation", () => {
  it("decodes supported actual image content and normalizes to JPEG", async () => {
    const png = await sharp({
      create: { width: 320, height: 420, channels: 3, background: { r: 30, g: 60, b: 90 } },
    })
      .png()
      .toBuffer();
    const normalized = await normalizePassportPhoto(png);
    expect((await sharp(normalized).metadata()).format).toBe("jpeg");
    expect(passportPhotoLimits.acceptedFormats).toEqual(["jpeg", "png", "webp"]);
    expect(passportPhotoLimits.maxUploadBytes).toBe(5 * 1024 * 1024);
  });

  it("rejects spoofed MIME-like content, corrupt images and oversize input", async () => {
    await expect(normalizePassportPhoto(Buffer.from("not an image"))).rejects.toThrow(
      "photo_invalid",
    );
    await expect(normalizePassportPhoto(Buffer.alloc(5 * 1024 * 1024 + 1))).rejects.toThrow(
      "photo_invalid",
    );
  });
});
