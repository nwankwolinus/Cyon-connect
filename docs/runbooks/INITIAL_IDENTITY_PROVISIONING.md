# Initial Identity Provisioning (CYON Connect DEV)

This one-time operation provisions the first eligible identity only. It creates an active `members` row and active `user_accounts` row for an existing Auth user. It does **not** assign `PLATFORM_ADMIN`; that remains a separate HMAC/Vault-protected bootstrap operation.

The migration is `supabase/migrations/20261014080000_initial_identity_provisioning.sql`. It binds execution to project reference `bpooqfgadtbyeduapwyi`, permits only a `parish` organization, rejects any existing member or application account, records a private audit event, and closes provisioning in the same transaction. Only the database owner can execute the function; no application role is granted `EXECUTE`.

## Owner-run Supabase Dashboard procedure

1. In the Dashboard, verify the project reference shown for the open project is exactly `bpooqfgadtbyeduapwyi` (`cyon-connect`). Do not use the `cyon-connect-security-test` project.
2. Review and apply the identity-provisioning migration manually. Do not apply it through this repository's linked-project CLI state.
3. Identify the sole intended organization explicitly. This query is read-only and should return exactly one row for the currently reported organization:

   ```sql
   select id, unit_type, name
   from public.org_units
   order by id;
   ```

   Confirm the returned row is the intended organization and that `unit_type` is `parish`. The schema only permits member home units of type `parish`. Do not proceed if there are zero or multiple candidate rows, or if the returned organization is not the intended one.

4. Confirm there are no existing member or application-account rows and that the target Auth user exists. The operation independently rechecks the Auth user, empty identity tables, organization ID/type/name, environment reference, one-time state, and uniqueness when it executes. It cannot infer whether an existing orphan member is the same human, so it fails closed if any member already exists.
5. Execute the following call only after replacing `<CONFIRMED_ORG_UNIT_UUID>`, `<EXACT_ORG_UNIT_NAME>`, and `<APPROVAL_EVIDENCE_REFERENCE>` with reviewed values. Use a real approval/provisioning evidence reference; do not invent one. This records the database session role, not a verified human identity; retain the Dashboard execution record under the project's operational controls.

   ```sql
   select *
   from public.provision_initial_identity(
     '81e089b4-c59f-47f4-ab8c-f73cb34cdeea'::uuid,
     'bpooqfgadtbyeduapwyi',
     '<CONFIRMED_ORG_UNIT_UUID>'::uuid,
     'parish',
     '<EXACT_ORG_UNIT_NAME>',
     '<APPROVAL_EVIDENCE_REFERENCE>'
   );
   ```

6. Preserve the returned account, member, and organization UUIDs in the approved operator record. Verify the result using the read-only query below. Do not rerun provisioning if the response was lost; inspect state first. A completed or ambiguous first execution must be reviewed rather than retried.

   ```sql
   select ua.id as account_id, ua.auth_user_id, ua.account_status,
          m.id as member_id, m.membership_status, m.org_unit_id, m.org_unit_type
   from public.user_accounts ua
   join public.members m on m.id = ua.member_id
   where ua.auth_user_id = '81e089b4-c59f-47f4-ab8c-f73cb34cdeea'::uuid;
   ```

The function has no caller-supplied status or role parameter: it creates only active account/membership records and never writes authorization tables. The database operation is atomic; audit failure rolls back both identity inserts and provisioning closure. No account, member, Auth user, or organization is created or changed by preparing this runbook.

The organization UUID is intentionally not filled in here: it must be read from and confirmed in the target project immediately before execution. The confirmed database count alone does not establish the row's identity or type.

## Initial platform-administrator bootstrap key and manifest

This is a separate, one-time operation after identity provisioning. Do not execute it until the identity rows have been independently checked as active and correctly linked. The bootstrap migration and script are fixed to the development project reference `bpooqfgadtbyeduapwyi`; the script also checks the hosted Supabase URL and manifest reference before calling the RPC.

### Prepare and provision the HMAC key

Generate at least 32 cryptographically random bytes using an approved operating-system CSPRNG or secret manager, then encode the bytes as standard padded Base64. Keep the raw bytes and encoded value in the approved secret manager. Do not put either value in source control, `.env.local`, command arguments, a SQL file, logs, or chat. This HMAC key is separate from the Supabase service-role credential.

Provision exactly one Supabase Vault secret with:

- Name: `cyon-initial-platform-admin-bootstrap-v1`
- JSON value: `{"project_ref":"bpooqfgadtbyeduapwyi","hmac_key_base64":"<STANDARD_BASE64_KEY>"}`

Use the Supabase Dashboard's Database Vault interface to create the secret; the Supabase Vault documentation supports managing secrets through the Dashboard and through `vault.create_secret`. The Dashboard path is preferred here so the key does not enter SQL editor history. Confirm the Dashboard project reference before provisioning. The repository cannot verify that the hosted project currently has this Vault UI/function available; the bootstrap migration requires `vault.decrypted_secrets` and fails closed if it is absent.

