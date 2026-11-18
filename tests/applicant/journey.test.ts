import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ApplicantPage from "@/app/applicant/page";
import ApplicantRegistrationConfirmedPage from "@/app/applicant/registration-confirmed/page";

const mocks = vi.hoisted(() => ({
  getVerifiedApplicant: vi.fn(),
  getMyMembershipApplicationOverview: vi.fn(),
  isMembershipApplicationOverviewAvailable: vi.fn(),
  isMembershipApplicationSubmissionAvailable: vi.fn(),
}));

vi.mock("@/modules/applicant-auth/composition", () => ({
  getVerifiedApplicant: mocks.getVerifiedApplicant,
}));
vi.mock("@/modules/membership-application/composition", () => ({
  getMyMembershipApplicationOverview: mocks.getMyMembershipApplicationOverview,
  isMembershipApplicationOverviewAvailable: mocks.isMembershipApplicationOverviewAvailable,
  isMembershipApplicationSubmissionAvailable: mocks.isMembershipApplicationSubmissionAvailable,
}));
vi.mock("@/modules/applicant-auth/presentation/sign-out-button", () => ({
  ApplicantSignOutButton: () => createElement("button", { type: "button" }, "Sign out"),
}));

const emptyOverview = {
  application: null,
  draft: null,
  expiredDraftDisposed: false,
};

beforeEach(() => {
  mocks.getVerifiedApplicant.mockResolvedValue({
    id: "verified-applicant",
    email: "applicant@example.test",
  });
  mocks.isMembershipApplicationOverviewAvailable.mockResolvedValue(true);
  mocks.isMembershipApplicationSubmissionAvailable.mockResolvedValue(true);
  mocks.getMyMembershipApplicationOverview.mockResolvedValue(emptyOverview);
});

afterEach(() => vi.clearAllMocks());

