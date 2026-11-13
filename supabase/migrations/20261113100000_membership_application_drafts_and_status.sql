-- Server-only resumable drafts and applicant-owned status summary.
-- DOB is expressly excluded from this table. Expired payloads are deleted by pg_cron.

create table membership_private.application_drafts (
  id uuid primary key default gen_random_uuid(),
  applicant_auth_id uuid not null references auth.users(id) on delete cascade,
  org_unit_id uuid not null,
  org_unit_type text not null default 'parish' check (org_unit_type = 'parish'),
  applicant_payload jsonb not null default '{}'::jsonb
    check (jsonb_typeof(applicant_payload) = 'object'),
  active_step smallint not null default 0 check (active_step between 0 and 9),
  last_activity_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  constraint application_drafts_org_unit_fk foreign key (org_unit_id, org_unit_type)
    references public.org_units(id, unit_type) on delete restrict,
  constraint application_drafts_expiry_ck check (expires_at = last_activity_at + interval '30 days'),
  constraint application_drafts_payload_no_dob_ck
    check (not membership_private.payload_contains_dob_key(applicant_payload))
);

create unique index application_drafts_one_per_applicant_idx
  on membership_private.application_drafts(applicant_auth_id);
create index application_drafts_expiry_idx
  on membership_private.application_drafts(expires_at);

alter table membership_private.application_drafts enable row level security;
revoke all on membership_private.application_drafts from public, anon, authenticated, service_role;

create function membership_private.lock_application_draft_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status in ('submitted', 'under_review', 'on_hold', 'approved') then
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(new.applicant_auth_id::text || ':membership_application.draft', 0)
    );
  end if;
  return new;
end;
$$;

create function membership_private.consume_application_draft_after_submission()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status in ('submitted', 'under_review', 'on_hold', 'approved') then
    delete from membership_private.application_drafts
    where applicant_auth_id = new.applicant_auth_id and org_unit_id = new.org_unit_id;
    if found then
      insert into membership_private.security_audit_events
        (actor_kind, action, outcome, failure_category, correlation_id)
      values
        ('system', 'membership_application.draft_consumed', 'succeeded', null, pg_catalog.gen_random_uuid());
    end if;
  end if;
  return new;
end;
$$;

create trigger membership_application_draft_lock
  before insert or update of status on membership_private.applications
  for each row execute function membership_private.lock_application_draft_owner();
create trigger membership_application_draft_consume
  after insert or update of status on membership_private.applications
  for each row execute function membership_private.consume_application_draft_after_submission();

create function membership_private.delete_expired_application_draft(p_draft_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid;
begin
  select d.applicant_auth_id into v_owner
  from membership_private.application_drafts d
  where d.id = p_draft_id and d.expires_at <= clock_timestamp();
  if not found then return false; end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_owner::text || ':membership_application.draft', 0)
  );
  delete from membership_private.application_drafts
  where id = p_draft_id and expires_at <= clock_timestamp();
  if not found then return false; end if;

  insert into membership_private.security_audit_events
    (actor_kind, action, outcome, failure_category, correlation_id)
  values
    ('system', 'membership_application.draft_expired_disposed', 'succeeded', null, pg_catalog.gen_random_uuid());
  return true;
end;
$$;

create function membership_private.purge_expired_application_drafts()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_draft record;
  v_count integer := 0;
begin
  for v_draft in
    select d.id from membership_private.application_drafts d
    where d.expires_at <= clock_timestamp()
    order by d.expires_at
    limit 200
  loop
    if membership_private.delete_expired_application_draft(v_draft.id) then
      v_count := v_count + 1;
    end if;
  end loop;
  return v_count;
end;
$$;

