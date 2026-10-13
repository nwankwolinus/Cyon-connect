"use client";

import React, { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { createBrowserSupabaseClient } from "@/infrastructure/supabase/browser";
import {
  checkIdentity,
  isCurrentIdentityRequest,
  mayRenderProtectedShell,
  signInAndVerify,
  signOutSafely,
  type IdentityGateOutcome,
} from "./identity-experience-state";

type BrowserSupabaseClient = ReturnType<typeof createBrowserSupabaseClient>;
type Screen = "checking" | "checking_identity" | IdentityGateOutcome;

const SIGN_IN_ERROR = "Unable to sign in. Check your details and try again.";

export function IdentityExperience() {
  const supabase = useRef<BrowserSupabaseClient | null>(null);
  const [screen, setScreen] = useState<Screen>("checking");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const requestSequence = useRef(0);
  const mounted = useRef(false);

  const verifyIdentity = useCallback(async () => {
    const request = ++requestSequence.current;
    setScreen("checking_identity");
    try {
      const outcome = await checkIdentity(() =>
        fetch("/api/identity/me", {
          method: "GET",
          cache: "no-store",
          headers: { accept: "application/json" },
        }),
      );
      if (mounted.current && isCurrentIdentityRequest(request, requestSequence.current)) {
        setScreen(outcome);
      }
      return { outcome, request };
    } catch {
      if (mounted.current && isCurrentIdentityRequest(request, requestSequence.current)) {
        setScreen("service_unavailable");
      }
      return { outcome: "service_unavailable" as const, request };
    }
  }, []);

  const finishSignOut = useCallback(async () => {
    const client = supabase.current;
    if (!client) {
      setScreen("service_unavailable");
      return;
    }
    setSigningOut(true);
    setScreen("checking");
    requestSequence.current += 1;
    const outcome = await signOutSafely(() => client.auth.signOut());
    if (mounted.current) {
      setScreen(outcome === "signed_out" ? "unauthenticated" : "service_unavailable");
    }
    setSigningOut(false);
  }, []);

  const retrySession = useCallback(async () => {
    const client = supabase.current;
    if (!client) {
      setScreen("service_unavailable");
      return;
    }
    const request = ++requestSequence.current;
    setScreen("checking");
    try {
      const { data, error } = await client.auth.getSession();
      if (!mounted.current || !isCurrentIdentityRequest(request, requestSequence.current)) return;
      if (error) setScreen("service_unavailable");
      else if (!data.session) setScreen("unauthenticated");
      else await verifyIdentity();
    } catch {
      if (mounted.current && isCurrentIdentityRequest(request, requestSequence.current)) {
        setScreen("service_unavailable");
      }
    }
  }, [verifyIdentity]);

  useEffect(() => {
    mounted.current = true;
    let client: BrowserSupabaseClient;
    try {
      client = createBrowserSupabaseClient();
    } catch {
      setScreen("service_unavailable");
      return () => {
        mounted.current = false;
        requestSequence.current += 1;
      };
    }
    supabase.current = client;
    const { data } = client.auth.onAuthStateChange((_event, session) => {
      if (!session) {
        requestSequence.current += 1;
        setScreen("unauthenticated");
        return;
      }
      void verifyIdentity();
    });

    void (async () => {
      const initialRequest = requestSequence.current;
      try {
        const { data: sessionData, error } = await client.auth.getSession();
        if (!mounted.current || !isCurrentIdentityRequest(initialRequest, requestSequence.current)) {
          return;
        }
        if (error) setScreen("service_unavailable");
        else if (!sessionData.session) setScreen("unauthenticated");
        else await verifyIdentity();
      } catch {
        if (mounted.current && isCurrentIdentityRequest(initialRequest, requestSequence.current)) {
          setScreen("service_unavailable");
        }
      }
    })();

    return () => {
      mounted.current = false;
      requestSequence.current += 1;
      data.subscription.unsubscribe();
      supabase.current = null;
    };
  }, [verifyIdentity]);

  async function handleSignIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setFormError(null);
    setScreen("checking_identity");
    const authAttemptRequest = requestSequence.current;
    const client = supabase.current;
    if (!client) {
      setSubmitting(false);
      if (isCurrentIdentityRequest(authAttemptRequest, requestSequence.current)) {
        setFormError(SIGN_IN_ERROR);
        setScreen("unauthenticated");
      }
      return;
    }
    const result = await signInAndVerify(
      (credentials) => client.auth.signInWithPassword(credentials),
      verifyIdentity,
      email.trim(),
      password,
      () =>
        mounted.current &&
        isCurrentIdentityRequest(authAttemptRequest, requestSequence.current),
    );
    setPassword("");
    setSubmitting(false);
    if (result.kind === "stale") return;
    if (result.kind === "sign_in_failed") {
      if (isCurrentIdentityRequest(authAttemptRequest, requestSequence.current)) {
        setScreen("unauthenticated");
        setFormError(SIGN_IN_ERROR);
      }
      return;
    }
    if (result.kind === "verification_failed") {
      if (mounted.current && isCurrentIdentityRequest(authAttemptRequest, requestSequence.current)) {
        setScreen("service_unavailable");
      }
      return;
    }
    if (
      mounted.current &&
      isCurrentIdentityRequest(result.outcome.request, requestSequence.current)
    ) {
      setScreen(result.outcome.outcome);
    }
  }

  if (screen === "checking" || screen === "checking_identity") {
    return (
      <main className="grid min-h-screen place-items-center px-6" aria-busy="true">
        <p role="status" className="text-sm text-neutral-600">
          {screen === "checking" ? "Checking your session..." : "Checking your access..."}
        </p>
      </main>
    );
  }

  if (mayRenderProtectedShell(screen)) {
    return (
      <main className="min-h-screen bg-neutral-50">
        <header className="flex items-center justify-between border-b border-neutral-200 bg-white px-6 py-4">
          <div>
            <p className="text-sm font-semibold tracking-wide text-neutral-900">CYON CONNECT</p>
            <p className="text-xs text-neutral-500">SS Joachim and Anne Parish, Ijegun</p>
          </div>
          <button
            type="button"
            onClick={() => void finishSignOut()}
            className="rounded-md border border-neutral-300 px-3 py-2 text-sm font-medium hover:bg-neutral-50 disabled:opacity-60"
            disabled={signingOut}
          >
            {signingOut ? "Signing out..." : "Sign out"}
          </button>
        </header>
        <section className="mx-auto max-w-5xl px-6 py-10">
          <h1 className="text-2xl font-semibold text-neutral-900">Welcome to CYON Connect</h1>
          <p className="mt-2 text-neutral-600">Your identity context is active.</p>
        </section>
      </main>
    );
  }

  if (screen === "access_unavailable") {
    return (
      <main className="grid min-h-screen place-items-center px-6">
        <section className="w-full max-w-md text-center">
          <Brand />
          <h1 className="mt-8 text-xl font-semibold">Access unavailable</h1>
          <p className="mt-2 text-sm text-neutral-600">
            We can&apos;t provide access right now. Please contact your parish administrator if you need
            help.
          </p>
          <button
            type="button"
            onClick={() => void finishSignOut()}
            className="mt-6 rounded-md border border-neutral-300 px-4 py-2 text-sm font-medium hover:bg-neutral-50"
          >
            Return to sign in
          </button>
        </section>
      </main>
    );
  }

  if (screen === "service_unavailable") {
    return (
      <main className="grid min-h-screen place-items-center px-6">
        <section className="w-full max-w-md text-center">
          <Brand />
          <h1 className="mt-8 text-xl font-semibold">Service temporarily unavailable</h1>
          <p className="mt-2 text-sm text-neutral-600">
            We couldn&apos;t confirm your access. Please try again.
          </p>
          <button
            type="button"
            onClick={() => void retrySession()}
            className="mt-6 rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700"
          >
            Try again
          </button>
        </section>
      </main>
    );
  }

  return (
    <main className="grid min-h-screen place-items-center bg-neutral-50 px-6 py-12">
      <section className="w-full max-w-md rounded-xl border border-neutral-200 bg-white p-8 shadow-sm">
        <Brand />
        <h1 className="mt-8 text-xl font-semibold">Sign in</h1>
        <p className="mt-2 text-sm text-neutral-600">
          Use the email and password for your CYON account.
        </p>
        <form className="mt-6 space-y-4" onSubmit={handleSignIn}>
          <div>
            <label htmlFor="email" className="mb-1 block text-sm font-medium">
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="w-full rounded-md border border-neutral-300 px-3 py-2 outline-none focus:border-neutral-700 focus:ring-2 focus:ring-neutral-200"
            />
          </div>
          <div>
            <label htmlFor="password" className="mb-1 block text-sm font-medium">
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="w-full rounded-md border border-neutral-300 px-3 py-2 outline-none focus:border-neutral-700 focus:ring-2 focus:ring-neutral-200"
            />
          </div>
          {formError ? (
            <p role="alert" className="text-sm text-red-700">
              {formError}
            </p>
          ) : null}
          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-md bg-neutral-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-neutral-700 disabled:cursor-wait disabled:opacity-60"
          >
            {submitting ? "Signing in..." : "Sign in"}
          </button>
        </form>
      </section>
    </main>
  );
}

function Brand() {
  return (
    <div>
      <p className="text-sm font-semibold tracking-wide text-neutral-900">CYON CONNECT</p>
      <p className="mt-1 text-xs text-neutral-500">SS Joachim and Anne Parish, Ijegun</p>
    </div>
  );
}
