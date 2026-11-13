-- Submission-only persistence, with DOB deliberately omitted until the approved
-- managed-envelope encryption work package is available. No table DML is granted.

alter table membership_private.application_data
  alter column dob_envelope drop not null,
  alter column kms_key_version drop not null;

alter table membership_private.application_data
  add constraint application_data_dob_envelope_pair_ck
  check ((dob_envelope is null) = (kms_key_version is null));

create unique index membership_applications_one_open_per_applicant_idx
  on membership_private.applications(applicant_auth_id)
  where status in ('submitted', 'under_review', 'on_hold', 'approved');

create function public.submit_membership_application(
  p_applicant_auth_id uuid,
  p_org_unit_id uuid,
  p_applicant_payload jsonb,
  p_idempotency_key_digest bytea,
  p_payload_digest bytea,
  p_correlation_id uuid
)
returns table (
  application_id uuid,
  application_reference uuid,
  application_status text,
  was_replay boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_application_id uuid;
  v_reference uuid;
  v_submitted_at timestamptz := clock_timestamp();
  v_existing_payload_digest bytea;
  v_existing_application_id uuid;
  v_existing_reference uuid;
  v_predecessor_id uuid;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'submission_not_authorized';
  end if;

  if p_applicant_auth_id is null
     or p_org_unit_id is null
     or p_correlation_id is null
     or p_idempotency_key_digest is null
     or octet_length(p_idempotency_key_digest) <> 32
     or p_payload_digest is null
     or octet_length(p_payload_digest) <> 32
     or jsonb_typeof(p_applicant_payload) <> 'object'
     or membership_private.payload_contains_dob_key(p_applicant_payload) then
    raise exception using errcode = '22023', message = 'submission_payload_invalid';
  end if;

  if not exists (
    select 1 from auth.users u
    where u.id = p_applicant_auth_id and u.email_confirmed_at is not null
  ) then
    raise exception using errcode = '42501', message = 'verified_applicant_required';
  end if;

  if not exists (
    select 1 from public.org_units o
    where o.id = p_org_unit_id
      and o.unit_type = 'parish'
      and o.name = 'SS Joachim and Anne Catholic Church, Ijegun'
  ) then
    raise exception using errcode = '23503', message = 'operational_parish_unavailable';
  end if;

  -- Serialize retries for the same owner and operation key across concurrent requests.
  perform pg_advisory_xact_lock(hashtextextended(
    p_applicant_auth_id::text || ':membership_application.submit:' || encode(p_idempotency_key_digest, 'hex'),
    0
  ));

  select i.payload_digest, i.application_id, a.public_reference
    into v_existing_payload_digest, v_existing_application_id, v_existing_reference
  from membership_private.submission_idempotency i
  join membership_private.applications a on a.id = i.application_id
  where i.applicant_auth_id = p_applicant_auth_id
    and i.operation = 'membership_application.submit'
    and i.key_digest = p_idempotency_key_digest;

  if found then
    if v_existing_payload_digest <> p_payload_digest then
      raise exception using errcode = '22023', message = 'idempotency_payload_conflict';
    end if;
    return query select v_existing_application_id, v_existing_reference, 'submitted'::text, true;
    return;
  end if;

  select a.id into v_predecessor_id
  from membership_private.applications a
  where a.applicant_auth_id = p_applicant_auth_id and a.status = 'rejected'
  order by a.submitted_at desc, a.created_at desc
  limit 1;

  insert into membership_private.applications (
    applicant_auth_id, org_unit_id, org_unit_type, status,
    screening_outcome, resubmitted_from_id, submitted_at
  ) values (
    p_applicant_auth_id, p_org_unit_id, 'parish', 'submitted',
    'inconclusive', v_predecessor_id, v_submitted_at
  ) returning id, public_reference into v_application_id, v_reference;

  insert into membership_private.application_data (
    application_id, applicant_payload, dob_envelope, kms_key_version
  ) values (
    v_application_id, p_applicant_payload, null, null
  );

  insert into membership_private.application_history (
    application_id, actor_kind, actor_auth_id, action,
    previous_status, resulting_status, correlation_id
  ) values (
    v_application_id, 'authenticated_user', p_applicant_auth_id, 'submitted',
    null, 'submitted', p_correlation_id
  );

  insert into membership_private.security_audit_events (
    actor_kind, actor_auth_id, target_application_id, action,
    outcome, correlation_id
  ) values (
    'authenticated_user', p_applicant_auth_id, v_application_id,
    'membership_application.submit', 'succeeded', p_correlation_id
  );

  insert into membership_private.submission_idempotency (
    applicant_auth_id, operation, key_digest, payload_digest, application_id
  ) values (
    p_applicant_auth_id, 'membership_application.submit',
    p_idempotency_key_digest, p_payload_digest, v_application_id
  );

  return query select v_application_id, v_reference, 'submitted'::text, false;
end;
$$;

revoke all on function public.submit_membership_application(uuid, uuid, jsonb, bytea, bytea, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.submit_membership_application(uuid, uuid, jsonb, bytea, bytea, uuid)
  to service_role;

comment on function public.submit_membership_application(uuid, uuid, jsonb, bytea, bytea, uuid) is
  'Single-transaction server-only submission. DOB is intentionally not persisted; call only after verified-session, eligibility, and trusted-parish checks.';