create function public.save_membership_application_draft(
  p_applicant_auth_id uuid,
  p_org_unit_id uuid,
  p_applicant_payload jsonb,
  p_active_step smallint,
  p_expected_updated_at timestamptz,
  p_correlation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_draft membership_private.application_drafts%rowtype;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'draft_not_authorized';
  end if;
  if p_applicant_auth_id is null or p_org_unit_id is null or p_correlation_id is null
     or p_active_step is null or p_active_step < 0 or p_active_step > 9
     or p_applicant_payload is null or jsonb_typeof(p_applicant_payload) <> 'object'
     or membership_private.payload_contains_dob_key(p_applicant_payload) then
    raise exception using errcode = '22023', message = 'draft_payload_invalid';
  end if;
  if not exists (
    select 1 from auth.users u where u.id = p_applicant_auth_id and u.email_confirmed_at is not null
  ) then
    raise exception using errcode = '42501', message = 'verified_applicant_required';
  end if;
  if not exists (
    select 1 from public.org_units o
    where o.id = p_org_unit_id and o.unit_type = 'parish'
      and o.name = 'SS Joachim and Anne Catholic Church, Ijegun'
  ) then
    raise exception using errcode = '23503', message = 'operational_parish_unavailable';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_applicant_auth_id::text || ':membership_application.draft', 0)
  );
  if exists (
    select 1 from membership_private.applications a
    where a.applicant_auth_id = p_applicant_auth_id
      and a.org_unit_id = p_org_unit_id
      and a.status in ('submitted', 'under_review', 'on_hold', 'approved')
  ) then
    raise exception using errcode = '23505', message = 'application_already_open';
  end if;

  select d.* into v_draft
  from membership_private.application_drafts d
  where d.applicant_auth_id = p_applicant_auth_id
  for update;
  if found and v_draft.expires_at <= v_now then
    perform membership_private.delete_expired_application_draft(v_draft.id);
    v_draft := null;
  end if;

  if v_draft.id is null then
    if p_expected_updated_at is not null then
      raise exception using errcode = '40001', message = 'draft_version_conflict';
    end if;
    insert into membership_private.application_drafts
      (applicant_auth_id, org_unit_id, applicant_payload, active_step,
       last_activity_at, expires_at, created_at, updated_at)
    values
      (p_applicant_auth_id, p_org_unit_id, p_applicant_payload, p_active_step,
       v_now, v_now + interval '30 days', v_now, v_now)
    returning * into v_draft;
  else
    if v_draft.org_unit_id <> p_org_unit_id
       or p_expected_updated_at is null
       or v_draft.updated_at <> p_expected_updated_at then
      raise exception using errcode = '40001', message = 'draft_version_conflict';
    end if;
    update membership_private.application_drafts
    set applicant_payload = p_applicant_payload,
        active_step = p_active_step,
        last_activity_at = v_now,
        expires_at = v_now + interval '30 days',
        updated_at = v_now
    where id = v_draft.id
    returning * into v_draft;
  end if;

  insert into membership_private.security_audit_events
    (actor_kind, actor_auth_id, action, outcome, correlation_id)
  values
    ('authenticated_user', p_applicant_auth_id, 'membership_application.draft_saved', 'succeeded', p_correlation_id);

  return pg_catalog.jsonb_build_object(
    'draftId', v_draft.id,
    'activeStep', v_draft.active_step,
    'lastActivityAt', v_draft.last_activity_at,
    'expiresAt', v_draft.expires_at,
    'updatedAt', v_draft.updated_at
  );
end;
$$;

