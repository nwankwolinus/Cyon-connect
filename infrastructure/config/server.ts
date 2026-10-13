import "server-only";
import { parseEnv } from "./public-schema";
import { privilegedEnvSchema, serverEnvSchema } from "./schema";

export function getServerEnv() {
  return parseEnv(serverEnvSchema, { APP_ENV: process.env.APP_ENV });
}

/** Privileged secrets (service role). Call only from server-side infrastructure code. */
export function getPrivilegedEnv() {
  return parseEnv(privilegedEnvSchema, {
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  });
}
