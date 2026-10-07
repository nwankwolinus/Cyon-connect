import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import { createCheckReadiness } from "@/modules/health/application/check-readiness";
import type { InfrastructureProbe } from "@/modules/health/application/ports";
import { buildReadinessReport } from "@/modules/health/domain/readiness";
import { createSupabaseDatabaseProbe } from "@/modules/health/infrastructure/supabase-database-probe";
import {
  createReadinessHandler,
  livenessHandler,
} from "@/modules/health/presentation/health-handlers";
import type { Logger } from "@/shared/logging/logger";

const silent = (): Logger & { warn: ReturnType<typeof vi.fn> } => ({
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
});
const probe = (name: string, check: () => Promise<void>): InfrastructureProbe => ({ name, check });

describe("domain: readiness report", () => {
  it("is not_ready when nothing was checked (fail closed)", () => {
    expect(buildReadinessReport([]).status).toBe("not_ready");
  });
});

describe("application: check readiness", () => {
  it("ready when all probes pass", async () => {
    const run = createCheckReadiness({
      probes: [probe("database", async () => {})],
      logger: silent(),
    });
    const report = await run();
    expect(report.status).toBe("ready");
    expect(report.checks[0]).toMatchObject({ name: "database", status: "up" });
  });

  it("not_ready when a probe rejects, and secrets in the error never reach the report or logs", async () => {
    const logger = silent();
    const run = createCheckReadiness({
      probes: [
        probe("database", async () => {
          throw new Error("password=hunter2 at db.internal:5432");
        }),
      ],
      logger,
    });
    const report = await run();
    expect(report.status).toBe("not_ready");
    expect(report.checks[0]!.status).toBe("down");
    expect(JSON.stringify(report)).not.toMatch(/hunter2|internal/);
    expect(JSON.stringify(logger.warn.mock.calls)).not.toMatch(/hunter2|internal/);
  });

  it("treats a hung probe as down after the timeout", async () => {
    const run = createCheckReadiness({
      probes: [probe("database", () => new Promise<void>(() => {}))],
      logger: silent(),
      timeoutMs: 20,
    });
    expect((await run()).checks[0]!.status).toBe("down");
  });

  it("one failing dependency makes the whole service not_ready", async () => {
    const run = createCheckReadiness({
      probes: [
        probe("a", async () => {}),
        probe("b", async () => {
          throw new Error("x");
        }),
      ],
      logger: silent(),
    });
    const report = await run();
    expect(report.status).toBe("not_ready");
    expect(report.checks.map((c) => c.status)).toEqual(["up", "down"]);
  });
});

describe("presentation: handlers", () => {
  it("liveness needs no infrastructure or configuration", async () => {
    const res = livenessHandler();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok" });
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("readiness returns 200 when ready, with a correlation id", async () => {
    const handler = createReadinessHandler(
      async () => buildReadinessReport([{ name: "database", status: "up", latencyMs: 3 }]),
      silent(),
    );
    const res = await handler(new Request("http://x/api/health/ready"));
    expect(res.status).toBe(200);
    expect(res.headers.get("x-correlation-id")).toBeTruthy();
  });

  it("readiness returns 503 when not ready, without error text", async () => {
    const handler = createReadinessHandler(
      async () => buildReadinessReport([{ name: "database", status: "down", latencyMs: 9 }]),
      silent(),
    );
    const res = await handler(new Request("http://x"));
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({
      status: "not_ready",
      checks: [{ name: "database", status: "down", latencyMs: 9 }],
    });
  });

  it("an unexpected crash becomes a safe 500 envelope", async () => {
    const handler = createReadinessHandler(async () => {
      throw new Error("stack with secret");
    }, silent());
    const res = await handler(new Request("http://x"));
    const text = await res.text();
    expect(res.status).toBe(500);
    expect(text).not.toContain("secret");
  });
});

describe("infrastructure: supabase database probe", () => {
  const client = (result: unknown) =>
    ({ rpc: vi.fn().mockResolvedValue(result) }) as unknown as SupabaseClient;

  it("passes when platform_ping returns true", async () => {
    await expect(
      createSupabaseDatabaseProbe(() => client({ data: true, error: null })).check(),
    ).resolves.toBeUndefined();
  });
  it("fails on an error, an unexpected value, or a client that cannot be created", async () => {
    await expect(
      createSupabaseDatabaseProbe(() => client({ data: null, error: { message: "boom" } })).check(),
    ).rejects.toThrow();
    await expect(
      createSupabaseDatabaseProbe(() => client({ data: false, error: null })).check(),
    ).rejects.toThrow();
    await expect(
      createSupabaseDatabaseProbe(() => {
        throw new Error("missing env");
      }).check(),
    ).rejects.toThrow();
  });
});
