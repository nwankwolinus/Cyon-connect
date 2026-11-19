import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getVerifiedApplicant: vi.fn(),
  isAvailable: vi.fn(),
  upload: vi.fn(),
  read: vi.fn(),
  remove: vi.fn(),
}));

vi.mock("@/modules/applicant-auth/composition", () => ({
  getVerifiedApplicant: mocks.getVerifiedApplicant,
}));
vi.mock("@/modules/membership-application/composition", () => ({
  isMembershipApplicationSubmissionAvailable: mocks.isAvailable,
}));
vi.mock("@/modules/membership-application/composition-photo", () => ({
  passportPhotoLimits: {
    maxUploadBytes: 4 * 1024 * 1024,
  },
  uploadApplicantPassportPhoto: mocks.upload,
  readApplicantPassportPhoto: mocks.read,
  removeApplicantPassportPhoto: mocks.remove,
}));

import { PUT } from "@/app/api/membership-applications/photo/route";

const url = "http://localhost:3000/api/membership-applications/photo";
const draftId = "8c2f75f3-b61b-4a2c-bf88-1fe5a6ab8946";
const maxPhotoBytes = 4_194_304;
const maxMultipartBytes = 4_210_688;

function multipartRequest(file: File) {
  const form = new FormData();
  form.set("draftId", draftId);
  form.set("file", file);
  return new Request(url, {
    method: "PUT",
    headers: { origin: "http://localhost:3000" },
    body: form,
  });
}

function streamedRequest(chunks: Uint8Array[]) {
  let index = 0;
  let canceled = false;
  const body = new ReadableStream<Uint8Array>(
    {
      pull(controller) {
        if (index < chunks.length) controller.enqueue(chunks[index++]!);
        else controller.close();
      },
      cancel() {
        canceled = true;
      },
    },
    { highWaterMark: 0 },
  );
  return {
    request: new Request(url, {
      method: "PUT",
      headers: {
        origin: "http://localhost:3000",
        "content-type": "multipart/form-data; boundary=synthetic",
      },
      body,
      duplex: "half",
    } as RequestInit),
    canceled: () => canceled,
  };
}

beforeEach(() => {
  process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
  mocks.getVerifiedApplicant.mockResolvedValue({
    id: "verified-applicant",
    email: "a@example.test",
  });
  mocks.isAvailable.mockResolvedValue(true);
  mocks.upload.mockResolvedValue({ photoId: "photo-id" });
});

afterEach(() => vi.clearAllMocks());

describe("membership passport-photo upload route size boundary", () => {
  it("accepts a 4 MiB file and passes its bytes to the upload service", async () => {
    const file = new File([Buffer.alloc(maxPhotoBytes)], "synthetic.jpg", { type: "image/jpeg" });
    const response = await PUT(multipartRequest(file));
    expect(response.status).toBe(200);
    expect(mocks.upload).toHaveBeenCalledOnce();
    expect(mocks.upload.mock.calls[0]?.[0].bytes.byteLength).toBe(maxPhotoBytes);
  });

  it("rejects a file one byte above 4 MiB", async () => {
    const file = new File([Buffer.alloc(maxPhotoBytes + 1)], "synthetic.jpg", {
      type: "image/jpeg",
    });
    const response = await PUT(multipartRequest(file));
    expect(response.status).toBe(413);
    expect(await response.json()).toEqual({ message: "Choose an image no larger than 4 MiB." });
    expect(mocks.upload).not.toHaveBeenCalled();
  });

  it("rejects and cancels a multipart stream over 4,210,688 bytes", async () => {
    expect(maxPhotoBytes + 16_384).toBe(maxMultipartBytes);
    const body = streamedRequest([new Uint8Array(maxMultipartBytes), new Uint8Array(1)]);
    const response = await PUT(body.request);
    expect(response.status).toBe(413);
    expect(body.canceled()).toBe(true);
    expect(mocks.upload).not.toHaveBeenCalled();
  });

  it("keeps origin, authenticated-applicant and intake checks in front of uploads", async () => {
    const file = new File([Buffer.from("synthetic")], "synthetic.jpg", { type: "image/jpeg" });
    const crossOrigin = new Request(url, {
      method: "PUT",
      headers: { origin: "https://attacker.test" },
      body: new FormData(),
    });
    expect((await PUT(crossOrigin)).status).toBe(403);

    mocks.getVerifiedApplicant.mockResolvedValueOnce(null);
    expect((await PUT(multipartRequest(file))).status).toBe(401);

    mocks.isAvailable.mockResolvedValueOnce(false);
    expect((await PUT(multipartRequest(file))).status).toBe(503);
    expect(mocks.upload).not.toHaveBeenCalled();
  });
});
