-- Return the authoritative draft concurrency token from the photo-registration transaction.
-- Replacing the existing function preserves its signature, owner, security mode, and grants.
create or replace function public.register_membership_application_photo(
  p_applicant_auth_id uuid,
  p_org_unit_id uuid,
  p_draft_id uuid,
  p_photo_id uuid,
  p_object_path text,
  p_byte_size integer,
  p_correlation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old_path text;
  v_draft_updated_at timestamptz;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'photo_not_authorized';
  end if;
  if p_applicant_auth_id is null or p_org_unit_id is null or p_draft_id is null
     or p_photo_id is null or p_correlation_id is null
     or p_byte_size not between 1 and 5242880
     or p_object_path <> p_applicant_auth_id::text || '/' || p_draft_id::text || '/' || p_photo_id::text || '.jpg' then
    raise exception using errcode = '22023', message = 'photo_invalid';
  end if;
  if not exists (
    select 1 from auth.users u where u.id = p_applicant_auth_id and u.email_confirmed_at is not null
  ) then raise exception using errcode = '42501', message = 'verified_applicant_required'; end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_applicant_auth_id::text || ':membership_application.draft', 0)
  );
  if not exists (
    select 1 from membership_private.application_drafts d
    join public.org_units o on o.id = d.org_unit_id and o.unit_type = 'parish'
    where d.id = p_draft_id and d.applicant_auth_id = p_applicant_auth_id
      and d.org_unit_id = p_org_unit_id and d.expires_at > clock_timestamp()
      and o.name = 'SS Joachim and Anne Catholic Church, Ijegun'
  ) then raise exception using errcode = '42501', message = 'photo_draft_unavailable'; end if;

  select p.object_path into v_old_path
  from membership_private.application_drafts d
  join membership_private.application_photos p on p.id = d.passport_photo_id
  where d.id = p_draft_id and p.state = 'draft'
  for update of d, p;
  if v_old_path is not null then
    update membership_private.application_photos
    set state = 'pending_delete', draft_id = null,
        deletion_reason = 'replaced', deletion_source_draft_id = p_draft_id,
        deletion_source_expires_at = null, deletion_queued_at = clock_timestamp(),
        deletion_next_attempt_at = clock_timestamp(), deletion_attempts = 0,
        deletion_claim_token = null, deletion_claimed_until = null,
        deletion_last_failure = null, deletion_blocked_at = null
    where object_path = v_old_path;
  end if;
  insert into membership_private.application_photos
    (id, applicant_auth_id, draft_id, object_path, content_type, byte_size, state, verified_at)
  values
    (p_photo_id, p_applicant_auth_id, p_draft_id, p_object_path, 'image/jpeg', p_byte_size, 'draft', clock_timestamp());
  update membership_private.application_drafts set passport_photo_id = p_photo_id
  where id = p_draft_id and applicant_auth_id = p_applicant_auth_id;
  update membership_private.application_drafts
  set last_activity_at = clock_timestamp(), expires_at = clock_timestamp() + interval '30 days',
      updated_at = clock_timestamp()
  where id = p_draft_id and applicant_auth_id = p_applicant_auth_id
  returning updated_at into v_draft_updated_at;
  insert into membership_private.security_audit_events
    (actor_kind, actor_auth_id, action, outcome, correlation_id)
  values ('authenticated_user', p_applicant_auth_id, 'membership_application.photo_uploaded', 'succeeded', p_correlation_id);
  return pg_catalog.jsonb_build_object(
    'photoId', p_photo_id,
    'previousObjectPath', v_old_path,
    'draftUpdatedAt', v_draft_updated_at
  );
end;
$$;
