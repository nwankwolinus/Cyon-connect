import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const root = path.resolve(__dirname, "../..");
const read = (p: string) => readFileSync(path.join(root, p), "utf8");

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(path.join(root, dir))) {
    const rel = `${dir}/${name}`; // forward slashes on every OS
    if (statSync(path.join(root, rel)).isDirectory()) walk(rel, out);
    else if (/\.(ts|tsx|mjs|js)$/.test(name)) out.push(rel);
  }
  return out;
}

describe("Supabase client separation", () => {
  it("server-side files import server-only (build fails if bundled into the browser)", () => {
    for (const f of [
      "infrastructure/supabase/admin.ts",
      "infrastructure/supabase/server.ts",
      "infrastructure/config/server.ts",
    ]) {
      expect(read(f), f).toMatch(/^import "server-only";/m);
    }
  });

  it("browser client touches only public configuration", () => {
    const src = read("infrastructure/supabase/browser.ts");
    const imports = src
      .split("\n")
      .filter((l) => /^\s*import\b/.test(l))
      .join("\n");
    const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    expect(imports).not.toMatch(/server-only|supabase\/(admin|server)|config\/server/);
    expect(code).not.toMatch(/SERVICE_ROLE/);
    expect(code).toContain("getSupabasePublicConfig");
  });

  it("the service-role variable name appears only in the config schema, server config and admin client", () => {
    const allowed = new Set([
      "infrastructure/config/schema.ts",
      "infrastructure/config/server.ts",
      "infrastructure/supabase/admin.ts",
    ]);
    const offenders = ["app", "modules", "shared", "infrastructure", "components"]
      .flatMap((d) => walk(d))
      .filter((f) => !allowed.has(f))
      .filter((f) => /SERVICE_ROLE/.test(read(f)));
    expect(offenders).toEqual([]);
  });

  it("no NEXT_PUBLIC_ variable can carry the service role", () => {
    const all = ["app", "modules", "shared", "infrastructure", "components"].flatMap((d) =>
      walk(d),
    );
    const bad = all.filter((f) => /NEXT_PUBLIC_[A-Z_]*(SERVICE|SECRET)/.test(read(f)));
    expect(bad).toEqual([]);
    expect(read(".env.example")).not.toMatch(/NEXT_PUBLIC_[A-Z_]*SERVICE/);
  });
});

describe("Supabase client factories", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("admin client refuses to be created without the service key and never echoes values", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
    const { createAdminSupabaseClient } = await import("@/infrastructure/supabase/admin");
    expect(() => createAdminSupabaseClient()).toThrow(/SUPABASE_SERVICE_ROLE_KEY/);
  });

  it("admin and browser clients can be constructed from valid configuration", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-placeholder");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-placeholder");
    const { createAdminSupabaseClient } = await import("@/infrastructure/supabase/admin");
    const { createBrowserSupabaseClient } = await import("@/infrastructure/supabase/browser");
    expect(typeof createAdminSupabaseClient().rpc).toBe("function");
    expect(typeof createBrowserSupabaseClient().rpc).toBe("function");
  });

  it("browser client does not need (or read) the service key", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-placeholder");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
    const { createBrowserSupabaseClient } = await import("@/infrastructure/supabase/browser");
    expect(() => createBrowserSupabaseClient()).not.toThrow();
  });
});
