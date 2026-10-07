# Architecture Decisions

Status key: **RECOMMENDED** (proposal), **PROVISIONAL** (stated by project documents, subject to validation), **OPEN**. Nothing here is stakeholder-approved.

## Selected technologies

| Choice                                       | Status                                        | Rationale / trade-off                                                                                     |
| -------------------------------------------- | --------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Next.js (App Router) + React + TypeScript    | PROVISIONAL (Charter §11, Project Definition) | One codebase for UI and server logic; trade-off: framework coupling, so business rules live in `domain/`. |
| Tailwind CSS                                 | PROVISIONAL                                   | Fast UI; v4 via PostCSS.                                                                                  |
| Supabase (Postgres, Auth, Storage, Realtime) | PROVISIONAL                                   | Fits RLS-based authorisation and low ops for a small team; trade-off: vendor coupling, RLS complexity.    |
| zod validation                               | RECOMMENDED                                   | Shared validation for web and future mobile.                                                              |
| Vitest                                       | RECOMMENDED                                   | Light, TypeScript-friendly.                                                                               |
| npm                                          | RECOMMENDED                                   | Already available; pnpm was not installed in the sandbox.                                                 |
| Vercel + GitHub Actions                      | PROVISIONAL                                   | Per project documents; CI only runs checks.                                                               |

## Alternatives considered

Separate Node API (NestJS/Express): rejected for now as unneeded complexity for ~300 members; revisit if mobile needs logic that cannot sit behind Next route handlers. Prisma/Drizzle ORM: deferred; not introduced in Sprint 0 (no unnecessary technologies).

## Services (existing-service discovery)

| Service                   | Evidence in repo                                         | Status                                                              |
| ------------------------- | -------------------------------------------------------- | ------------------------------------------------------------------- |
| GitHub                    | None (new local repo, no remote)                         | UNVERIFIED; human action: create/confirm remote                     |
| Vercel                    | No `vercel.json`, no `.vercel`                           | UNVERIFIED; human action: link project                              |
| Supabase                  | No `supabase/config.toml`, no env file                   | UNVERIFIED; human action: confirm project, provide URL/keys via env |
| Database / Auth / Storage | Part of Supabase                                         | UNVERIFIED                                                          |
| CI/CD                     | `.github/workflows/ci.yml` added (not yet run on GitHub) | NOT RUN remotely                                                    |

## Unresolved technical decisions

Mobile repo layout; ORM/query layer and type generation; handling of Supabase Auth lockout/throttling (FR-SEC-022); account activation flow details; offline QR behaviour (Charter risk); email provider for recovery.

## Requiring stakeholder approval

FRS baseline sign-off (FRS §28); the four open business decisions (OPEN_DECISIONS.md); hosting cost limits; any move of Phase 2 items into MVP (FR-CC-006).

---

# Sprint 1A decisions (all RECOMMENDED; none stakeholder-approved)

Note: the earlier "Services" table above is still accurate: GitHub, Vercel and the Supabase project remain **unverified**. `lib/`, `domain/`, `services/` and `types/` referred to in Sprint 0 documents no longer exist (see ARCHITECTURE.md section 11).

## ADR-001 Module-first architecture

Business modules, not technical layers, are the primary boundary (`modules/<name>/{domain,application,infrastructure,presentation}`). Trade-off: more directories per feature and a composition root per module, in return for locality of change and a clean path to extract or reuse logic for mobile. Rejected: global layer-first folders (they encourage cross-feature coupling); `src/` relocation (churn without benefit).

## ADR-002 Supabase as infrastructure behind ports

Domain/application never import Supabase; adapters live in module `infrastructure/`. Three clients (browser, server-as-user, admin). Trade-off: extra indirection; benefit: testable rules and the option to change data access. Accepted risk: RLS and application code both encode access rules and must be kept consistent (tests required per module).

## ADR-003 Boundary enforcement with dependency-cruiser

Chosen over ESLint-only because it can express "not another module's internals" with capture groups and detect cycles. ESLint rules are kept for editor feedback. Rules are verified by fixture tests. Residual limit: dependency-cruiser sees imports, not runtime behaviour.

## ADR-004 Environment identity and destructive-operation safety

`APP_ENV` (development/test/staging/production) is the explicit deployment identity because `NODE_ENV` is `production` for every Vercel build. Destructive scripts fail closed. Remote-database override exists for disposable projects only and never overrides production.

## ADR-005 Liveness vs readiness

Two endpoints with different contracts (see ARCHITECTURE.md section 6). Readiness uses the service role only to call a no-data function; it exposes no detail.

## ADR-006 Realtime messaging boundary (design only)

Supabase Realtime is an infrastructure adapter behind a messaging application port. Channel authorization must be RLS-backed and private by default; executives do not get message-content access (FR-SEC-017). Open: Broadcast vs Postgres Changes, presence, message retention.

## ADR-007 Organisation scope model (PROPOSED, needs approval before Sprint 1B schema)

Requirement: FR-SEC-029 (scope enforceable across Parish, Deanery, Archdiocese) and FR-GEN-006.
Analysis: a single `parish_id` column is **not** sufficient, because (a) an executive assignment's authority may apply to one unit **or** to a unit and its descendants (e.g. a Deanery executive over its parishes), (b) a member may transfer between parishes while history must stay attributable, (c) reports and RLS need "is X within scope Y" checks.
Proposal: an `org_units` table (type: parish | deanery | archdiocese, nullable `parent_id`) now with a single parish row; records carry `org_unit_id`; assignments carry a scope unit and an explicit `includes_descendants` flag; add a closure/path structure only when a second level is actually used. Alternatives: `ltree` (compact, Postgres-specific), closure table (flexible, more writes), per-tenant databases (rejected: operational cost for ~300 members).
Not decided: deanery/archdiocese reality for CYON in this area, member transfer rules, cross-parish reporting rules. Nothing in this ADR is implemented.