describe("applicant journey landing", () => {
  it("shows the public membership information and registration/sign-in links to visitors", async () => {
    mocks.getVerifiedApplicant.mockResolvedValueOnce(null);
    const markup = renderToStaticMarkup(await ApplicantPage());

    expect(markup).toContain("Begin a membership application");
    expect(markup).toContain("16–40 years old inclusive");
    expect(markup).toContain("Start Membership Application");
    expect(markup).toContain('href="/applicant/register"');
    expect(markup).toContain('href="/applicant/sign-in"');
    expect(markup).toContain("authorised parish review and approval process");
    expect(markup).toContain("ss-joachim-and-anne-parish.jpg");
    expect(markup).toContain("cyon-nigeria-logo.png");
  });

  it("shows a welcome and start CTA for a verified applicant with no application", async () => {
    const markup = renderToStaticMarkup(await ApplicantPage());
    expect(markup).toContain("Welcome to your applicant portal");
    expect(markup).toContain("Complete membership application");
    expect(markup).toContain('href="/applicant/form"');
    expect(markup).not.toContain("temporarily unavailable");
    expect(mocks.getMyMembershipApplicationOverview).toHaveBeenCalledWith("verified-applicant");
  });

  it("keeps the read-only overview available but hides application actions when intake is disabled", async () => {
    mocks.isMembershipApplicationSubmissionAvailable.mockResolvedValueOnce(false);

    const markup = renderToStaticMarkup(await ApplicantPage());

    expect(markup).toContain("Welcome to your applicant portal");
    expect(markup).toContain("Membership application submission is temporarily unavailable");
    expect(markup).not.toContain("Complete membership application");
    expect(markup).not.toContain('href="/applicant/form"');
    expect(mocks.getMyMembershipApplicationOverview).toHaveBeenCalledWith("verified-applicant");
  });

  it("never uses a client-selected identity for the applicant overview", async () => {
    mocks.getVerifiedApplicant.mockResolvedValueOnce({
      id: "session-owner",
      email: "owner@example.test",
    });
    await ApplicantPage();
    expect(mocks.getMyMembershipApplicationOverview).toHaveBeenCalledWith("session-owner");
    expect(mocks.getMyMembershipApplicationOverview).not.toHaveBeenCalledWith("another-applicant");
  });

  it("offers to resume a saved draft", async () => {
    mocks.getMyMembershipApplicationOverview.mockResolvedValueOnce({
      ...emptyOverview,
      draft: {
        id: "draft-id",
        lastActivityAt: "2026-11-16T09:00:00.000Z",
        expiresAt: "2026-12-16T09:00:00.000Z",
        activeStep: 4,
      },
    });
    const markup = renderToStaticMarkup(await ApplicantPage());
    expect(markup).toContain("Welcome back — your application is in progress");
    expect(markup).toContain("Continue application");
    expect(markup).toContain('href="/applicant/form"');
  });

  it("hides draft resume and resubmission actions while intake is disabled", async () => {
    mocks.isMembershipApplicationSubmissionAvailable.mockResolvedValueOnce(false);
    mocks.getMyMembershipApplicationOverview.mockResolvedValueOnce({
      ...emptyOverview,
      draft: {
        id: "draft-id",
        lastActivityAt: "2026-11-16T09:00:00.000Z",
        expiresAt: "2026-12-16T09:00:00.000Z",
        activeStep: 4,
      },
    });

    const draftMarkup = renderToStaticMarkup(await ApplicantPage());
    expect(draftMarkup).toContain("Welcome back — your application is in progress");
    expect(draftMarkup).toContain("Membership application submission is temporarily unavailable");
    expect(draftMarkup).not.toContain("Continue application");
    expect(draftMarkup).not.toContain('href="/applicant/form"');

    mocks.isMembershipApplicationSubmissionAvailable.mockResolvedValueOnce(false);
    mocks.getMyMembershipApplicationOverview.mockResolvedValueOnce({
      ...emptyOverview,
      application: {
        id: "application-id",
        reference: "CYON-TEST-0001",
        status: "rejected",
        submittedAt: "2026-11-16T09:00:00.000Z",
        createdAt: "2026-11-16T09:00:00.000Z",
      },
    });
    const rejectedMarkup = renderToStaticMarkup(await ApplicantPage());
    expect(rejectedMarkup).toContain("This application was not approved");
    expect(rejectedMarkup).not.toContain("Start a new application");
    expect(rejectedMarkup).not.toContain('href="/applicant/form"');
  });

  it.each(["submitted", "under_review", "on_hold", "approved", "rejected", "withdrawn", "closed"])(
    "shows the actual %s application status and lifecycle text",
    async (status) => {
      mocks.getMyMembershipApplicationOverview.mockResolvedValueOnce({
        ...emptyOverview,
        application: {
          id: "application-id",
          reference: "CYON-TEST-0001",
          status,
          submittedAt: "2026-11-16T09:00:00.000Z",
          createdAt: "2026-11-16T09:00:00.000Z",
        },
      });
      const markup = renderToStaticMarkup(await ApplicantPage());
      expect(markup).toContain(status.replaceAll("_", " "));
      expect(markup).toContain("CYON-TEST-0001");
      expect(markup).not.toContain("temporarily unavailable");
    },
  );

  it("preserves a real application-service failure instead of showing an empty state", async () => {
    mocks.getMyMembershipApplicationOverview.mockRejectedValueOnce(
      new Error("database unavailable"),
    );
    const markup = renderToStaticMarkup(await ApplicantPage());
    expect(markup).toContain("Application information is temporarily unavailable");
    expect(markup).not.toContain("Complete membership application");
  });

  it("keeps an unavailable application configuration distinct from an empty application", async () => {
    mocks.isMembershipApplicationOverviewAvailable.mockResolvedValueOnce(false);
    const markup = renderToStaticMarkup(await ApplicantPage());
    expect(markup).toContain("Application information is temporarily unavailable");
    expect(mocks.getMyMembershipApplicationOverview).not.toHaveBeenCalled();
  });

  it("continues verified applicants through the portal instead of bypassing it", () => {
    const markup = renderToStaticMarkup(createElement(ApplicantRegistrationConfirmedPage));
    expect(markup).toContain('href="/applicant"');
    expect(markup).toContain(
      "Email verification does not mean your membership application has been submitted or approved",
    );
  });
});
