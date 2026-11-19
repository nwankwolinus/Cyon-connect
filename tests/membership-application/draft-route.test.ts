import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PUT } from "@/app/api/membership-applications/draft/route";
import { membershipApplicationDraftPayloadSchema } from "@/modules/membership-application/domain/draft";

const mocks = vi.hoisted(() => ({ getVerifiedApplicant: vi.fn(), saveDraft: vi.fn() }));
vi.mock("@/modules/applicant-auth/composition", () => ({
  getVerifiedApplicant: mocks.getVerifiedApplicant,
}));
vi.mock("@/modules/membership-application/composition", () => ({
  saveMembershipApplicationDraft: mocks.saveDraft,
}));

function request(body: unknown, origin = "http://localhost:3000") {
  return new Request("http://localhost:3000/api/membership-applications/draft", {
    method: "PUT",
    headers: { origin, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function streamedRequest(chunks: Uint8Array[], contentLength?: string) {
  let index = 0;
  let canceled = false;
  const stream = new ReadableStream<Uint8Array>(
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
  const headers: Record<string, string> = {
    origin: "http://localhost:3000",
    "content-type": "application/json",
  };
  if (contentLength !== undefined) headers["content-length"] = contentLength;
  return {
    request: new Request("http://localhost:3000/api/membership-applications/draft", {
      method: "PUT",
      headers,
      body: stream,
      duplex: "half",
    } as RequestInit),
    canceled: () => canceled,
  };
}

beforeEach(() => {
  process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
  mocks.getVerifiedApplicant.mockResolvedValue({
    id: "verified-owner",
    email: "owner@example.test",
  });
  mocks.saveDraft.mockImplementation(async (input) => {
    if (!membershipApplicationDraftPayloadSchema.safeParse(input.payload).success) {
      return { kind: "invalid" };
    }
    return {
      kind: "saved",
      result: {
        draftId: "draft-id",
        activeStep: input.activeStep,
        updatedAt: "2026-11-12T10:00:00.000Z",
        lastActivityAt: "2026-11-12T10:00:00.000Z",
        expiresAt: "2026-12-12T10:00:00.000Z",
      },
    };
  });
});
afterEach(() => vi.clearAllMocks());

describe("membership application draft route", () => {
  it("derives ownership from verified session and accepts only same-origin saves", async () => {
    const response = await PUT(
      request({ payload: { firstName: "Ada" }, activeStep: 2, expectedUpdatedAt: null }),
    );
    expect(response.status).toBe(200);
    expect(mocks.saveDraft).toHaveBeenCalledWith({
      applicantAuthId: "verified-owner",
      payload: { firstName: "Ada" },
      activeStep: 2,
      expectedUpdatedAt: null,
    });
    expect(mocks.saveDraft.mock.calls[0]?.[0]).not.toHaveProperty("applicantId");
  });

  it("rejects unauthenticated, forged-identity, DOB-bearing and cross-origin requests", async () => {
    mocks.getVerifiedApplicant.mockResolvedValueOnce(null);
    expect(
      (await PUT(request({ payload: {}, activeStep: 0, expectedUpdatedAt: null }))).status,
    ).toBe(401);
    expect(
      (
        await PUT(
          request({ payload: { applicantId: "forged" }, activeStep: 0, expectedUpdatedAt: null }),
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await PUT(
          request({
            payload: { nested: { dateOfBirth: "2000-01-01" } },
            activeStep: 0,
            expectedUpdatedAt: null,
          }),
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await PUT(
          request({ payload: {}, activeStep: 0, expectedUpdatedAt: null }, "https://attacker.test"),
        )
      ).status,
    ).toBe(403);
    expect(mocks.saveDraft).toHaveBeenCalledTimes(2);
    expect(mocks.saveDraft.mock.calls.map(([input]) => input.applicantAuthId)).toEqual([
      "verified-owner",
      "verified-owner",
    ]);
    expect(mocks.saveDraft.mock.calls.map(([input]) => input.payload)).toEqual([
      { applicantId: "forged" },
      { nested: { dateOfBirth: "2000-01-01" } },
    ]);
  });

  it("returns conflict rather than overwriting when an application is already open", async () => {
    mocks.saveDraft.mockResolvedValueOnce({ kind: "application_open" });
    const response = await PUT(request({ payload: {}, activeStep: 0, expectedUpdatedAt: null }));
    expect(response.status).toBe(409);
  });

  it("rejects oversized streamed data with or without a reliable Content-Length", async () => {
    const chunks = [new Uint8Array(48 * 1024), new Uint8Array(1)];
    const missingLength = streamedRequest(chunks);
    expect((await PUT(missingLength.request)).status).toBe(413);
    expect(missingLength.canceled()).toBe(true);

    const misleadingLength = streamedRequest(chunks, "1");
    expect((await PUT(misleadingLength.request)).status).toBe(413);
    expect(misleadingLength.canceled()).toBe(true);
    expect(mocks.saveDraft).not.toHaveBeenCalled();
  });

  it("returns a client error for malformed JSON and interrupted request streams", async () => {
    const malformed = streamedRequest([new TextEncoder().encode("{")]);
    expect((await PUT(malformed.request)).status).toBe(400);

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("{"));
        controller.error(new Error("synthetic stream interruption"));
      },
    });
    const interrupted = new Request("http://localhost:3000/api/membership-applications/draft", {
      method: "PUT",
      headers: { origin: "http://localhost:3000", "content-type": "application/json" },
      body: stream,
      duplex: "half",
    } as RequestInit);
    expect((await PUT(interrupted)).status).toBe(400);
    expect(mocks.saveDraft).not.toHaveBeenCalled();
  });
});
