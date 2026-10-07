# CYON Connect

Web and backend foundation for CYON Connect (SS Joachim and Anne Catholic Church, Ijegun Parish). Module-first architecture on Next.js + Supabase. No business features yet; mobile is deferred.

## Commands

| Command                                                        | Purpose                                                           |
| -------------------------------------------------------------- | ----------------------------------------------------------------- |
| `npm run dev` / `build` / `start`                              | Next.js                                                           |
| `npm run lint` · `typecheck` · `test`                          | quality gates                                                     |
| `npm run arch:check`                                           | architecture boundary rules (dependency-cruiser)                  |
| `npm run secrets:scan` · `security:bundle-scan`                | secret scanning; post-build client bundle check                   |
| `npm run database:migrate`                                     | apply migrations to the LOCAL Supabase stack (needs Supabase CLI) |
| `APP_ENV=development npm run database:reset` / `database:seed` | guarded; refuse production                                        |
| `npm run check`                                                | everything above except database commands                         |

## Layout

`app/` routes · `modules/<name>/{domain,application,infrastructure,presentation}` + `composition.ts` · `shared/` pure kernel · `infrastructure/` config, Supabase clients, logging, DB safety · `components/` · `scripts/` · `supabase/` (config, migrations, seed) · `tests/` · `docs/`.

Start with `docs/architecture/MODULE_GUIDE.md` and `docs/architecture/ARCHITECTURE.md`.

## Environment

Copy `.env.example` to `.env.local`. Real `.env*` files are gitignored; never commit secrets. `SUPABASE_SERVICE_ROLE_KEY` is server-only.
