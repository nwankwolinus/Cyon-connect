-- Development-only correction following 20261014080000_initial_identity_provisioning.sql.
-- Preserve the historical migration and its state/audit objects, but make its one-time
-- active member/account creation RPC fail closed in the development migration sequence.
-- This migration is not part of the production migration stream; production's separately
-- reviewed operator procedure must not be replaced by this development-only stub.

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
begin
  raise exception using errcode = 'P0001', message = 'Initial identity provisioning rejected.';
end;
$$;

alter function public.provision_initial_identity(uuid, text, uuid, text, text, text) owner to postgres;
revoke all on function public.provision_initial_identity(uuid, text, uuid, text, text, text)
  from public, anon, authenticated, service_role;

comment on function public.provision_initial_identity(uuid, text, uuid, text, text, text) is
  'Disabled in the development migration sequence. Always rejects; creates no member or user_account.';
