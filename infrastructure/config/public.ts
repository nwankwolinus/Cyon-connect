import { parseEnv, publicEnvSchema } from "./public-schema";

export const DEVELOPMENT_SUPABASE_PROJECT_REF = "crfcglxcsnmeovnipnko";

/** Prevent `next dev` from silently using the known production Supabase project. */
export function assertDevelopmentSupabaseTarget(url: string, nodeEnv = process.env.NODE_ENV): void {
  if (nodeEnv !== "development") return;

  let hostname: string;
  try {
    const parsed = new URL(url);
    hostname = parsed.hostname;
    const isLocalSupabase =
      (hostname === "127.0.0.1" || hostname === "localhost") &&
      parsed.protocol === "http:" &&
      parsed.port === "54321" &&
      parsed.username === "" &&
      parsed.password === "" &&
      parsed.pathname === "/" &&
      parsed.search === "" &&
      parsed.hash === "";
    if (isLocalSupabase) return;
    if (
      parsed.protocol !== "https:" ||
      parsed.port ||
      parsed.username ||
      parsed.password ||
      parsed.pathname !== "/" ||
      parsed.search ||
      parsed.hash
    ) {
      throw new Error("Invalid development Supabase URL.");
    }
  } catch {
    throw new Error("Invalid Supabase URL.");
  }

  const expectedHost = `${DEVELOPMENT_SUPABASE_PROJECT_REF}.supabase.co`;
  if (hostname !== expectedHost) {
    throw new Error("Development Supabase target must be the CYON security-test project.");
  }
}

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
  const url = parseEnv(supabaseUrlOnly, {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  }).NEXT_PUBLIC_SUPABASE_URL;
  assertDevelopmentSupabaseTarget(url);
  return url;
}

export function getSupabasePublicConfig(): { url: string; anonKey: string } {
  const env = parseEnv(supabasePublicConfig, {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  });
  assertDevelopmentSupabaseTarget(env.NEXT_PUBLIC_SUPABASE_URL);
  return { url: env.NEXT_PUBLIC_SUPABASE_URL, anonKey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY };
}

/** Build only fixed application callback destinations from trusted deployment configuration. */
export function getAuthRedirectUrl(
  path: "/auth/callback",
  flow: "confirmation" | "recovery",
): string {
  const redirect = getTrustedAppDestination(path);
  redirect.searchParams.set("flow", flow);
  return redirect.toString();
}

export function getTrustedAppDestination(
  path: "/applicant" | "/applicant/sign-in" | "/auth/callback" | "/auth/reset-password",
  status?: "confirmed" | "confirmation-failed" | "recovery-failed" | "unavailable",
): URL {
  const appUrl = parseEnv(publicEnvSchema.pick({ NEXT_PUBLIC_APP_URL: true }), {
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  }).NEXT_PUBLIC_APP_URL;
  const base = new URL(appUrl);
  if (base.protocol !== "http:" && base.protocol !== "https:") {
    throw new Error("Invalid application URL.");
  }
  const destination = new URL(path, base.origin);
  if (status) destination.searchParams.set("status", status);
  return destination;
}

export function getPasswordUpdateDestination(): URL {
  const destination = getTrustedAppDestination("/auth/reset-password");
  destination.searchParams.set("mode", "update");
  return destination;
}

/** Browser JSON endpoints accept only same-origin requests; this is CSRF defense, not bot protection. */
export function hasTrustedAppOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  return origin === getTrustedAppDestination("/applicant").origin;
}