To confirm presence without returning the secret value, run this read-only query manually in the confirmed project's SQL Editor as an appropriately privileged operator. It returns only a boolean:

```sql
select count(*) = 1 as expected_secret_present
from vault.decrypted_secrets
where name = 'cyon-initial-platform-admin-bootstrap-v1';
```

Do not select `decrypted_secret`, `hmac_key_base64`, or the full decrypted view. This query confirms only that a named entry is visible to the executing database role; it does not verify that the JSON or key matches. The bootstrap function performs those checks without returning the key.

### Inject the key and prepare a manifest

The repository does not configure a particular local secret manager. Use the approved secret manager's process-injection facility to launch PowerShell with `CYON_INITIAL_PLATFORM_ADMIN_HMAC_KEY_BASE64` populated in the parent process. The preparation command reads only that process environment variable; it does not load `.env.local`, contact Supabase, or call the bootstrap RPC. Do not set the key in `.env.local`, a command-line argument, or shell history. The existing bootstrap script likewise captures the HMAC key from its parent process before loading non-key `.env.local` configuration. Supply `SUPABASE_SERVICE_ROLE_KEY` to the bootstrap process from the approved secret manager as well; the admin client requires it, and it must not be placed in `.env.local` or exposed to the browser.

For the fingerprint check and manifest preparation, only the HMAC key must be present in the current process. The service-role key is needed only for the later bootstrap command; do not load it just for this read-only check or manifest preparation. Confirm HMAC-key presence without printing it:

```powershell
if (-not $env:CYON_INITIAL_PLATFORM_ADMIN_HMAC_KEY_BASE64) { throw 'HMAC key is not available in this process.' }
```

### Read-only HMAC key consistency check

Before preparing the manifest, the operator may compare SHA-256 fingerprints of the raw key bytes held by the local process and by Vault. This check does not read or print the manifest, either key, or an HMAC. It does not call the bootstrap RPC or prove that the approval evidence is valid. Run the PowerShell portion in the same process that received `CYON_INITIAL_PLATFORM_ADMIN_HMAC_KEY_BASE64` from the approved secret manager:

```powershell
if (-not $env:CYON_INITIAL_PLATFORM_ADMIN_HMAC_KEY_BASE64) { throw 'HMAC key is not available in this process.' }
$keyBytes = [Convert]::FromBase64String($env:CYON_INITIAL_PLATFORM_ADMIN_HMAC_KEY_BASE64)
$sha256 = [System.Security.Cryptography.SHA256]::Create()
$fingerprintBytes = $null
try {
  if ($keyBytes.Length -lt 32) { throw 'HMAC key must contain at least 32 bytes.' }
  $fingerprintBytes = $sha256.ComputeHash($keyBytes)
  $localKeyFingerprint = -join ($fingerprintBytes | ForEach-Object { $_.ToString('x2') })
  Write-Output "Local raw-key SHA-256 fingerprint: $localKeyFingerprint"
}
finally {
  [Array]::Clear($keyBytes, 0, $keyBytes.Length)
  if ($null -ne $fingerprintBytes) { [Array]::Clear($fingerprintBytes, 0, $fingerprintBytes.Length) }
  $sha256.Dispose()
}
```

In the Supabase SQL Editor, first positively confirm the open Dashboard project is `cyon-connect` with reference `bpooqfgadtbyeduapwyi`. Run this read-only query there; replace `<LOCAL_RAW_KEY_SHA256_FINGERPRINT>` with the 64-character fingerprint printed by PowerShell. The query filters by the exact Vault secret name, checks that exactly one row exists and its `project_ref` is the expected project, checks that the decoded key is at least 32 bytes, and returns only boolean checks and the SHA-256 fingerprint of the raw Vault key bytes:

```sql
with candidate as (
  select decrypted_secret::jsonb as secret
  from vault.decrypted_secrets
  where name = 'cyon-initial-platform-admin-bootstrap-v1'
), checked as (
  select
    count(*)::integer as secret_count,
    coalesce(bool_and(secret ->> 'project_ref' = 'bpooqfgadtbyeduapwyi'), false) as project_matches,
    coalesce(bool_and(
      jsonb_typeof(secret) = 'object'
      and secret ->> 'hmac_key_base64' is not null
      and octet_length(pg_catalog.decode(secret ->> 'hmac_key_base64', 'base64')) >= 32
    ), false) as key_is_well_formed,
    case when count(*) = 1
      then encode(extensions.digest(
        pg_catalog.decode(max(secret ->> 'hmac_key_base64'), 'base64'), 'sha256'
      ), 'hex')
      else null
    end as vault_raw_key_fingerprint
  from candidate
)
select
  secret_count = 1 as exactly_one_named_secret,
  project_matches as expected_project,
  key_is_well_formed,
  vault_raw_key_fingerprint = '<LOCAL_RAW_KEY_SHA256_FINGERPRINT>' as local_key_matches_vault
from checked;
```

