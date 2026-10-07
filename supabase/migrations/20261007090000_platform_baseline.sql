-- Platform baseline (Sprint 1A). Infrastructure only: no CYON business tables.

-- 1. Shared trigger helper used by future tables.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- 2. Default-deny posture: tables/sequences created from now on are NOT readable or writable by
--    anon/authenticated. Each future migration must GRANT explicitly and enable RLS (FR-SEC-010).
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;

-- 3. Readiness probe target. Reachable only by the server-side service role.
create or replace function public.platform_ping()
returns boolean
language sql
stable
set search_path = ''
as $$ select true $$;

revoke all on function public.platform_ping() from public, anon, authenticated;
grant execute on function public.platform_ping() to service_role;
