import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";

const root = path.resolve(__dirname, "../..");
const migrationsDir = path.join(root, "supabase/migrations");

let db: PGlite;

async function as<T>(role: string, fn: () => Promise<T>) {
  await db.exec(`set role ${role}`);
  try {
    return await fn();
  } finally {
    await db.exec("reset role");
  }
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec(readFileSync(path.join(root, "tests/support/supabase-stub.sql"), "utf8"));
  const files = readdirSync(migrationsDir).filter((f) => f.endsWith(".sql")).sort();
  expect(files.length).toBeGreaterThan(0);
  for (const f of files) await db.exec(readFileSync(path.join(migrationsDir, f), "utf8"));
}, 60_000);

describe("platform baseline migration (applied to a clean PostgreSQL)", () => {
  it("migration files are timestamp-ordered and uniquely named", () => {
    const files = readdirSync(migrationsDir).filter((f) => f.endsWith(".sql"));
    expect(files.every((f) => /^\d{14}_[a-z0-9_]+\.sql$/.test(f))).toBe(true);
    expect(new Set(files.map((f) => f.slice(0, 14))).size).toBe(files.length);
  });

  it("creates no business tables", async () => {
    const r = await db.query("select tablename from pg_tables where schemaname='public'");
    expect(r.rows).toEqual([]);
  });

  it("platform_ping is callable by service_role only", async () => {
    const ok = await as("service_role", () => db.query<{ platform_ping: boolean }>("select public.platform_ping()"));
    expect(ok.rows[0]!.platform_ping).toBe(true);
    for (const role of ["anon", "authenticated"]) {
      await expect(as(role, () => db.query("select public.platform_ping()"))).rejects.toThrow(/permission denied/i);
    }
  });

  it("set_updated_at helper works", async () => {
    await db.exec(`
      create table public._t (id int, updated_at timestamptz default '2000-01-01');
      create trigger t before update on public._t for each row execute function public.set_updated_at();
      insert into public._t values (1);
      update public._t set id = 2;`);
    const r = await db.query<{ recent: boolean }>("select updated_at > now() - interval '1 minute' as recent from public._t");
    expect(r.rows[0]!.recent).toBe(true);
  });

  it("new tables are default-deny for anon/authenticated (explicit grants required)", async () => {
    await db.exec("create table public._probe (id int)");
    for (const role of ["anon", "authenticated"]) {
      await expect(as(role, () => db.query("select * from public._probe"))).rejects.toThrow(/permission denied/i);
    }
  });
});
