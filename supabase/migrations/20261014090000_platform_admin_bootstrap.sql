-- One-time, HMAC-authorized initial PLATFORM_ADMIN bootstrap.
-- Identity/account/member rows are read and locked only; this migration never provisions or changes them.
-- Requires Supabase Vault (vault.decrypted_secrets) and pgcrypto in the extensions schema.

do $$
begin
  if to_regclass('vault.decrypted_secrets') is null then
    raise exception 'Supabase Vault must be enabled before applying platform admin bootstrap.';
  end if;
end;
$$;

create extension if not exists pgcrypto with schema extensions;

create schema authorization_private;
alter schema authorization_private owner to postgres;
revoke all on schema authorization_private from public, anon, authenticated, service_role;

create table authorization_private.platform_roles (
  code text primary key check (code = 'PLATFORM_ADMIN'),
  description text not null
);

create table authorization_private.platform_permissions (
  code text primary key check (code in (
    'platform.authorization.assignment.read',
    'platform.authorization.assignment.grant',
    'platform.authorization.assignment.revoke',
    'platform.security_audit.read'
  )),
  description text not null
);

create table authorization_private.platform_role_permissions (
  role_code text not null references authorization_private.platform_roles(code) on delete restrict,
  permission_code text not null references authorization_private.platform_permissions(code) on delete restrict,
  primary key (role_code, permission_code)
);

create table authorization_private.platform_role_assignments (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.user_accounts(id) on delete restrict,
  role_code text not null references authorization_private.platform_roles(code) on delete restrict,
  scope_type text not null check (scope_type = 'platform'),
  scope_id uuid check (scope_id is null),
  granted_at timestamptz not null default now(),
  revoked_at timestamptz,
  constraint platform_role_assignments_revocation_pair check (revoked_at is null or revoked_at >= granted_at)
);
create unique index platform_role_assignments_one_active
  on authorization_private.platform_role_assignments(account_id, role_code)
  where revoked_at is null;

create table authorization_private.platform_bootstrap_state (
  singleton boolean primary key default true check (singleton),
  closed_at timestamptz
);
insert into authorization_private.platform_bootstrap_state(singleton, closed_at) values (true, null);

create table authorization_private.platform_bootstrap_operations (
  operation_id uuid primary key,
  manifest_digest bytea not null unique,
  assignment_id uuid not null unique references authorization_private.platform_role_assignments(id) on delete restrict,
  consumed_at timestamptz not null default now()
);

create table authorization_private.platform_security_audit (
  id uuid primary key default gen_random_uuid(),
  operation_id uuid not null unique references authorization_private.platform_bootstrap_operations(operation_id) on delete restrict,
  event_type text not null check (event_type = 'initial_platform_admin_granted'),
  actor_auth_user_id uuid not null references auth.users(id) on delete restrict,
  target_auth_user_id uuid not null references auth.users(id) on delete restrict,
  target_account_id uuid not null references public.user_accounts(id) on delete restrict,
  target_member_id uuid not null references public.members(id) on delete restrict,
  target_org_unit_id uuid not null references public.org_units(id) on delete restrict,
  role_code text not null references authorization_private.platform_roles(code) on delete restrict,
  permission_ceiling text not null,
  environment_project_ref text not null,
  evidence_reference text not null,
  manifest_digest bytea not null,
  outcome text not null check (outcome = 'granted'),
  occurred_at timestamptz not null default now()
);

insert into authorization_private.platform_roles(code, description)
values ('PLATFORM_ADMIN', 'Platform authorization administration and security-audit review only.');

insert into authorization_private.platform_permissions(code, description) values
  ('platform.authorization.assignment.read', 'Read platform authorization assignments.'),
  ('platform.authorization.assignment.grant', 'Grant authorization only through a separately approved controlled workflow.'),
  ('platform.authorization.assignment.revoke', 'Revoke authorization only through a separately approved controlled workflow.'),
  ('platform.security_audit.read', 'Read security-audit events relevant to platform access administration.');

insert into authorization_private.platform_role_permissions(role_code, permission_code) values
  ('PLATFORM_ADMIN', 'platform.authorization.assignment.read'),
  ('PLATFORM_ADMIN', 'platform.authorization.assignment.grant'),
  ('PLATFORM_ADMIN', 'platform.authorization.assignment.revoke'),
  ('PLATFORM_ADMIN', 'platform.security_audit.read');

alter table authorization_private.platform_roles enable row level security;
alter table authorization_private.platform_permissions enable row level security;
alter table authorization_private.platform_role_permissions enable row level security;
alter table authorization_private.platform_role_assignments enable row level security;
alter table authorization_private.platform_bootstrap_state enable row level security;
alter table authorization_private.platform_bootstrap_operations enable row level security;
alter table authorization_private.platform_security_audit enable row level security;
revoke all on all tables in schema authorization_private from public, anon, authenticated, service_role;
revoke all on all sequences in schema authorization_private from public, anon, authenticated, service_role;
revoke select on vault.decrypted_secrets from public, anon, authenticated, service_role;

