import { describe, expect, it } from "vitest";
import sharp from "sharp";
import {
  normalizePassportPhoto,
  passportPhotoLimits,
} from "@/modules/membership-application/infrastructure/passport-photo";

async function validJpegExactly(size: number): Promise<Buffer> {
  const jpeg = await sharp({
    create: { width: 320, height: 420, channels: 3, background: { r: 30, g: 60, b: 90 } },
  })
    .jpeg()
    .toBuffer();
  const scanIndex = jpeg.indexOf(Buffer.from([0xff, 0xda]));
  if (scanIndex < 0) throw new Error("synthetic_jpeg_invalid");

  const extraBytes = size - jpeg.byteLength;
  const segmentCount = Math.ceil(extraBytes / 65_537);
  let remainingPayloadBytes = extraBytes - segmentCount * 4;
  const comments: Buffer[] = [];
  for (let index = 0; index < segmentCount; index += 1) {
    const payloadBytes = Math.min(65_533, remainingPayloadBytes);
    remainingPayloadBytes -= payloadBytes;
    const segment = Buffer.alloc(payloadBytes + 4);
    segment[0] = 0xff;
    segment[1] = 0xfe;
    segment.writeUInt16BE(payloadBytes + 2, 2);
    comments.push(segment);
  }
  if (remainingPayloadBytes !== 0) throw new Error("synthetic_jpeg_padding_invalid");
  return Buffer.concat([jpeg.subarray(0, scanIndex), ...comments, jpeg.subarray(scanIndex)]);
}

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
    expect(passportPhotoLimits.maxUploadBytes).toBe(4_194_304);
  });

  it("accepts a valid JPEG exactly at the 4 MiB input limit", async () => {
    const input = await validJpegExactly(4_194_304);
    expect(input.byteLength).toBe(4_194_304);
    const normalized = await normalizePassportPhoto(input);
    expect((await sharp(normalized).metadata()).format).toBe("jpeg");
  });

  it("rejects spoofed MIME-like content, corrupt images and input above 4 MiB", async () => {
    await expect(normalizePassportPhoto(Buffer.from("not an image"))).rejects.toThrow(
      "photo_invalid",
    );
    await expect(normalizePassportPhoto(Buffer.alloc(4_194_305))).rejects.toThrow("photo_invalid");
  });
});
