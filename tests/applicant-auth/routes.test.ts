import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as register } from "@/app/api/applicant-auth/register/route";
import { POST as recover } from "@/app/api/applicant-auth/recovery/route";
import { POST as updatePassword } from "@/app/api/applicant-auth/password/route";
import { GET as callback } from "@/app/auth/callback/route";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  createApplicantAuthIdentity: vi.fn(),
  resetPasswordForEmail: vi.fn(),
  exchangeCodeForSession: vi.fn(),
  verifyOtp: vi.fn(),
  getUser: vi.fn(),
  updateUser: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock("@/infrastructure/supabase/server", () => ({
  createServerSupabaseClient: mocks.createClient,
}));
vi.mock("@/modules/applicant-auth/infrastructure/supabase-applicant-identity-creator", () => ({
  createApplicantAuthIdentity: mocks.createApplicantAuthIdentity,
}));
const client = {
  auth: {
    resetPasswordForEmail: mocks.resetPasswordForEmail,
    exchangeCodeForSession: mocks.exchangeCodeForSession,
    verifyOtp: mocks.verifyOtp,
    getUser: mocks.getUser,
    updateUser: mocks.updateUser,
    signOut: mocks.signOut,
  },
};

function post(body: unknown): Request {
  return new Request("http://localhost:3000/api", {
    method: "POST",
    headers: { "content-type": "application/json", origin: "http://localhost:3000" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.stubEnv("NODE_ENV", "test");
  process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://crfcglxcsnmeovnipnko.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-publishable-key";
  process.env.APP_ENV = "development";
  process.env.APPLICANT_REGISTRATION_ENABLED = "true";
  mocks.createClient.mockResolvedValue(client);
  mocks.createApplicantAuthIdentity.mockResolvedValue("accepted");
  mocks.resetPasswordForEmail.mockResolvedValue({ error: null });
  mocks.exchangeCodeForSession.mockResolvedValue({ error: null });
  mocks.verifyOtp.mockResolvedValue({ error: null });
  mocks.getUser.mockResolvedValue({
    data: {
      user: {
        id: "verified-auth-user",
        email: "verified@example.test",
        email_confirmed_at: "2026-11-07T00:00:00Z",
      },
    },
    error: null,
  });
  mocks.updateUser.mockResolvedValue({ error: null });
  mocks.signOut.mockResolvedValue({ error: null });
});

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

describe("prospective applicant registration", () => {
  it("rejects cross-origin or missing-origin API requests", async () => {
    const crossOrigin = new Request("http://localhost:3000/api", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "https://attacker.test" },
      body: JSON.stringify({
        email: "applicant@example.test",
        password: "password-123",
        dateOfBirth: "2000-01-01",
      }),
    });
    const missingOrigin = new Request("http://localhost:3000/api", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: "applicant@example.test",
        password: "password-123",
        dateOfBirth: "2000-01-01",
      }),
    });
    expect((await register(crossOrigin)).status).toBe(403);
    expect((await register(missingOrigin)).status).toBe(403);
    expect(mocks.createApplicantAuthIdentity).not.toHaveBeenCalled();
  });

  it("validates input and creates only an Auth identity", async () => {
    const invalid = await register(
      post({ email: "bad", password: "short", dateOfBirth: "2000-01-01" }),
    );
    expect(invalid.status).toBe(400);
    expect(mocks.createApplicantAuthIdentity).not.toHaveBeenCalled();

    const response = await register(
      post({
        email: "Applicant@example.test ",
        password: "password-123",
        dateOfBirth: "2000-01-01",
      }),
    );
    expect(response.status).toBe(202);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({
      message: "If registration can proceed, confirmation instructions will be sent.",
    });
    expect(mocks.createApplicantAuthIdentity).toHaveBeenCalledWith({
      email: "Applicant@example.test",
      password: "password-123",
    });
    expect(JSON.stringify(mocks.createApplicantAuthIdentity.mock.calls)).not.toMatch(
      /members|user_accounts|PLATFORM_ADMIN/i,
    );
    expect(JSON.stringify(mocks.createApplicantAuthIdentity.mock.calls)).not.toContain(
      "dateOfBirth",
    );
  });

  it("keeps the registration endpoint closed unless development is explicitly enabled", async () => {
    process.env.APPLICANT_REGISTRATION_ENABLED = "false";
    const disabled = await register(
      post({
        email: "applicant@example.test",
        password: "password-123",
        dateOfBirth: "2000-01-01",
      }),
    );
    expect(disabled.status).toBe(503);
    expect(mocks.createApplicantAuthIdentity).not.toHaveBeenCalled();

    process.env.APPLICANT_REGISTRATION_ENABLED = "true";
    process.env.APP_ENV = "production";
    const production = await register(
      post({
        email: "applicant@example.test",
        password: "password-123",
        dateOfBirth: "2000-01-01",
      }),
    );
    expect(production.status).toBe(503);
    expect(mocks.createApplicantAuthIdentity).not.toHaveBeenCalled();
  });

  it("allows staging registration only when explicitly enabled and bound to the security-test project", async () => {
    process.env.APP_ENV = "staging";
    process.env.APPLICANT_REGISTRATION_ENABLED = "true";
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://crfcglxcsnmeovnipnko.supabase.co";

    const accepted = await register(
      post({ email: "staging@example.test", password: "password-123", dateOfBirth: "2000-01-01" }),
    );
    expect(accepted.status).toBe(202);
    expect(mocks.createApplicantAuthIdentity).toHaveBeenCalledOnce();

    mocks.createApplicantAuthIdentity.mockClear();
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://bpooqfgadtbyeduapwyi.supabase.co";
    const rejected = await register(
      post({ email: "staging@example.test", password: "password-123", dateOfBirth: "2000-01-01" }),
    );
    expect(rejected.status).toBe(503);
    expect(mocks.createApplicantAuthIdentity).not.toHaveBeenCalled();
  });

  it("does not enable staging registration when its flag is disabled", async () => {
    process.env.APP_ENV = "staging";
    process.env.APPLICANT_REGISTRATION_ENABLED = "false";

    const response = await register(
      post({ email: "staging@example.test", password: "password-123", dateOfBirth: "2000-01-01" }),
    );
    expect(response.status).toBe(503);
    expect(mocks.createApplicantAuthIdentity).not.toHaveBeenCalled();
  });

  it("does not treat an unset deployment identity as development in a production runtime", async () => {
    delete process.env.APP_ENV;
    vi.stubEnv("NODE_ENV", "production");
    process.env.APPLICANT_REGISTRATION_ENABLED = "true";

    const response = await register(
      post({ email: "staging@example.test", password: "password-123", dateOfBirth: "2000-01-01" }),
    );
    expect(response.status).toBe(503);
    expect(mocks.createApplicantAuthIdentity).not.toHaveBeenCalled();
  });

  it("normalizes duplicate-email errors to the same generic success response", async () => {
    mocks.createApplicantAuthIdentity.mockResolvedValue("accepted");
    const response = await register(
      post({ email: "known@example.test", password: "password-123", dateOfBirth: "2000-01-01" }),
    );
    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({
      message: "If registration can proceed, confirmation instructions will be sent.",
    });
  });

  it("returns a generic operational failure without provider details", async () => {
    mocks.createApplicantAuthIdentity.mockResolvedValue("unavailable");
    const response = await register(
      post({
        email: "applicant@example.test",
        password: "password-123",
        dateOfBirth: "2000-01-01",
      }),
    );
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("private provider detail");
  });

  it("rejects ineligible ages before Supabase Auth and never forwards DOB to Auth", async () => {
    const tooYoung = await register(
      post({
        email: "applicant@example.test",
        password: "password-123",
        dateOfBirth: "2011-11-09",
      }),
    );
    expect(tooYoung.status).toBe(403);
    expect(mocks.createApplicantAuthIdentity).not.toHaveBeenCalled();

    const futureBirthday = await register(
      post({
        email: "applicant@example.test",
        password: "password-123",
        dateOfBirth: "2027-01-01",
      }),
    );
    expect(futureBirthday.status).toBe(400);
    expect(mocks.createApplicantAuthIdentity).not.toHaveBeenCalled();
  });
});