create or replace function public._platform_bootstrap_manifest_bytes(p_manifest jsonb)
returns bytea
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_fields text[];
  v_value text;
  v_payload bytea := ''::bytea;
begin
  v_fields := array[
    p_manifest ->> 'version', p_manifest ->> 'project_ref', p_manifest ->> 'operation_id',
    p_manifest ->> 'target_auth_user_id', p_manifest ->> 'target_account_id',
    p_manifest ->> 'target_member_id', p_manifest ->> 'target_org_unit_id',
    p_manifest ->> 'role', p_manifest ->> 'scope', p_manifest ->> 'permission_ceiling',
    p_manifest ->> 'issued_at', p_manifest ->> 'expires_at',
    p_manifest ->> 'approver_auth_user_id', p_manifest ->> 'evidence_reference'
  ];
  foreach v_value in array v_fields loop
    if v_value is null then raise exception 'invalid bootstrap manifest'; end if;
    v_payload := v_payload || pg_catalog.int4send(octet_length(convert_to(v_value, 'UTF8')))
      || convert_to(v_value, 'UTF8');
  end loop;
  return v_payload;
end;
$$;

create or replace function public._platform_bootstrap_constant_time_equal(p_left bytea, p_right bytea)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_difference integer := 0;
  v_index integer;
