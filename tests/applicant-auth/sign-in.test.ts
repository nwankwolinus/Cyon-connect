import { describe, expect, it, vi } from "vitest";
import { signInApplicant } from "@/modules/applicant-auth/application/sign-in-applicant";

describe("applicant password sign-in", () => {
  it("accepts provider sign-in with a session but leaves protected access to server validation", async () => {
    const auth = {
      signInWithPassword: vi
        .fn()
        .mockResolvedValue({ data: { session: { access_token: "opaque" } }, error: null }),
    };
    await expect(signInApplicant(auth, " applicant@example.test ", "password-123")).resolves.toBe(
      true,
    );
    expect(auth.signInWithPassword).toHaveBeenCalledWith({
      email: "applicant@example.test",
      password: "password-123",
    });
  });

  it.each([
    { data: { session: null }, error: null },
    { data: { session: { access_token: "opaque" } }, error: new Error("unverified") },
  ])(
    "rejects failed or absent provider sessions without exposing provider errors",
    async (result) => {
      const auth = { signInWithPassword: vi.fn().mockResolvedValue(result) };
      await expect(signInApplicant(auth, "applicant@example.test", "wrong-password")).resolves.toBe(
        false,
      );
    },
  );

  it("normalizes provider transport failures", async () => {
    const auth = { signInWithPassword: vi.fn().mockRejectedValue(new Error("provider detail")) };
    await expect(signInApplicant(auth, "applicant@example.test", "password-123")).resolves.toBe(
      false,
    );
  });
});
