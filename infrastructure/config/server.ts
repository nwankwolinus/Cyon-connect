import "server-only";
import { parseEnv } from "./public-schema";
import { privilegedEnvSchema, serverEnvSchema } from "./schema";

export function getServerEnv() {
  return parseEnv(serverEnvSchema, {
    APP_ENV: process.env.APP_ENV,
    APPLICANT_REGISTRATION_ENABLED: process.env.APPLICANT_REGISTRATION_ENABLED,
    MEMBERSHIP_APPLICATION_SUBMISSION_ENABLED:
      process.env.MEMBERSHIP_APPLICATION_SUBMISSION_ENABLED,
    CYON_ACTIVE_PARISH_ID: process.env.CYON_ACTIVE_PARISH_ID,
    MEMBERSHIP_PHOTO_CLEANUP_HMAC_SECRET: process.env.MEMBERSHIP_PHOTO_CLEANUP_HMAC_SECRET,
  });
}

/** Privileged secrets (service role). Call only from server-side infrastructure code. */
export function getPrivilegedEnv() {
  return parseEnv(privilegedEnvSchema, {
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  });
}
