-- Recoverable Storage API cleanup for draft passport photographs.
-- pg_cron + pg_net invoke a narrowly scoped server endpoint. SQL never deletes Storage objects.

do $$
begin
  if to_regnamespace('cron') is null then
    raise exception 'Enable Supabase pg_cron before applying photo-cleanup migration';
  end if;
  if to_regprocedure('net.http_post(text,jsonb,jsonb,jsonb,integer)') is null then
    raise exception 'Enable Supabase pg_net before applying photo-cleanup migration';
  end if;
  if to_regclass('vault.decrypted_secrets') is null then
    raise exception 'Supabase Vault is required for photo-cleanup endpoint configuration';
  end if;
  if to_regprocedure('extensions.hmac(bytea,bytea,text)') is null then
    raise exception 'extensions.hmac(bytea,bytea,text) is required for signed photo-cleanup requests';
  end if;
  if not exists (
    select 1 from vault.decrypted_secrets
    where name = 'membership_photo_cleanup_url' and decrypted_secret like 'https://%'
  ) or not exists (
    select 1 from vault.decrypted_secrets
    where name = 'membership_photo_cleanup_hmac_secret'
      and length(decrypted_secret) >= 43
  ) then
    raise exception 'Provision membership_photo_cleanup_url and membership_photo_cleanup_hmac_secret in Vault before applying photo-cleanup migration';
  end if;
end;
$$;

alter table membership_private.application_photos
  add column deletion_reason text,
  add column deletion_source_draft_id uuid,
  add column deletion_source_expires_at timestamptz,
  add column deletion_queued_at timestamptz,
  add column deletion_attempts integer not null default 0,
  add column deletion_next_attempt_at timestamptz not null default clock_timestamp(),
  add column deletion_claim_token uuid,
  add column deletion_claimed_until timestamptz,
  add column deletion_last_failure text,
  add column deletion_blocked_at timestamptz;

