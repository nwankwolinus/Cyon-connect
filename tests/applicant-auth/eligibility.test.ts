import { describe, expect, it } from "vitest";
import {
  evaluateApplicantEligibility,
  evaluateMembershipSubmissionEligibility,
  getCurrentParishDate,
} from "@/modules/applicant-auth/infrastructure/applicant-eligibility";

describe("server-side applicant age eligibility", () => {
  it("uses exact birthdays and the inclusive 16–40 range", () => {
    expect(evaluateApplicantEligibility("2010-11-10", "2026-11-09")).toBe("ineligible");
    expect(evaluateApplicantEligibility("2010-11-09", "2026-11-09")).toBe("eligible");
    expect(evaluateApplicantEligibility("1986-11-09", "2026-11-09")).toBe("eligible");
    expect(evaluateApplicantEligibility("1986-11-10", "2026-11-09")).toBe("eligible");
    expect(evaluateApplicantEligibility("1985-11-09", "2026-11-09")).toBe("ineligible");
  });

  it("rejects malformed, impossible, and future dates without returning DOB data", () => {
    expect(evaluateApplicantEligibility("not-a-date", "2026-11-09")).toBe("invalid");
    expect(evaluateApplicantEligibility("2026-02-30", "2026-11-09")).toBe("invalid");
    expect(evaluateApplicantEligibility("2026-11-10", "2026-11-09")).toBe("invalid");
  });

  it("uses the operational parish calendar date rather than UTC date", () => {
    expect(getCurrentParishDate(new Date("2026-01-01T23:30:00.000Z"))).toBe("2026-01-02");
  });

  it("blocks minors until the consent method exists while preserving the inclusive adult age range", () => {
    expect(evaluateMembershipSubmissionEligibility("2010-11-09", "2026-11-09")).toBe(
      "guardian_consent_required",
    );
    expect(evaluateMembershipSubmissionEligibility("2008-11-09", "2026-11-09")).toBe("eligible");
    expect(evaluateMembershipSubmissionEligibility("1986-11-09", "2026-11-09")).toBe("eligible");
    expect(evaluateMembershipSubmissionEligibility("2010-11-10", "2026-11-09")).toBe("ineligible");
    expect(evaluateMembershipSubmissionEligibility("1985-11-09", "2026-11-09")).toBe("ineligible");
  });
});
