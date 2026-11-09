import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as register } from "@/app/api/applicant-auth/register/route";
import { POST as recover } from "@/app/api/applicant-auth/recovery/route";
import { POST as updatePassword } from "@/app/api/applicant-auth/password/route";
import { GET as callback } from "@/app/auth/callback/route";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  signUp: vi.fn(),
  resetPasswordForEmail: vi.fn(),
  exchangeCodeForSession: vi.fn(),
  getUser: vi.fn(),
  updateUser: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock("@/infrastructure/supabase/server", () => ({
  createServerSupabaseClient: mocks.createClient,
}));
const client = {
  auth: {
    signUp: mocks.signUp,
    resetPasswordForEmail: mocks.resetPasswordForEmail,
    exchangeCodeForSession: mocks.exchangeCodeForSession,
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
  process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://crfcglxcsnmeovnipnko.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-publishable-key";
  mocks.createClient.mockResolvedValue(client);
  mocks.signUp.mockResolvedValue({ error: null });
  mocks.resetPasswordForEmail.mockResolvedValue({ error: null });
  mocks.exchangeCodeForSession.mockResolvedValue({ error: null });
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
});

describe("prospective applicant registration", () => {
  it("rejects cross-origin or missing-origin API requests", async () => {
    const crossOrigin = new Request("http://localhost:3000/api", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "https://attacker.test" },
      body: JSON.stringify({ email: "applicant@example.test", password: "password-123" }),
    });
    const missingOrigin = new Request("http://localhost:3000/api", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "applicant@example.test", password: "password-123" }),
    });
    expect((await register(crossOrigin)).status).toBe(403);
    expect((await register(missingOrigin)).status).toBe(403);
    expect(mocks.signUp).not.toHaveBeenCalled();
  });

  it("validates input and creates only an Auth identity", async () => {
    const invalid = await register(post({ email: "bad", password: "short" }));
    expect(invalid.status).toBe(400);
    expect(mocks.signUp).not.toHaveBeenCalled();

    const response = await register(
      post({ email: "Applicant@example.test ", password: "password-123" }),
    );
    expect(response.status).toBe(202);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({
      message: "If registration can proceed, confirmation instructions will be sent.",
    });
    expect(mocks.signUp).toHaveBeenCalledWith({
      email: "Applicant@example.test",
      password: "password-123",
      options: { emailRedirectTo: "http://localhost:3000/auth/callback?flow=confirmation" },
    });
    expect(JSON.stringify(mocks.signUp.mock.calls)).not.toMatch(
      /members|user_accounts|PLATFORM_ADMIN/i,
    );
  });

  it("normalizes duplicate-email errors to the same generic success response", async () => {
    mocks.signUp.mockResolvedValue({ error: { code: "user_already_exists" } });
    const response = await register(
      post({ email: "known@example.test", password: "password-123" }),
    );
    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({
      message: "If registration can proceed, confirmation instructions will be sent.",
    });
  });

  it("returns a generic operational failure without provider details", async () => {
    mocks.signUp.mockRejectedValue(new Error("private provider detail"));
    const response = await register(
      post({ email: "applicant@example.test", password: "password-123" }),
    );
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("private provider detail");
  });
});

describe("confirmation and recovery callback", () => {
  it("exchanges a confirmation code and redirects to a fixed internal destination", async () => {
    const response = await callback(
      new Request(
        "http://localhost:3000/auth/callback?code=one-time-code&flow=confirmation&next=https%3A%2F%2Fevil.test",
      ),
    );
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "http://localhost:3000/applicant/sign-in?status=confirmed",
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
