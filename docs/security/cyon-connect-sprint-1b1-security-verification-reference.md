# CYON Connect --- Sprint 1B.1 Supabase Security Verification Reference

**Purpose:** Record the security-verification workflow, commands,
outcomes, errors, and resolutions for future reference.

**Scope:** Disposable Supabase security-test environment only. The
original CYON Connect DEV project and production were not targeted.

## 1. Executive summary

Security checks were performed against a disposable Supabase project.
Tested areas included migration deployment, RLS, policies and grants,
authenticated API reads, denied writes, cross-user isolation, parish
isolation, and suspended-account behaviour.

The original disposable project was deleted after the SQL cleanup
transaction was blocked by the database's `prevent_delete()` trigger.
The transaction rolled back completely. The project was recreated to
remove synthetic test data without bypassing database safeguards.

**Interpretation:** The specific isolation and access tests listed below
passed for the cases tested. Two policy behaviours remain design
findings to confirm against requirements: an inactive membership
remained readable by its owner when the linked account was active, and a
suspended account could read its own account row. These observations
should not be misreported as fully resolved security requirements. The
checks were targeted, not an exhaustive audit.

## 2. Project targeting and safety

### Original test project --- deleted

-   Name: `cyon-connect-security-test`
-   Reference: `nvjqcfezxknrifjbeeig`
-   Region: Frankfurt
-   The historical test results in this document were collected here.

### Recreated disposable project

-   Name: `cyon-connect-security-test`
-   Reference: `crfcglxcsnmeovnipnko`
-   Region: West EU (Paris)
-   Linked to the local repository.
-   At the time this document was written, the `public` schema
    table-list query returned no application tables and `auth.users`
    count was `0`.
-   The two migrations had not yet been deployed to this recreated
    project. Historical results below belong to the deleted project, not
    the recreated one.

### Protected environments

-   Original DEV project: `cyon-connect`, reference
    `bpooqfgadtbyeduapwyi`.
-   Production was not targeted.
-   Never run test-fixture or destructive commands against DEV or
    production.

### Local repository

`C:\Users\DELL\Desktop\CYON_Connect\cyon-connect-sprint1b1\cyon-1a`

Changes observed and preserved: - Modified: `.env.example`,
`package.json`, `package-lock.json` - Added: `docs/security/`,
`scripts/test-fixtures/`

No reset/discard operation was used.

## 3. Migrations, schema, and policies

Local migration files: -
`supabase/migrations/20261007090000_platform_baseline.sql` -
`supabase/migrations/20261008090000_identity_foundation.sql`

Both migrations were deployed to the original test project and
local/remote migration timestamps matched.

Tables reviewed: - `public.org_units` - `public.members` -
`public.user_accounts`

Read-only inspection confirmed: - RLS enabled (`rowsecurity = true`) on
all three tables. - Expected SELECT policies present:
`user_accounts_select_own`, `members_select_own_active`,
`org_units_select_own_unit`. - Policies assigned to `authenticated`. -
`authenticated` had SELECT grants on all three tables. - `service_role`
had SELECT, INSERT, UPDATE grants on all three tables. - No direct
`anon` grants were returned by the grant inspection; no direct DELETE
grant was present. - Identity/linkage fields had immutable-field
triggers. - Physical deletion was blocked by `prevent_delete()`. -
Relevant foreign keys used `ON DELETE RESTRICT`.

**Result:** PASS for the schema, RLS, policies, and grants inspected.

## 4. Synthetic fixtures

All identities and the second parish below belonged only to the deleted
disposable project.

  -----------------------------------------------------------------------
  User              Account status    Membership status Parish
  ----------------- ----------------- ----------------- -----------------
  A                 `active`          `active`          Original Ijegun
                                                        parish

  B                 `active`          `active` after a  Original Ijegun
                                      temporary         parish
                                      inactive test     

  C                 `suspended`       `active`          Original Ijegun
                                                        parish

  D                 `active`          `active`          Test Parish B
  -----------------------------------------------------------------------

Passwords and tokens are intentionally omitted. Do not reuse them or
store secrets in reports/source control.

Original parish: - `SS Joachim and Anne Catholic Church, Ijegun` - ID
`2ba858fc-a1bc-448f-9d09-7249d59457f5`

Synthetic second parish: - `CYON Security Test Parish B` - ID
`12eda499-5f67-4d6f-b080-af102d384b07`

## 5. Process and test results

### 5.1 Confirm project and migrations

