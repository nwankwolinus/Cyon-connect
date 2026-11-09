import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { as, type Db, freshDb, seed } from "../support/db";

const projectRef = "bpooqfgadtbyeduapwyi";
const targetAuthUserId = "81e089b4-c59f-47f4-ab8c-f73cb34cdeea";
const parishName = "SS Joachim and Anne Catholic Church, Ijegun";
let db: Db;
let orgUnitId: string;

async function provision(
  authUserId = targetAuthUserId,
  selectedOrgId: string | null = orgUnitId,
  expectedType = "parish",
  expectedName = parishName,
  approvalReference = "owner-reviewed-initial-identity",
) {
  return db.query<{
    account_id: string;
    member_id: string;
    org_unit_id: string;
  }>(`select * from public.provision_initial_identity($1::uuid,$2,$3::uuid,$4,$5,$6)`, [
    authUserId,
    projectRef,
    selectedOrgId,
    expectedType,
    expectedName,
    approvalReference,
  ]);
}

beforeEach(async () => {
  db = await freshDb();
  orgUnitId = await seed.parishId(db);
  await db.query("insert into auth.users(id,email) values ($1,$2)", [
    targetAuthUserId,
    "bootstrap-target@example.invalid",
  ]);
});

afterEach(async () => db.close());

describe("operator-only initial identity provisioning", () => {
  it("creates a distinct active member/account chain, records audit, closes, and grants no role", async () => {
    const result = await provision();
    const created = result.rows[0]!;
    expect(created.org_unit_id).toBe(orgUnitId);
    expect(created.member_id).not.toBe(created.account_id);
    expect(created.account_id).not.toBe(targetAuthUserId);

    const chain = await db.query<{
      auth_user_id: string;
      account_status: string;
      account_id: string;
      member_id: string;
      membership_status: string;
      org_unit_id: string;
      org_unit_type: string;
    }>(`
      select ua.auth_user_id, ua.account_status, ua.id account_id, m.id member_id,
             m.membership_status, m.org_unit_id, m.org_unit_type
      from public.user_accounts ua join public.members m on m.id=ua.member_id`);
    expect(chain.rows).toEqual([
      {
        auth_user_id: targetAuthUserId,
        account_status: "active",
        account_id: created.account_id,
        member_id: created.member_id,
        membership_status: "active",
        org_unit_id: orgUnitId,
        org_unit_type: "parish",
      },
    ]);
    const recorded = await db.query<{ audit_count: number; closed: boolean; roles: number }>(`
      select (select count(*)::int from identity_private.initial_identity_provisioning_audit) audit_count,
             (select closed_at is not null from identity_private.initial_identity_provisioning_state where singleton) closed,
             (select count(*)::int from authorization_private.platform_role_assignments) roles`);
    expect(recorded.rows[0]).toEqual({ audit_count: 1, closed: true, roles: 0 });
  });

  it("rejects an Auth UUID that does not exist", async () => {
    await expect(provision(randomUUID())).rejects.toThrow(
      "Initial identity provisioning rejected.",
    );
    await expect(db.query("select 1 from public.members")).resolves.toMatchObject({ rows: [] });
  });

  it.each([
    { id: randomUUID(), type: "parish", name: parishName },
    { id: null, type: "parish", name: parishName },
    { id: orgUnitId, type: "deanery", name: parishName },
    { id: orgUnitId, type: "parish", name: "Different organization" },
  ])("rejects an invalid, omitted, or mismatched organization target", async (target) => {
    await expect(provision(targetAuthUserId, target.id, target.type, target.name)).rejects.toThrow(
      "Initial identity provisioning rejected.",
    );
    await expect(db.query("select 1 from public.user_accounts")).resolves.toMatchObject({
      rows: [],
    });
  });

  it("rejects if an account already exists for the Auth identity", async () => {
    const memberId = await seed.member(db, { orgUnitId, status: "active" });
    await seed.account(db, targetAuthUserId, memberId, "active");
    await expect(provision()).rejects.toThrow("Initial identity provisioning rejected.");
  });

  it("rejects pre-existing member records rather than guessing whether one is a duplicate", async () => {
    await seed.member(db, { orgUnitId, status: "active" });
    await expect(provision()).rejects.toThrow("Initial identity provisioning rejected.");
    await expect(db.query("select 1 from public.user_accounts")).resolves.toMatchObject({
      rows: [],
    });
  });

  it("rejects the wrong environment and missing approval reference", async () => {
    await expect(
      db.query(`select * from public.provision_initial_identity($1::uuid,$2,$3::uuid,$4,$5,$6)`, [
        targetAuthUserId,
        "crfcglxcsnmeovnipnko",
        orgUnitId,
        "parish",
        parishName,
        "review-ref",
      ]),
    ).rejects.toThrow("Initial identity provisioning rejected.");
    await expect(
      provision(targetAuthUserId, orgUnitId, "parish", parishName, "short"),
    ).rejects.toThrow("Initial identity provisioning rejected.");
  });

  it("always sets eligible statuses and rejects duplicate execution", async () => {
    const first = await provision();
    await expect(provision()).rejects.toThrow("Initial identity provisioning rejected.");
    const counts = await db.query<{ accounts: number; members: number; audits: number }>(`
      select (select count(*)::int from public.user_accounts) accounts,
             (select count(*)::int from public.members) members,
             (select count(*)::int from identity_private.initial_identity_provisioning_audit) audits`);
    expect(first.rows).toHaveLength(1);
    expect(counts.rows[0]).toEqual({ accounts: 1, members: 1, audits: 1 });
  });

  it("rolls back identity rows and one-time state when audit persistence fails", async () => {
    await db.exec(`
      create function identity_private.fail_initial_identity_audit() returns trigger
      language plpgsql as $$ begin raise exception 'synthetic audit failure'; end $$;
      create trigger fail_initial_identity_audit
      before insert on identity_private.initial_identity_provisioning_audit
      for each row execute function identity_private.fail_initial_identity_audit();`);
    await expect(provision()).rejects.toThrow("Initial identity provisioning rejected.");
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

  it("denies anon, authenticated, and service_role invocation", async () => {
    for (const role of ["anon", "authenticated", "service_role"] as const) {
      await expect(as(db, role, targetAuthUserId, () => provision())).rejects.toThrow(
        /permission denied/i,
      );
    }
  });
});
