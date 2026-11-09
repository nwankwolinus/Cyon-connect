import "server-only";
import { verifyApplicantSession } from "./application/verify-applicant-session";
import { createSupabaseApplicantSessionReader } from "./infrastructure/supabase-applicant-session";
import {
  passwordUpdateSchema,
  recoveryRequestSchema,
  registrationSchema,
} from "./domain/credentials";
import { createServerSupabaseClient } from "@/infrastructure/supabase/server";
import { getAuthRedirectUrl } from "@/infrastructure/config/public";

export function getVerifiedApplicant() {
  return verifyApplicantSession(createSupabaseApplicantSessionReader());
}

export async function registerApplicant(input: unknown) {
  const parsed = registrationSchema.safeParse(input);
  if (!parsed.success) return "invalid" as const;
  try {
    const client = await createServerSupabaseClient();
    const { error } = await client.auth.signUp({
      email: parsed.data.email,
      password: parsed.data.password,
      options: { emailRedirectTo: getAuthRedirectUrl("/auth/callback", "confirmation") },
    });
    if (!error || error.code === "user_already_exists") return "accepted" as const;
    return "unavailable" as const;
  } catch {
    return "unavailable" as const;
  }
}

export async function requestApplicantRecovery(input: unknown) {
  const parsed = recoveryRequestSchema.safeParse(input);
  if (!parsed.success) return "invalid" as const;
  try {
    const client = await createServerSupabaseClient();
    await client.auth.resetPasswordForEmail(parsed.data.email, {
      redirectTo: getAuthRedirectUrl("/auth/callback", "recovery"),
    });
    // Normalize provider responses to avoid revealing whether an account exists.
    return "accepted" as const;
  } catch {
    return "unavailable" as const;
  }
}

export async function updateApplicantPassword(input: unknown) {
  const parsed = passwordUpdateSchema.safeParse(input);
  if (!parsed.success) return "invalid" as const;
  try {
    const applicant = await getVerifiedApplicant();
    if (!applicant) return "unauthenticated" as const;
    const client = await createServerSupabaseClient();
    const { error } = await client.auth.updateUser({ password: parsed.data.password });
    return error ? ("rejected" as const) : ("updated" as const);
  } catch {
    return "unavailable" as const;
  }
}

export async function consumeApplicantAuthCallback(input: {
  readonly code: string | null;
  readonly flow: string | null;
}) {
  const recovery = input.flow === "recovery";
  if (!input.code || input.code.length > 4096 || (input.flow !== "confirmation" && !recovery)) {
    return { kind: "rejected" as const, recovery };
  }
  try {
    const client = await createServerSupabaseClient();
    const { error: exchangeError } = await client.auth.exchangeCodeForSession(input.code);
    if (exchangeError) {
      await client.auth.signOut();
      return { kind: "rejected" as const, recovery };
    }
    const { data, error } = await client.auth.getUser();
    if (error || !data.user?.id || !data.user.email_confirmed_at) {
      await client.auth.signOut();
      return { kind: "rejected" as const, recovery };
    }
    return { kind: "verified" as const, recovery };
  } catch {
    return { kind: "rejected" as const, recovery };
  }
}