Commands:

``` powershell
npx supabase projects list
npx supabase migration list
```

The `●` marker in the project list identified the linked project. The
original test project showed matching local and remote migration
timestamps `20261007090000` and `20261008090000`.

**Result: PASS.**

### 5.2 Inspect schema, RLS, policies, and grants

Read-only queries were used against `information_schema`, `pg_tables`,
and `pg_policies`. All three identity tables had RLS enabled, the
expected policies were present, and the expected grants were confirmed.

**Result: PASS for inspected items.**

### 5.3 Baseline and fixture setup

Before synthetic users were created, the original disposable project
had: - Auth users: `0` - `org_units`: `1` - `members`: `0` -
`user_accounts`: `0`

Four synthetic Auth users and their application account/membership links
were created. User C was suspended; User D was associated with Test
Parish B. Read-only queries confirmed their statuses and links.

**Result: PASS.**

### 5.4 Authenticated reads and isolation

The following API checks were run with synthetic user sessions:

  -----------------------------------------------------------------------
  Test                                Observed result
  ----------------------------------- -----------------------------------
  User A reads own account and        Own rows returned
  membership                          

  User B reads own account and        Own rows returned
  membership                          

  A reads B account/membership        No rows returned

  B reads A account/membership        No rows returned

  A reads D account/membership        No rows returned

  D reads A account/membership        No rows returned

  A reads organisation units          Only original Ijegun parish

  D reads organisation units          Only Test Parish B

  Suspended C reads own account       Own row returned with `suspended`
                                      status

  Suspended C reads memberships or    No rows returned
  organisation units                  
  -----------------------------------------------------------------------

**Result: PASS for the tested cases**, with suspended-account read
behaviour noted for policy confirmation.

### 5.5 Anonymous reads and write attempts

  Request                                            Result
  -------------------------------------------------- ------------
  Anonymous GET `/rest/v1/user_accounts?select=id`   HTTP `401`
  Authenticated PATCH of `user_accounts`             HTTP `403`
  Authenticated PATCH of `members`                   HTTP `403`
  Authenticated POST to `user_accounts`              HTTP `403`
  Authenticated DELETE of `user_accounts`            HTTP `403`

These were negative tests using synthetic identifiers.

**Result: PASS; tested requests were denied.**

### 5.6 Inactive membership test

User B's `membership_status` was temporarily set to `inactive`. User B
could still read their own membership row, showing
`membership_status = inactive`. The fixture was restored; a read-only
query confirmed User B's account and membership were both `active`
afterward.

**Result: FINDING.** The policy appears to authorize own-membership
reads based on the linked account being active, not on the membership
status. Confirm the intended requirement. If inactive membership must
block access, make a reviewed migration and rerun this targeted test.

## 6. Errors encountered and resolutions

### Error A --- `--project-ref` without `--linked`

**Symptom:** CLI reported `--project-ref` must be used with `--linked`.

**Cause:** Project reference supplied without linked-project mode.

**Resolution:**

``` powershell
npx supabase db query --linked --project-ref <PROJECT_REF> "SELECT ..."
```

Use the exact disposable project reference and never run destructive
operations until the target is verified.

### Error B --- placeholder script path

**Symptom:** A command used a script path that did not exist.

**Cause:** A placeholder path was used literally.

**Resolution:** Inspect the real path before running:

``` powershell
Get-Content .\scripts\test-fixtures\cleanup-cross-parish.sql
```

### Error C --- malformed `current_setting` SQL

**Symptom:** PostgreSQL syntax error `42601` near `::` for a subquery
shaped like:

``` sql
(SELECT value FROM current_setting('app.settings.project_ref', true)::text AS value)
```

**Cause:** `current_setting()` already returns a scalar text value; the
subquery syntax was invalid.

**Resolution:**

``` sql
SELECT
  current_database() AS database_name,
  current_user AS database_role,
  current_setting('app.settings.project_ref', true) AS configured_project_ref;
```

Output was `postgres`, `postgres`, and `NULL`. The setting was not
configured; `NULL` was not itself a failure. The CLI project reference
and project list are the target controls.

### Error D --- Markdown fence pasted into PowerShell