-- Pending rows created by the already-approved upload/remove paths predate reason metadata.
-- Preserve them as legacy deletion intents, deriving only the source draft UUID from the
-- canonical server-generated key. Malformed legacy paths remain visible but are blocked.
update membership_private.application_photos p
set deletion_reason = case
      when p.object_path ~* ('^' || p.applicant_auth_id::text || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/' || p.id::text || '\.jpg$')
        then 'legacy_pending'
      else 'invalid_path'
    end,
    deletion_source_draft_id = case
      when p.object_path ~* ('^' || p.applicant_auth_id::text || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/' || p.id::text || '\.jpg$')
        then split_part(p.object_path, '/', 2)::uuid
      else null
    end,
    deletion_queued_at = clock_timestamp(),
    deletion_blocked_at = case
      when p.object_path ~* ('^' || p.applicant_auth_id::text || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/' || p.id::text || '\.jpg$')
        then null
      else clock_timestamp()
    end,
    deletion_last_failure = case
      when p.object_path ~* ('^' || p.applicant_auth_id::text || '/[0-9a-f-]{36}/' || p.id::text || '\.jpg$')
        then null
      else 'invalid_object_path'
    end
where p.state = 'pending_delete';

alter table membership_private.application_photos
  add constraint application_photos_cleanup_metadata_ck check (
    (state = 'pending_delete' and deletion_reason in ('draft_expired', 'replaced', 'applicant_removed', 'legacy_pending', 'invalid_path')
      and deletion_queued_at is not null)
    or (state <> 'pending_delete' and deletion_reason is null and deletion_source_draft_id is null
      and deletion_source_expires_at is null and deletion_queued_at is null
      and deletion_claim_token is null and deletion_claimed_until is null)
  ),
  add constraint application_photos_expired_source_ck check (
    deletion_reason <> 'draft_expired'
    or (deletion_source_draft_id is not null and deletion_source_expires_at is not null
      and deletion_source_expires_at <= deletion_queued_at)
  ),
  add constraint application_photos_cleanup_attempts_ck check (deletion_attempts >= 0);

create index application_photos_cleanup_due_idx
  on membership_private.application_photos(deletion_next_attempt_at, deletion_queued_at)
  where state = 'pending_delete' and deletion_blocked_at is null;

-- Record expiry provenance only when the approved 30-day deadline has actually passed.
create or replace function membership_private.mark_expired_draft_photo_for_deletion()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update membership_private.application_photos
  set state = 'pending_delete', draft_id = null,
      deletion_reason = 'draft_expired',
      deletion_source_draft_id = old.id,
      deletion_source_expires_at = old.expires_at,
      deletion_queued_at = clock_timestamp(),
      deletion_next_attempt_at = clock_timestamp(),
      deletion_attempts = 0,
      deletion_claim_token = null,
      deletion_claimed_until = null,
      deletion_last_failure = null,
      deletion_blocked_at = null
  where id = old.passport_photo_id and applicant_auth_id = old.applicant_auth_id
    and state = 'draft' and application_id is null
    and old.expires_at <= clock_timestamp();
  if found then return old; end if;

  if exists (
    select 1 from membership_private.application_photos p
    where p.id = old.passport_photo_id and p.state = 'draft'
  ) then
    raise exception 'Cannot remove a draft with an unexpired passport photo';
  end if;
  return old;
end;
$$;

-- Preserve cleanup provenance for replaced and applicant-removed draft photos.
create or replace function public.register_membership_application_photo(
  p_applicant_auth_id uuid, p_org_unit_id uuid, p_draft_id uuid, p_photo_id uuid,
  p_object_path text, p_byte_size integer, p_correlation_id uuid
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_old_path text;
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
  if not exists (select 1 from auth.users u where u.id = p_applicant_auth_id and u.email_confirmed_at is not null) then
    raise exception using errcode = '42501', message = 'verified_applicant_required';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_applicant_auth_id::text || ':membership_application.draft', 0));
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
  values (p_photo_id, p_applicant_auth_id, p_draft_id, p_object_path, 'image/jpeg', p_byte_size, 'draft', clock_timestamp());
  update membership_private.application_drafts set passport_photo_id = p_photo_id
  where id = p_draft_id and applicant_auth_id = p_applicant_auth_id;
  update membership_private.application_drafts
  set last_activity_at = clock_timestamp(), expires_at = clock_timestamp() + interval '30 days', updated_at = clock_timestamp()
  where id = p_draft_id and applicant_auth_id = p_applicant_auth_id;
  insert into membership_private.security_audit_events
    (actor_kind, actor_auth_id, action, outcome, correlation_id)
  values ('authenticated_user', p_applicant_auth_id, 'membership_application.photo_uploaded', 'succeeded', p_correlation_id);
  return pg_catalog.jsonb_build_object('photoId', p_photo_id, 'previousObjectPath', v_old_path);
end;
$$;

create or replace function public.remove_membership_application_photo(
  p_applicant_auth_id uuid, p_org_unit_id uuid, p_draft_id uuid, p_correlation_id uuid
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_photo membership_private.application_photos%rowtype;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'photo_not_authorized';
  end if;
  if not exists (select 1 from auth.users u where u.id = p_applicant_auth_id and u.email_confirmed_at is not null)
     or not exists (select 1 from public.org_units o where o.id = p_org_unit_id and o.unit_type = 'parish'
       and o.name = 'SS Joachim and Anne Catholic Church, Ijegun') then
    raise exception using errcode = '42501', message = 'verified_applicant_required';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_applicant_auth_id::text || ':membership_application.draft', 0));
  select p.* into v_photo
  from membership_private.application_drafts d
  join membership_private.application_photos p on p.id = d.passport_photo_id
  where d.id = p_draft_id and d.applicant_auth_id = p_applicant_auth_id and d.org_unit_id = p_org_unit_id
    and d.expires_at > clock_timestamp() and p.state = 'draft'
  for update of d, p;
  if not found then return null; end if;
  update membership_private.application_drafts set passport_photo_id = null
  where id = p_draft_id and applicant_auth_id = p_applicant_auth_id;
  update membership_private.application_photos
  set state = 'pending_delete', draft_id = null,
      deletion_reason = 'applicant_removed', deletion_source_draft_id = p_draft_id,
      deletion_source_expires_at = null, deletion_queued_at = clock_timestamp(),
      deletion_next_attempt_at = clock_timestamp(), deletion_attempts = 0,
      deletion_claim_token = null, deletion_claimed_until = null,
      deletion_last_failure = null, deletion_blocked_at = null
  where id = v_photo.id;
  insert into membership_private.security_audit_events
    (actor_kind, actor_auth_id, action, outcome, correlation_id)
  values ('authenticated_user', p_applicant_auth_id, 'membership_application.photo_removed', 'succeeded', p_correlation_id);
  return pg_catalog.jsonb_build_object('objectPath', v_photo.object_path);
end;
$$;

-- Claim only detached pending objects that cannot be referenced by a draft or application.
-- Expired jobs carry the DB-verified expiry timestamp; legacy/replaced/removed intents are
-- retained because the existing API already queued them for deletion.
create function public.claim_membership_application_photo_cleanup_jobs(p_limit integer)
returns table (
  photo_id uuid, applicant_auth_id uuid, source_draft_id uuid, object_path text,
  deletion_reason text, source_expires_at timestamptz, queued_at timestamptz,
  claim_token uuid, attempt_count integer
)
language plpgsql security definer set search_path = '' as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'photo_cleanup_not_authorized';
  end if;
  if p_limit is null or p_limit < 1 then
    raise exception using errcode = '22023', message = 'photo_cleanup_limit_invalid';
  end if;
  return query
  with candidates as (
    select p.id
    from membership_private.application_photos p
    where p.state = 'pending_delete' and p.application_id is null
      and p.deletion_blocked_at is null
      and p.deletion_next_attempt_at <= clock_timestamp()
      and (p.deletion_claimed_until is null or p.deletion_claimed_until <= clock_timestamp())
      and p.deletion_reason in ('draft_expired', 'replaced', 'applicant_removed', 'legacy_pending')
      and p.deletion_source_draft_id is not null
      and (p.deletion_reason <> 'draft_expired' or p.deletion_source_expires_at <= p.deletion_queued_at)
      and p.draft_id is null
      and not exists (
        select 1 from membership_private.application_drafts d where d.passport_photo_id = p.id
      )
      and not exists (
        select 1 from membership_private.application_data ad where ad.passport_photo_id = p.id
      )
      and not exists (
        select 1 from membership_private.applications a where a.id = p.application_id
      )
    order by p.deletion_next_attempt_at, p.deletion_queued_at
    for update of p skip locked
    limit least(p_limit, 10)
  ), claimed as (
    update membership_private.application_photos p
    set deletion_claim_token = pg_catalog.gen_random_uuid(),
        deletion_claimed_until = clock_timestamp() + interval '5 minutes',
        deletion_attempts = p.deletion_attempts + 1
    from candidates c where p.id = c.id
    returning p.id, p.applicant_auth_id, p.deletion_source_draft_id, p.object_path,
      p.deletion_reason, p.deletion_source_expires_at, p.deletion_queued_at,
      p.deletion_claim_token, p.deletion_attempts
  )
  select * from claimed;
end;
$$;

create function public.complete_membership_application_photo_cleanup(p_photo_id uuid, p_claim_token uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_completed boolean := false;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'photo_cleanup_not_authorized';
  end if;
  delete from membership_private.application_photos p
  where p.id = p_photo_id and p.state = 'pending_delete' and p.application_id is null
    and p.deletion_claim_token = p_claim_token
    and p.deletion_claimed_until > clock_timestamp()
    and p.object_path = p.applicant_auth_id::text || '/' || p.deletion_source_draft_id::text || '/' || p.id::text || '.jpg'
    and not exists (select 1 from membership_private.application_drafts d where d.passport_photo_id = p.id)
    and not exists (select 1 from membership_private.application_data ad where ad.passport_photo_id = p.id);
  v_completed := found;
  if v_completed then
    insert into membership_private.security_audit_events
      (actor_kind, action, outcome, failure_category, correlation_id)
    values ('system', 'membership_application.photo_cleanup_completed', 'succeeded', null, pg_catalog.gen_random_uuid());
  end if;
  return v_completed;
end;
$$;

create function public.fail_membership_application_photo_cleanup(
  p_photo_id uuid, p_claim_token uuid, p_failure_category text, p_permanent boolean default false
)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'photo_cleanup_not_authorized';
  end if;
  if p_failure_category is null or p_failure_category not in ('invalid_object_path', 'storage_unavailable') then
    raise exception using errcode = '22023', message = 'photo_cleanup_failure_category_invalid';
  end if;
  update membership_private.application_photos p
  set deletion_last_failure = p_failure_category,
      deletion_blocked_at = case when p_permanent then clock_timestamp() else null end,
      deletion_next_attempt_at = case when p_permanent then p.deletion_next_attempt_at
        else clock_timestamp() + least(interval '5 minutes' * power(2, least(p.deletion_attempts - 1, 6)), interval '6 hours') end,
      deletion_claim_token = null,
      deletion_claimed_until = null
  where p.id = p_photo_id and p.state = 'pending_delete' and p.application_id is null
    and p.deletion_claim_token = p_claim_token and p.deletion_claimed_until > clock_timestamp()
    and not exists (select 1 from membership_private.application_drafts d where d.passport_photo_id = p.id)
    and not exists (select 1 from membership_private.application_data ad where ad.passport_photo_id = p.id);
  return found;
end;
$$;

-- Keep the existing inline replacement/removal cleanup path safe if a scheduled
-- worker has already leased the same row. The lease holder owns completion in that case.
create or replace function public.finalize_membership_application_photo_deletion(p_object_path text)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'photo_not_authorized';
  end if;
  delete from membership_private.application_photos p
  where p.object_path = p_object_path and p.state = 'pending_delete'
    and p.application_id is null and p.deletion_claim_token is null
    and p.object_path = p.applicant_auth_id::text || '/' || p.deletion_source_draft_id::text || '/' || p.id::text || '.jpg'
    and not exists (select 1 from membership_private.application_drafts d where d.passport_photo_id = p.id)
    and not exists (select 1 from membership_private.application_data ad where ad.passport_photo_id = p.id);
  return found;
end;
$$;

-- A bounded audit endpoint for the operator. It deliberately excludes IDs, paths and PII.
create function public.get_membership_application_photo_cleanup_summary()
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'photo_cleanup_not_authorized';
  end if;
  return (
    select coalesce(jsonb_agg(jsonb_build_object(
      'reason', q.deletion_reason, 'failure', q.deletion_last_failure,
      'blocked', q.deletion_blocked_at is not null, 'count', q.job_count,
      'oldestQueuedAt', q.oldest_queued_at
    )), '[]'::jsonb)
    from (
      select deletion_reason, deletion_last_failure, deletion_blocked_at is not null as blocked,
        count(*) as job_count, min(deletion_queued_at) as oldest_queued_at
      from membership_private.application_photos
      where state = 'pending_delete'
      group by deletion_reason, deletion_last_failure, deletion_blocked_at is not null
      order by min(deletion_queued_at)
      limit 20
    ) q
  );
end;
$$;

-- Queue an HMAC-signed request, not the HMAC secret itself. The random request ID and
-- timestamp limit replay impact; worker operations remain safe to repeat.
create function membership_private.invoke_membership_photo_cleanup()
returns bigint language plpgsql security definer set search_path = '' as $$
declare
  v_url text;
  v_secret text;
  v_timestamp bigint := floor(extract(epoch from clock_timestamp()))::bigint;
  v_request_id uuid := pg_catalog.gen_random_uuid();
  v_signature text;
begin
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'membership_photo_cleanup_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'membership_photo_cleanup_hmac_secret';
  if v_url is null or v_url not like 'https://%' or v_secret is null or length(v_secret) < 43 then
    raise exception 'Membership photo cleanup Vault configuration is missing or invalid';
  end if;
  v_signature := encode(extensions.hmac(
    convert_to(v_timestamp::text || '.' || v_request_id::text, 'UTF8'),
    convert_to(v_secret, 'UTF8'), 'sha256'
  ), 'hex');
  return net.http_post(
    url := v_url,
    body := jsonb_build_object('timestamp', v_timestamp::text, 'requestId', v_request_id::text),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cyon-cleanup-timestamp', v_timestamp::text,
      'x-cyon-cleanup-request-id', v_request_id::text,
      'x-cyon-cleanup-signature', v_signature
    ),
    timeout_milliseconds := 5000
  );
end;
$$;

revoke all on function public.claim_membership_application_photo_cleanup_jobs(integer) from public, anon, authenticated, service_role;
revoke all on function public.complete_membership_application_photo_cleanup(uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function public.fail_membership_application_photo_cleanup(uuid, uuid, text, boolean) from public, anon, authenticated, service_role;
revoke all on function public.get_membership_application_photo_cleanup_summary() from public, anon, authenticated, service_role;
revoke all on function membership_private.invoke_membership_photo_cleanup() from public, anon, authenticated, service_role;
grant execute on function public.claim_membership_application_photo_cleanup_jobs(integer) to service_role;
grant execute on function public.complete_membership_application_photo_cleanup(uuid, uuid) to service_role;
grant execute on function public.fail_membership_application_photo_cleanup(uuid, uuid, text, boolean) to service_role;
grant execute on function public.get_membership_application_photo_cleanup_summary() to service_role;

select cron.schedule(
  'cyon-cleanup-membership-application-photos',
  '*/15 * * * *',
  'select membership_private.invoke_membership_photo_cleanup()'
);

comment on function public.claim_membership_application_photo_cleanup_jobs(integer) is
  'Service-only bounded, lease-based claim. Only detached server-queued objects with canonical paths are returned.';
comment on function public.get_membership_application_photo_cleanup_summary() is
  'Service-only aggregate cleanup status; excludes object paths and applicant identifiers.';
