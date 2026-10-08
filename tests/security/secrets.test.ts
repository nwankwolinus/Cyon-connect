import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { runTsx } from "../support/cli";
import { findSecrets } from "../../scripts/security/secret-patterns";
import nextConfig, { securityHeaders } from "@/next.config";

const root = path.resolve(__dirname, "../..");
// Built at runtime so this test file itself never contains a secret-shaped literal.
const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
const fakeJwt = `${b64({ alg: "HS256" })}.${b64({ role: "service_role", iss: "supabase" })}.${"s".repeat(30)}`;

describe("secret detector", () => {
  it("detects JWTs, private keys, DB URLs with passwords and service-role assignments", () => {
    expect(findSecrets(`const k = "${fakeJwt}"`, "a.ts")[0]?.rule).toBe("jwt");
    expect(findSecrets("-----BEGIN " + "PRIVATE KEY-----", "a.pem")[0]?.rule).toBe(
      "private-key-block",
    );
    expect(
      findSecrets("DATABASE_URL=postgres://app:realpass99@db.prod.internal/x", "a.env")[0]?.rule,
    ).toBe("postgres-url-with-password");
    expect(findSecrets(`SUPABASE_SERVICE_ROLE_KEY=${"a1B2".repeat(8)}`, "a.env")[0]?.rule).toBe(
      "service-role-assignment",
    );
  });

  it("never reports the secret value", () => {
    const f = findSecrets(`SUPABASE_SERVICE_ROLE_KEY=${"a1B2".repeat(8)}`, "a.env");
    expect(JSON.stringify(f)).not.toContain("a1B2a1B2");
  });

  it("accepts the committed .env.example (placeholders only)", () => {
    expect(
      findSecrets(readFileSync(path.join(root, ".env.example"), "utf8"), ".env.example"),
    ).toEqual([]);
  });

  it("the repository scan passes on the current tree", () => {
    const r = runTsx("scripts/security/scan-secrets.ts");
    expect(r.error).toBeUndefined();
    expect(r.stderr).toBe("");
    expect(r.status).toBe(0);
  });
});

describe("git ignore protects secrets", () => {
  const ignored = (f: string) =>
    spawnSync("git", ["check-ignore", "-q", f], { cwd: root }).status === 0;
  it("ignores real env files but not the template", () => {
    for (const f of [
      ".env",
      ".env.local",
      ".env.production",
      ".env.development.local",
      "supabase/.env",
    ])
      expect(ignored(f), f).toBe(true);
    expect(ignored(".env.example")).toBe(false);
  });
});

describe("security headers", () => {
  it("are applied to all routes and include the baseline set", async () => {
    const rules = await nextConfig.headers!();
    expect(rules[0]!.source).toBe("/:path*");
    const keys = securityHeaders.map((h) => h.key);
    for (const k of [
      "X-Content-Type-Options",
      "X-Frame-Options",
      "Referrer-Policy",
      "Strict-Transport-Security",
      "Permissions-Policy",
    ])
      expect(keys).toContain(k);
    expect(nextConfig.poweredByHeader).toBe(false);
  });
});
