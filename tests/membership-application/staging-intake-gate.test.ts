import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  resolveOperationalParish: vi.fn(),
  createSupabaseSubmissionRepository: vi.fn(),
  createSupabaseApplicantApplicationRepository: vi.fn(),
}));

vi.mock("@/infrastructure/organization/operational-parish", () => ({
  resolveOperationalParish: mocks.resolveOperationalParish,
}));
vi.mock("@/modules/membership-application/infrastructure/supabase-submission-repository", () => ({
  createSupabaseSubmissionRepository: mocks.createSupabaseSubmissionRepository,
}));
vi.mock(
  "@/modules/membership-application/infrastructure/supabase-applicant-application-repository",
  () => ({
    createSupabaseApplicantApplicationRepository:
      mocks.createSupabaseApplicantApplicationRepository,
  }),
);
vi.mock("@/modules/membership-application/composition-photo", () => ({
  verifyApplicantPassportPhotoForSubmission: vi.fn(),
}));

import {
  isMembershipApplicationSubmissionAvailable,
  saveMembershipApplicationDraft,
  submitMembershipApplication,
} from "@/modules/membership-application/composition";

const parishId = "3f1937e0-5f82-44d9-b919-7189649763b2";

function configure(
  options: {
    appEnv?: string;
    enabled?: string;
    url?: string;
  } = {},
) {
  process.env.APP_ENV = options.appEnv ?? "staging";
  process.env.MEMBERSHIP_APPLICATION_SUBMISSION_ENABLED = options.enabled ?? "true";
  process.env.CYON_ACTIVE_PARISH_ID = parishId;
  if (options.url === undefined) {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://crfcglxcsnmeovnipnko.supabase.co";
  } else {
    process.env.NEXT_PUBLIC_SUPABASE_URL = options.url;
  }
}

beforeEach(() => {
  vi.stubEnv("NODE_ENV", "test");
  configure();
  mocks.resolveOperationalParish.mockResolvedValue({
    id: parishId,
    type: "parish",
    name: "SS Joachim and Anne Catholic Church, Ijegun",
  });
});

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

describe("membership intake staging gate", () => {
  it("allows staging intake only when explicitly enabled and the target is correct", async () => {
    expect(await isMembershipApplicationSubmissionAvailable()).toBe(true);
    expect(mocks.resolveOperationalParish).toHaveBeenCalledOnce();
  });

  it("keeps membership intake closed when its staging flag is disabled", async () => {
    configure({ enabled: "false" });

    expect(await isMembershipApplicationSubmissionAvailable()).toBe(false);
    expect(mocks.resolveOperationalParish).not.toHaveBeenCalled();
  });

  it.each([
    "https://bpooqfgadtbyeduapwyi.supabase.co",
    "https://another-project.supabase.co",
    "not a url",
    "",
  ])("fails closed before writes for an invalid staging target (%s)", async (url) => {
    configure({ url });

    expect(
      await saveMembershipApplicationDraft({
        applicantAuthId: "synthetic-applicant",
        payload: {},
        activeStep: 0,
        expectedUpdatedAt: null,
      }),
    ).toEqual({ kind: "disabled" });
    expect(
      await submitMembershipApplication({
        applicantAuthId: "synthetic-applicant",
        verifiedEmail: "synthetic@example.test",
        idempotencyKey: "synthetic-key",
        draft: {},
        passportPhotoId: "synthetic-photo",
      }),
    ).toEqual({ kind: "disabled" });
    expect(mocks.resolveOperationalParish).not.toHaveBeenCalled();
    expect(mocks.createSupabaseSubmissionRepository).not.toHaveBeenCalled();
    expect(mocks.createSupabaseApplicantApplicationRepository).not.toHaveBeenCalled();
  });

  it("keeps production intake disabled even when the flag is true", async () => {
    configure({ appEnv: "production", enabled: "true" });

    expect(await isMembershipApplicationSubmissionAvailable()).toBe(false);
    expect(
      await submitMembershipApplication({
        applicantAuthId: "synthetic-applicant",
        verifiedEmail: "synthetic@example.test",
        idempotencyKey: "synthetic-key",
        draft: {},
        passportPhotoId: "synthetic-photo",
      }),
    ).toEqual({ kind: "disabled" });
    expect(mocks.resolveOperationalParish).not.toHaveBeenCalled();
    expect(mocks.createSupabaseSubmissionRepository).not.toHaveBeenCalled();
  });

  it("does not treat a missing deployment identity as development in production runtime", async () => {
    delete process.env.APP_ENV;
    vi.stubEnv("NODE_ENV", "production");
    process.env.MEMBERSHIP_APPLICATION_SUBMISSION_ENABLED = "true";

    expect(await isMembershipApplicationSubmissionAvailable()).toBe(false);
    expect(mocks.resolveOperationalParish).not.toHaveBeenCalled();
    expect(mocks.createSupabaseSubmissionRepository).not.toHaveBeenCalled();
  });

  it("preserves explicitly enabled development intake behavior", async () => {
    configure({ appEnv: "development", enabled: "true" });

    expect(await isMembershipApplicationSubmissionAvailable()).toBe(true);
    expect(mocks.resolveOperationalParish).toHaveBeenCalledOnce();
  });
});
