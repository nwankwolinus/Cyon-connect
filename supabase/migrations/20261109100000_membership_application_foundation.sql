-- Stage 3 foundation: private, default-deny membership application structures.
-- No endpoint or client role can access these tables. A future protected server path must
-- provide explicit authorization and use a managed KMS envelope for DOB before any intake.

create schema membership_private;
revoke all on schema membership_private from public, anon, authenticated, service_role;

create function membership_private.payload_contains_dob_key(p_value jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  item record;
begin
  if jsonb_typeof(p_value) = 'object' then
    for item in select key, value from jsonb_each(p_value) loop
      if lower(item.key) in ('dateofbirth', 'date_of_birth', 'date-of-birth', 'birthdate', 'birth_date', 'dob')
         or membership_private.payload_contains_dob_key(item.value) then
        return true;
      end if;
    end loop;
  elsif jsonb_typeof(p_value) = 'array' then
    for item in select value from jsonb_array_elements(p_value) loop
      if membership_private.payload_contains_dob_key(item.value) then
        return true;
      end if;
    end loop;
  end if;
  return false;
end;
$$;

create table membership_private.applications (
  id uuid primary key default gen_random_uuid(),
  public_reference uuid not null unique default gen_random_uuid(),
  applicant_auth_id uuid not null references auth.users(id) on delete restrict,
  org_unit_id uuid not null,
  org_unit_type text not null default 'parish' check (org_unit_type = 'parish'),
  status text not null default 'submitted'
    check (status in ('draft', 'submitted', 'under_review', 'on_hold', 'approved', 'rejected', 'withdrawn', 'closed')),
  screening_outcome text
    check (screening_outcome in ('confirmed_duplicate', 'not_duplicate', 'inconclusive')),
  resubmitted_from_id uuid,
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint membership_applications_org_unit_fk foreign key (org_unit_id, org_unit_type)
    references public.org_units(id, unit_type) on delete restrict,
  constraint membership_applications_id_owner_key unique (id, applicant_auth_id),
  constraint membership_applications_predecessor_owner_fk
    foreign key (resubmitted_from_id, applicant_auth_id)
    references membership_private.applications(id, applicant_auth_id) on delete restrict,
  constraint membership_applications_submitted_timestamp_ck
    check ((status = 'draft' and submitted_at is null) or (status <> 'draft' and submitted_at is not null)),
  constraint membership_applications_approval_screening_ck
    check (status <> 'approved' or coalesce(screening_outcome = 'not_duplicate', false)),
  constraint membership_applications_not_self_resubmission_ck
    check (resubmitted_from_id is null or resubmitted_from_id <> id)
);

create index membership_applications_owner_created_idx
  on membership_private.applications(applicant_auth_id, created_at desc);
create index membership_applications_parish_status_idx
  on membership_private.applications(org_unit_id, status, submitted_at);
create index membership_applications_predecessor_idx
  on membership_private.applications(resubmitted_from_id) where resubmitted_from_id is not null;

create table membership_private.application_data (
  application_id uuid primary key references membership_private.applications(id) on delete restrict,
  -- Contains only the accepted non-DOB submission fields. Server validation must reject
  -- DOB keys at every payload depth; DOB is held only in the opaque KMS envelope below.
  applicant_payload jsonb not null check (jsonb_typeof(applicant_payload) = 'object'),
  dob_envelope bytea not null,
  kms_key_version text not null,
  created_at timestamptz not null default now(),
  constraint application_data_payload_excludes_dob_ck
    check (not membership_private.payload_contains_dob_key(applicant_payload))
);

create table membership_private.application_history (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references membership_private.applications(id) on delete restrict,
  actor_kind text not null check (actor_kind in ('authenticated_user', 'system')),
  actor_auth_id uuid references auth.users(id) on delete restrict,
  action text not null,
  previous_status text check (previous_status is null or previous_status in ('draft', 'submitted', 'under_review', 'on_hold', 'approved', 'rejected', 'withdrawn', 'closed')),
  resulting_status text not null check (resulting_status in ('draft', 'submitted', 'under_review', 'on_hold', 'approved', 'rejected', 'withdrawn', 'closed')),
  rationale text,
  evidence_reference text,
  occurred_at timestamptz not null default now(),
  correlation_id uuid,
  constraint application_history_actor_ck check (
    (actor_kind = 'authenticated_user' and actor_auth_id is not null)
    or (actor_kind = 'system' and actor_auth_id is null)
  )
);

create index application_history_application_time_idx
  on membership_private.application_history(application_id, occurred_at, id);

create table membership_private.submission_idempotency (
  applicant_auth_id uuid not null references auth.users(id) on delete restrict,
  operation text not null check (operation = 'membership_application.submit'),
  key_digest bytea not null check (octet_length(key_digest) = 32),
  payload_digest bytea not null check (octet_length(payload_digest) = 32),
  application_id uuid not null references membership_private.applications(id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (applicant_auth_id, operation, key_digest)
);

create table membership_private.security_audit_events (
  id uuid primary key default gen_random_uuid(),
  actor_kind text not null check (actor_kind in ('authenticated_user', 'system')),
  actor_auth_id uuid references auth.users(id) on delete restrict,
  target_application_id uuid references membership_private.applications(id) on delete restrict,
  action text not null,
  outcome text not null check (outcome in ('succeeded', 'denied', 'failed')),
  failure_category text,
  correlation_id uuid,
  occurred_at timestamptz not null default now(),
  constraint security_audit_actor_ck check (
    (actor_kind = 'authenticated_user' and actor_auth_id is not null)
    or (actor_kind = 'system' and actor_auth_id is null)
  )
);

create index membership_security_audit_time_idx
  on membership_private.security_audit_events(occurred_at desc);

create function membership_private.reject_history_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'historical records are append-only';
end;
$$;

create trigger application_history_append_only
  before update or delete on membership_private.application_history
  for each row execute function membership_private.reject_history_mutation();
create trigger security_audit_append_only
  before update or delete on membership_private.security_audit_events
  for each row execute function membership_private.reject_history_mutation();

alter table membership_private.applications enable row level security;
alter table membership_private.application_data enable row level security;
alter table membership_private.application_history enable row level security;
alter table membership_private.submission_idempotency enable row level security;
alter table membership_private.security_audit_events enable row level security;

revoke all on all tables in schema membership_private from public, anon, authenticated, service_role;
revoke all on all sequences in schema membership_private from public, anon, authenticated, service_role;
revoke all on function membership_private.payload_contains_dob_key(jsonb) from public, anon, authenticated, service_role;
revoke all on function membership_private.reject_history_mutation() from public, anon, authenticated, service_role;

-- No policies or application grants are installed in this foundation migration.
-- Runtime intake, reviewer access, audit reads, and KMS processing remain disabled until
-- narrow server-side operations and their tests are implemented.
