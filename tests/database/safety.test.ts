import { execFileSync, spawnSync } from "node:child_process";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  assertSafeForDestructiveOperation,
  REMOTE_OVERRIDE_VARIABLE,
  REMOTE_OVERRIDE_VALUE,
  UnsafeDatabaseOperationError,
} from "@/infrastructure/database/safety";

const local = { APP_ENV: "development", NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321" };

describe("destructive database operation guard", () => {
  for (const op of ["reset", "seed"] as const) {
    it(`${op}: allows local development and test`, () => {
      expect(() => assertSafeForDestructiveOperation(op, local)).not.toThrow();
      expect(() =>
        assertSafeForDestructiveOperation(op, { ...local, APP_ENV: "test" }),
      ).not.toThrow();
    });

    it(`${op}: refuses APP_ENV=production, even with the remote override`, () => {
      expect(() =>
        assertSafeForDestructiveOperation(op, { ...local, APP_ENV: "production" }),
      ).toThrow(UnsafeDatabaseOperationError);
      expect(() =>
        assertSafeForDestructiveOperation(op, {
          APP_ENV: "production",
          [REMOTE_OVERRIDE_VARIABLE]: REMOTE_OVERRIDE_VALUE,
        }),
      ).toThrow(/production/);
    });

    it(`${op}: refuses NODE_ENV=production`, () => {
      expect(() =>
        assertSafeForDestructiveOperation(op, { ...local, NODE_ENV: "production" }),
      ).toThrow(/NODE_ENV/);
    });

    it(`${op}: fails closed when APP_ENV is unset or unknown (incl. staging)`, () => {
      expect(() => assertSafeForDestructiveOperation(op, {})).toThrow(/APP_ENV is not set/);
      expect(() => assertSafeForDestructiveOperation(op, { APP_ENV: "staging" })).toThrow(
        /staging/,
      );
      expect(() => assertSafeForDestructiveOperation(op, { APP_ENV: "prod" })).toThrow(/prod/);
    });

    it(`${op}: refuses a remote database unless explicitly overridden`, () => {
      const remote = {
        APP_ENV: "development",
        NEXT_PUBLIC_SUPABASE_URL: "https://abc.supabase.co",
      };
      expect(() => assertSafeForDestructiveOperation(op, remote)).toThrow(/not a local database/);
      expect(() =>
        assertSafeForDestructiveOperation(op, {
          ...remote,
          [REMOTE_OVERRIDE_VARIABLE]: REMOTE_OVERRIDE_VALUE,
        }),
      ).not.toThrow();
    });

    it(`${op}: treats an unparseable target as remote`, () => {
      expect(() =>
        assertSafeForDestructiveOperation(op, {
          APP_ENV: "development",
          DATABASE_URL: "not a url",
        }),
      ).toThrow(/not a local database/);
    });
  }
});

describe("database CLI wrapper", () => {
  const cli = path.resolve("scripts/database/run.ts");
  const tsx = path.resolve("node_modules/.bin/tsx");
  const run = (cmd: string, env: Record<string, string>) =>
    spawnSync(tsx, [cli, cmd, "--dry-run"], {
      env: { PATH: process.env.PATH ?? "", ...env } as unknown as NodeJS.ProcessEnv,
      encoding: "utf8",
    });

  it("refuses reset and seed against production and never reaches the supabase/psql step", () => {
    for (const cmd of ["reset", "seed"]) {
      const r = run(cmd, { APP_ENV: "production", DATABASE_URL: "postgres://u:p@localhost/db" });
      expect(r.status).toBe(3);
      expect(r.stderr).toMatch(/Refusing database/);
      expect(r.stdout).not.toMatch(/supabase|psql/);
    }
  });

  it("dry-run reset on local development prints the supabase command only", () => {
    const r = run("reset", { APP_ENV: "development" });
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("supabase db reset --local");
  });

  it("seed requires DATABASE_URL", () => {
    const r = run("seed", { APP_ENV: "development" });
    expect(r.status).toBe(3);
    expect(r.stderr).toMatch(/DATABASE_URL/);
  });

  it("exposes the guard through npm scripts", () => {
    const out = execFileSync(
      "node",
      ["-p", "require('./package.json').scripts['database:reset']"],
      { encoding: "utf8" },
    );
    expect(out).toContain("scripts/database/run.ts reset");
  });
});
