import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { GET as liveness } from "@/app/api/health/route";
import { GET as readiness } from "@/app/api/health/ready/route";

// A tiny fake PostgREST so the REAL supabase-js adapter and admin client are exercised end to end.
let server: Server;
let mode: "ok" | "error" | "false" = "ok";
let baseUrl = "";

beforeAll(async () => {
  server = createServer((req, res) => {
    res.setHeader("content-type", "application/json");
    if (req.url?.startsWith("/rest/v1/rpc/platform_ping") && mode === "ok") return void res.end("true");
    if (mode === "false") return void res.end("false");
    res.statusCode = 500;
    res.end(JSON.stringify({ message: "relation secret_table does not exist", hint: "db.internal" }));
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => new Promise<void>((r) => server.close(() => r())));
afterEach(() => vi.unstubAllEnvs());

const call = () => readiness(new Request("http://app/api/health/ready"));

describe("GET /api/health (liveness)", () => {
  it("is 200 with no configuration at all", async () => {
    const res = liveness();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok" });
  });
});

describe("GET /api/health/ready (readiness)", () => {
  it("200 when the database answers", async () => {
    mode = "ok";
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", baseUrl);
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-placeholder");
    const res = await call();
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ status: "ready", checks: [{ name: "database", status: "up" }] });
  });

  it("503 without leaking details when the database errors", async () => {
    mode = "error";
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", baseUrl);
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-placeholder");
    const res = await call();
    const text = await res.text();
    expect(res.status).toBe(503);
    expect(text).not.toMatch(/secret_table|internal|service-placeholder|127\.0\.0\.1/);
  });

  it("503 when the database is unreachable", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:9");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-placeholder");
    expect((await call()).status).toBe(503);
  });

  it("503 when configuration is missing (liveness is unaffected)", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
    const res = await call();
    expect(res.status).toBe(503);
    expect(liveness().status).toBe(200);
  });

  it("503 when the probe returns something other than true", async () => {
    mode = "false";
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", baseUrl);
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-placeholder");
    expect((await call()).status).toBe(503);
  });
});
