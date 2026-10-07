# Database: Identity Foundation (Sprint 1B.1)

Migration: `supabase/migrations/20261008090000_identity_foundation.sql`. ERD: `ERD_IDENTITY.md`. Security: `DATABASE_SECURITY.md`. Tests and seed strategy: `docs/engineering/DATABASE_TESTING.md`. Decisions: ADR-007 (gate) and ADR-008 in `ARCHITECTURE_DECISIONS.md`.

## 1. Scope

Implemented: `org_units`, `members`, `user_accounts`, their constraints, indexes, triggers, grants and RLS. Not implemented (later stages/sprints): TypeScript types/domain/services, API, UI, member profile data, roles/permissions/executive assignments, audit tables, any other business module.

## 2. ADR-007 gate outcome

ADR-007 (organisation scope) is **PROPOSED, not approved**. Rather than invent the final model, only the subset common to every ADR-007 option was built: typed organisation units with an optional parent, and a member's single home parish. Deferred until ADR-007 is approved: executive scope assignments and "includes descendants" semantics, closure/path structures, member transfer history, cross-unit access rules and any RLS beyond own-row. The two interim rules that go slightly beyond the bare minimum (members belong to a **parish**; hierarchy order Archdiocese → Deanery → Parish) come directly from the project's stated hierarchy and are reversible by a migration that drops a CHECK/constraint.

## 3. Design decisions