begin
  if p_left is null or p_right is null or octet_length(p_left) <> octet_length(p_right) then
    return false;
  end if;
  for v_index in 0..octet_length(p_left) - 1 loop
    v_difference := v_difference | (get_byte(p_left, v_index) # get_byte(p_right, v_index));
  end loop;
  return v_difference = 0;
end;
$$;

revoke all on function public._platform_bootstrap_manifest_bytes(jsonb) from public, anon, authenticated, service_role;
revoke all on function public._platform_bootstrap_constant_time_equal(bytea, bytea) from public, anon, authenticated, service_role;

create or replace function public.bootstrap_initial_platform_admin(p_manifest jsonb, p_mac_hex text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_secret jsonb;
  v_key bytea;
  v_expected_mac bytea;
  v_supplied_mac bytea;
  v_digest bytea;
  v_account public.user_accounts%rowtype;
  v_member public.members%rowtype;
  v_assignment_id uuid;
  v_secret_count integer;
  v_permission_count integer;
  v_expected_permissions constant text := 'platform.authorization.assignment.read,platform.authorization.assignment.grant,platform.authorization.assignment.revoke,platform.security_audit.read';
  v_issued_at timestamptz;
  v_expires_at timestamptz;
begin
  if p_manifest is null or jsonb_typeof(p_manifest) <> 'object'
     or (select count(*) from jsonb_object_keys(p_manifest)) <> 14
     or p_manifest ->> 'version' <> 'cyon-platform-admin-bootstrap/v1'
     or p_manifest ->> 'role' <> 'PLATFORM_ADMIN'
     or p_manifest ->> 'scope' <> 'platform'
     or p_manifest ->> 'permission_ceiling' <> v_expected_permissions
     or length(coalesce(p_manifest ->> 'evidence_reference', '')) not between 1 and 200
     or p_mac_hex !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = 'P0001', message = 'Bootstrap rejected.';
  end if;

  select count(*)::integer into v_secret_count
  from vault.decrypted_secrets
  where name = 'cyon-initial-platform-admin-bootstrap-v1';
  if v_secret_count <> 1 then
    raise exception using errcode = 'P0001', message = 'Bootstrap rejected.';
  end if;

  select decrypted_secret::jsonb into v_secret
  from vault.decrypted_secrets
  where name = 'cyon-initial-platform-admin-bootstrap-v1';
  if v_secret is null
     or v_secret ->> 'project_ref' is null
     or v_secret ->> 'hmac_key_base64' is null then
    raise exception using errcode = 'P0001', message = 'Bootstrap rejected.';
  end if;
  v_key := pg_catalog.decode(v_secret ->> 'hmac_key_base64', 'base64');
  if octet_length(v_key) < 32
     or (p_manifest ->> 'project_ref') <> (v_secret ->> 'project_ref') then
    raise exception using errcode = 'P0001', message = 'Bootstrap rejected.';
  end if;

  select count(*)::integer into v_permission_count
  from authorization_private.platform_role_permissions
  where role_code = 'PLATFORM_ADMIN'
    and permission_code = any(array[
      'platform.authorization.assignment.read',
      'platform.authorization.assignment.grant',
      'platform.authorization.assignment.revoke',
      'platform.security_audit.read'
    ]);
  if v_permission_count <> 4 then
    raise exception using errcode = 'P0001', message = 'Bootstrap rejected.';
  end if;

  v_expected_mac := extensions.hmac(public._platform_bootstrap_manifest_bytes(p_manifest), v_key, 'sha256');
  v_supplied_mac := pg_catalog.decode(p_mac_hex, 'hex');
  if not public._platform_bootstrap_constant_time_equal(v_expected_mac, v_supplied_mac) then
    raise exception using errcode = 'P0001', message = 'Bootstrap rejected.';
  end if;

  v_issued_at := (p_manifest ->> 'issued_at')::timestamptz;
  v_expires_at := (p_manifest ->> 'expires_at')::timestamptz;
  if to_char(v_issued_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') <> p_manifest ->> 'issued_at'
     or to_char(v_expires_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') <> p_manifest ->> 'expires_at'
     or v_issued_at > now() + interval '60 seconds'
     or v_expires_at <= now()
     or v_expires_at <= v_issued_at
     or v_expires_at - v_issued_at > interval '15 minutes'
     or p_manifest ->> 'approver_auth_user_id' <> p_manifest ->> 'target_auth_user_id' then
    raise exception using errcode = 'P0001', message = 'Bootstrap rejected.';
  end if;

  perform 1 from authorization_private.platform_bootstrap_state
    where singleton and closed_at is null for update;
  if not found then raise exception using errcode = 'P0001', message = 'Bootstrap rejected.'; end if;
  if exists (select 1 from authorization_private.platform_bootstrap_operations
             where operation_id = (p_manifest ->> 'operation_id')::uuid) then
    raise exception using errcode = 'P0001', message = 'Bootstrap rejected.';
  end if;

  select * into v_account from public.user_accounts
    where id = (p_manifest ->> 'target_account_id')::uuid
      and auth_user_id = (p_manifest ->> 'target_auth_user_id')::uuid
      and account_status = 'active'
    for update;
  if not found then raise exception using errcode = 'P0001', message = 'Bootstrap rejected.'; end if;

  select * into v_member from public.members
    where id = (p_manifest ->> 'target_member_id')::uuid
      and id = v_account.member_id
      and org_unit_id = (p_manifest ->> 'target_org_unit_id')::uuid
      and membership_status = 'active'
    for update;
  if not found then raise exception using errcode = 'P0001', message = 'Bootstrap rejected.'; end if;

  v_digest := extensions.digest(public._platform_bootstrap_manifest_bytes(p_manifest), 'sha256');
  insert into authorization_private.platform_role_assignments(account_id, role_code, scope_type, scope_id)
    values (v_account.id, 'PLATFORM_ADMIN', 'platform', null)
    returning id into v_assignment_id;

  insert into authorization_private.platform_bootstrap_operations(operation_id, manifest_digest, assignment_id)
    values ((p_manifest ->> 'operation_id')::uuid, v_digest, v_assignment_id);

  insert into authorization_private.platform_security_audit(
    operation_id, event_type, actor_auth_user_id, target_auth_user_id, target_account_id,
    target_member_id, target_org_unit_id, role_code, permission_ceiling,
    environment_project_ref, evidence_reference, manifest_digest, outcome
  ) values (
    (p_manifest ->> 'operation_id')::uuid, 'initial_platform_admin_granted',
    (p_manifest ->> 'approver_auth_user_id')::uuid, v_account.auth_user_id, v_account.id,
    v_member.id, v_member.org_unit_id, 'PLATFORM_ADMIN', v_expected_permissions,
    p_manifest ->> 'project_ref', p_manifest ->> 'evidence_reference', v_digest, 'granted'
  );

  update authorization_private.platform_bootstrap_state set closed_at = now() where singleton;
  return true;
exception when others then
  -- Avoid exposing identity, Vault, SQL, or cryptographic details through PostgREST.
  raise exception using errcode = 'P0001', message = 'Bootstrap rejected.';
end;
$$;

create or replace function public.current_user_is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from auth.users au
    join public.user_accounts ua on ua.auth_user_id = au.id and ua.account_status = 'active'
    join public.members m on m.id = ua.member_id and m.membership_status = 'active'
    join authorization_private.platform_role_assignments ra
      on ra.account_id = ua.id and ra.role_code = 'PLATFORM_ADMIN'
      and ra.scope_type = 'platform' and ra.scope_id is null and ra.revoked_at is null
    join authorization_private.platform_role_permissions rp on rp.role_code = ra.role_code
    where au.id = auth.uid()
      and rp.permission_code = 'platform.authorization.assignment.read'
  )
$$;

alter function public._platform_bootstrap_manifest_bytes(jsonb) owner to postgres;
alter function public._platform_bootstrap_constant_time_equal(bytea, bytea) owner to postgres;
alter function public.bootstrap_initial_platform_admin(jsonb, text) owner to postgres;
alter function public.current_user_is_platform_admin() owner to postgres;

revoke all on function public.bootstrap_initial_platform_admin(jsonb, text) from public, anon, authenticated, service_role;
grant execute on function public.bootstrap_initial_platform_admin(jsonb, text) to service_role;
revoke all on function public.current_user_is_platform_admin() from public, anon, authenticated, service_role;
grant execute on function public.current_user_is_platform_admin() to authenticated;
