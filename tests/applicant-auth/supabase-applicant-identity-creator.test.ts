import { beforeEach, describe, expect, it, vi } from "vitest";
import { createApplicantAuthIdentity } from "@/modules/applicant-auth/infrastructure/supabase-applicant-identity-creator";

const mocks = vi.hoisted(() => ({
  createAdminSupabaseClient: vi.fn(),
  createServerSupabaseClient: vi.fn(),
  createUser: vi.fn(),
  resend: vi.fn(),
}));

vi.mock("@/infrastructure/supabase/admin", () => ({
  createAdminSupabaseClient: mocks.createAdminSupabaseClient,
}));
vi.mock("@/infrastructure/supabase/server", () => ({
  createServerSupabaseClient: mocks.createServerSupabaseClient,
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "http://localhost:3000");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://crfcglxcsnmeovnipnko.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "test-publishable-key");
  mocks.createAdminSupabaseClient.mockReturnValue({
    auth: { admin: { createUser: mocks.createUser } },
  });
  mocks.createServerSupabaseClient.mockResolvedValue({ auth: { resend: mocks.resend } });
  mocks.createUser.mockResolvedValue({ data: { user: { id: "new-auth-id" } }, error: null });
  mocks.resend.mockResolvedValue({ error: null });
});

describe("server-controlled applicant identity creation", () => {
  it("creates an unconfirmed Auth identity and sends the fixed signup confirmation", async () => {
    await expect(
      createApplicantAuthIdentity({ email: "applicant@example.test", password: "secret-password" }),
    ).resolves.toBe("accepted");

    expect(mocks.createUser).toHaveBeenCalledWith({
      email: "applicant@example.test",
      password: "secret-password",
      email_confirm: false,
    });
    expect(mocks.resend).toHaveBeenCalledWith({
      type: "signup",
      email: "applicant@example.test",
      options: {
        emailRedirectTo: "http://localhost:3000/auth/callback?flow=confirmation",
      },
    });
    expect(JSON.stringify(mocks.createUser.mock.calls)).not.toMatch(/dateOfBirth|DOB|eligibility/i);
  });

  it("recovers a retry after identity creation by resending without creating a second identity", async () => {
    mocks.createUser.mockResolvedValue({
      data: { user: null },
      error: { code: "email_exists" },
    });

    await expect(
      createApplicantAuthIdentity({ email: "applicant@example.test", password: "secret-password" }),
    ).resolves.toBe("accepted");

    expect(mocks.createUser).toHaveBeenCalledOnce();
    expect(mocks.resend).toHaveBeenCalledOnce();
  });

  it("fails closed on an Admin creation failure unrelated to a duplicate email", async () => {
    const diagnostic = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.createUser.mockResolvedValue({
      data: { user: null },
      error: { code: "unexpected_failure", message: "private provider detail" },
    });

    await expect(
      createApplicantAuthIdentity({ email: "applicant@example.test", password: "secret-password" }),
    ).resolves.toBe("unavailable");
    expect(mocks.resend).not.toHaveBeenCalled();
    expect(diagnostic).toHaveBeenCalledWith(
      "[applicant-registration]",
      "admin_identity_creation_failed",
    );
    expect(diagnostic.mock.calls.flat().join(" ")).not.toContain("private provider detail");
    diagnostic.mockRestore();
  });

  it("keeps a newly created identity unconfirmed when confirmation delivery fails", async () => {
    const diagnostic = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.resend.mockResolvedValue({ error: { message: "private delivery detail" } });

    await expect(
      createApplicantAuthIdentity({ email: "applicant@example.test", password: "secret-password" }),
    ).resolves.toBe("unavailable");
    expect(mocks.createUser).toHaveBeenCalledWith(
      expect.objectContaining({ email_confirm: false }),
    );
    expect(diagnostic).toHaveBeenCalledWith(
      "[applicant-registration]",
      "confirmation_email_resend_failed",
    );
    expect(diagnostic.mock.calls.flat().join(" ")).not.toContain("private delivery detail");
    diagnostic.mockRestore();
  });

  it("records only a fixed diagnostic category for unexpected configuration errors", async () => {
    const diagnostic = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.createAdminSupabaseClient.mockImplementation(() => {
      throw new Error("private configuration detail");
    });

    await expect(
      createApplicantAuthIdentity({ email: "applicant@example.test", password: "secret-password" }),
    ).resolves.toBe("unavailable");

    expect(diagnostic).toHaveBeenCalledWith("[applicant-registration]", "configuration_exception");
    expect(diagnostic.mock.calls.flat().join(" ")).not.toContain("private configuration detail");
    diagnostic.mockRestore();
  });

  it("keeps duplicate responses generic if a resend cannot be performed", async () => {
    mocks.createUser.mockResolvedValue({ data: { user: null }, error: { code: "email_exists" } });
    mocks.resend.mockResolvedValue({ error: { message: "private delivery detail" } });

    await expect(
      createApplicantAuthIdentity({ email: "applicant@example.test", password: "secret-password" }),
    ).resolves.toBe("accepted");
  });
});
