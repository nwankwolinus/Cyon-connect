import "server-only";
import { createAdminSupabaseClient } from "@/infrastructure/supabase/admin";
import { createServerSupabaseClient } from "@/infrastructure/supabase/server";
import { getAuthRedirectUrl } from "@/infrastructure/config/public";

/**
 * Creates an unconfirmed Auth identity after the caller has checked eligibility,
 * then asks Auth to send the normal signup confirmation email. DOB is deliberately
 * not accepted by this adapter and is never sent to Auth.
 */
export async function createApplicantAuthIdentity(input: {
  readonly email: string;
  readonly password: string;
}): Promise<"accepted" | "unavailable"> {
  let stage: "configuration" | "admin_identity_creation" | "confirmation_email_resend" =
    "configuration";
  try {
    const admin = createAdminSupabaseClient();
    stage = "admin_identity_creation";
    const { data, error } = await admin.auth.admin.createUser({
      email: input.email,
      password: input.password,
      email_confirm: false,
    });

    if (error && !isDuplicateEmailError(error)) {
      logRegistrationFailure("admin_identity_creation_failed");
      return "unavailable";
    }

    // Re-running after a lost response is safe: Auth's unique email identity
    // prevents duplicate creation, and resend recovers confirmation delivery.
    // Duplicate-account outcomes stay generic to avoid account enumeration.
    stage = "confirmation_email_resend";
    const serverClient = await createServerSupabaseClient();
    const { error: confirmationError } = await serverClient.auth.resend({
      type: "signup",
      email: input.email,
      options: {
        emailRedirectTo: getAuthRedirectUrl("/auth/callback", "confirmation"),
      },
    });

    if (error) return "accepted";
    if (confirmationError) {
      logRegistrationFailure("confirmation_email_resend_failed");
      return "unavailable";
    }
    if (!data.user) {
      logRegistrationFailure("admin_identity_creation_incomplete");
      return "unavailable";
    }
    return "accepted";
  } catch {
    logRegistrationFailure(`${stage}_exception`);
    return "unavailable";
  }
}

/** Logs only a fixed diagnostic category; never include provider errors or applicant data. */
function logRegistrationFailure(
  category:
    | "admin_identity_creation_failed"
    | "admin_identity_creation_incomplete"
    | "confirmation_email_resend_failed"
    | "configuration_exception"
    | "admin_identity_creation_exception"
    | "confirmation_email_resend_exception",
): void {
  console.error("[applicant-registration]", category);
}

function isDuplicateEmailError(error: { readonly code?: string | null }): boolean {
  return error.code === "email_exists" || error.code === "user_already_exists";
}
