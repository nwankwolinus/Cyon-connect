import { z } from "zod";

export const APP_ENVIRONMENTS = ["development", "test", "staging", "production"] as const;
export type AppEnvironment = (typeof APP_ENVIRONMENTS)[number];

/** Public configuration: safe for browsers and future mobile clients. Keys MUST start with NEXT_PUBLIC_. */
export const publicEnvSchema = z.object({
  NEXT_PUBLIC_APP_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
});

/** Server-only, non-secret configuration. */
export const serverEnvSchema = z.object({
  /** Explicit deployment identity. NODE_ENV is not enough: Vercel previews also run NODE_ENV=production. */
  APP_ENV: z.enum(APP_ENVIRONMENTS).default("development"),
});

/** Privileged secrets. Server-only. Never logged, never NEXT_PUBLIC_. */
export const privilegedEnvSchema = z.object({
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
});

export type PublicEnv = z.infer<typeof publicEnvSchema>;
export type ServerEnv = z.infer<typeof serverEnvSchema>;
export type PrivilegedEnv = z.infer<typeof privilegedEnvSchema>;

/** Pure parser (testable). Error messages list variable names only, never values. */
export function parseEnv<T extends z.ZodTypeAny>(
  schema: T,
  source: Record<string, string | undefined>,
): z.infer<T> {
  const result = schema.safeParse(source);
  if (!result.success) {
    const names = [...new Set(result.error.issues.map((i) => i.path.join(".")))].join(", ");
    throw new Error(`Invalid or missing environment variables: ${names}`);
  }
  return result.data;
}
