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

const supabaseUrlOnly = publicEnvSchema.pick({ NEXT_PUBLIC_SUPABASE_URL: true });
const supabasePublicConfig = publicEnvSchema.pick({
  NEXT_PUBLIC_SUPABASE_URL: true,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: true,
});

/** Narrow getters so a Supabase client does not require unrelated variables to be set. */
export function getSupabaseUrl(): string {
  return parseEnv(supabaseUrlOnly, {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  }).NEXT_PUBLIC_SUPABASE_URL;
}

export function getSupabasePublicConfig(): { url: string; anonKey: string } {
  const env = parseEnv(supabasePublicConfig, {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  });
  return { url: env.NEXT_PUBLIC_SUPABASE_URL, anonKey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY };
}
