import { z } from "zod";
export { parseEnv } from "./public-schema";
export type { PublicEnv } from "./public-schema";

export const APP_ENVIRONMENTS = ["development", "test", "staging", "production"] as const;
export type AppEnvironment = (typeof APP_ENVIRONMENTS)[number];

/** Server-only, non-secret configuration. */
export const serverEnvSchema = z.object({
  /** Explicit deployment identity. NODE_ENV is not enough: Vercel previews also run NODE_ENV=production. */
  APP_ENV: z.enum(APP_ENVIRONMENTS).default("development"),
  /** Applicant identity creation is opt-in and limited to development until hosted gates are verified. */
  APPLICANT_REGISTRATION_ENABLED: z.enum(["true", "false"]).default("false"),
  /** Membership submission stays disabled unless explicitly enabled in development. */
  MEMBERSHIP_APPLICATION_SUBMISSION_ENABLED: z.enum(["true", "false"]).default("false"),
  /** Trusted server-only UUID for the sole operational CYON parish. */
  CYON_ACTIVE_PARISH_ID: z.string().uuid().optional(),
  /** HMAC key for the scheduled, server-only draft-photo cleanup invocation. */
  MEMBERSHIP_PHOTO_CLEANUP_HMAC_SECRET: z.string().min(43).optional(),
});

/** Privileged secrets. Server-only. Never logged, never NEXT_PUBLIC_. */
export const privilegedEnvSchema = z.object({
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;
export type PrivilegedEnv = z.infer<typeof privilegedEnvSchema>;
