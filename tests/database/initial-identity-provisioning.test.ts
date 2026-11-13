import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { as, type Db, freshDb, seed } from "../support/db";

const parishName = "SS Joachim and Anne Catholic Church, Ijegun";
let db: Db;

beforeEach(async () => {
  db = await freshDb();
});

afterEach(async () => db.close());

describe("development initial identity provisioning hardening", () => {
  it("retains the historical state and audit objects but the provisioning RPC always fails closed", async () => {
    const orgUnitId = await seed.parishId(db);
    const authUserId = await seed.authUser(db);

    await expect(
      db.query(`select * from public.provision_initial_identity($1::uuid,$2,$3::uuid,$4,$5,$6)`, [
        authUserId,
        "crfcglxcsnmeovnipnko",
        orgUnitId,
        "parish",
        parishName,
        "synthetic-owner-evidence",
      ]),
    ).rejects.toThrow("Initial identity provisioning rejected.");

    const result = await db.query<{
      accounts: number;
      members: number;
      audits: number;
      closed: boolean;
    }>(`
      select (select count(*)::int from public.user_accounts) accounts,
             (select count(*)::int from public.members) members,
             (select count(*)::int from identity_private.initial_identity_provisioning_audit) audits,
             (select closed_at is not null from identity_private.initial_identity_provisioning_state where singleton) closed`);
    expect(result.rows[0]).toEqual({ accounts: 0, members: 0, audits: 0, closed: false });
  });

  it("keeps the RPC owner-controlled and denies application roles", async () => {
    const result = await db.query<{
      owner: string;
      security_definer: boolean;
      owner_can_execute: boolean;
      anon_can_execute: boolean;
      authenticated_can_execute: boolean;
      service_role_can_execute: boolean;
    }>(`
      select pg_catalog.pg_get_userbyid(p.proowner) as owner,
             p.prosecdef as security_definer,
             has_function_privilege(p.proowner, p.oid, 'EXECUTE') as owner_can_execute,
             has_function_privilege('anon', p.oid, 'EXECUTE') as anon_can_execute,
             has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_can_execute,
             has_function_privilege('service_role', p.oid, 'EXECUTE') as service_role_can_execute
      from pg_catalog.pg_proc p
      where p.oid = 'public.provision_initial_identity(uuid,text,uuid,text,text,text)'::regprocedure`);

    expect(result.rows[0]).toEqual({
      owner: "postgres",
      security_definer: true,
      owner_can_execute: true,
      anon_can_execute: false,
      authenticated_can_execute: false,
      service_role_can_execute: false,
    });
  });

  it("preserves the service-role write revocations on identity tables", async () => {
    for (const table of ["members", "user_accounts"]) {
      expect(
        await db.query(
          `select has_table_privilege('service_role','public.${table}','INSERT') as allowed`,
        ),
      ).toMatchObject({ rows: [{ allowed: false }] });
      expect(
        await db.query(
          `select has_table_privilege('service_role','public.${table}','UPDATE') as allowed`,
        ),
      ).toMatchObject({ rows: [{ allowed: false }] });
    }
  });

  it("denies the RPC to anon, authenticated, and service_role", async () => {
    const authUserId = await seed.authUser(db);
    const orgUnitId = await seed.parishId(db);
    for (const role of ["anon", "authenticated", "service_role"] as const) {
      await expect(
        as(db, role, authUserId, () =>
          db.query(
            `select * from public.provision_initial_identity($1::uuid,$2,$3::uuid,$4,$5,$6)`,
            [
              authUserId,
              "crfcglxcsnmeovnipnko",
              orgUnitId,
              "parish",
              parishName,
              "synthetic-owner-evidence",
            ],
          ),
        ),
      ).rejects.toThrow(/permission denied/i);
    }
  });
});
