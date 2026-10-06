import { describe, expect, it } from "vitest";
import { parseEnv, publicEnvSchema, serverEnvSchema } from "@/lib/env/schema";

describe("environment validation", () => {
  it("accepts valid public config", () => {
    const env = parseEnv(publicEnvSchema, {
      NEXT_PUBLIC_APP_URL: "http://localhost:3000",
      NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "placeholder",
    });
    expect(env.NEXT_PUBLIC_APP_URL).toBe("http://localhost:3000");
  });

  it("reports variable names but never values on failure", () => {
    const secret = "super-secret-value";
    try {
      parseEnv(serverEnvSchema, { SUPABASE_SERVICE_ROLE_KEY: "", EXTRA: secret });
      throw new Error("should have thrown");
    } catch (e) {
      const msg = (e as Error).message;
      expect(msg).toContain("SUPABASE_SERVICE_ROLE_KEY");
      expect(msg).not.toContain(secret);
    }
  });
});
