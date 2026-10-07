import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";

const root = path.resolve(__dirname, "../..");

export type Db = PGlite;

/** A clean PostgreSQL with a stub of Supabase's auth schema/roles and ALL migrations applied in order. */
export async function freshDb(): Promise<Db> {
  const db = new PGlite();
  await db.exec(readFileSync(path.join(root, "tests/support/supabase-stub.sql"), "utf8"));
  const dir = path.join(root, "supabase/migrations");
  for (const f of readdirSync(dir)
    .filter((x) => x.endsWith(".sql"))
    .sort()) {
    await db.exec(readFileSync(path.join(dir, f), "utf8"));
  }
  return db;
}

/** Run `fn` as a database role, optionally with a JWT subject (auth.uid()). Always resets afterwards. */
export async function as<T>(
  db: Db,
  role: "anon" | "authenticated" | "service_role",
  sub: string | null,
  fn: () => Promise<T>,
) {
  await db.exec(`set role ${role}`);
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [sub ?? ""]);
  try {
    return await fn();
  } finally {
    await db.exec("reset role");
    await db.query("select set_config('request.jwt.claim.sub', '', false)");
  }
}

/** TEST DATA helpers (clearly synthetic; never used outside tests). */
export const seed = {
  async parishId(db: Db) {
    return (
      await db.query<{ id: string }>(
        "select id from public.org_units where unit_type='parish' and parent_id is null order by created_at limit 1",
      )
    ).rows[0]!.id;
  },
  async orgUnit(db: Db, type: string, name: string, parent?: { id: string; type: string }) {
    return (
      await db.query<{ id: string }>(
        "insert into public.org_units (unit_type, name, parent_id, parent_type) values ($1,$2,$3,$4) returning id",
        [type, name, parent?.id ?? null, parent?.type ?? null],
      )
    ).rows[0]!.id;
  },
  async authUser(db: Db) {
    return (
      await db.query<{ id: string }>(
        "insert into auth.users (email) values ('test-user@example.invalid') returning id",
      )
    ).rows[0]!.id;
  },
  async member(db: Db, opts: { orgUnitId?: string; status?: string } = {}) {
    return (
      await db.query<{ id: string }>(
        "insert into public.members (org_unit_id, membership_status) values ($1, coalesce($2,'pending')) returning id",
        [opts.orgUnitId ?? (await seed.parishId(db)), opts.status ?? null],
      )
    ).rows[0]!.id;
  },
  async account(db: Db, authUserId: string, memberId: string, status?: string) {
    return (
      await db.query<{ id: string }>(
        "insert into public.user_accounts (auth_user_id, member_id, account_status) values ($1,$2,coalesce($3,'pending_activation')) returning id",
        [authUserId, memberId, status ?? null],
      )
    ).rows[0]!.id;
  },
  /** auth user + member + account in one call. */
  async person(db: Db, opts: { orgUnitId?: string; membership?: string; account?: string } = {}) {
    const authUserId = await seed.authUser(db);
    const memberId = await seed.member(db, { orgUnitId: opts.orgUnitId, status: opts.membership });
    const accountId = await seed.account(db, authUserId, memberId, opts.account ?? "active");
    return { authUserId, memberId, accountId };
  },
};
