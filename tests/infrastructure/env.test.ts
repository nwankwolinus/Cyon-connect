import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { parseEnv, publicEnvSchema } from "@/infrastructure/config/public-schema";
import {
  assertDevelopmentSupabaseTarget,
  getPasswordUpdateDestination,
  getTrustedAppDestination,
} from "@/infrastructure/config/public";
import { privilegedEnvSchema, serverEnvSchema } from "@/infrastructure/config/schema";

describe("environment validation", () => {
  it("restricts local development to the security-test project", () => {
    expect(() =>
      assertDevelopmentSupabaseTarget("https://crfcglxcsnmeovnipnko.supabase.co", "development"),
    ).not.toThrow();
    expect(() =>
      assertDevelopmentSupabaseTarget("https://bpooqfgadtbyeduapwyi.supabase.co", "development"),
    ).toThrow("Development Supabase target must be the CYON security-test project.");
    expect(() =>
      assertDevelopmentSupabaseTarget("http://crfcglxcsnmeovnipnko.supabase.co", "development"),
    ).toThrow("Invalid Supabase URL.");
    expect(() =>
      assertDevelopmentSupabaseTarget("https://other.supabase.co", "test"),
    ).not.toThrow();
    expect(() =>
      assertDevelopmentSupabaseTarget("http://127.0.0.1:54321", "development"),
    ).not.toThrow();
    expect(() =>
      assertDevelopmentSupabaseTarget("http://localhost:54321", "development"),
    ).not.toThrow();
    expect(() =>
      assertDevelopmentSupabaseTarget("http://127.0.0.1:54322", "development"),
    ).toThrow();
    expect(() =>
      assertDevelopmentSupabaseTarget("http://localhost.evil.test:54321", "development"),
    ).toThrow();
  });

  it("constructs only fixed internal app destinations from trusted configuration", () => {
    process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000/ignored/base";
    const destination = getTrustedAppDestination("/applicant/sign-in", "confirmed");
    expect(destination.toString()).toBe("http://localhost:3000/applicant/sign-in?status=confirmed");
    expect(getPasswordUpdateDestination().toString()).toBe(
      "http://localhost:3000/auth/reset-password?mode=update",
    );
  });

  it("accepts valid public config", () => {
    const env = parseEnv(publicEnvSchema, {
      NEXT_PUBLIC_APP_URL: "http://localhost:3000",
      NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "placeholder",
    });
    expect(env.NEXT_PUBLIC_APP_URL).toBe("http://localhost:3000");
  });

  it("rejects missing public variables by name", () => {
    expect(() => parseEnv(publicEnvSchema, {})).toThrow(/NEXT_PUBLIC_SUPABASE_URL/);
  });

  it("reports variable names but never values on failure", () => {
    const secret = "super-secret-value";
    try {
      parseEnv(privilegedEnvSchema, { SUPABASE_SERVICE_ROLE_KEY: "", EXTRA: secret });
      throw new Error("should have thrown");
    } catch (e) {
      const msg = (e as Error).message;
      expect(msg).toContain("SUPABASE_SERVICE_ROLE_KEY");
      expect(msg).not.toContain(secret);
    }
  });

  it("APP_ENV defaults to development and rejects unknown values", () => {
    expect(parseEnv(serverEnvSchema, {}).APP_ENV).toBe("development");
    expect(parseEnv(serverEnvSchema, {}).APPLICANT_REGISTRATION_ENABLED).toBe("false");
    expect(parseEnv(serverEnvSchema, {}).MEMBERSHIP_APPLICATION_SUBMISSION_ENABLED).toBe("false");
    expect(
      parseEnv(serverEnvSchema, { APPLICANT_REGISTRATION_ENABLED: "true" })
        .APPLICANT_REGISTRATION_ENABLED,
    ).toBe("true");
    expect(
      parseEnv(serverEnvSchema, { MEMBERSHIP_APPLICATION_SUBMISSION_ENABLED: "true" })
        .MEMBERSHIP_APPLICATION_SUBMISSION_ENABLED,
    ).toBe("true");
    expect(() => parseEnv(serverEnvSchema, { APPLICANT_REGISTRATION_ENABLED: "yes" })).toThrow(
      /APPLICANT_REGISTRATION_ENABLED/,
    );
    expect(() => parseEnv(serverEnvSchema, { APP_ENV: "prod" })).toThrow(/APP_ENV/);
  });

  it("disables public signup in the local Supabase configuration", () => {
    const config = readFileSync("supabase/config.toml", "utf8");
    expect(config).toMatch(/\[auth\][\s\S]*?enable_signup\s*=\s*false/);
    expect(config).toMatch(/\[auth\.email\][\s\S]*?enable_signup\s*=\s*true/);
    expect(config).toMatch(/\[auth\.email\][\s\S]*?enable_confirmations\s*=\s*true/);
    expect(config).toContain("[auth.email.template.confirmation]");
    expect(readFileSync("supabase/templates/applicant-confirmation.html", "utf8")).toContain(
      "token_hash={{ .TokenHash }}",
    );
  });

  it("accepts only a UUID for the optional server-side operational parish setting", () => {
    expect(
      parseEnv(serverEnvSchema, { CYON_ACTIVE_PARISH_ID: "4e784b43-7c94-4dd7-a215-a4f4c6b88070" })
        .CYON_ACTIVE_PARISH_ID,
    ).toBe("4e784b43-7c94-4dd7-a215-a4f4c6b88070");
    expect(() => parseEnv(serverEnvSchema, { CYON_ACTIVE_PARISH_ID: "not-a-uuid" })).toThrow(
      /CYON_ACTIVE_PARISH_ID/,
    );
  });

  it("service-role key is separated from the public and server schemas", () => {
    const publicKeys = Object.keys(publicEnvSchema.shape);
    const serverKeys = Object.keys(serverEnvSchema.shape);
    expect(publicKeys.every((k) => k.startsWith("NEXT_PUBLIC_"))).toBe(true);
    expect([...publicKeys, ...serverKeys].some((k) => /SERVICE_ROLE/.test(k))).toBe(false);
    expect(Object.keys(privilegedEnvSchema.shape)).toEqual(["SUPABASE_SERVICE_ROLE_KEY"]);
  });
});
