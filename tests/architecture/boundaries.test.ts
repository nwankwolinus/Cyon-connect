import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { ESLint } from "eslint";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const root = path.resolve(__dirname, "../..");
const depcruise = path.join(root, "node_modules/dependency-cruiser/bin/dependency-cruiser.mjs");
const config = path.join(root, ".dependency-cruiser.cjs");

interface Violation {
  rule: { name: string };
  from: string;
}

function cruise(cwd: string, dirs: string[], extra: string[] = []) {
  const r = spawnSync(process.execPath, [depcruise, ...dirs, "--config", config, "--output-type", "json", ...extra], {
    cwd,
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024,
  });
  const summary = JSON.parse(r.stdout).summary as { violations: Violation[]; error: number };
  return { errors: summary.error, violations: summary.violations };
}

describe("architecture: real repository", () => {
  it("has no boundary violations", () => {
    const { errors, violations } = cruise(root, ["app", "modules", "shared", "infrastructure", "components", "scripts"], [
      "--ts-config",
      "tsconfig.json",
    ]);
    expect(violations).toEqual([]);
    expect(errors).toBe(0);
  });
});

describe("architecture: prohibited dependencies are detected", () => {
  let dir: string;
  const files: Record<string, string> = {
    // ---- compliant code (must produce NO violations)
    "shared/r.ts": "export const r = 1;",
    "modules/demo/domain/ok.ts": "export const ok = 1;",
    "modules/demo/infrastructure/repo.ts": "export const repo = 1;",
    "modules/demo/application/ok.ts": 'import { ok } from "../domain/ok";\nimport { r } from "../../../shared/r";\nexport const f = ok + r;',
    "modules/demo/presentation/ok.ts": 'import { f } from "../application/ok";\nexport const p = f;',
    "modules/demo/composition.ts": 'import { repo } from "./infrastructure/repo";\nimport { f } from "./application/ok";\nexport const c = repo + f;',
    // ---- domain violations
    "modules/demo/domain/bad-supabase.ts": 'import { createClient } from "@supabase/supabase-js";\nexport const a = createClient;',
    "modules/demo/domain/bad-next.ts": 'import { headers } from "next/headers";\nexport const b = headers;',
    "modules/demo/domain/bad-react.ts": 'import * as React from "react";\nexport const c2 = React;',
    "modules/demo/domain/bad-infra.ts": 'import { repo } from "../infrastructure/repo";\nexport const d = repo;',
    "modules/demo/domain/bad-global-infra.ts": 'import { x } from "../../../infrastructure/supabase/admin";\nexport const e = x;',
    // ---- application violations
    "modules/demo/application/bad-infra.ts": 'import { repo } from "../infrastructure/repo";\nexport const g = repo;',
    "modules/demo/application/bad-supabase.ts": 'import { createClient } from "@supabase/supabase-js";\nexport const h = createClient;',
    "modules/demo/application/bad-test.ts": 'import { t } from "../../../tests/helper";\nexport const i = t;',
    // ---- presentation violations
    "modules/demo/presentation/bad-infra.ts": 'import { repo } from "../infrastructure/repo";\nexport const j = repo;',
    "modules/demo/presentation/bad-domain.ts": 'import { ok } from "../domain/ok";\nexport const k = ok;',
    "modules/demo/presentation/Client.tsx": 'import { x } from "../../../infrastructure/supabase/admin";\nexport default x;',
    // ---- cross-module
    "modules/other/application/bad-cross.ts": 'import { ok } from "../../demo/domain/ok";\nexport const l = ok;',
    "modules/other/application/bad-cross-composition.ts": 'import { c } from "../../demo/composition";\nexport const m = c;',
    // ---- upward / global
    "modules/demo/infrastructure/bad-upward.ts": 'import { p } from "../presentation/ok";\nexport const n = p;',
    "shared/bad.ts": 'import { ok } from "../modules/demo/domain/ok";\nexport const o = ok;',
    "infrastructure/supabase/admin.ts": "export const x = 1;",
    "infrastructure/bad-business.ts": 'import { ok } from "../modules/demo/domain/ok";\nexport const q = ok;',
    "app/bad-route.ts": 'import { ok } from "../modules/demo/domain/ok";\nexport const s = ok;',
    "app/bad-page.tsx": 'import { x } from "../infrastructure/supabase/admin";\nexport default x;',
    "shared/c1.ts": 'import { c2 } from "./c2";\nexport const c1 = c2;',
    "shared/c2.ts": 'import { c1 } from "./c1";\nexport const c2 = c1;',
    "tests/helper.ts": "export const t = 1;",
  };

  beforeAll(() => {
    dir = mkdtempSync(path.join(os.tmpdir(), "arch-fixture-"));
    symlinkSync(path.join(root, "node_modules"), path.join(dir, "node_modules"));
    writeFileSync(path.join(dir, "package.json"), "{}");
    for (const [rel, body] of Object.entries(files)) {
      mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
      writeFileSync(path.join(dir, rel), body);
    }
  });
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  const expected: Array<[rule: string, from: string]> = [
    ["domain-no-frameworks", "modules/demo/domain/bad-supabase.ts"],
    ["domain-no-frameworks", "modules/demo/domain/bad-next.ts"],
    ["domain-no-frameworks", "modules/demo/domain/bad-react.ts"],
    ["domain-isolation", "modules/demo/domain/bad-infra.ts"],
    ["domain-isolation", "modules/demo/domain/bad-global-infra.ts"],
    ["application-isolation", "modules/demo/application/bad-infra.ts"],
    ["application-isolation", "modules/demo/application/bad-test.ts"],
    ["application-no-frameworks", "modules/demo/application/bad-supabase.ts"],
    ["presentation-isolation", "modules/demo/presentation/bad-infra.ts"],
    ["presentation-isolation", "modules/demo/presentation/bad-domain.ts"],
    ["no-server-clients-from-tsx", "modules/demo/presentation/Client.tsx"],
    ["privileged-clients-restricted", "modules/demo/presentation/Client.tsx"],
    ["no-cross-module-internals", "modules/other/application/bad-cross.ts"],
    ["no-cross-module-internals", "modules/other/application/bad-cross-composition.ts"],
    ["module-infrastructure-no-upward", "modules/demo/infrastructure/bad-upward.ts"],
    ["shared-kernel-pure", "shared/bad.ts"],
    ["global-infrastructure-no-business", "infrastructure/bad-business.ts"],
    ["app-via-module-entrypoints", "app/bad-route.ts"],
    ["no-server-clients-from-tsx", "app/bad-page.tsx"],
    ["privileged-clients-restricted", "app/bad-page.tsx"],
    ["no-circular", "shared/c1.ts"],
    ["no-tests-in-production-code", "modules/demo/application/bad-test.ts"],
  ];

  it("flags every prohibited import and nothing else", () => {
    const { errors, violations } = cruise(dir, ["app", "modules", "shared", "infrastructure", "tests"]);
    const got = new Set(violations.map((v) => `${v.rule.name} @ ${v.from}`));
    for (const [rule, from] of expected) expect(got, `${rule} @ ${from}`).toContain(`${rule} @ ${from}`);
    const compliant = violations.filter((v) => /(^|\/)(ok|repo|r)\.ts$|^modules\/demo\/composition\.ts$/.test(v.from));
    expect(compliant.map((v) => `${v.rule.name} @ ${v.from}`)).toEqual([]);
    expect(errors).toBeGreaterThan(0);
  });
});

