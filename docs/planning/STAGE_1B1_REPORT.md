# Sprint 1B.1 Stage Report: Database and Identity Foundation

**Status:** database stage complete and verified on PostgreSQL (PGlite); awaiting review. Stopped at the stage boundary.

## Scope

Database only: identity data model, organisation foundation, constraints, indexes, RLS, migration, database tests, documentation. No TypeScript domain, services, API, UI or other business features (confirmed: no changes under `app/`, `modules/`, `shared/` or `infrastructure/`).

## ADR-007 gate

Still PROPOSED. Not treated as approved: only the subset common to all options was implemented (typed `org_units`, member home parish). Executive scope, descendants, transfers and cross-unit access remain blocked (TD-2, ID-5, ID-7).

## Artifacts

| Artifact                                    | Path                                                                           |
| ------------------------------------------- | ------------------------------------------------------------------------------ |
| Migration                                   | `supabase/migrations/20261008090000_identity_foundation.sql`                   |
| Schema design                               | `docs/architecture/DATABASE_IDENTITY.md`                                       |
| ERD (verified against the database by test) | `docs/architecture/ERD_IDENTITY.md`                                            |
| Security and RLS                            | `docs/architecture/DATABASE_SECURITY.md`                                       |
| Test and seed strategy                      | `docs/engineering/DATABASE_TESTING.md`                                         |
| ADRs                                        | ADR-007 gate note and ADR-008 in `docs/architecture/ARCHITECTURE_DECISIONS.md` |
| Tests                                       | `tests/database/{identity,erd,migrations}.test.ts`, `tests/support/db.ts`      |

## Schema

`auth.users` → `user_accounts` → `members` → `org_units`. Separate `membership_status` and `account_status`; no role/permission/executive columns; UUID identifiers immutable by trigger; no physical deletes; FK RESTRICT; composite FKs verify organisation types without triggers; no credentials or personal data.

## Security

RLS enabled on all tables; Supabase default grants removed; `anon` has nothing; `authenticated` can only SELECT, own account row always and own member row/home unit only while the account is `active`; `service_role` (server only) can select/insert/update but never delete/truncate; helper functions are not executable by PUBLIC. Authorization beyond own-row is deferred, so executives cannot yet read member data through the database.

## Tests (actual)

Database tests 60 (identity 36, migrations 5, ERD 3, production safety 16). Whole suite 106 of 106. lint, typecheck, architecture check (37 modules, 0 violations), build, bundle scan, secrets scan, gitleaks (history) and prettier all pass. Seven deliberate migration mutations and two ERD mutations were each caught by the tests.

## Known limitations

Verified via PGlite with a stub of Supabase's auth schema, **not** the Supabase CLI stack or real PostgREST/Auth (TD-5); generated types not produced (CLI unverified); duplicate persons cannot be prevented by schema; transfers not modelled; table owners can still TRUNCATE; CI has never run on GitHub.

## Open decisions

TD-2 (ADR-007 approval), TD-5, ID-1 to ID-8 in `docs/planning/OPEN_DECISIONS.md`.

## KILL-CRITIC

Hostile review covered identity fan-out, auth linkage, status coupling, org scope, integrity, RLS breadth, privacy, privilege escalation, migration repeatability and test strength. One finding (helper functions executable by PUBLIC) was fixed and covered by a permanent test. No unresolved critical database or identity blocker remains. Result: CONDITIONAL PASS (ADR-007 unapproved, Supabase CLI unverified).

## Independent KILL-CRITIC review (addendum)

A second, independent review re-ran every gate and attacked the migration instead of trusting the report above.

**Re-verified:** lint, typecheck, architecture check (37 modules, 0 violations), build, bundle scan, secrets scan, gitleaks (history) and prettier all pass; no files outside `docs/`, `tests/` and `supabase/migrations/` changed since Sprint 1A.

**Mutation testing (9 new mutations, distinct from the 7 above):** members policy `using (true)`, org_units policy `using (true)`, accounts policy readable by every signed-in user, dropped parish hierarchy clause, helper functions left executable, `membership_status` check removed, `account_status` check removed, cascading auth FK, cascading org FK. Eight were caught immediately. One (cascading org FK) **survived** because the no-delete trigger on `org_units` masked it, so the foreign key's delete rule was only indirectly tested.

**Fix:** `tests/database/identity-review.test.ts` asserts the delete/update rules of every identity foreign key directly in the catalog (the surviving mutant is now killed), probes `SELECT ... FOR UPDATE` as a signed-in user, a cross-table join, and the presence of the indexes behind the documented access patterns. Database tests: 64 (identity 36, review 4, migrations 5, ERD 3, production safety 16); whole suite 110.

**Findings recorded, not fixed (belong to later stages):**

1. The database does **not** constrain status transitions (e.g. `deactivated` to `active`, `archived` to `active`) or changes to `members.org_unit_id`. This is deliberate (returning members, FR-MEMA-006; transfers undecided, ID-5) but means the service role can change them freely. Until audit and actor attribution exist (FR-MEMA-004, FR-SEC-030), such privileged changes are not attributable at the database level, so **no API may expose status changes before the attribution mechanism is designed.**
2. `org_units_select_own_unit` relies on `members` RLS inside its subquery. When executive read policies are added to `members`, org-unit visibility widens implicitly. Revisit both together in the RBAC sprint.
3. Role-switching safety (a client cannot run `SET ROLE service_role`) cannot be asserted under PGlite because its session user is a superuser. It depends on PostgREST and signed JWTs and needs the real Supabase stack (TD-5).
4. The seeded parish name differs from the wording used elsewhere in the docs (ID-8).

No critical database or identity blocker was found.
