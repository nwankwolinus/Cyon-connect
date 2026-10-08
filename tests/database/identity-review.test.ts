import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { as, type Db, freshDb, seed } from "../support/db";

/**
 * Regression tests added by the independent KILL-CRITIC review of Sprint 1B.1.
 * They close gaps found by mutation testing: protections that were only enforced indirectly.
 */
let db: Db;
beforeAll(async () => {
  db = await freshDb();
}, 60_000);
afterAll(() => db.close());

describe("foreign keys are RESTRICT in the catalog (not merely masked by delete triggers)", () => {
  it("every foreign key on identity tables is ON DELETE RESTRICT / ON UPDATE NO ACTION", async () => {
    const r = await db.query<{ conname: string; confdeltype: string; confupdtype: string }>(`
      select conname, confdeltype, confupdtype from pg_constraint
      where contype = 'f' and conrelid in ('public.org_units'::regclass, 'public.members'::regclass, 'public.user_accounts'::regclass)`);
    expect(r.rows.length).toBeGreaterThanOrEqual(4);
    for (const fk of r.rows) {
      expect(fk.confdeltype, fk.conname).toBe("r");
      expect(fk.confupdtype, fk.conname).toBe("a");
    }
  });
});

// NOTE: "a signed-in user cannot SET ROLE service_role" cannot be asserted here: the PGlite session user is a
// superuser, so SET ROLE always succeeds. In Supabase, role selection is done by PostgREST from a signed JWT
// and clients cannot run SET ROLE. That path needs the real stack (TD-5).
describe("privilege escalation attempts as a signed-in user", () => {
  it("cannot lock rows for update/share (requires write privilege)", async () => {
    const { authUserId } = await seed.person(db);
    for (const t of ["members", "user_accounts", "org_units"]) {
      await expect(
        as(db, "authenticated", authUserId, () => db.query(`select * from public.${t} for update`)),
      ).rejects.toThrow(/permission denied/i);
    }
  });

  it("cannot read or write through a join that crosses protected tables", async () => {
    const a = await seed.person(db);
    await seed.person(db);
    const rows = await as(db, "authenticated", a.authUserId, () =>
      db.query(
        `select m.id from public.members m join public.user_accounts u on u.member_id = m.id
         join public.org_units o on o.id = m.org_unit_id`,
      ),
    );
    expect(rows.rows).toHaveLength(1);
  });
});

describe("indexes exist for the documented access patterns", () => {
  it("covers account-by-auth-user, account-by-member, members-by-org-and-status, children-of-unit", async () => {
    const r = await db.query<{ indexname: string }>(
      "select indexname from pg_indexes where schemaname = 'public'",
    );
    const names = r.rows.map((x) => x.indexname);
    for (const n of [
      "user_accounts_auth_user_key",
      "user_accounts_member_key",
      "members_org_unit_status_idx",
      "org_units_parent_id_idx",
    ]) {
      expect(names, n).toContain(n);
    }
  });
});
