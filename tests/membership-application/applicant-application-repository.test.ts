import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSupabaseApplicantApplicationRepository } from "@/modules/membership-application/infrastructure/supabase-applicant-application-repository";

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));

vi.mock("@/infrastructure/supabase/admin", () => ({
  createAdminSupabaseClient: () => ({ rpc: mocks.rpc }),
}));

const lookup = {
  applicantAuthId: "ae144743-9fd1-43bb-bbaf-3b3128bf113e",
  parishId: "3f1937e0-5f82-44d9-b919-7189649763b2",
  correlationId: "0fbf3fd7-f4ba-4e4b-bffc-eeb12768fba0",
};

const emptyOverview = {
  application: null,
  draft: null,
  expiredDraftDisposed: false,
};

const savedDraftOverview = {
  application: null,
  draft: {
    id: "f4b1ff7c-e169-4adb-b4c4-6bc7fa2837a4",
    lastActivityAt: "2026-11-17T09:00:00.000Z",
    expiresAt: "2026-12-17T09:00:00.000Z",
    activeStep: 4,
  },
  expiredDraftDisposed: false,
};

const submittedApplicationOverview = {
  application: {
    id: "b4be66ba-3d72-4655-9d13-1db8478ad8d8",
    reference: "d5e8f02c-e6a5-4ff4-9e10-d69be772d8ab",
    status: "submitted",
    submittedAt: "2026-11-17T09:15:00.000Z",
    createdAt: "2026-11-17T09:15:00.000Z",
  },
  draft: null,
  expiredDraftDisposed: false,
};

function rpcResponse(data: unknown) {
  mocks.rpc.mockResolvedValueOnce({ data, error: null });
}

beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.restoreAllMocks());

describe("applicant application overview RPC response validation", () => {
  it("accepts an authenticated applicant with no application and no draft", async () => {
    rpcResponse(emptyOverview);

    await expect(
      createSupabaseApplicantApplicationRepository().getOverview(lookup),
    ).resolves.toEqual(emptyOverview);
    expect(mocks.rpc).toHaveBeenCalledWith("get_my_membership_application_overview", {
      p_applicant_auth_id: lookup.applicantAuthId,
      p_org_unit_id: lookup.parishId,
      p_correlation_id: lookup.correlationId,
    });
  });

  it("accepts a valid saved-draft overview", async () => {
    rpcResponse(savedDraftOverview);

    await expect(
      createSupabaseApplicantApplicationRepository().getOverview(lookup),
    ).resolves.toEqual(savedDraftOverview);
  });

  it("accepts a valid submitted-application overview", async () => {
    rpcResponse(submittedApplicationOverview);

    await expect(
      createSupabaseApplicantApplicationRepository().getOverview(lookup),
    ).resolves.toEqual(submittedApplicationOverview);
  });

  it.each([
    ["missing top-level field", { application: null, draft: null }],
    ["missing application property", { ...emptyOverview, application: { id: "missing" } }],
    ["invalid nullable application", { ...emptyOverview, application: "none" }],
    ["invalid nullable draft", { ...emptyOverview, draft: false }],
    [
      "invalid active-step type",
      { ...savedDraftOverview, draft: { ...savedDraftOverview.draft, activeStep: "4" } },
    ],
    ["unexpected overview field", { ...emptyOverview, privateApplicantData: "must not be logged" }],
    [
      "unexpected application status",
      {
        ...submittedApplicationOverview,
        application: { ...submittedApplicationOverview.application, status: "draft" },
      },
    ],
  ])("rejects %s as an unavailable result", async (_name, malformed) => {
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => undefined);
    rpcResponse(malformed);

    await expect(
      createSupabaseApplicantApplicationRepository().getOverview(lookup),
    ).rejects.toThrow("application_unavailable");
    expect(errorLog).toHaveBeenCalledOnce();
    expect(errorLog.mock.calls.flat().join(" ")).not.toContain("must not be logged");
  });
});
