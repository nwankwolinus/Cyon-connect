# CYON Connect

Web and backend foundation for CYON Connect (SS Joachim and Anne Catholic Church, Ijegun Parish). Sprint 0: no business features yet; mobile is deferred.

## Commands

`npm install` · `npm run dev` · `npm run lint` · `npm run typecheck` · `npm test` · `npm run build` · `npm run check`

## Layout

`app/` UI and route handlers · `components/` UI parts · `lib/` infrastructure (env, errors) · `services/` use cases · `domain/` pure business rules · `types/` shared contracts · `tests/` · `supabase/` migrations and seed · `docs/` requirements pointer, architecture, planning, engineering.

## Environment

Copy `.env.example` to `.env.local`. Real `.env*` files are gitignored; never commit secrets.

## Docs

Start with `docs/architecture/ARCHITECTURE.md`, then `docs/planning/`.
