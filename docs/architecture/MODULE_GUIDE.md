# Module Guide and Architecture Walkthrough

## Layout

```
app/                        Next.js routes only (thin): call a module's presentation or composition root
modules/<name>/
  domain/                   pure business rules and types (no frameworks, SDKs, env, browser APIs)
  application/              use cases + ports (interfaces owned by the module); depends on domain only
  infrastructure/           adapters implementing ports (Supabase, storage, realtime)
  presentation/             request/response handlers, view models, UI for this module
  composition.ts            the ONLY place that wires application ports to infrastructure adapters
shared/                     small pure kernel (Result, AppError, http helpers, log redaction)
infrastructure/             module-agnostic technical code: config/ (env), supabase/ (clients), database/, logging/
components/                 generic, non-business UI primitives (empty for now)
scripts/                    CLI tooling (database wrapper, security scans)
supabase/                   config.toml, migrations/, seed/
tests/                      mirrors the above; tests/architecture enforces the rules
```

## Dependency rules (enforced by `npm run arch:check`, config in `.dependency-cruiser.cjs`)

| From                     | May import                                                                                   | Must NOT import                                                                              |
| ------------------------ | -------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `domain`                 | same module's domain, `shared`                                                               | application, infrastructure, presentation, composition, `app`, Next.js, React, Supabase, env |
| `application`            | own domain, own ports, `shared`                                                              | infrastructure, presentation, composition, `app`, Next.js, React, Supabase                   |
| `presentation`           | own application, `shared`, `infrastructure/supabase/browser`, `infrastructure/config/public` | own domain, any infrastructure, Supabase SDK packages                                        |
| module `infrastructure`  | own domain/application, `shared`, global `infrastructure/`                                   | presentation, composition, `app`, other modules' internals                                   |
| `composition.ts`         | own layers, global `infrastructure/`                                                         | other modules' internals                                                                     |
| global `infrastructure/` | `shared`, npm packages                                                                       | `modules/`, `app/`, `components/`                                                            |
| `shared`                 | other `shared` files only                                                                    | everything else                                                                              |
| `app`                    | module `presentation` and `composition`                                                      | module domain/application/infrastructure                                                     |
| any other module         | nothing inside this module (add a deliberate public contract first)                          | internals of this module                                                                     |

Additional rules: `infrastructure/supabase/admin.ts`, `server.ts` and `config/server.ts` may be imported only from infrastructure adapters, composition roots, scripts and tests, and never from `.tsx` files. ESLint adds editor feedback (no `process.env` or browser globals in domain/application/shared).

## Walkthrough: `GET /api/health/ready` (the one real slice)

```
Request
  ↓  app/api/health/ready/route.ts                                  thin route, exports GET
  ↓  modules/health/composition.ts                                  wires probe -> use case -> handler
  ↓  modules/health/presentation/health-handlers.ts                 HTTP mapping, correlation id, 200/503
  ↓  modules/health/application/check-readiness.ts                  use case: timeouts, failure handling
  ↓  modules/health/domain/readiness.ts                             buildReadinessReport (fail closed)
  ↑  modules/health/application/ports.ts                            InfrastructureProbe (port)
  ↑  modules/health/infrastructure/supabase-database-probe.ts       adapter implements the port
  ↓  infrastructure/supabase/admin.ts                               service-role client (server-only)
  ↓  Supabase (PostgREST) -> PostgreSQL: public.platform_ping()     migration 20261007090000
```

`GET /api/health` (liveness) calls `modules/health/presentation/health-handlers.ts` directly and touches no infrastructure.

## Adding a module (e.g. `membership`)

1. Create `modules/membership/{domain,application,infrastructure,presentation}` only for layers you need now.
2. Put rules and types in `domain/`; use cases and ports (`XRepository` interfaces) in `application/`.
3. Implement ports in `infrastructure/` using `infrastructure/supabase/*`. Use the **server** client (RLS, as the user) by default; the admin client only when a use case genuinely needs privileges, after an application-level authorization check.
4. Add `composition.ts` that builds the use cases with the adapters.
5. Add `app/` routes that call the composition root or presentation handlers.
6. Add a migration (RLS enabled, explicit grants; default is deny) and tests. Run `npm run check`.
7. If another module needs yours, expose a deliberate contract first (e.g. `modules/membership/index.ts` of pure types) and update `.dependency-cruiser.cjs` consciously. Never reach into another module's persistence.

## Realtime (preparation only, nothing implemented)

`Browser → Supabase Realtime channel → (messaging presentation) → messaging application port → messaging domain`, with the Supabase Realtime subscription as an infrastructure adapter in `modules/messaging/infrastructure/`. Channel authorization must rely on RLS so private message content never becomes executive-readable (FR-SEC-017). See ADR-006.
