import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { IdentityExperience } from "@/modules/identity/presentation/identity-experience";
import {
  checkIdentity,
  identityGateOutcome,
  isCurrentIdentityRequest,
  mayRenderProtectedShell,
  resolveSessionIdentity,
  signInAndVerify,
  signOutSafely,
  signInWithEmailPassword,
} from "@/modules/identity/presentation/identity-experience-state";

describe("identity frontend access gate", () => {
  it("renders only a session-checking state before browser identity verification", () => {
    const markup = renderToStaticMarkup(createElement(IdentityExperience));
    expect(markup).toContain("Checking your session");
    expect(markup).not.toContain("Welcome to CYON Connect");
    expect(markup).not.toContain("Your identity context is active");
  });

  it("permits the shell only after the identity endpoint returns 200", () => {
    expect(identityGateOutcome(200)).toBe("permitted");
    expect(mayRenderProtectedShell("permitted")).toBe(true);
  });

  it.each([401, 403, 404, 500, 503])("keeps the shell blocked for HTTP %i", (status) => {
    const outcome = identityGateOutcome(status);
    expect(mayRenderProtectedShell(outcome)).toBe(false);
  });

  it("maps missing authentication separately from denied identity context", () => {
    expect(identityGateOutcome(401)).toBe("unauthenticated");
    expect(identityGateOutcome(403)).toBe("access_unavailable");
    expect(identityGateOutcome(404)).toBe("access_unavailable");
  });

  it("treats non-authentication server responses as retryable service failures", () => {
    expect(identityGateOutcome(503)).toBe("service_unavailable");
    expect(identityGateOutcome(500)).toBe("service_unavailable");
  });

  it("keeps the protected shell inaccessible for every outcome except verified HTTP 200", () => {
    for (const status of [0, 200, 201, 401, 403, 404, 500, 503]) {
      expect(mayRenderProtectedShell(identityGateOutcome(status))).toBe(status === 200);
    }
  });

  it("maps a thrown network request to a retryable service failure", async () => {
    await expect(checkIdentity(async () => { throw new Error("network detail"); })).resolves.toBe(
      "service_unavailable",
    );
  });

  it("retries identity verification for a live session and denies an expired session", async () => {
    const verify = vi.fn().mockResolvedValue("permitted");
    await expect(resolveSessionIdentity(true, verify)).resolves.toBe("permitted");
    await expect(resolveSessionIdentity(false, verify)).resolves.toBe("unauthenticated");
    expect(verify).toHaveBeenCalledOnce();
  });

  it("handles auth state changes without retaining protected access after sign-out", async () => {
    const verify = vi.fn().mockResolvedValue("permitted");
    await expect(resolveSessionIdentity(true, verify)).resolves.toBe("permitted");
    await expect(resolveSessionIdentity(false, verify)).resolves.toBe("unauthenticated");
    expect(mayRenderProtectedShell("unauthenticated")).toBe(false);
  });

  it("rejects identity results whose request sequence was invalidated by a newer auth state", () => {
    const staleRequest = 4;
    const currentRequest = 5;
    expect(isCurrentIdentityRequest(staleRequest, currentRequest)).toBe(false);
    expect(isCurrentIdentityRequest(currentRequest, currentRequest)).toBe(true);
  });
});

describe("email and password sign-in", () => {
  it("passes the submitted credentials to the approved Supabase Auth method", async () => {
    const signIn = vi
      .fn()
      .mockResolvedValue({ data: { session: { access_token: "test" } }, error: null });
    await expect(signInWithEmailPassword(signIn, "member@example.invalid", "secret")).resolves.toBe(
      true,
    );
    expect(signIn).toHaveBeenCalledWith({ email: "member@example.invalid", password: "secret" });
  });

  it("returns a generic failure for invalid credentials or provider errors", async () => {
    const providerError = vi.fn().mockResolvedValue({
      data: { session: null },
      error: new Error("private provider detail"),
    });
    const thrownError = vi.fn().mockRejectedValue(new Error("private network detail"));

    await expect(
      signInWithEmailPassword(providerError, "member@example.invalid", "wrong"),
    ).resolves.toBe(false);
    await expect(
      signInWithEmailPassword(thrownError, "member@example.invalid", "secret"),
    ).resolves.toBe(false);
  });

  it("verifies identity after successful sign-in and returns only the gate outcome", async () => {
    const signIn = vi.fn().mockResolvedValue({ data: { session: { id: "session" } }, error: null });
    const verify = vi.fn().mockResolvedValue("permitted");

    await expect(
      signInAndVerify(signIn, verify, "member@example.invalid", "secret"),
    ).resolves.toEqual({ kind: "identity", outcome: "permitted" });
    expect(signIn.mock.invocationCallOrder[0]).toBeLessThan(verify.mock.invocationCallOrder[0]!);
  });

  it("does not verify identity after failed sign-in", async () => {
    const signIn = vi.fn().mockResolvedValue({ data: { session: null }, error: new Error("auth") });
    const verify = vi.fn();

    await expect(
      signInAndVerify(signIn, verify, "member@example.invalid", "wrong"),
    ).resolves.toEqual({ kind: "sign_in_failed" });
    expect(verify).not.toHaveBeenCalled();
  });

  it("does not start identity verification when sign-in was invalidated", async () => {
    const signIn = vi.fn().mockResolvedValue({ data: { session: { id: "session" } }, error: null });
    const verify = vi.fn();
    const isCurrent = vi.fn().mockReturnValue(false);

    await expect(
      signInAndVerify(signIn, verify, "member@example.invalid", "secret", isCurrent),
    ).resolves.toEqual({ kind: "stale" });
    expect(isCurrent).toHaveBeenCalledOnce();
    expect(verify).not.toHaveBeenCalled();
  });

  it("returns no identity result when the verification operation throws", async () => {
    const signIn = vi.fn().mockResolvedValue({ data: { session: { id: "session" } }, error: null });
    const verify = vi.fn().mockRejectedValue(new Error("private network detail"));

    await expect(
      signInAndVerify(signIn, verify, "member@example.invalid", "secret"),
    ).resolves.toEqual({ kind: "verification_failed" });
  });
});

describe("sign-out outcome", () => {
  it("returns to the sign-in state after successful sign-out", async () => {
    await expect(signOutSafely(async () => ({ error: null }))).resolves.toBe("signed_out");
  });

  it("returns a safe recoverable failure when Supabase reports a sign-out error", async () => {
    await expect(
      signOutSafely(async () => ({ error: new Error("private provider detail") })),
    ).resolves.toBe("service_unavailable");
  });

  it("returns a safe recoverable failure when sign-out throws", async () => {
    await expect(
      signOutSafely(async () => {
        throw new Error("private network detail");
      }),
    ).resolves.toBe("service_unavailable");
  });
});
