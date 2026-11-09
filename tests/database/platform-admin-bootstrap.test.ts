import { createHmac, randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { as, type Db, freshDb, seed } from "../support/db";
import {
  canonicalPlatformAdminManifest,
  PLATFORM_ADMIN_PERMISSION_CEILING,
  signPlatformAdminManifest,
  type InitialPlatformAdminManifest,
} from "@/scripts/security/platform-admin-bootstrap-manifest";

const key = Buffer.from("0123456789abcdef0123456789abcdef", "utf8");
const projectRef = "bpooqfgadtbyeduapwyi";
let db: Db;

async function configureVault() {
  await db.query("insert into vault.decrypted_secrets(name,decrypted_secret) values ($1,$2)", [
    "cyon-initial-platform-admin-bootstrap-v1",
    JSON.stringify({ project_ref: projectRef, hmac_key_base64: key.toString("base64") }),
  ]);
}

async function eligibleIdentity() {
  const person = await seed.person(db, { account: "active", membership: "active" });
  const organization = await db.query<{ org_unit_id: string }>(
    "select org_unit_id from public.members where id=$1",
    [person.memberId],
  );
  return { ...person, orgUnitId: organization.rows[0]!.org_unit_id };
}

function manifestFor(
  identity: Awaited<ReturnType<typeof eligibleIdentity>>,
): InitialPlatformAdminManifest {
  const issuedAt = new Date(Math.floor(Date.now() / 1000) * 1000).toISOString();
  return {
    version: "cyon-platform-admin-bootstrap/v1",
    project_ref: projectRef,
    operation_id: randomUUID(),
    target_auth_user_id: identity.authUserId,
    target_account_id: identity.accountId,
    target_member_id: identity.memberId,
    target_org_unit_id: identity.orgUnitId,
    role: "PLATFORM_ADMIN",
    scope: "platform",
    permission_ceiling: PLATFORM_ADMIN_PERMISSION_CEILING,
    issued_at: issuedAt,
    expires_at: new Date(Date.parse(issuedAt) + 5 * 60_000).toISOString(),
    approver_auth_user_id: identity.authUserId,
    evidence_reference: "test-owner-approval",
  };
}

async function invoke(
  manifest: InitialPlatformAdminManifest,
  mac = signPlatformAdminManifest(manifest, key),
) {
  return as(db, "service_role", null, () =>
    db.query<{ bootstrap_initial_platform_admin: boolean }>(
      "select public.bootstrap_initial_platform_admin($1::jsonb,$2) as bootstrap_initial_platform_admin",
      [JSON.stringify(manifest), mac],
    ),
  );
}

beforeEach(async () => {
  db = await freshDb();
  await configureVault();
});

afterEach(async () => db.close());

describe("one-time platform admin bootstrap migration", () => {
  it("grants only the fixed PLATFORM_ADMIN ceiling and atomically records audit and closure", async () => {
    const identity = await eligibleIdentity();
    const manifest = manifestFor(identity);
    await expect(invoke(manifest)).resolves.toMatchObject({
      rows: [{ bootstrap_initial_platform_admin: true }],
    });

    const assignments = await db.query<{
      account_id: string;
      role_code: string;
      scope_type: string;
    }>(
      "select account_id,role_code,scope_type from authorization_private.platform_role_assignments",
    );
    expect(assignments.rows).toEqual([
      { account_id: identity.accountId, role_code: "PLATFORM_ADMIN", scope_type: "platform" },
    ]);
    const identityAfterGrant = await db.query<{
      auth_user_id: string;
      account_status: string;
      member_id: string;
      membership_status: string;
    }>(
      `
      select ua.auth_user_id, ua.account_status, ua.member_id, m.membership_status
      from public.user_accounts ua join public.members m on m.id=ua.member_id where ua.id=$1`,
      [identity.accountId],
    );
    expect(identityAfterGrant.rows[0]).toEqual({
      auth_user_id: identity.authUserId,
      account_status: "active",
      member_id: identity.memberId,
      membership_status: "active",
    });
    const grants = await db.query<{ permission_code: string }>(
      "select permission_code from authorization_private.platform_role_permissions order by permission_code",
    );
    expect(grants.rows.map((row) => row.permission_code)).toEqual([
      "platform.authorization.assignment.grant",
      "platform.authorization.assignment.read",
      "platform.authorization.assignment.revoke",
      "platform.security_audit.read",
    ]);
    const persisted = await db.query<{
      audit_count: number;
      operation_count: number;
      closed: boolean;
    }>(`
      select (select count(*)::int from authorization_private.platform_security_audit) audit_count,
             (select count(*)::int from authorization_private.platform_bootstrap_operations) operation_count,
             (select closed_at is not null from authorization_private.platform_bootstrap_state where singleton) closed`);
    expect(persisted.rows[0]).toEqual({ audit_count: 1, operation_count: 1, closed: true });
    const permission = await as(db, "authenticated", identity.authUserId, () =>
      db.query<{ current_user_is_platform_admin: boolean }>(
        "select public.current_user_is_platform_admin() as current_user_is_platform_admin",
      ),
    );
    expect(permission.rows[0]!.current_user_is_platform_admin).toBe(true);
    const ordinary = await eligibleIdentity();
    const denied = await as(db, "authenticated", ordinary.authUserId, () =>
      db.query<{ current_user_is_platform_admin: boolean }>(
        "select public.current_user_is_platform_admin() as current_user_is_platform_admin",
      ),
    );
    expect(denied.rows[0]!.current_user_is_platform_admin).toBe(false);
  });

  it("rejects invalid MACs, altered payloads, wrong environment and expired manifests", async () => {
    const identity = await eligibleIdentity();
    const manifest = manifestFor(identity);
    await expect(invoke(manifest, "0".repeat(64))).rejects.toThrow("Bootstrap rejected.");
    const altered = { ...manifest, target_member_id: randomUUID() };
    await expect(
      invoke(
        altered,
        createHmac("sha256", key).update(canonicalPlatformAdminManifest(manifest)).digest("hex"),
      ),
    ).rejects.toThrow("Bootstrap rejected.");
    const wrongEnvironment = { ...manifest, project_ref: "aaaaaaaaaaaaaaaaaaaa" };
    await expect(invoke(wrongEnvironment)).rejects.toThrow("Bootstrap rejected.");
    const otherOrgId = await seed.orgUnit(db, "parish", "T-Other-Org");
    const wrongOrganization = { ...manifest, target_org_unit_id: otherOrgId };
    await expect(invoke(wrongOrganization)).rejects.toThrow("Bootstrap rejected.");
    const expired = {
      ...manifest,
      issued_at: "2020-01-01T00:00:00.000Z",
      expires_at: "2020-01-01T00:05:00.000Z",
    };
    const expiredMac = createHmac("sha256", key)
      .update(canonicalPlatformAdminManifest(expired))
      .digest("hex");
    await expect(invoke(expired, expiredMac)).rejects.toThrow("Bootstrap rejected.");
    const result = await db.query<{ assignments: number; closed: boolean }>(`
      select (select count(*)::int from authorization_private.platform_role_assignments) assignments,
             (select closed_at is not null from authorization_private.platform_bootstrap_state where singleton) closed`);
    expect(result.rows[0]).toEqual({ assignments: 0, closed: false });
  });

  it.each([
    { account: "suspended", membership: "active" },
    { account: "active", membership: "inactive" },
  ])(
    "fails closed for ineligible account/member statuses ($account/$membership)",
    async ({ account, membership }) => {
      const identity = await seed.person(db, { account, membership });
      const orgUnit = await db.query<{ org_unit_id: string }>(
        "select org_unit_id from public.members where id=$1",
        [identity.memberId],
      );
      const manifest = manifestFor({ ...identity, orgUnitId: orgUnit.rows[0]!.org_unit_id });
      await expect(invoke(manifest)).rejects.toThrow("Bootstrap rejected.");
      const result = await db.query<{ assignments: number; closed: boolean }>(`
      select (select count(*)::int from authorization_private.platform_role_assignments) assignments,
             (select closed_at is not null from authorization_private.platform_bootstrap_state where singleton) closed`);
      expect(result.rows[0]).toEqual({ assignments: 0, closed: false });
    },
  );

  it("rejects replay and every ordinary direct write path", async () => {
    const identity = await eligibleIdentity();
    const manifest = manifestFor(identity);
    await invoke(manifest);
    await expect(invoke(manifest)).rejects.toThrow("Bootstrap rejected.");
    const mac = signPlatformAdminManifest(manifest, key);
    await expect(
      as(db, "authenticated", identity.authUserId, () =>
        db.query("select public.bootstrap_initial_platform_admin($1::jsonb,$2)", [
          JSON.stringify(manifest),
          mac,
        ]),
      ),
    ).rejects.toThrow(/permission denied/i);
    await expect(
      as(db, "anon", null, () =>
        db.query("select * from authorization_private.platform_role_assignments"),
      ),
    ).rejects.toThrow(/permission denied/i);
    await expect(
      as(db, "service_role", null, () =>
        db.query(
          "insert into authorization_private.platform_roles(code,description) values ('OTHER','bad')",
        ),
      ),
    ).rejects.toThrow(/permission denied/i);
    await expect(
      as(db, "service_role", null, () => db.query("select * from vault.decrypted_secrets")),
    ).rejects.toThrow(/permission denied/i);
  });

  it("rolls back role assignment, operation consumption and closure if audit persistence fails", async () => {
    const identity = await eligibleIdentity();
    const manifest = manifestFor(identity);
    await db.exec(`create function authorization_private.fail_audit_insert() returns trigger language plpgsql as $$ begin raise exception 'audit unavailable'; end $$;
      create trigger fail_audit before insert on authorization_private.platform_security_audit for each row execute function authorization_private.fail_audit_insert();`);
    await expect(invoke(manifest)).rejects.toThrow("Bootstrap rejected.");
    const result = await db.query<{
      assignments: number;
      operations: number;
      audit: number;
      closed: boolean;
    }>(`
      select (select count(*)::int from authorization_private.platform_role_assignments) assignments,
             (select count(*)::int from authorization_private.platform_bootstrap_operations) operations,
             (select count(*)::int from authorization_private.platform_security_audit) audit,
             (select closed_at is not null from authorization_private.platform_bootstrap_state where singleton) closed`);
    expect(result.rows[0]).toEqual({ assignments: 0, operations: 0, audit: 0, closed: false });
  });
});