describe("confirmation and recovery callback", () => {
  it("verifies a server-side confirmation token hash and establishes the verified identity", async () => {
    const response = await callback(
      new Request(
        "http://localhost:3000/auth/callback?token_hash=one-time-email-token&flow=confirmation",
      ),
    );
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "http://localhost:3000/applicant/registration-confirmed",
    );
    expect(mocks.verifyOtp).toHaveBeenCalledWith({
      token_hash: "one-time-email-token",
      type: "email",
    });
    expect(mocks.getUser).toHaveBeenCalledOnce();
  });

  it("exchanges a confirmation code and redirects to a fixed internal destination", async () => {
    const response = await callback(
      new Request(
        "http://localhost:3000/auth/callback?code=one-time-code&flow=confirmation&next=https%3A%2F%2Fevil.test",
      ),
    );
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "http://localhost:3000/applicant/registration-confirmed",
    );
    expect(mocks.exchangeCodeForSession).toHaveBeenCalledWith("one-time-code");
    expect(mocks.getUser).toHaveBeenCalledOnce();
  });

  it("rejects invalid, expired, and replayed codes without redirecting externally", async () => {
    mocks.exchangeCodeForSession.mockResolvedValue({ error: { code: "invalid_grant" } });
    const response = await callback(
      new Request(
        "http://localhost:3000/auth/callback?code=expired&flow=confirmation&next=https%3A%2F%2Fevil.test",
      ),
    );
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "http://localhost:3000/applicant/sign-in?status=confirmation-failed",
    );
    expect(response.headers.get("location")).not.toContain("evil.test");
    expect(mocks.getUser).not.toHaveBeenCalled();
  });

  it("requires a confirmed identity after code exchange", async () => {
    mocks.getUser.mockResolvedValue({
      data: { user: { id: "auth-id", email_confirmed_at: null } },
      error: null,
    });
    const response = await callback(
      new Request("http://localhost:3000/auth/callback?code=unconfirmed&flow=confirmation"),
    );
    expect(response.headers.get("location")).toContain("confirmation-failed");
    expect(mocks.signOut).toHaveBeenCalledOnce();
  });

  it("rejects expired recovery codes with a fixed recovery error destination", async () => {
    mocks.exchangeCodeForSession.mockResolvedValue({ error: { code: "invalid_grant" } });
    const response = await callback(
      new Request("http://localhost:3000/auth/callback?code=expired&flow=recovery"),
    );
    expect(response.headers.get("location")).toBe(
      "http://localhost:3000/auth/reset-password?status=recovery-failed",
    );
  });

  it("routes recovery proofs only to the fixed password-reset page", async () => {
    const response = await callback(
      new Request(
        "http://localhost:3000/auth/callback?code=recovery-code&flow=recovery&next=https%3A%2F%2Fevil.test",
      ),
    );
    expect(response.headers.get("location")).toBe(
      "http://localhost:3000/auth/reset-password?mode=update",
    );
  });

  it("rejects missing codes and unknown callback modes", async () => {
    const response = await callback(
      new Request("http://localhost:3000/auth/callback?next=https://evil.test"),
    );
    expect(response.headers.get("location")).toBe(
      "http://localhost:3000/applicant/sign-in?status=confirmation-failed",
    );
    expect(mocks.exchangeCodeForSession).not.toHaveBeenCalled();
  });

  it("does not accept confirmation token hashes for recovery or ambiguous callbacks", async () => {
    const recovery = await callback(
      new Request(
        "http://localhost:3000/auth/callback?token_hash=one-time-email-token&flow=recovery",
      ),
    );
    const ambiguous = await callback(
      new Request(
        "http://localhost:3000/auth/callback?code=code&token_hash=token&flow=confirmation",
      ),
    );
    expect(recovery.headers.get("location")).toBe(
      "http://localhost:3000/auth/reset-password?status=recovery-failed",
    );
    expect(ambiguous.headers.get("location")).toBe(
      "http://localhost:3000/applicant/sign-in?status=confirmation-failed",
    );
    expect(mocks.verifyOtp).not.toHaveBeenCalled();
  });
});

