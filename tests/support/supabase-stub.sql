-- Minimal stand-in for the Supabase platform pieces our migrations depend on.
-- Used ONLY by the PGlite migration test. Real environments use the Supabase CLI stack.
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;

create schema auth;
create schema extensions;
create schema storage;
create table storage.buckets (
  id text primary key,
  name text not null,
  public boolean not null default false,
  file_size_limit bigint,
  allowed_mime_types text[]
);
create table storage.objects (bucket_id text not null, name text not null);
alter table storage.objects enable row level security;
-- Minimal test-only Vault stand-in. It does not model Supabase Vault encryption or grants.
create schema vault;
create table vault.decrypted_secrets (name text, decrypted_secret text);
insert into vault.decrypted_secrets(name, decrypted_secret) values
  ('membership_photo_cleanup_url', 'https://cleanup.invalid/api/internal/membership-photo-cleanup'),
  ('membership_photo_cleanup_hmac_secret', 'test-only-not-a-real-secret-0123456789abcdef0123456789abcdef');
-- Test-only shim for the hosted Supabase Cron schema; migration code schedules a job but
-- these tests never execute a background schedule.
create schema cron;
create table cron.test_jobs(job_name text, schedule text, command text);
create function cron.schedule(p_job_name text, p_schedule text, p_command text)
returns bigint language plpgsql as $$
begin
  insert into cron.test_jobs values (p_job_name, p_schedule, p_command);
  return 1;
end
$$;
-- Test-only pg_net stand-in. Tests inspect scheduled SQL but never send HTTP requests.
create schema net;
create function net.http_post(url text, body jsonb default '{}'::jsonb, params jsonb default '{}'::jsonb,
  headers jsonb default '{}'::jsonb, timeout_milliseconds integer default 2000)
returns bigint language sql as $$ select 1::bigint $$;
create table auth.users (id uuid primary key default gen_random_uuid(), email text, email_confirmed_at timestamptz);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(coalesce(
    current_setting('request.jwt.claim.sub', true),
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'
  ), '')::uuid
$$;
create function auth.role() returns text language sql stable as $$
  select coalesce(
    current_setting('request.jwt.claim.role', true),
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'
  )
$$;

grant usage on schema public, auth to anon, authenticated, service_role;
-- Mimic Supabase's permissive default privileges so our baseline REVOKEs are genuinely exercised.
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
