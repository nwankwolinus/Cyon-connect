"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { createBrowserSupabaseClient } from "@/infrastructure/supabase/browser";
import {
  passwordUpdateSchema,
  recoveryRequestSchema,
  registrationSchema,
} from "../application/credentials-validation";
import { signInApplicant } from "../application/sign-in-applicant";

type FormProps = { readonly status?: string };

export function ApplicantRegistrationForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const parsed = registrationSchema.safeParse({ email, password, dateOfBirth });
    if (!parsed.success) {
      setMessage(
        "Enter a valid email, a password of at least 8 characters, and your date of birth.",
      );
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/applicant-auth/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(parsed.data),
      });
      const body = (await response.json()) as { message?: string };
      setMessage(body.message ?? "Registration could not be completed. Please try again later.");
      if (response.status === 202) {
        setPassword("");
        setDateOfBirth("");
      }
    } catch {
      setMessage("Registration could not be completed. Please try again later.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <EmailField value={email} onChange={setEmail} />
      <PasswordField value={password} onChange={setPassword} label="Create password" />
      <div>
        <label
          className="block text-sm font-medium text-neutral-800"
          htmlFor="registration-date-of-birth"
        >
          Date of birth <span className="text-neutral-500">(required)</span>
        </label>
        <input
          id="registration-date-of-birth"
          name="dateOfBirth"
          type="date"
          required
          autoComplete="bday"
          value={dateOfBirth}
          onChange={(event) => setDateOfBirth(event.target.value)}
          className={inputClass}
          aria-describedby="registration-date-of-birth-note"
        />
        <p id="registration-date-of-birth-note" className="mt-2 text-xs leading-5 text-neutral-600">
          Used by the server to check the approved registration age range (16–40 years). It is not
          sent to Supabase Auth.
        </p>
      </div>
      {message ? (
        <p
          role="status"
          className="rounded-md border border-neutral-200 bg-neutral-50 p-3 text-sm leading-5 text-neutral-700"
        >
          {message}
        </p>
      ) : null}
      <button type="submit" disabled={busy} className={buttonClass}>
        {busy ? "Submitting..." : "Create applicant sign-in"}
      </button>
    </form>
  );
}

export function ApplicantSignInForm({ status }: FormProps) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState(statusMessage(status));
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !email.trim() || !password) return;
    setBusy(true);
    setMessage("");
    try {
      const client = createBrowserSupabaseClient();
      const accepted = await signInApplicant(
        { signInWithPassword: (credentials) => client.auth.signInWithPassword(credentials) },
        email,
        password,
      );
      setPassword("");
      if (!accepted) {
        setMessage(
          "Unable to sign in. Check your details and confirmation status, then try again.",
        );
      } else {
        router.replace("/applicant");
        router.refresh();
      }
    } catch {
      setMessage("Sign-in is temporarily unavailable. Please try again later.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-6 space-y-4">
      <EmailField value={email} onChange={setEmail} />
      <PasswordField
        value={password}
        onChange={setPassword}
        label="Password"
        autoComplete="current-password"
      />
      {message ? (
        <p role="status" className="text-sm text-neutral-700">
          {message}
        </p>
      ) : null}
      <button type="submit" disabled={busy} className={buttonClass}>
        {busy ? "Signing in..." : "Sign in"}
      </button>
    </form>
  );
}

export function RecoveryRequestForm() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const parsed = recoveryRequestSchema.safeParse({ email });
    if (!parsed.success) {
      setMessage("Enter a valid email address.");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/applicant-auth/recovery", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(parsed.data),
      });
      const body = (await response.json()) as { message?: string };
      setMessage(body.message ?? "If the account can be recovered, instructions will be sent.");
    } catch {
      setMessage("Recovery is temporarily unavailable. Please try again later.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-6 space-y-4">
      <EmailField value={email} onChange={setEmail} />
      {message ? (
        <p role="status" className="text-sm text-neutral-700">
          {message}
        </p>
      ) : null}
      <button type="submit" disabled={busy} className={buttonClass}>
        {busy ? "Submitting..." : "Request recovery instructions"}
      </button>
    </form>
  );
}

export function PasswordUpdateForm() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const parsed = passwordUpdateSchema.safeParse({ password });
    if (!parsed.success) {
      setMessage("Enter a password of at least 8 characters.");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/applicant-auth/password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(parsed.data),
      });
      const body = (await response.json()) as { message?: string };
      if (response.ok) {
        setPassword("");
        try {
          await createBrowserSupabaseClient().auth.signOut();
        } catch {
          // The update succeeded server-side; the protected route still validates the session.
        }
        router.replace("/applicant/sign-in?status=password-updated");
        router.refresh();
      } else {
        setMessage(body.message ?? "Password could not be updated.");
      }
    } catch {
      setMessage("Password update is temporarily unavailable.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-6 space-y-4">
      <PasswordField value={password} onChange={setPassword} label="New password" />
      {message ? (
        <p role="status" className="text-sm text-neutral-700">
          {message}
        </p>
      ) : null}
      <button type="submit" disabled={busy} className={buttonClass}>
        {busy ? "Updating..." : "Update password"}
      </button>
    </form>
  );
}

function EmailField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <div>
      <label htmlFor="email" className="block text-sm font-medium text-neutral-800">
        Email
      </label>
      <input
        id="email"
        name="email"
        type="email"
        autoComplete="email"
        required
        maxLength={254}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={inputClass}
      />
    </div>
  );
}

function PasswordField({
  value,
  onChange,
  label,
  autoComplete = "new-password",
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
  autoComplete?: string;
}) {
  return (
    <div>
      <label htmlFor="password" className="block text-sm font-medium text-neutral-800">
        {label}
      </label>
      <input
        id="password"
        name="password"
        type="password"
        autoComplete={autoComplete}
        required
        minLength={8}
        maxLength={128}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={inputClass}
      />
    </div>
  );
}

function statusMessage(status?: string): string {
  if (status === "confirmed") return "Email confirmed. You can now sign in.";
  if (status === "password-updated")
    return "Password updated. You can sign in with the new password.";
  if (status === "confirmation-failed")
    return "That confirmation link is invalid or expired. Start again with applicant registration or contact support.";
  if (status === "recovery-failed")
    return "That recovery link is invalid or expired. Request a new link if needed.";
  if (status === "unavailable")
    return "A verified applicant sign-in could not be confirmed. Please sign in again.";
  return "";
}

const inputClass =
  "mt-1 block h-11 w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 shadow-sm outline-none transition placeholder:text-neutral-400 focus:border-neutral-700 focus:ring-4 focus:ring-neutral-200/70";
const buttonClass =
  "w-full rounded-md bg-neutral-900 px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-neutral-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-900 disabled:cursor-wait disabled:opacity-60";
