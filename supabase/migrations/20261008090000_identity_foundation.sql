-- Sprint 1B.1: identity database foundation.
--   auth.users (Supabase Auth, owns credentials) -> user_accounts -> members -> org_units
-- Scope: org_units, members, user_accounts. Nothing else (no profile data, roles, permissions,
-- executive assignments, audit tables or business modules).
-- Requirements: FR-SEC-003, FR-SEC-004, FR-SEC-027, FR-SEC-029, FR-MEM-002, FR-MEM-009,
--               FR-MEMA-005, FR-MEMA-006, BR-CC-001, BR-CC-002, BR-CC-016. See docs/architecture/DATABASE_IDENTITY.md.
-- ADR-007 (organisation scope) is still PROPOSED: only the subset common to every option is
-- implemented here (typed org units + a member's home parish). Everything else is deliberately deferred.

-- ---------------------------------------------------------------------------
-- Guard functions (generic, parameterised by trigger arguments)
-- ---------------------------------------------------------------------------

-- Identifiers and linkage columns are immutable: they are references other records rely on.
create or replace function public.reject_column_change()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  col text;
begin
  foreach col in array tg_argv loop
    if (to_jsonb(new) -> col) is distinct from (to_jsonb(old) -> col) then
      raise exception '%.% is immutable', tg_table_name, col using errcode = 'restrict_violation';
    end if;
  end loop;
  return new;
end;
$$;

-- Identity history is retained (BR-CC-016, FR-MEMA-005). Change status instead of deleting.
create or replace function public.prevent_delete()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'Physical deletion from % is not permitted; change status instead.', tg_table_name
    using errcode = 'restrict_violation';
end;
$$;

-- ---------------------------------------------------------------------------
-- org_units: typed organisational units (FR-SEC-029, FR-GEN-006)
-- Hierarchy rule from the project: Archdiocese -> Deanery -> Parish. Parent is optional because
-- the deanery/archdiocese above the initial parish are not yet defined. The (parent_id,
-- parent_type) composite FK lets the database verify the parent's type without triggers.
-- ---------------------------------------------------------------------------
create table public.org_units (
  id          uuid primary key default gen_random_uuid(),
  unit_type   text not null check (unit_type in ('archdiocese', 'deanery', 'parish')),
  name        text not null check (length(btrim(name)) > 0),
  parent_id   uuid,
  parent_type text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint org_units_id_type_key unique (id, unit_type),
  constraint org_units_parent_fk foreign key (parent_id, parent_type)
    references public.org_units (id, unit_type) on delete restrict,
  constraint org_units_parent_pair check ((parent_id is null) = (parent_type is null)),
  constraint org_units_hierarchy check (
       (unit_type = 'archdiocese' and parent_id is null)
    or (unit_type = 'deanery' and (parent_id is null or parent_type = 'archdiocese'))
    or (unit_type = 'parish'  and (parent_id is null or parent_type = 'deanery'))
  )
);

-- Names are unique among siblings of the same type; supports "children of unit X" lookups.
create unique index org_units_sibling_name_key
  on public.org_units (unit_type, coalesce(parent_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(btrim(name)));
create index org_units_parent_id_idx on public.org_units (parent_id) where parent_id is not null;

-- ---------------------------------------------------------------------------
-- members: stable CYON member identity (one row = one person's CYON member record, FR-MEM-002)
-- Holds NO personal data: names, contact details and other profile fields (FR-MEM-006) will live in a
-- separate, more tightly protected table (FR-MEM-012, FR-PRI-003). Membership status is independent of
-- account status and of any executive assignment (BR-CC-002); there is no role column here.
-- ---------------------------------------------------------------------------
create table public.members (
  id                uuid primary key default gen_random_uuid(),
  org_unit_id       uuid not null,
  -- discriminator that lets the FK below guarantee the home unit is a parish (interim, see ADR-007)
  org_unit_type     text not null default 'parish' check (org_unit_type = 'parish'),
  membership_status text not null default 'pending'
    check (membership_status in ('pending', 'active', 'inactive', 'suspended', 'archived')), -- FR-MEM-009
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint members_org_unit_fk foreign key (org_unit_id, org_unit_type)
    references public.org_units (id, unit_type) on delete restrict
);

-- "members of an organisation, optionally filtered by status" (e.g. active members in a parish).
create index members_org_unit_status_idx on public.members (org_unit_id, membership_status);

-- ---------------------------------------------------------------------------
-- user_accounts: application account linking one Supabase Auth identity to exactly one member
-- No credentials are stored here (Supabase Auth owns them). account_status has its own lifecycle,
-- derived from FR-SEC-004 (activation, suspension, deactivation).
-- ON DELETE RESTRICT: an auth identity with an account cannot be deleted by accident; deactivate instead.
-- ---------------------------------------------------------------------------
create table public.user_accounts (
  id             uuid primary key default gen_random_uuid(),
  auth_user_id   uuid not null,
  member_id      uuid not null,
  account_status text not null default 'pending_activation'
    check (account_status in ('pending_activation', 'active', 'suspended', 'deactivated')),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint user_accounts_auth_user_key unique (auth_user_id),  -- one account per auth identity; account lookup by auth user
  constraint user_accounts_member_key unique (member_id),        -- one account per member; account lookup by member (BR-CC-001)
  constraint user_accounts_auth_user_fk foreign key (auth_user_id)
    references auth.users (id) on delete restrict,
  constraint user_accounts_member_fk foreign key (member_id)
    references public.members (id) on delete restrict
);

-- ---------------------------------------------------------------------------
-- Triggers: updated_at maintenance, immutable identifiers, no physical deletes
-- ---------------------------------------------------------------------------
create trigger org_units_set_updated_at before update on public.org_units
  for each row execute function public.set_updated_at();
create trigger members_set_updated_at before update on public.members
  for each row execute function public.set_updated_at();
create trigger user_accounts_set_updated_at before update on public.user_accounts
  for each row execute function public.set_updated_at();

create trigger org_units_immutable before update on public.org_units
  for each row execute function public.reject_column_change('id', 'unit_type', 'created_at');
create trigger members_immutable before update on public.members
  for each row execute function public.reject_column_change('id', 'created_at');
create trigger user_accounts_immutable before update on public.user_accounts
  for each row execute function public.reject_column_change('id', 'auth_user_id', 'member_id', 'created_at');

create trigger org_units_prevent_delete before delete on public.org_units
  for each row execute function public.prevent_delete();
create trigger members_prevent_delete before delete on public.members
  for each row execute function public.prevent_delete();
create trigger user_accounts_prevent_delete before delete on public.user_accounts
  for each row execute function public.prevent_delete();

-- Trigger helper functions are not API surface: remove the default EXECUTE grant to PUBLIC so they are
-- not exposed (e.g. as PostgREST RPC endpoints). Triggers keep working: EXECUTE is not checked at fire time.
revoke all on function public.set_updated_at(), public.reject_column_change(), public.prevent_delete()
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Security: default deny. RLS is defence in depth; backend authorization remains authoritative.
-- ---------------------------------------------------------------------------
alter table public.org_units     enable row level security;
alter table public.members       enable row level security;
alter table public.user_accounts enable row level security;

revoke all on public.org_units, public.members, public.user_accounts
  from public, anon, authenticated, service_role;

-- Signed-in users may only READ. They can never write identity data directly (status changes,
-- linking and creation are server-side operations).
grant select on public.org_units, public.members, public.user_accounts to authenticated;
-- Server-side service role: no DELETE or TRUNCATE. It bypasses RLS, so every use needs prior
-- application-level authorization.
grant select, insert, update on public.org_units, public.members, public.user_accounts to service_role;

-- A user can always read their own account row (so the app can show the account state).
create policy user_accounts_select_own on public.user_accounts
  for select to authenticated
  using (auth_user_id = (select auth.uid()));

-- Member and organisation data is readable through RLS only while the user's own account is active.
-- Suspended, deactivated and not-yet-activated accounts see nothing but their own account row.
create policy members_select_own_active on public.members
  for select to authenticated
  using (exists (
    select 1 from public.user_accounts ua
    where ua.member_id = members.id
      and ua.auth_user_id = (select auth.uid())
      and ua.account_status = 'active'
  ));

-- A user may see only their own home unit (not siblings, ancestors or other organisations).
create policy org_units_select_own_unit on public.org_units
  for select to authenticated
  using (exists (select 1 from public.members m where m.org_unit_id = org_units.id));

-- ---------------------------------------------------------------------------
-- Reference data: the single initial parish (FR-GEN-005). Deanery and archdiocese are not yet
-- defined, so parent is NULL. Not personal or fabricated membership data.
-- ---------------------------------------------------------------------------
insert into public.org_units (unit_type, name)
select 'parish', 'SS Joachim and Anne Catholic Church, Ijegun'
where not exists (
  select 1 from public.org_units
  where unit_type = 'parish' and parent_id is null and lower(btrim(name)) = lower('SS Joachim and Anne Catholic Church, Ijegun')
);
