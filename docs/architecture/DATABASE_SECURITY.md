# Database Security and RLS (Sprint 1B.1)

Principle: **authentication ≠ authorization.** RLS is defence in depth; backend application authorization remains authoritative (FR-SEC-008, FR-CC-008). Every table has RLS enabled and Supabase's default grants removed.

## Privilege matrix

| Role                         | org_units              | members                | user_accounts          | Functions                      |
| ---------------------------- | ---------------------- | ---------------------- | ---------------------- | ------------------------------ |
| `anon`                       | none                   | none                   | none                   | none                           |
| `authenticated`              | SELECT (RLS)           | SELECT (RLS)           | SELECT (RLS)           | none (`platform_ping` revoked) |
| `service_role` (server only) | SELECT, INSERT, UPDATE | SELECT, INSERT, UPDATE | SELECT, INSERT, UPDATE | `platform_ping`                |
| nobody                       | DELETE, TRUNCATE       | DELETE, TRUNCATE       | DELETE, TRUNCATE       |                                |

## Policies (all `FOR SELECT TO authenticated`)

| Policy                      | Rule                                                                                                   |
| --------------------------- | ------------------------------------------------------------------------------------------------------ |
| `user_accounts_select_own`  | `auth_user_id = auth.uid()`: a user can always read their own account row, in any status               |
| `members_select_own_active` | the row is the member of the caller's own account **and that account is `active`**                     |
| `org_units_select_own_unit` | the unit is the home unit of a member row the caller can see (own unit only; no siblings or ancestors) |

There are no INSERT/UPDATE/DELETE policies and no write grants for `authenticated`, so users cannot create, edit, link, activate or delete identity data. There are no broad policies. Suspended, deactivated and not-yet-activated accounts see only their own account row, so suspension takes effect at the database layer too.

## Service role

It bypasses RLS and is never available to clients (server-only modules, import rules, bundle scan from Sprint 1A). Writes (creating members/accounts, changing statuses) must go through server code that has first authorized the actor. It cannot delete or truncate, and constraints, immutability and no-delete triggers still apply to it.

## Scenarios attempted (see `tests/database/identity.test.ts`)

Unauthenticated read/write/delete (denied); authenticated user without an account (sees nothing); user reading another user's account/member/unit (denied); cross-organisation reads (denied); self-activation of a suspended account (denied); editing own membership status (denied); inserts, deletes and truncates as `authenticated` (denied); service-only function as `authenticated` (denied); service role delete/truncate (denied); service role violating uniqueness or immutability (rejected); suspension revoking RLS visibility immediately.
KILL-CRITIC finding fixed in this stage: the three trigger helper functions were executable by `PUBLIC` (a potential RPC surface); they are now revoked and an invariant test asserts no public function is executable by `PUBLIC`, `anon` or `authenticated`.
Additionally, seven deliberate mutations of the migration (dropping the active gate, granting UPDATE, dropping a unique constraint, dropping an immutability trigger, loosening the parish check, cascading the auth FK, granting service-role DELETE) were each caught by at least one test.

## Intentionally deferred (not pretended complete)

- Role- and scope-based access for executives (who may read which members' data): needs the RBAC sprint and ADR-007. Until then **no one except the owner themselves and the server (service role) can read identity data.**
- Field-level protection of personal data (FR-MEM-012): profile table not yet created.
- Cross-organisation executive access and "includes descendants" rules.
- Audit trail of status changes.
- Whether membership status (e.g. suspended) should also block RLS visibility: only account status gates it today (open decision ID-4).
- Confirmation against real Supabase roles (`authenticator`, PostgREST, Auth hooks): TD-5.