**Symptom:** PowerShell said ```` ``` ```` was not recognized.

**Cause:** Markdown code-fence markers were copied as if they were a
command.

**Resolution:** Copy only the command between the fences.

### Error E --- API requests returned `401` during testing

**Symptom:** Some API tests returned `401`.

**Cause:** A token had expired or a token variable was empty.

**Resolution:** Sign in again, assign a fresh token locally, and rerun
the test. Do not paste tokens into chat or reports. The relevant tests
passed when repeated with fresh sessions.

### Error F --- Dashboard SQL Editor RLS warning

**Symptom:** SQL Editor warned that `public.user_accounts` could be
created without RLS and offered options to run with or without RLS.

**Resolution:** Cancelled rather than choosing an option that could
change RLS. Subsequent read-only inspection confirmed RLS enabled on all
three tables. Investigate the warning before rerunning any write script
through the dashboard.

### Error G --- cleanup blocked by `prevent_delete()`

**Command:**

``` powershell
npx supabase db query --linked --project-ref nvjqcfezxknrifjbeeig --file .\scripts\test-fixtures\cleanup-cross-parish.sql
```

**Symptom:** SQLSTATE `23001`:
`Physical deletion from user_accounts is not permitted; change status instead.`
The error came from `public.prevent_delete()`.

**Cause:** The cleanup script tried to physically delete rows from
`public.user_accounts`, which the schema intentionally forbids.

**Resolution:** Did not disable the trigger, alter migrations, or bypass
the safeguard. A read-only query showed the transaction had rolled
back: - Test accounts: `4` - Test memberships: `4` - Test Parish B:
`1` - Original parish: `1`

The disposable project was then deleted through the Supabase Dashboard
and recreated, removing its test database and Auth data without
bypassing deletion protection.

### Error H --- `configured_project_ref` returned `NULL` on recreated project

**Symptom:** `current_setting('app.settings.project_ref', true)`
returned `NULL`.

**Resolution:** Treated as an unset custom setting, not a failure.
Confirmed the new reference in `npx supabase projects list`, linked it
explicitly, and used the exact reference on read-only queries.

## 7. Cleanup and recreation record

The cleanup script could not complete because `prevent_delete()` blocked
deletion from `user_accounts`. The transaction rolled back; the counts
above confirmed no partial cleanup.

The original disposable project (`nvjqcfezxknrifjbeeig`) was deleted
through the Supabase Dashboard. The new disposable project was created
as `crfcglxcsnmeovnipnko` in Paris and linked using:

``` powershell
npx supabase link --project-ref crfcglxcsnmeovnipnko
```

The project list showed the new project as linked. Read-only checks
found no application tables in `public` and `auth.users` count `0`.
`npx supabase migration list` showed both local migration timestamps but
no remote timestamps. **The migrations had not yet been deployed to the
recreated project when this document was written.** Historical
verification results are from the original project and remain a record
of those tests; they should not be represented as tests rerun on the
recreated project.

## 8. Local artifacts

-   `docs/security/sprint-1b1-security-verification.md` --- concise
    verification report.
-   `scripts/test-fixtures/cross-parish.sql` --- creates the synthetic
    second parish and User D fixture.
-   `scripts/test-fixtures/cleanup-cross-parish.sql` --- attempted
    cleanup script; blocked by the deletion-prevention trigger.

Do not run fixture scripts against DEV or production. Do not modify the
cleanup script to bypass database safeguards.

## 9. Final status and follow-up

### Confirmed for the tested cases on the original disposable project

-   Migrations deployed and local/remote versions matched.
-   RLS enabled on the three identity tables.
-   Expected policies and grants present.
-   Anonymous read denied.
-   Tested authenticated writes denied.
-   Cross-user account and membership isolation passed for the tested
    pairs.
-   Cross-parish isolation passed for Users A and D.
-   Suspended User C could not read membership or organisation-unit
    rows.
-   Physical deletion protection blocked cleanup and the transaction
    rolled back.

### Findings to retain

1.  An inactive membership remained readable by its owner while the
    linked account was active. Confirm intended access behaviour.
2.  A suspended account could read its own account row. Confirm intended
    behaviour.
3.  The checks were targeted, not an exhaustive security audit.

### Safe operating rules

-   Verify the exact project reference before every database mutation.
-   Use disposable projects and synthetic fixtures for security tests.
-   Do not target DEV (`bpooqfgadtbyeduapwyi`) or production for
    cleanup/test commands.
-   Never record passwords, API keys, database passwords, or tokens in
    reports.
-   Do not disable RLS, remove `prevent_delete()`, or edit applied
    migrations to bypass safeguards.
-   Distinguish a passing test from a policy-design finding.
