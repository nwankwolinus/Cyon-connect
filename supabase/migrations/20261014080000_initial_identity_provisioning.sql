-- One-time, operator-only provisioning of the first eligible application identity.
-- This does not assign a platform role and is intentionally bound to the CYON Connect DEV project.

create schema identity_private;
alter schema identity_private owner to postgres;
revoke all on schema identity_private from public, anon, authenticated, service_role;

create table identity_private.initial_identity_provisioning_state (
  singleton boolean primary key default true check (singleton),
  closed_at timestamptz,
  auth_user_id uuid unique references auth.users(id) on delete restrict,
  account_id uuid unique references public.user_accounts(id) on delete restrict,
  member_id uuid unique references public.members(id) on delete restrict,
  org_unit_id uuid references public.org_units(id) on delete restrict,
  approval_reference text,
  operator_db_role name,
  constraint initial_identity_provisioning_state_closed_fields check (
    (closed_at is null and auth_user_id is null and account_id is null and member_id is null
      and org_unit_id is null and approval_reference is null and operator_db_role is null)
    or
    (closed_at is not null and auth_user_id is not null and account_id is not null and member_id is not null
      and org_unit_id is not null and approval_reference is not null and operator_db_role is not null)
  )
);

insert into identity_private.initial_identity_provisioning_state(singleton) values (true);

create table identity_private.initial_identity_provisioning_audit (
  id uuid primary key default gen_random_uuid(),
  operation_type text not null check (operation_type = 'initial_identity_provisioned'),
  auth_user_id uuid not null references auth.users(id) on delete restrict,
  account_id uuid not null references public.user_accounts(id) on delete restrict,
  member_id uuid not null references public.members(id) on delete restrict,
  org_unit_id uuid not null references public.org_units(id) on delete restrict,
  account_status text not null check (account_status = 'active'),
  membership_status text not null check (membership_status = 'active'),
  environment_project_ref text not null,
  approval_reference text not null,
  operator_db_role name not null,
  occurred_at timestamptz not null default now()
);

revoke all on all tables in schema identity_private from public, anon, authenticated, service_role;
revoke all on all sequences in schema identity_private from public, anon, authenticated, service_role;

-- The identity migration granted broad server-role DML for future authorized workflows. None exists
-- yet; remove those direct paths so initial active identity creation is owner-operated only.
revoke insert, update on public.members, public.user_accounts from service_role;

create or replace function public.provision_initial_identity(
  p_auth_user_id uuid,
  p_project_ref text,
  p_org_unit_id uuid,
  p_expected_org_unit_type text,
  p_expected_org_unit_name text,
  p_approval_reference text
)
returns table (account_id uuid, member_id uuid, org_unit_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org public.org_units%rowtype;
  v_account_id uuid;
  v_member_id uuid;
  v_state identity_private.initial_identity_provisioning_state%rowtype;
begin
  -- This owner-run operation is intentionally specific to the confirmed development project.
  if p_project_ref is distinct from 'bpooqfgadtbyeduapwyi'
     or p_auth_user_id is null
     or p_org_unit_id is null
     or p_expected_org_unit_type is distinct from 'parish'
     or p_expected_org_unit_name is null
     or length(btrim(p_expected_org_unit_name)) = 0
     or p_approval_reference is null
     or length(btrim(p_approval_reference)) < 8
     or length(p_approval_reference) > 200 then
    raise exception using errcode = 'P0001', message = 'Initial identity provisioning rejected.';
  end if;

  select * into v_state
    from identity_private.initial_identity_provisioning_state
    where singleton
    for update;
  if not found or v_state.closed_at is not null then
    raise exception using errcode = 'P0001', message = 'Initial identity provisioning rejected.';
  end if;

  -- This is a first-identity bootstrap. Fail closed if any account/member was provisioned first;
  -- the identity schema has no natural-person key with which to safely deduplicate such records.
  if exists (select 1 from public.user_accounts)
     or exists (select 1 from public.members) then
    raise exception using errcode = 'P0001', message = 'Initial identity provisioning rejected.';
  end if;

  perform 1 from auth.users where id = p_auth_user_id for key share;
  if not found then
    raise exception using errcode = 'P0001', message = 'Initial identity provisioning rejected.';
  end if;

  select * into v_org
    from public.org_units
    where id = p_org_unit_id
      and unit_type = p_expected_org_unit_type
      and name = p_expected_org_unit_name
    for share;
  if not found then
    raise exception using errcode = 'P0001', message = 'Initial identity provisioning rejected.';
  end if;

  -- Generate distinct identifiers so UUIDs from different identity domains are never assumed equal.
  loop
    v_member_id := pg_catalog.gen_random_uuid();
    exit when v_member_id <> p_auth_user_id;
  end loop;
  loop
    v_account_id := pg_catalog.gen_random_uuid();
    exit when v_account_id <> p_auth_user_id and v_account_id <> v_member_id;
  end loop;

  insert into public.members(id, org_unit_id, org_unit_type, membership_status)
    values (v_member_id, v_org.id, 'parish', 'active');
  insert into public.user_accounts(id, auth_user_id, member_id, account_status)
    values (v_account_id, p_auth_user_id, v_member_id, 'active');

  insert into identity_private.initial_identity_provisioning_audit(
    operation_type, auth_user_id, account_id, member_id, org_unit_id,
    account_status, membership_status, environment_project_ref, approval_reference, operator_db_role
  ) values (
    'initial_identity_provisioned', p_auth_user_id, v_account_id, v_member_id, v_org.id,
    'active', 'active', p_project_ref, btrim(p_approval_reference), session_user
  );

  update identity_private.initial_identity_provisioning_state
    set closed_at = now(), auth_user_id = p_auth_user_id, account_id = v_account_id,
        member_id = v_member_id, org_unit_id = v_org.id,
        approval_reference = btrim(p_approval_reference), operator_db_role = session_user
    where singleton and closed_at is null;
  if not found then
    raise exception using errcode = 'P0001', message = 'Initial identity provisioning rejected.';
  end if;

  return query select v_account_id, v_member_id, v_org.id;
exception when others then
  -- Keep error output generic. The statement-level transaction rolls back all inserts on failure.
  raise exception using errcode = 'P0001', message = 'Initial identity provisioning rejected.';
end;
$$;

alter function public.provision_initial_identity(uuid, text, uuid, text, text, text) owner to postgres;
revoke all on function public.provision_initial_identity(uuid, text, uuid, text, text, text)
  from public, anon, authenticated, service_role;
-- No app role receives EXECUTE. The database owner invokes this once from the reviewed SQL Editor session.