Proceed only if all four results are `true`. If the secret is missing/duplicated, the project does not match, the key is malformed, the query errors, or the fingerprints differ, stop and resolve it through the approved secret-management process; do not regenerate or replace the key as part of this check. The fingerprint is a comparison value, not the key, but do not include it in source control, documentation, chat, or logs. This query does not mutate Vault or database state. Do not select `decrypted_secret` or any key field directly.

Set only non-secret environment values as needed (the Supabase URL must resolve to the fixed development project and `APP_ENV` must be `development` or `test`). The manifest preparation command requires the project reference, target Auth/account/member/organization UUIDs and real approval-evidence reference explicitly. The approver UUID must equal the target Auth UUID for this one-time same-person exception. It creates a fresh operation UUID, an ISO UTC issue time and a five-minute expiry, and refuses padded/invalid values, an incorrect project, an invalid key, or an output file that already exists. Write the manifest outside the repository, for example under `%TEMP%`:

```powershell
$manifestPath = Join-Path $env:TEMP 'cyon-initial-platform-admin-manifest.json'
npm run prepare:initial-admin-manifest -- `
  --project-ref bpooqfgadtbyeduapwyi `
  --target-auth-user-id '<VERIFIED_AUTH_UUID>' `
  --target-account-id '<VERIFIED_ACCOUNT_UUID>' `
  --target-member-id '<VERIFIED_MEMBER_UUID>' `
  --target-org-unit-id '<VERIFIED_ORG_UNIT_UUID>' `
  --approver-auth-user-id '<VERIFIED_AUTH_UUID>' `
  --evidence-reference '<REAL_APPROVAL_EVIDENCE_REFERENCE>' `
  --output $manifestPath
```

The output contains the exact 14-field manifest payload expected by the RPC; it never contains the HMAC key or computed MAC. The existing bootstrap command computes the HMAC in memory immediately before calling the RPC. Do not edit the manifest after preparation. The script rejects overwriting an existing path and rejects paths inside the repository. If the manifest has expired or any value must change, remove the old temporary file and prepare a new manifest with a new operation ID.

### Execute and verify the existing bootstrap

After reviewing the manifest and positively confirming the current Dashboard project is `cyon-connect` (`bpooqfgadtbyeduapwyi`), the owner may manually run:

```powershell
npm run bootstrap:initial-admin -- $manifestPath
```

The bootstrap script uses the existing server-only service-role client solely to invoke the restricted RPC; service-role possession alone is not the approval proof. The HMAC manifest, Vault key, fixed project allowlist, active identity chain, permission ceiling, one-time state, replay guard, audit insert and closure checks remain enforced by the migration. Never run this command against production or an unverified URL.

After success, manually verify using the operation ID and target account/Auth UUID from the manifest. These read-only queries return status/count evidence only:

```sql
select exists (
  select 1
  from authorization_private.platform_role_assignments ra
  join public.user_accounts ua on ua.id = ra.account_id
  where ua.auth_user_id = '<VERIFIED_AUTH_UUID>'::uuid
    and ua.id = '<VERIFIED_ACCOUNT_UUID>'::uuid
    and ra.role_code = 'PLATFORM_ADMIN'
    and ra.scope_type = 'platform'
    and ra.scope_id is null
    and ra.revoked_at is null
) as expected_active_assignment;

select count(*) = 1 as expected_audit_record
from authorization_private.platform_security_audit
where operation_id = '<OPERATION_UUID_FROM_MANIFEST>'::uuid
  and target_auth_user_id = '<VERIFIED_AUTH_UUID>'::uuid
  and event_type = 'initial_platform_admin_granted'
  and outcome = 'granted';

select closed_at is not null as bootstrap_closed
from authorization_private.platform_bootstrap_state
where singleton;
```

These checks must be run by an operator with appropriate read access and must not select audit or Vault secret contents. If the bootstrap command returns an ambiguous result, do not retry with a new manifest; inspect the operation/audit/closure state first. The database transaction makes grant, operation consumption, audit and closure atomic.

### Cleanup and operational limits

After verification, remove only the exact temporary manifest path created above, then clear the current PowerShell process environment values:

```powershell
Remove-Item -LiteralPath $manifestPath
$env:CYON_INITIAL_PLATFORM_ADMIN_HMAC_KEY_BASE64 = $null
$env:SUPABASE_SERVICE_ROLE_KEY = $null
```

Use the secret manager's documented process/session cleanup for any inherited process injection. Clearing environment variables is best-effort process hygiene; it cannot guarantee erasure from the secret manager, operating-system process memory, or an already captured diagnostic trace. Keep the execution record and approval evidence in the approved protected location, not alongside the manifest. No key, service-role credential, SQL result containing secret material, or signed manifest should be committed or copied into repository documentation.

**Operational limitation:** No secret manager or local process-injection integration is configured by this repository. The operator must select an approved secret manager that can inject a secret into a process without placing it in shell history or `.env.local`; the exact provider-specific launch command depends on that external tool and is intentionally not invented here. Supabase Vault's Dashboard/SQL support is documented at [Supabase Vault](https://supabase.com/docs/guides/database/vault).
