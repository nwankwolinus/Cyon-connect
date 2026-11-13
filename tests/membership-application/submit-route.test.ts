import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/membership-applications/submit/route";

const mocks = vi.hoisted(() => ({
  getVerifiedApplicant: vi.fn(),
  assessMembershipSubmissionEligibility: vi.fn(),
  submitMembershipApplication: vi.fn(),
}));

vi.mock("@/modules/applicant-auth/composition", () => ({
  getVerifiedApplicant: mocks.getVerifiedApplicant,
  assessMembershipSubmissionEligibility: mocks.assessMembershipSubmissionEligibility,
}));
vi.mock("@/modules/membership-application/composition", () => ({
  submitMembershipApplication: mocks.submitMembershipApplication,
}));

function post(body: unknown, headers: Record<string, string> = {}) {
  return new Request("http://localhost:3000/api/membership-applications/submit", {
    method: "POST",
    headers: {
      origin: "http://localhost:3000",
      "content-type": "application/json",
      "idempotency-key": "63d7d3b6-2d7a-42de-a0e4-8d099aa33c12",
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
  mocks.getVerifiedApplicant.mockResolvedValue({
    id: "verified-user-id",
    email: "verified@example.test",
  });
  mocks.assessMembershipSubmissionEligibility.mockReturnValue("eligible");
  mocks.submitMembershipApplication.mockResolvedValue({
    kind: "submitted",
    result: {
      applicationId: "id",
      applicationReference: "reference",
      status: "submitted",
      replay: false,
    },
  });
});

afterEach(() => vi.clearAllMocks());

describe("membership application submission route", () => {
  it("requires same-origin and a verified applicant identity", async () => {
    const crossOrigin = await POST(
      post(
        {
          draft: { dateOfBirth: "2000-01-01" },
          passportPhotoId: "9c98d5f5-7e65-4cc3-a333-7bfbec7aa1c5",
        },
        { origin: "https://attacker.test" },
      ),
    );
    expect(crossOrigin.status).toBe(403);
    mocks.getVerifiedApplicant.mockResolvedValueOnce(null);
    const unauthenticated = await POST(
      post({
        draft: { dateOfBirth: "2000-01-01" },
        passportPhotoId: "9c98d5f5-7e65-4cc3-a333-7bfbec7aa1c5",
      }),
    );
    expect(unauthenticated.status).toBe(401);
    expect(mocks.submitMembershipApplication).not.toHaveBeenCalled();
  });

  it.each(["ineligible", "guardian_consent_required"] as const)(
    "does not persist when eligibility is %s",
    async (eligibility) => {
      mocks.assessMembershipSubmissionEligibility.mockReturnValue(eligibility);
      const response = await POST(
        post({
          draft: { dateOfBirth: "2008-01-01" },
          passportPhotoId: "9c98d5f5-7e65-4cc3-a333-7bfbec7aa1c5",
        }),
      );
      expect(response.status).toBe(422);
      expect(mocks.submitMembershipApplication).not.toHaveBeenCalled();
    },
  );

  it("derives owner/email from the verified session and returns only the committed reference", async () => {
    const response = await POST(
      post({
        draft: { firstName: "Synthetic", dateOfBirth: "2000-01-01" },
        passportPhotoId: "9c98d5f5-7e65-4cc3-a333-7bfbec7aa1c5",
      }),
    );
    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({
      applicationReference: "reference",
      status: "submitted",
    });
    expect(mocks.submitMembershipApplication).toHaveBeenCalledWith(
      expect.objectContaining({
        applicantAuthId: "verified-user-id",
        verifiedEmail: "verified@example.test",
        idempotencyKey: "63d7d3b6-2d7a-42de-a0e4-8d099aa33c12",
        passportPhotoId: "9c98d5f5-7e65-4cc3-a333-7bfbec7aa1c5",
      }),
    );
  });

  it("does not accept caller-supplied ownership fields", async () => {
    const response = await POST(
      post({
        draft: { dateOfBirth: "2000-01-01" },
        passportPhotoId: "9c98d5f5-7e65-4cc3-a333-7bfbec7aa1c5",
        applicantId: "forged",
        parishId: "forged",
      }),
    );
    expect(response.status).toBe(400);
    expect(mocks.submitMembershipApplication).not.toHaveBeenCalled();
  });

  it("does not expose a persistence error as success", async () => {
    mocks.submitMembershipApplication.mockResolvedValueOnce({ kind: "unavailable" });
    const response = await POST(
      post({
        draft: { dateOfBirth: "2000-01-01" },
        passportPhotoId: "9c98d5f5-7e65-4cc3-a333-7bfbec7aa1c5",
      }),
    );
    expect(response.status).toBe(503);
    expect(await response.json()).not.toHaveProperty("applicationReference");
  });

  it("rejects a submission with no applicant photo reference before persistence", async () => {
    const response = await POST(post({ draft: { dateOfBirth: "2000-01-01" } }));
    expect(response.status).toBe(400);
    expect(mocks.submitMembershipApplication).not.toHaveBeenCalled();
  });
});
