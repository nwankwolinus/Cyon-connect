import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PUT } from "@/app/api/membership-applications/draft/route";

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

beforeEach(() => {
  process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
  mocks.getVerifiedApplicant.mockResolvedValue({
    id: "verified-owner",
    email: "owner@example.test",
  });
  mocks.saveDraft.mockResolvedValue({
    kind: "saved",
    result: {
      draftId: "draft-id",
      activeStep: 2,
      updatedAt: "2026-11-12T10:00:00.000Z",
      lastActivityAt: "2026-11-12T10:00:00.000Z",
      expiresAt: "2026-12-12T10:00:00.000Z",
    },
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
    expect(mocks.saveDraft).not.toHaveBeenCalled();
  });

  it("returns conflict rather than overwriting when an application is already open", async () => {
    mocks.saveDraft.mockResolvedValueOnce({ kind: "application_open" });
    const response = await PUT(request({ payload: {}, activeStep: 0, expectedUpdatedAt: null }));
    expect(response.status).toBe(409);
  });
});