describe("password recovery and update", () => {
  it("uses the same generic response for provider success and account-sensitive errors", async () => {
    const success = await recover(post({ email: "applicant@example.test" }));
    mocks.resetPasswordForEmail.mockResolvedValue({ error: { code: "user_not_found" } });
    const noAccount = await recover(post({ email: "unknown@example.test" }));
    expect(success.status).toBe(202);
    expect(noAccount.status).toBe(202);
    expect(await success.json()).toEqual(await noAccount.json());
    expect(mocks.resetPasswordForEmail).toHaveBeenCalledWith("applicant@example.test", {
      redirectTo: "http://localhost:3000/auth/callback?flow=recovery",
    });
  });

  it("requires a verified current Auth identity and ignores a caller-supplied target ID", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null });
    const denied = await updatePassword(post({ password: "new-password-123" }));
    expect(denied.status).toBe(401);
    expect(mocks.updateUser).not.toHaveBeenCalled();

    mocks.getUser.mockResolvedValue({
      data: {
        user: {
          id: "verified-auth-user",
          email: "verified@example.test",
          email_confirmed_at: "now",
        },
      },
      error: null,
    });
    const accepted = await updatePassword(
      post({ password: "new-password-123", userId: "another-applicant-auth-id" }),
    );
    expect(accepted.status).toBe(200);
    expect(mocks.updateUser).toHaveBeenCalledWith({ password: "new-password-123" });
    expect(JSON.stringify(mocks.updateUser.mock.calls)).not.toMatch(
      /userId|members|user_accounts/i,
    );
  });

  it("normalizes provider password-update failures", async () => {
    mocks.updateUser.mockResolvedValue({ error: { message: "private Auth detail" } });
    const response = await updatePassword(post({ password: "new-password-123" }));
    expect(response.status).toBe(400);
    expect(await response.text()).not.toContain("private Auth detail");
  });

  it("validates recovery and update passwords server-side", async () => {
    const invalidEmail = await recover(post({ email: "not-an-email" }));
    const invalidPassword = await updatePassword(post({ password: "tiny" }));
    expect(invalidEmail.status).toBe(400);
    expect(invalidPassword.status).toBe(400);
    expect(mocks.resetPasswordForEmail).not.toHaveBeenCalled();
    expect(mocks.updateUser).not.toHaveBeenCalled();
  });
});
