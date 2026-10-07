# Database Testing and Seed Strategy

## How the database is tested

- `tests/database/migrations.test.ts`: applies every migration in order to a clean PostgreSQL (PGlite) and checks the platform baseline.
- `tests/database/identity.test.ts`: 36 tests for constraints, immutability, deletion, status separation, hierarchy and RLS/privileges, including cross-organisation and privilege-escalation attempts.
- `tests/database/erd.test.ts`: verifies `docs/architecture/ERD_IDENTITY.md` against the real catalog.
- `tests/database/safety.test.ts`: production reset/seed refusal (unchanged from Sprint 1A).
- Shared helpers: `tests/support/db.ts` (fresh database, role switching), `tests/support/supabase-stub.sql` (stand-in for Supabase roles and `auth.users`/`auth.uid()`).
  Run: `npx vitest run tests/database` (or `npm test`). Each test file builds its own database, so there is no shared state between files.

## Seed strategy

- `supabase/seed/00_infrastructure.sql` stays empty of data. No fake members, executives, payments or other CYON records are seeded in any environment.
- The only data in a migration is reference data the schema requires to function: the single initial parish row.
- Tests create their own synthetic rows through `seed.*` helpers; names are prefixed `T-` and emails use `example.invalid`. Test data never leaves the in-memory test database.
- A developer wanting local sample people should create them through the application once it exists, not through committed SQL.

## Limits

- PGlite is real PostgreSQL but not the Supabase stack. The Supabase CLI path (`supabase start`, `db reset`, `gen types`) and real PostgREST/Auth behaviour are **not verified** (TD-5).
- Tests assert what is implemented; they do not prove the later authorization model.
