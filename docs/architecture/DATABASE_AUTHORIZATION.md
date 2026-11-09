# Platform authorization and initial administrator bootstrap

## Scope and status

Migration `20261014090000_platform_admin_bootstrap.sql` adds a narrowly scoped `PLATFORM_ADMIN` role and a one-time grant operation. It does not change identity rows, activate membership, add executive assignments, or implement routine role grants/revocations or last-administrator recovery. The migration is not considered deployed or verified against Supabase until the development project is positively identified and the migration and integration tests are run there.

`PLATFORM_ADMIN` is distinct from account status, membership status, and executive assignment. The initial role permission catalog contains only authorization-assignment administration and security-audit review identifiers. Grant/revoke workflows and audit-review APIs are not implemented here, so no such operation is enabled merely by having a catalog entry. Business, financial, welfare, member-directory, database-owner, and service-role access are excluded.

## Database boundary

Authorization tables live in the non-PostgREST `authorization_private` schema, have RLS enabled, and grant no table or sequence access to `anon`, `authenticated`, or `service_role`. The tables use foreign keys to the existing application account, member, organization, and Auth identity records. Active role assignments are unique per account and role.

`public.bootstrap_initial_platform_admin(jsonb,text)` is a `SECURITY DEFINER` operation with an empty search path. Only `service_role` may execute it. It verifies an HMAC-SHA-256 over a fixed, versioned sequence of UTF-8 fields, each prefixed with a 4-byte big-endian byte length. It checks the environment binding, expiry (maximum 15 minutes), same-person approver/target, exact role/scope/permission ceiling, and a unique operation ID. It locks the one-time bootstrap state and the target account/member rows, then requires the linked account and membership to be active and the Auth/account/member/organization identifiers to match. The grant, consumed operation, audit record, and bootstrap closure occur in one PostgreSQL transaction. Any failure aborts all of them and returns a generic error.

The migration requires `pgcrypto` in schema `extensions` and an existing Supabase Vault `vault.decrypted_secrets` view. If Vault is not available, the migration fails closed. `service_role` cannot read that view or directly write authorization tables. Database owners/project administrators remain trusted authorities able to alter functions, grants, or Vault configuration.

`public.current_user_is_platform_admin()` is the only authenticated RPC exposed by this migration. It takes no caller-controlled identity argument and returns only whether the current `auth.uid()` has the active platform role, an active account, and active membership. The frontend requires both `/api/identity/me` and `/api/authorization/me` to return HTTP 200 before rendering the protected shell.

## Operator bootstrap

Before any execution:

1. Confirm the project reference in the Supabase Dashboard and in `NEXT_PUBLIC_SUPABASE_URL`; set `APP_ENV` to `development` or `test`. Do not infer the target from the CLI link alone.
2. Apply the migration only after the target is confirmed. Do not reset the database.
3. Create a unique 256-bit-or-stronger HMAC key in an approved secret manager. Provision a Vault secret named `cyon-initial-platform-admin-bootstrap-v1` whose JSON value has `project_ref` and `hmac_key_base64`. The project reference must be exact and the key unique to this environment. Never put the HMAC key in Git, `.env.local`, client configuration, shell history, or logs.
4. Inject `CYON_INITIAL_PLATFORM_ADMIN_HMAC_KEY_BASE64` into the operator process from the approved secret manager. The bootstrap script intentionally captures this variable before loading `.env.local`, so a key stored only in that file is rejected.
5. Prepare a short-lived manifest with the exact schema enforced by `scripts/security/platform-admin-bootstrap-manifest.ts`, including the verified account/member/organization UUIDs, approval evidence reference, and the exact role/permission ceiling. Do not use guessed IDs.
6. Run `npm run bootstrap:initial-admin -- <manifest.json>`. The script requires a hosted Supabase URL whose project reference matches the manifest and an explicit development/test `APP_ENV`. It uses the server-only service-role client solely to call the protected function; the service-role key alone cannot pass the HMAC verifier. Do not run this command until the Vault secret, target, and eligible identity are independently confirmed.

The HMAC authenticates possession of the environment-specific approval key; it does not independently prove organizational authority. The evidence reference must point to the actual owner decision record. The accepted initial same-person exception means approver and target IDs must be equal. The key holder and operator remain within the trust boundary.

## Verification limits

The automated migration tests use PGlite with a test-only Vault stand-in and pgcrypto. They verify SQL transaction behavior, HMAC binding, eligibility checks, replay rejection, role boundaries, generic failures, and audit rollback. They do not establish that the hosted development project has Vault/pgcrypto enabled, that the migration has been applied, or that real Supabase Auth/PostgREST/RLS behavior is correct. Those require an explicitly authorized disposable/development Supabase verification.
