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
