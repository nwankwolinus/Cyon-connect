# Database Security and RLS (Sprint 1B.1)

Principle: **authentication ≠ authorization.** RLS is defence in depth; backend application authorization remains authoritative (FR-SEC-008, FR-CC-008). Every table has RLS enabled and Supabase's default grants removed.

## Privilege matrix

| Role                         | org_units              | members          | user_accounts    | Functions                            |
| ---------------------------- | ---------------------- | ---------------- | ---------------- | ------------------------------------ |
| `anon`                       | none                   | none             | none             | none                                 |
| `authenticated`              | SELECT (RLS)           | SELECT (RLS)     | SELECT (RLS)     | none (`platform_ping` revoked)       |
| `service_role` (server only) | SELECT, INSERT, UPDATE | SELECT           | SELECT           | `platform_ping`; admin bootstrap RPC |
| nobody                       | DELETE, TRUNCATE       | DELETE, TRUNCATE | DELETE, TRUNCATE |                                      |

## Policies (all `FOR SELECT TO authenticated`)

| Policy                      | Rule                                                                                                   |
| --------------------------- | ------------------------------------------------------------------------------------------------------ |
| `user_accounts_select_own`  | `auth_user_id = auth.uid()`: a user can always read their own account row, in any status               |
| `members_select_own_active` | the row is the member of the caller's own account **and that account is `active`**                     |
| `org_units_select_own_unit` | the unit is the home unit of a member row the caller can see (own unit only; no siblings or ancestors) |

There are no INSERT/UPDATE/DELETE policies and no write grants for `authenticated`, so users cannot create, edit, link, activate or delete identity data. There are no broad policies. Suspended, deactivated and not-yet-activated accounts see only their own account row, so suspension takes effect at the database layer too.

## Service role

It bypasses RLS and is never available to clients (server-only modules, import rules, bundle scan from Sprint 1A). Migration `20261014080000_initial_identity_provisioning.sql` revokes direct `INSERT`/`UPDATE` on `members` and `user_accounts`; current service-role application code therefore has identity read access only. The database-owner-only initial provisioning function is not executable by service_role. The separately protected `bootstrap_initial_platform_admin` RPC is the only service-role write entrypoint for authorization bootstrap; it does not write identity records. The role still has direct `org_units` DML as defined by the identity foundation; broader organizational write policy is outside this provisioning increment.

## Scenarios attempted (see `tests/database/identity.test.ts`)

Unauthenticated read/write/delete (denied); authenticated user without an account (sees nothing); user reading another user's account/member/unit (denied); cross-organisation reads (denied); self-activation of a suspended account (denied); editing own membership status (denied); inserts, deletes and truncates as `authenticated` (denied); service-only function as `authenticated` (denied); service role delete/truncate and direct member/account insert/update (denied); suspension revoking RLS visibility immediately.
KILL-CRITIC finding fixed in this stage: the three trigger helper functions were executable by `PUBLIC` (a potential RPC surface); they are now revoked and an invariant test asserts no public function is executable by `PUBLIC`, `anon` or `authenticated`.
Additionally, seven deliberate mutations of the migration (dropping the active gate, granting UPDATE, dropping a unique constraint, dropping an immutability trigger, loosening the parish check, cascading the auth FK, granting service-role DELETE) were each caught by at least one test.

## Intentionally deferred (not pretended complete)

- Role- and scope-based access for executives (who may read which members' data): needs the RBAC sprint and ADR-007. Until then **no one except the owner themselves and the server (service role) can read identity data.**
- Field-level protection of personal data (FR-MEM-012): profile table not yet created.
- Cross-organisation executive access and "includes descendants" rules.
- Audit trail of status changes.
- Whether membership status (e.g. suspended) should also block RLS visibility: only account status gates it today (open decision ID-4).
- Confirmation against real Supabase roles (`authenticator`, PostgREST, Auth hooks): TD-5.

## Initial platform authorization bootstrap

The initial identity-provisioning operation is documented in [DATABASE_IDENTITY.md](DATABASE_IDENTITY.md) and the owner runbook. It is owner-only, one-time, DEV-bound, and atomic with its audit record; it has no application endpoint or role assignment. The later `PLATFORM_ADMIN` authorization boundary is described in [DATABASE_AUTHORIZATION.md](DATABASE_AUTHORIZATION.md) and migration `20261014090000_platform_admin_bootstrap.sql`. Authorization tables are isolated in a private schema with no app-role DML. A service-role-only security-definer RPC requires a Vault-backed, environment-bound HMAC manifest and checks the active identity chain before atomically recording the initial assignment, audit event, operation consumption, and bootstrap closure. Hosted migration deployment and real Supabase execution remain outstanding.

## Stage 3 sensitive applicant data requirements

Stage 3 must also comply with the owner-approved [S3D baseline](../planning/STAGE_3_OWNER_APPROVED_REQUIREMENTS.md). In particular, DOB requires separate envelope-encrypted storage, managed KMS key protection outside the application database, and eligibility-service-only decryption; no parish reviewer or technical administrator receives DOB access. Application access is default-deny and role/parish scoped, PRO APIs exclude restricted application/sacramental fields, sensitive access and permission changes are audited without sensitive values, and audit records are protected from unauthorised modification/deletion. These are approved requirements, not existing database guarantees. No such application schema, KMS path, reviewer access path, or retention implementation is evidenced here; the required professional assessment, approved schedules, and security assessment remain prerequisites for live handling/deployment.