describe("architecture: ESLint boundary rules give editor feedback", () => {
  const eslint = new ESLint({ cwd: root });
  const lint = async (file: string, code: string) =>
    (await eslint.lintText(code, { filePath: path.join(root, file) }))[0]!.messages.map((m) => m.ruleId);

  it("forbids frameworks, Supabase and infrastructure imports in domain code", async () => {
    expect(await lint("modules/demo/domain/a.ts", 'import { headers } from "next/headers";\nexport const a = headers;')).toContain("no-restricted-imports");
    expect(await lint("modules/demo/domain/b.ts", 'import { createClient } from "@supabase/supabase-js";\nexport const b = createClient;')).toContain("no-restricted-imports");
    expect(await lint("modules/demo/domain/c.ts", 'import { x } from "@/infrastructure/supabase/admin";\nexport const c = x;')).toContain("no-restricted-imports");
  });

  it("forbids environment variables and browser globals in domain/application/shared", async () => {
    expect(await lint("modules/demo/domain/d.ts", "export const d = process.env.FOO;")).toContain("no-restricted-syntax");
    expect(await lint("modules/demo/application/e.ts", "export const e = window.location;")).toContain("no-restricted-globals");
    expect(await lint("shared/f.ts", "export const f = process.env.FOO;")).toContain("no-restricted-syntax");
  });

  it("does not restrict infrastructure code", async () => {
    expect(await lint("infrastructure/g.ts", "export const g = process.env.FOO;")).not.toContain("no-restricted-syntax");
  });
});
