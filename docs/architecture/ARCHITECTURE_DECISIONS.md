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