create function public.get_membership_application_draft(
  p_applicant_auth_id uuid,
  p_org_unit_id uuid,
  p_correlation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_draft membership_private.application_drafts%rowtype;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'draft_not_authorized';
  end if;
  if not exists (
    select 1 from auth.users u where u.id = p_applicant_auth_id and u.email_confirmed_at is not null
  ) then
    raise exception using errcode = '42501', message = 'verified_applicant_required';
  end if;
  if not exists (
    select 1 from public.org_units o
    where o.id = p_org_unit_id and o.unit_type = 'parish'
      and o.name = 'SS Joachim and Anne Catholic Church, Ijegun'
  ) then
    raise exception using errcode = '23503', message = 'operational_parish_unavailable';
  end if;
  select d.* into v_draft from membership_private.application_drafts d
  where d.applicant_auth_id = p_applicant_auth_id and d.org_unit_id = p_org_unit_id;
  if not found then return null; end if;
  if v_draft.expires_at <= clock_timestamp() then
    perform membership_private.delete_expired_application_draft(v_draft.id);
    return pg_catalog.jsonb_build_object('expired', true);
  end if;

  insert into membership_private.security_audit_events
    (actor_kind, actor_auth_id, action, outcome, correlation_id)
  values
    ('authenticated_user', p_applicant_auth_id, 'membership_application.draft_read', 'succeeded', p_correlation_id);
  return pg_catalog.jsonb_build_object(
    'draftId', v_draft.id,
    'payload', v_draft.applicant_payload,
    'activeStep', v_draft.active_step,
    'lastActivityAt', v_draft.last_activity_at,
    'expiresAt', v_draft.expires_at,
    'updatedAt', v_draft.updated_at
  );
end;
$$;

create function public.get_my_membership_application_overview(
  p_applicant_auth_id uuid,
  p_org_unit_id uuid,
  p_correlation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_application record;
  v_draft record;
  v_expired boolean := false;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'application_read_not_authorized';
  end if;
  if not exists (
    select 1 from auth.users u where u.id = p_applicant_auth_id and u.email_confirmed_at is not null
  ) then
    raise exception using errcode = '42501', message = 'verified_applicant_required';
  end if;
  if not exists (
    select 1 from public.org_units o
    where o.id = p_org_unit_id and o.unit_type = 'parish'
      and o.name = 'SS Joachim and Anne Catholic Church, Ijegun'
  ) then
    raise exception using errcode = '23503', message = 'operational_parish_unavailable';
  end if;

  select d.id, d.expires_at into v_draft
  from membership_private.application_drafts d
  where d.applicant_auth_id = p_applicant_auth_id and d.org_unit_id = p_org_unit_id;
  if found and v_draft.expires_at <= clock_timestamp() then
    v_expired := membership_private.delete_expired_application_draft(v_draft.id);
  end if;

  select a.id, a.public_reference, a.status, a.submitted_at, a.created_at
    into v_application
  from membership_private.applications a
  where a.applicant_auth_id = p_applicant_auth_id and a.org_unit_id = p_org_unit_id
    and a.status <> 'draft'
  order by case when a.status in ('submitted', 'under_review', 'on_hold', 'approved') then 0 else 1 end,
           a.created_at desc
  limit 1;

  select d.id, d.last_activity_at, d.expires_at, d.active_step
    into v_draft
  from membership_private.application_drafts d
  where d.applicant_auth_id = p_applicant_auth_id and d.org_unit_id = p_org_unit_id
    and d.expires_at > clock_timestamp();

  insert into membership_private.security_audit_events
    (actor_kind, actor_auth_id, action, outcome, correlation_id)
  values
    ('authenticated_user', p_applicant_auth_id, 'membership_application.status_read', 'succeeded', p_correlation_id);

  return pg_catalog.jsonb_build_object(
    'application', case when v_application.id is null then null else pg_catalog.jsonb_build_object(
      'id', v_application.id,
      'reference', v_application.public_reference,
      'status', v_application.status,
      'submittedAt', v_application.submitted_at,
      'createdAt', v_application.created_at
    ) end,
    'draft', case when v_draft.id is null then null else pg_catalog.jsonb_build_object(
      'id', v_draft.id,
      'lastActivityAt', v_draft.last_activity_at,
      'expiresAt', v_draft.expires_at,
      'activeStep', v_draft.active_step
    ) end,
    'expiredDraftDisposed', v_expired
  );
end;
$$;

-- Required expiry is independent of applicant page visits. Supabase Cron (pg_cron)
-- must be enabled for this migration; the job deletes the sensitive draft payload and
-- records only a payload-free disposal event. Run every minute for bounded expiry delay.
do $$
begin
  if to_regnamespace('cron') is null then
    raise exception 'Enable Supabase pg_cron (cron schema) before applying draft persistence migration';
  end if;
end;
$$;

select cron.schedule(
  'cyon-expire-membership-application-drafts',
  '* * * * *',
  'select membership_private.purge_expired_application_drafts()'
);

revoke all on function membership_private.delete_expired_application_draft(uuid)
  from public, anon, authenticated, service_role;
revoke all on function membership_private.purge_expired_application_drafts()
  from public, anon, authenticated, service_role;
revoke all on function membership_private.lock_application_draft_owner()
  from public, anon, authenticated, service_role;
revoke all on function membership_private.consume_application_draft_after_submission()
  from public, anon, authenticated, service_role;
revoke all on function public.save_membership_application_draft(uuid, uuid, jsonb, smallint, timestamptz, uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.get_membership_application_draft(uuid, uuid, uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.get_my_membership_application_overview(uuid, uuid, uuid)
  from public, anon, authenticated, service_role;

grant execute on function public.save_membership_application_draft(uuid, uuid, jsonb, smallint, timestamptz, uuid)
  to service_role;
grant execute on function public.get_membership_application_draft(uuid, uuid, uuid)
  to service_role;
grant execute on function public.get_my_membership_application_overview(uuid, uuid, uuid)
  to service_role;

comment on table membership_private.application_drafts is
  'Applicant-owned private resumable data. DOB is prohibited and the payload is deleted 30 days after last successful save.';
