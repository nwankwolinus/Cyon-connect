# CYON Connect Architecture (Sprint 0 proposal)

Status: recommendation. Not stakeholder-approved. See ARCHITECTURE_DECISIONS.md.

## 1. System overview

One backend, many clients (FR-GEN-002). Sprint scope: a Next.js web/admin app plus Supabase (PostgreSQL, Auth, Storage, Realtime). A mobile client is deferred but will consume the same contracts. Target: ~300 members at one parish (FR-GEN-005), without blocking Parish → Deanery → Archdiocese growth (FR-GEN-006, FR-SEC-029).

## 2. Layering

| Layer                | Location                                     | Rule                                                                                         |
| -------------------- | -------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Presentation         | `app/`, `components/`                        | No business rules; no authorisation decisions treated as security                            |
| Application services | `services/`                                  | Use cases; orchestrate domain, data, audit                                                   |
| Domain               | `domain/`                                    | Pure TypeScript business rules (e.g. financial authority), no framework imports; unit-tested |
| Persistence          | `lib/data/` (future), `supabase/migrations/` | Data access and SQL                                                                          |
| Auth / authorization | `lib/auth/`, `lib/authz/` (future)           | Server-side checks plus RLS                                                                  |
| Validation           | zod schemas in `domain/` or `types/`         | Shared with mobile later                                                                     |
| Audit                | `services/audit` (future), DB table          | Append-only                                                                                  |
| Infrastructure       | `lib/`                                       | Env, Supabase clients, errors                                                                |

## 3. Web and backend

Next.js App Router. Mutations go through server-side services (Route Handlers or Server Actions that delegate to `services/`). Route Handlers under `app/api/` expose a stable HTTP surface the mobile client can call; business logic never lives in components.

## 4. Database direction

PostgreSQL via Supabase, schema in versioned migrations. Separate tables for member record, user account, membership status, account status and executive assignment (BR-CC-002). Financial, attendance, executive and audit data are never hard-deleted (FR-FIN-011, FR-MEMA-005, FR-AUD-003). Include an organisational-unit column strategy (parish now, deanery/archdiocese later). Detailed ERD is a later artefact (FR-CC-005).

## 5. Authentication

Supabase Auth for credentials, recovery and sessions (FR-SEC-004–007). One user account per member record, linked by a unique constraint (FR-SEC-003). Throttling/lockout (FR-SEC-022) to be validated against Supabase capabilities in Sprint 1.

## 6. Authorization

Roles are not permissions (BR-CC-003). Permissions are derived from valid, time-bound executive assignments (FR-ADM-005, FR-SEC-011) using the FRS §21 matrix as the baseline; anything unspecified is denied (FR-SEC-010). Checks run in services and are mirrored by RLS. Financial correct/reverse is a separate permission granted only to Financial Secretary (BR-CC-004/005/006/007).

## 7. RLS strategy

RLS enabled on every table by default, deny-by-default policies, helper SQL functions that resolve the caller's active permissions. The service-role key is server-only and used sparingly, with application-level checks and audit. Welfare and private messages get stricter policies (FR-SEC-016/017). Files inherit access from their parent record (FR-SEC-018).

## 8. Future mobile integration

Domain rules and validation schemas are framework-free so they can be shared; HTTP/API contracts and Supabase RLS provide the same enforcement to any client. Mobile decisions (monorepo vs separate repo) are deferred.

## 9. Storage, realtime, audit

- **Storage:** private buckets, signed URLs, policies tied to owning record; upload type/size validation (FR-SEC-025).
- **Realtime:** only for messaging and live updates (Sprint 9); realtime respects RLS; messaging analytics never expose content (FR-MSG-011).
- **Audit:** append-only audit table written by services/DB triggers; records actor, action, time, record, change (FR-AUD-002); audited actions listed in FR-AUD-001.

## 10. Deployment

GitHub → CI (lint, typecheck, test, build) → Vercel preview/production; Supabase separate dev and production projects recommended. Actual service state is **unverified** (see ARCHITECTURE_DECISIONS.md, Services).

## 11. Scalability

300 members does not need extra infrastructure. Keep the tenancy/org-scope column, index by it, and avoid per-parish assumptions in code. Revisit connection pooling, rate limiting and cost (Charter risk: hosting cost) before release.
