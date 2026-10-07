# ERD: Identity Foundation (Sprint 1B.1)

This diagram describes the schema created by `supabase/migrations/20261008090000_identity_foundation.sql`.
It is verified against the real database catalog by `tests/database/erd.test.ts` (columns, types, PK/FK/UK flags and relationship cardinality), so it cannot silently drift from the implementation. `auth_users` is Supabase Auth's `auth.users` table, owned by Supabase; only its `id` is shown.

```mermaid
erDiagram
  auth_users ||--o| user_accounts : "authenticates (restrict)"
  members ||--o| user_accounts : "has at most one account (restrict)"
  org_units ||--o{ members : "home parish (restrict)"
  org_units |o--o{ org_units : "parent (restrict)"

  auth_users {
    uuid id PK
  }

  org_units {
    uuid id PK
    text unit_type
    text name
    uuid parent_id FK
    text parent_type FK
    timestamptz created_at
    timestamptz updated_at
  }

  members {
    uuid id PK
    uuid org_unit_id FK
    text org_unit_type FK
    text membership_status
    timestamptz created_at
    timestamptz updated_at
  }

  user_accounts {
    uuid id PK
    uuid auth_user_id FK, UK
    uuid member_id FK, UK
    text account_status
    timestamptz created_at
    timestamptz updated_at
  }
```

## Reading the diagram
- **Person → Member → Account:** a `members` row is the person's CYON member record. It may exist without an account (a pending applicant). A `user_accounts` row always has exactly one member and exactly one auth identity (`UK` on both foreign keys).
- **Separate lifecycles:** `members.membership_status` (pending, active, inactive, suspended, archived) and `user_accounts.account_status` (pending_activation, active, suspended, deactivated) are independent columns. Executive assignments and permissions are deliberately absent; they arrive in a later sprint as separate tables.
- **Organisation:** `org_units` is a typed adjacency tree (archdiocese, deanery, parish). `parent_type` and `org_unit_type` exist so the database can verify, with plain composite foreign keys, that a parent has the expected type and that a member's home unit is a parish. Unspecified composite uniqueness `(id, unit_type)` on `org_units` supports those keys and is not drawn.
- **Not drawn:** CHECK constraints, triggers (immutability, no physical delete), indexes and RLS. See `DATABASE_IDENTITY.md` and `DATABASE_SECURITY.md`.
