# CYON Connect Architecture (as implemented after Sprint 1A)

Status: describes the repository as it is. Recommendations not yet implemented are labelled **Planned**. Nothing is stakeholder-approved. Decisions: `ARCHITECTURE_DECISIONS.md`. Developer guide and walkthrough: `MODULE_GUIDE.md`.

## 1. Overview

One backend, many clients (FR-GEN-002). Today: a Next.js 15 / React 19 / TypeScript web app (`app/`) and Supabase as infrastructure (PostgreSQL, Auth, Storage, Realtime). Mobile is deferred, but business logic lives in modules that do not depend on Next.js, so a mobile client can later use the same HTTP API and database rules. Target scale ~300 members at one parish (FR-GEN-005); expansion to Deanery/Archdiocese is kept possible (FR-GEN-006, ADR-007).

## 2. Module-first structure

Business boundaries are modules (`modules/<name>/{domain,application,infrastructure,presentation}`), not global technical layers. Only one module exists: `modules/health` (technical, proves the pattern). Business modules (identity, membership, attendance, finance, ...) are created in their own sprints, not as empty folders. See `MODULE_GUIDE.md` for the rules table and the real request walkthrough.

## 3. Supabase is infrastructure

`infrastructure/supabase/` holds three clients:

- `browser.ts`: anon key, RLS applies, safe for client components.
- `server.ts` (`server-only`): anon key + session cookies, acts as the signed-in user, RLS applies.
- `admin.ts` (`server-only`): service role, bypasses RLS. Callable only from infrastructure adapters and composition roots (enforced). Callers must authorize in the application layer first (FR-CC-008).
  Domain and application code never import Supabase; they depend on ports implemented by adapters.

## 4. Environment

`infrastructure/config/schema.ts` (zod) separates **public** (`NEXT_PUBLIC_*`), **server** (`APP_ENV`) and **privileged** (`SUPABASE_SERVICE_ROLE_KEY`) variables. Public values are read in `config/public.ts`; server/privileged in `config/server.ts` (`server-only`). Validation is lazy; error messages name variables, never values. `.env*` files (except `.env.example`) are gitignored. A post-build scan (`npm run security:bundle-scan`) fails if the browser bundle references the key or contains a service-role JWT.

## 5. Database

- Migrations in `supabase/migrations/` (timestamped SQL), config in `supabase/config.toml`, seed in `supabase/seed/` (intentionally contains no data).
- Baseline migration `20261007090000_platform_baseline.sql`: `set_updated_at()` helper; default privileges revoked from `anon`/`authenticated` on new tables and sequences (default-deny); `platform_ping()` readiness function executable only by `service_role`. No business tables yet.
- Same engine everywhere: PostgreSQL via Supabase for dev, test and production.
- Safe commands: `npm run database:migrate` (local `supabase migration up`), `database:reset` and `database:seed` (guarded). The guard (`infrastructure/database/safety.ts`) fails closed: requires `APP_ENV` of `development` or `test`, refuses `production` and `NODE_ENV=production` unconditionally, refuses non-local targets unless an explicit override variable is set. Remote/production migration deployment is a separate, deliberate human step (open decision TD-1).
- Verification: `tests/database/migrations.test.ts` applies the migrations to a clean PostgreSQL (PGlite) with a small stub of Supabase's `auth`/roles (`tests/support/supabase-stub.sql`). **The Supabase CLI stack (`supabase start`/`db reset`) was NOT run** (no Docker in the build sandbox); `config.toml` is unverified against the CLI.

## 6. Health

- `GET /api/health`: liveness, no dependencies, no configuration.
- `GET /api/health/ready`: readiness; calls `platform_ping()` through the real supabase-js client; 200 when ready, 503 otherwise; body lists dependency name/status/latency only. Details go to logs (error name only), never to the response.

## 7. Errors, logging, correlation

`shared/errors/app-error.ts`: categories validation, authentication, authorization, not_found, conflict, business_rule, infrastructure, internal, mapped to HTTP status in `shared/http/error-response.ts`; unknown errors become a generic message. `shared/logging/logger.ts` provides redaction (credentials, email, message/content fields); `infrastructure/logging/console-logger.ts` writes JSON lines. `x-correlation-id` is accepted (if well formed) or generated and returned. External observability tooling is **Planned**, not present.

## 8. Security baseline implemented

Server/client separation (`server-only`, import rules, bundle scan); secrets protection (gitignore, `.env.example`, lightweight scanner, gitleaks over full history in CI); default-deny DB defaults; security headers (nosniff, frame deny, referrer policy, HSTS, permissions policy, COOP); safe error responses; `npm audit` job (awareness). Not implemented: CSP, rate limiting, authentication, authorization (FR-SEC-008/009 are backend features for sprints 1B/3).

## 9. Enforcement and CI

`npm run arch:check` (dependency-cruiser) plus ESLint boundary rules; tests in `tests/architecture` prove each rule fires. CI (`.github/workflows/ci.yml`): install, lint, typecheck, arch check, tests, build, bundle scan, secrets scan; separate gitleaks job and a non-blocking dependency audit job. CI has not run on GitHub (no remote).

## 10. Deliberately NOT implemented in Sprint 1A

Authentication, identity/member/account tables, roles, permissions, executive assignments, organisation tables, RLS policies for business data, all business modules, realtime messaging, notifications, storage buckets, reporting, mobile app, observability tooling, Supabase CLI verification.

## 11. Disposition of Sprint 0 structure

| Sprint 0 item                               | Decision        | Result                                                                                                 |
| ------------------------------------------- | --------------- | ------------------------------------------------------------------------------------------------------ |
| `lib/env/schema.ts`, `lib/env/index.ts`     | Move + Refactor | `infrastructure/config/{schema,public,server}.ts`; added `APP_ENV`, privileged split                   |
| `lib/errors.ts`                             | Replace         | `shared/errors/app-error.ts` (categories replace codes) + `shared/http/error-response.ts`              |
| `tests/env.test.ts`, `tests/errors.test.ts` | Move + Refactor | `tests/infrastructure/env.test.ts`, `tests/shared/errors.test.ts` (original assertions kept, extended) |
| `domain/`, `services/`, `types/` (empty)    | Delete          | Logic belongs in `modules/<name>/` or `shared/`                                                        |
| `lib/`                                      | Delete          | Emptied by the moves                                                                                   |
| `components/`                               | Keep            | Generic non-business UI primitives only                                                                |
| `app/api/health/route.ts`                   | Refactor        | Delegates to `modules/health/presentation`; added `/api/health/ready`                                  |
| `supabase/migrations`, `supabase/seed`      | Keep + populate | Baseline migration, config.toml, empty seed                                                            |
| root-level `app/`                           | Keep            | No `src/` migration (no technical reason)                                                              |
