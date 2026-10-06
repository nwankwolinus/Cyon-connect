import { parseEnv, publicEnvSchema, serverEnvSchema } from "./schema";

/** Validate public config lazily so builds and tests do not require real credentials. */
export function getPublicEnv() {
  return parseEnv(publicEnvSchema, {
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  });
}

/** Server-side only. Call from server code (route handlers, server actions, services). */
export function getServerEnv() {
  return parseEnv(serverEnvSchema, {
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  });
}