**No separate `persons` table.** FR-MEM-002/FR-SEC-003 define one member record per person; a persons table 1:1 with members would only duplicate the key. The real-world "person" is the member record itself. The database cannot prove two rows are the same human (duplicate detection and merge are workflow decisions, FR-MEM-011, open decision #3), so person-level uniqueness is **not** enforced by constraint and must not be faked with email/phone/name uniqueness.

**`members` holds no personal data.** FR-MEM-006 fields (name, DOB, email, phone, ...) will go in a separate profile table so field-level protection (FR-MEM-012, FR-PRI-003) can be applied without exposing identity rows. Rule for later migrations: never add PII columns to `members` or `user_accounts` (the `authenticated` role has table-wide SELECT on its own rows).

**Chain:** `auth.users` → `user_accounts` → `members` → `org_units`. Authentication stays in Supabase Auth; no credentials, hashes or tokens exist in `public`.

**Two ids on purpose:** `user_accounts.id` (application account id, used later for audit actor references and decoupled from the auth provider) and `user_accounts.auth_user_id` (provider identity).

## 4. Tables

### org_units

| Column                     | Notes                                                                                                                                        |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `id` uuid PK               | `gen_random_uuid()`, immutable                                                                                                               |
| `unit_type`                | archdiocese / deanery / parish, immutable                                                                                                    |
| `name`                     | non-blank; unique among siblings of the same type (case/space-insensitive)                                                                   |
| `parent_id`, `parent_type` | optional parent; both null or both set; composite FK `(parent_id, parent_type)` → `org_units(id, unit_type)` verifies the parent's real type |
| `created_at`, `updated_at` | timestamptz, UTC semantics                                                                                                                   |

Hierarchy CHECK: archdiocese has no parent; deanery's parent (if any) is an archdiocese; parish's parent (if any) is a deanery. Parents are optional because the units above the initial parish are not yet defined. Types strictly descend, so cycles are impossible. One parish row is inserted by the migration (reference data, not personal data).

### members

| Column                         | Notes                                                                                                                                              |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id` uuid PK                   | stable member identity, immutable; never derived from name/email/phone/DOB                                                                         |
| `org_unit_id`, `org_unit_type` | home unit; composite FK to `org_units(id, unit_type)` with `org_unit_type = 'parish'`, so a member's home unit must be a parish (interim, ADR-007) |
| `membership_status`            | pending, active, inactive, suspended, archived (FR-MEM-009), default pending                                                                       |
| timestamps                     | as above                                                                                                                                           |

### user_accounts

| Column           | Notes                                                                          |
| ---------------- | ------------------------------------------------------------------------------ |
| `id` uuid PK     | application account id, immutable                                              |
| `auth_user_id`   | NOT NULL, UNIQUE, FK `auth.users(id)` **ON DELETE RESTRICT**, immutable        |
| `member_id`      | NOT NULL, UNIQUE, FK `members(id)` ON DELETE RESTRICT, immutable               |
| `account_status` | pending_activation, active, suspended, deactivated; default pending_activation |
| timestamps       | as above                                                                       |

## 5. Invariants enforced by the database

- One account per member and one account per auth identity (two UNIQUE constraints): **Person → Member → Account** cannot fan out. A member may exist without an account (pending applicant, FR-MEM-005 flow).
- An account always has an existing member and an existing auth user (NOT NULL + FK).
- Statuses are limited to the defined values; membership and account status are separate columns with no coupling.
- Identifiers and linkage columns (`id`, `unit_type`, `auth_user_id`, `member_id`, `created_at`) cannot be changed (`reject_column_change` trigger).
- No physical deletes on any identity table (`prevent_delete` trigger, plus no DELETE grant to any role). History is kept by changing status (BR-CC-016, FR-MEMA-005, FR-MEMA-006, FR-SEC-027). No generic `deleted_at` column: `inactive`, `archived`, `deactivated` already express the lifecycle.
- Foreign keys use RESTRICT, so a referenced parent cannot disappear.

## 6. Auth linkage lifecycle

No sync trigger exists on `auth.users`. The server-side flow (Stage 1B.2+) creates the member and account rows explicitly after the auth identity exists. Deleting an auth identity that has an account fails by design (RESTRICT); use `account_status = 'deactivated'`. The `NOT NULL` choice is stricter than necessary and can be relaxed if pre-created accounts are ever required. A controlled erasure/re-link procedure is deferred (open decision ID-3).

## 7. Indexes

| Index                                                          | Purpose                                                                  |
| -------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `user_accounts_auth_user_key` (unique)                         | account by auth user id (every request)                                  |
| `user_accounts_member_key` (unique)                            | account by member id                                                     |
| `members_org_unit_status_idx (org_unit_id, membership_status)` | members in an organisation, active members; also serves org-only filters |
| `org_units_sibling_name_key` (unique)                          | sibling name uniqueness                                                  |
| `org_units_parent_id_idx` (partial)                            | children of a unit                                                       |
| primary keys and `org_units_id_type_key`                       | member-by-id lookups; composite FK targets                               |

## 8. Audit considerations (not implemented)

Changes to `membership_status` and `account_status`, account creation/linking, and any org-unit change must be attributable to the authenticated actor (FR-MEMA-004, FR-SEC-030, FR-AUD). Account ids are stable and non-deleted, so audit rows can reference them forever. Because rows cannot be deleted and identifiers are immutable, audit references can never dangle. `updated_at` is only a convenience, not an audit trail.

## 9. Generated database types

Deliberately **not** generated in this stage. Generation needs the Supabase CLI (`supabase gen types typescript --local`) against a running local stack, which has not been verified in this repository (TD-5), and no TypeScript code consumes the schema yet. Hand-writing "generated" types would violate the rule against manual maintenance. Stage 1B.2 should add the script and committed output once the CLI path is verified.

## 10. Requirement coverage (database foundation only)

FR-SEC-003, BR-CC-001, FR-MEM-002, FR-MEM-009, BR-CC-002, FR-SEC-004, FR-SEC-027, FR-MEMA-005/006, BR-CC-016, FR-SEC-029 and FR-GEN-006 are **partially established**. Nothing is complete: workflows, domain rules, authorization and audit come later. **Deferred:** FR-MEM-003 (membership identifier, format undecided), FR-MEM-006/012 (profile and field-level access), FR-MEM-011 (duplicate detection), BR-CC-003/015 (permissions, assignments).

## 11. Known limitations

- Duplicate persons cannot be prevented by the schema (see section 3).
- Member transfer between parishes is neither modelled nor blocked at the database level (only unreachable for non-service roles); needs ADR-007.
- Table owners/superusers can still TRUNCATE; protection relies on grants and migration review.
- Verified on PostgreSQL via PGlite with a stub of Supabase's auth schema, not on the Supabase CLI stack.
