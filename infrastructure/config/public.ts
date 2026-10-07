import { parseEnv, publicEnvSchema } from "./schema";

/**
 * Public config. Each variable is referenced statically so Next.js can inline it into browser bundles.
 * Validated lazily so builds and tests do not require real credentials.
 */
export function getPublicEnv() {
  return parseEnv(publicEnvSchema, {
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  });
}
