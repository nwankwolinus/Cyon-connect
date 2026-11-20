import "server-only";
import { verifyApplicantSession } from "./application/verify-applicant-session";
import { createSupabaseApplicantSessionReader } from "./infrastructure/supabase-applicant-session";
import {
  passwordUpdateSchema,
  recoveryRequestSchema,
  registrationSchema,
} from "./domain/credentials";
import { getServerEnv } from "@/infrastructure/config/server";
import { createApplicantAuthIdentity } from "./infrastructure/supabase-applicant-identity-creator";
import { createServerSupabaseClient } from "@/infrastructure/supabase/server";
import {
  assertStagingSupabaseTarget,
  getAuthRedirectUrl,
  getSupabaseUrl,
} from "@/infrastructure/config/public";
import {
  evaluateApplicantEligibility,
  evaluateMembershipSubmissionEligibility,
  getCurrentParishDate,
} from "./infrastructure/applicant-eligibility";

export function getVerifiedApplicant() {
  return verifyApplicantSession(createSupabaseApplicantSessionReader());
}

/** Server-only submission gate. DOB and calculated age are returned only as a coarse result. */
export function assessMembershipSubmissionEligibility(dateOfBirth: string) {
  return evaluateMembershipSubmissionEligibility(dateOfBirth, getCurrentParishDate());
}

export async function registerApplicant(input: unknown) {
  const parsed = registrationSchema.safeParse(input);
  if (!parsed.success) return "invalid" as const;
  const today = getCurrentParishDate();
  const eligibility = evaluateApplicantEligibility(parsed.data.dateOfBirth, today);
  if (eligibility === "invalid") return "invalid" as const;
  if (eligibility === "ineligible") return "ineligible" as const;
  let env: ReturnType<typeof getServerEnv>;
  try {
    env = getServerEnv();
  } catch (error) {
    logRegistrationConfigurationFailure(error);
    throw error;
  }
  const developmentRuntime = env.APP_ENV === "development" && process.env.NODE_ENV !== "production";
  const stagingRuntime = env.APP_ENV === "staging";
  if ((!developmentRuntime && !stagingRuntime) || env.APPLICANT_REGISTRATION_ENABLED !== "true") {
    return "unavailable" as const;
  }
  if (stagingRuntime) {
    try {
      assertStagingSupabaseTarget(getSupabaseUrl());
    } catch {
      return "unavailable" as const;
    }
  }
  return createApplicantAuthIdentity({ email: parsed.data.email, password: parsed.data.password });
}

function logRegistrationConfigurationFailure(error: unknown): void {
  const errorName =
    error instanceof Error && /^[A-Za-z][A-Za-z0-9]{0,63}$/.test(error.name)
      ? error.name
      : error instanceof Error
        ? "Error"
        : "NonError";
  try {
    console.error("[applicant-registration]", "server_env_validation", errorName);
  } catch {
    // Preserve the original validation exception for the route-level handler.
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
  readonly tokenHash: string | null;
  readonly flow: string | null;
}) {
  const recovery = input.flow === "recovery";
  const isConfirmation = input.flow === "confirmation";
  const hasCode = !!input.code && input.code.length <= 4096;
  const hasConfirmationToken =
    !!input.tokenHash && input.tokenHash.length <= 4096 && isConfirmation;
  if (
    (input.code && input.code.length > 4096) ||
    (input.tokenHash && input.tokenHash.length > 4096) ||
    (input.code && input.tokenHash) ||
    (!hasCode && !hasConfirmationToken) ||
    (!isConfirmation && !recovery)
  ) {
    return { kind: "rejected" as const, recovery };
  }
  try {
    const client = await createServerSupabaseClient();
    const { error: exchangeError } = hasConfirmationToken
      ? await client.auth.verifyOtp({ token_hash: input.tokenHash!, type: "email" })
      : await client.auth.exchangeCodeForSession(input.code!);
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
