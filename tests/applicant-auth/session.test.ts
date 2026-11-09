import { describe, expect, it, vi } from "vitest";
import { verifyApplicantSession } from "@/modules/applicant-auth/application/verify-applicant-session";

describe("verified applicant session", () => {
  it("returns only the Auth principal when email verification is present", async () => {
    const reader = {
      getCurrentAuthUser: vi.fn().mockResolvedValue({
        id: "auth-user",
        email: "verified@example.test",
        emailConfirmedAt: "now",
      }),
    };
    expect(await verifyApplicantSession(reader)).toEqual({
      id: "auth-user",
      email: "verified@example.test",
      emailConfirmedAt: "now",
    });
    expect(reader.getCurrentAuthUser).toHaveBeenCalledOnce();
  });

  it.each([
    null,
    { id: "auth-user", email: "verified@example.test", emailConfirmedAt: null },
    { id: "auth-user", email: "", emailConfirmedAt: "now" },
    { id: "", email: "verified@example.test", emailConfirmedAt: "now" },
  ])("denies missing or unverified Auth identities without membership lookups", async (user) => {
    const reader = { getCurrentAuthUser: vi.fn().mockResolvedValue(user) };
    await expect(verifyApplicantSession(reader)).resolves.toBeNull();
    expect(Object.keys(reader)).toEqual(["getCurrentAuthUser"]);
  });

  it("fails closed when Auth validation is unavailable", async () => {
    const reader = { getCurrentAuthUser: vi.fn().mockRejectedValue(new Error("private detail")) };
    await expect(verifyApplicantSession(reader)).rejects.toThrow("private detail");
  });
});
