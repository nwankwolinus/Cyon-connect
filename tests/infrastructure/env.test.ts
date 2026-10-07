import { describe, expect, it } from "vitest";
import {
  parseEnv,
  privilegedEnvSchema,
  publicEnvSchema,
  serverEnvSchema,
} from "@/infrastructure/config/schema";

describe("environment validation", () => {
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
    expect(() => parseEnv(serverEnvSchema, { APP_ENV: "prod" })).toThrow(/APP_ENV/);
  });

  it("service-role key is separated from the public and server schemas", () => {
    const publicKeys = Object.keys(publicEnvSchema.shape);
    const serverKeys = Object.keys(serverEnvSchema.shape);
    expect(publicKeys.every((k) => k.startsWith("NEXT_PUBLIC_"))).toBe(true);
    expect([...publicKeys, ...serverKeys].some((k) => /SERVICE_ROLE/.test(k))).toBe(false);
    expect(Object.keys(privilegedEnvSchema.shape)).toEqual(["SUPABASE_SERVICE_ROLE_KEY"]);
  });
});
