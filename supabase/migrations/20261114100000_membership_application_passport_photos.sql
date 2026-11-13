-- Private, applicant-owned passport photographs for resumable membership applications.
-- Draft object disposal requires a Storage API cleanup worker; SQL never deletes storage.objects.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'membership-applicant-photos',
  'membership-applicant-photos',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

-- A restrictive policy prevents any broad pre-existing permissive storage policy from
-- granting browser roles access to this bucket. The service-role server path bypasses RLS.
create policy membership_applicant_photo_no_client_access
  on storage.objects as restrictive for all to anon, authenticated
  using (bucket_id <> 'membership-applicant-photos')
  with check (bucket_id <> 'membership-applicant-photos');

create table membership_private.application_photos (
  id uuid primary key,
  applicant_auth_id uuid not null references auth.users(id) on delete restrict,
  draft_id uuid references membership_private.application_drafts(id) on delete set null,
  application_id uuid references membership_private.applications(id) on delete restrict,
  object_path text not null unique,
  content_type text not null check (content_type = 'image/jpeg'),
  byte_size integer not null check (byte_size between 1 and 5242880),
  state text not null check (state in ('draft', 'attached', 'pending_delete')),
  verified_at timestamptz not null,
  created_at timestamptz not null default clock_timestamp(),
  constraint application_photos_state_binding_ck check (
    (state = 'draft' and draft_id is not null and application_id is null)
    or (state = 'attached' and draft_id is null and application_id is not null)
    or (state = 'pending_delete' and application_id is null)
  ),
  constraint application_photos_application_owner_fk foreign key (application_id, applicant_auth_id)
    references membership_private.applications(id, applicant_auth_id) on delete restrict
);

alter table membership_private.application_drafts
  add column passport_photo_id uuid;
alter table membership_private.application_drafts
  add constraint application_drafts_passport_photo_fk
  foreign key (passport_photo_id) references membership_private.application_photos(id) on delete set null;
alter table membership_private.application_data
  add column passport_photo_id uuid references membership_private.application_photos(id) on delete restrict;
alter table membership_private.application_photos enable row level security;
revoke all on membership_private.application_photos from public, anon, authenticated, service_role;

create index application_photos_owner_draft_idx
  on membership_private.application_photos(applicant_auth_id, draft_id) where state = 'draft';
create index application_photos_cleanup_idx
  on membership_private.application_photos(created_at) where state = 'pending_delete';

-- Expiring a draft hides its photo immediately and queues it for deletion through the
-- Supabase Storage API. Direct SQL deletion from storage.objects is intentionally avoided.
create function membership_private.mark_expired_draft_photo_for_deletion()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update membership_private.application_photos
  set state='pending_delete', draft_id=null
  where id=old.passport_photo_id and state='draft';
  return old;
end;
$$;
create trigger application_draft_photo_expiry_queue
  before delete on membership_private.application_drafts
  for each row execute function membership_private.mark_expired_draft_photo_for_deletion();

-- The existing submission trigger atomically promotes the draft's validated image to the
-- submitted application before consuming the draft.
create or replace function membership_private.consume_application_draft_after_submission()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status in ('submitted', 'under_review', 'on_hold', 'approved') then
    update membership_private.application_photos p
    set state='attached', draft_id=null, application_id=new.id
    from membership_private.application_drafts d
    where d.applicant_auth_id=new.applicant_auth_id and d.org_unit_id=new.org_unit_id
      and p.id=d.passport_photo_id and p.applicant_auth_id=new.applicant_auth_id and p.state='draft';
    delete from membership_private.application_drafts
    where applicant_auth_id=new.applicant_auth_id and org_unit_id=new.org_unit_id;
    if found then
      insert into membership_private.security_audit_events
        (actor_kind, action, outcome, failure_category, correlation_id)
      values ('system', 'membership_application.draft_consumed', 'succeeded', null, pg_catalog.gen_random_uuid());
    end if;
  end if;
  return new;
end;
$$;

create function public.register_membership_application_photo(
  p_applicant_auth_id uuid, p_org_unit_id uuid, p_draft_id uuid, p_photo_id uuid,
  p_object_path text, p_byte_size integer, p_correlation_id uuid
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_old_path text;
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
    update membership_private.application_photos set state = 'pending_delete', draft_id = null
    where object_path = v_old_path;
  end if;
  insert into membership_private.application_photos
    (id, applicant_auth_id, draft_id, object_path, content_type, byte_size, state, verified_at)
  values
    (p_photo_id, p_applicant_auth_id, p_draft_id, p_object_path, 'image/jpeg', p_byte_size, 'draft', clock_timestamp());
  update membership_private.application_drafts set passport_photo_id = p_photo_id
  where id = p_draft_id and applicant_auth_id = p_applicant_auth_id;
  update membership_private.application_drafts
  set last_activity_at=clock_timestamp(), expires_at=clock_timestamp() + interval '30 days', updated_at=clock_timestamp()
  where id=p_draft_id and applicant_auth_id=p_applicant_auth_id;
  insert into membership_private.security_audit_events
    (actor_kind, actor_auth_id, action, outcome, correlation_id)
  values ('authenticated_user', p_applicant_auth_id, 'membership_application.photo_uploaded', 'succeeded', p_correlation_id);
  return pg_catalog.jsonb_build_object('photoId', p_photo_id, 'previousObjectPath', v_old_path);
end;
$$;

create function public.get_membership_application_photo(
  p_applicant_auth_id uuid, p_org_unit_id uuid, p_draft_id uuid, p_correlation_id uuid
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_photo membership_private.application_photos%rowtype;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'photo_not_authorized';
  end if;
  if not exists (select 1 from auth.users u where u.id=p_applicant_auth_id and u.email_confirmed_at is not null) then
    raise exception using errcode = '42501', message = 'verified_applicant_required';
  end if;
  select p.* into v_photo
  from membership_private.application_drafts d
  join public.org_units o on o.id=d.org_unit_id and o.unit_type='parish'
  join membership_private.application_photos p on p.id=d.passport_photo_id
  where d.id=p_draft_id and d.applicant_auth_id=p_applicant_auth_id and d.org_unit_id=p_org_unit_id
    and d.expires_at > clock_timestamp() and o.name='SS Joachim and Anne Catholic Church, Ijegun'
    and p.applicant_auth_id=p_applicant_auth_id and p.draft_id=d.id and p.state='draft';
  if not found then return null; end if;
  insert into membership_private.security_audit_events
    (actor_kind, actor_auth_id, action, outcome, correlation_id)
  values ('authenticated_user', p_applicant_auth_id, 'membership_application.photo_read', 'succeeded', p_correlation_id);
  return pg_catalog.jsonb_build_object('photoId', v_photo.id, 'objectPath', v_photo.object_path,
    'contentType', v_photo.content_type, 'byteSize', v_photo.byte_size);
end;
$$;

create function public.remove_membership_application_photo(
  p_applicant_auth_id uuid, p_org_unit_id uuid, p_draft_id uuid, p_correlation_id uuid
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_photo membership_private.application_photos%rowtype;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'photo_not_authorized';
  end if;
  if not exists (select 1 from auth.users u where u.id=p_applicant_auth_id and u.email_confirmed_at is not null)
     or not exists (select 1 from public.org_units o where o.id=p_org_unit_id and o.unit_type='parish'
       and o.name='SS Joachim and Anne Catholic Church, Ijegun') then
    raise exception using errcode = '42501', message = 'verified_applicant_required';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_applicant_auth_id::text || ':membership_application.draft', 0)
  );
  select p.* into v_photo
  from membership_private.application_drafts d
  join membership_private.application_photos p on p.id=d.passport_photo_id
  where d.id=p_draft_id and d.applicant_auth_id=p_applicant_auth_id and d.org_unit_id=p_org_unit_id
    and d.expires_at > clock_timestamp() and p.state='draft'
  for update of d,p;
  if not found then return null; end if;
  update membership_private.application_drafts set passport_photo_id=null
  where id=p_draft_id and applicant_auth_id=p_applicant_auth_id;
  update membership_private.application_photos set state='pending_delete', draft_id=null
  where id=v_photo.id;
  insert into membership_private.security_audit_events
    (actor_kind, actor_auth_id, action, outcome, correlation_id)
  values ('authenticated_user', p_applicant_auth_id, 'membership_application.photo_removed', 'succeeded', p_correlation_id);
  return pg_catalog.jsonb_build_object('objectPath', v_photo.object_path);
end;
$$;

create function public.verify_membership_application_photo(
  p_applicant_auth_id uuid, p_org_unit_id uuid, p_photo_id uuid, p_correlation_id uuid
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_photo membership_private.application_photos%rowtype;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'photo_not_authorized';
  end if;
  if not exists (select 1 from auth.users u where u.id=p_applicant_auth_id and u.email_confirmed_at is not null) then
    raise exception using errcode = '42501', message = 'verified_applicant_required';
  end if;
  select p.* into v_photo
  from membership_private.application_drafts d
  join public.org_units o on o.id=d.org_unit_id and o.unit_type='parish'
  join membership_private.application_photos p on p.id=d.passport_photo_id
  where d.applicant_auth_id=p_applicant_auth_id and d.org_unit_id=p_org_unit_id
    and d.expires_at > clock_timestamp() and d.passport_photo_id=p_photo_id
    and o.name='SS Joachim and Anne Catholic Church, Ijegun'
    and p.applicant_auth_id=p_applicant_auth_id and p.draft_id=d.id
    and p.state='draft' and p.verified_at is not null;
  if not found then return null; end if;
  insert into membership_private.security_audit_events
    (actor_kind, actor_auth_id, action, outcome, correlation_id)
  values ('authenticated_user', p_applicant_auth_id, 'membership_application.photo_verified_for_submission', 'succeeded', p_correlation_id);
  return pg_catalog.jsonb_build_object('objectPath', v_photo.object_path, 'byteSize', v_photo.byte_size);
end;
$$;

create function public.finalize_membership_application_photo_deletion(p_object_path text)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'photo_not_authorized';
  end if;
  delete from membership_private.application_photos
  where object_path=p_object_path and state='pending_delete' and application_id is null;
  return found;
end;
$$;

-- Change the submission signature so all new submissions carry a photo reference.
revoke all on function public.submit_membership_application(uuid, uuid, jsonb, bytea, bytea, uuid)
  from public, anon, authenticated, service_role;
drop function public.submit_membership_application(uuid, uuid, jsonb, bytea, bytea, uuid);

create function public.submit_membership_application(
  p_applicant_auth_id uuid, p_org_unit_id uuid, p_applicant_payload jsonb,
  p_idempotency_key_digest bytea, p_payload_digest bytea, p_correlation_id uuid,
  p_passport_photo_id uuid, p_passport_photo_verified boolean
)
returns table (application_id uuid, application_reference uuid, application_status text, was_replay boolean)
language plpgsql security definer set search_path = '' as $$
declare
  v_application_id uuid; v_reference uuid; v_submitted_at timestamptz := clock_timestamp();
  v_existing_payload_digest bytea; v_existing_application_id uuid; v_existing_reference uuid;
  v_predecessor_id uuid; v_draft_id uuid;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'submission_not_authorized';
  end if;
  if p_applicant_auth_id is null or p_org_unit_id is null or p_correlation_id is null
     or p_idempotency_key_digest is null or octet_length(p_idempotency_key_digest) <> 32
     or p_payload_digest is null or octet_length(p_payload_digest) <> 32
     or p_passport_photo_id is null or p_passport_photo_verified is null
     or jsonb_typeof(p_applicant_payload) <> 'object'
     or membership_private.payload_contains_dob_key(p_applicant_payload) then
    raise exception using errcode = '22023', message = 'submission_payload_invalid';
  end if;
  if not exists (select 1 from auth.users u where u.id=p_applicant_auth_id and u.email_confirmed_at is not null) then
    raise exception using errcode = '42501', message = 'verified_applicant_required';
  end if;
  if not exists (select 1 from public.org_units o where o.id=p_org_unit_id and o.unit_type='parish'
    and o.name='SS Joachim and Anne Catholic Church, Ijegun') then
    raise exception using errcode = '23503', message = 'operational_parish_unavailable';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(
    p_applicant_auth_id::text || ':membership_application.submit:' || encode(p_idempotency_key_digest, 'hex'), 0));
  select i.payload_digest, i.application_id, a.public_reference into v_existing_payload_digest, v_existing_application_id, v_existing_reference
  from membership_private.submission_idempotency i join membership_private.applications a on a.id=i.application_id
  where i.applicant_auth_id=p_applicant_auth_id and i.operation='membership_application.submit'
    and i.key_digest=p_idempotency_key_digest;
  if found then
    if v_existing_payload_digest <> p_payload_digest then
      raise exception using errcode='22023', message='idempotency_payload_conflict';
    end if;
    return query select v_existing_application_id, v_existing_reference, 'submitted'::text, true;
    return;
  end if;
  if not p_passport_photo_verified then
    raise exception using errcode='23514', message='valid_applicant_photo_required';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_applicant_auth_id::text || ':membership_application.draft', 0));
  select d.id into v_draft_id from membership_private.application_drafts d
  join membership_private.application_photos p on p.id=d.passport_photo_id
  where d.applicant_auth_id=p_applicant_auth_id and d.org_unit_id=p_org_unit_id
    and d.expires_at > clock_timestamp() and d.passport_photo_id=p_passport_photo_id
    and p.applicant_auth_id=p_applicant_auth_id and p.draft_id=d.id and p.state='draft'
    and p.verified_at is not null
  for update of d,p;
  if not found then raise exception using errcode='23514', message='valid_applicant_photo_required'; end if;
  select a.id into v_predecessor_id from membership_private.applications a
  where a.applicant_auth_id=p_applicant_auth_id and a.status='rejected'
  order by a.submitted_at desc, a.created_at desc limit 1;
  insert into membership_private.applications
    (applicant_auth_id,org_unit_id,org_unit_type,status,screening_outcome,resubmitted_from_id,submitted_at)
  values (p_applicant_auth_id,p_org_unit_id,'parish','submitted','inconclusive',v_predecessor_id,v_submitted_at)
  returning id,public_reference into v_application_id,v_reference;
  insert into membership_private.application_data
    (application_id,applicant_payload,dob_envelope,kms_key_version,passport_photo_id)
  values (v_application_id,p_applicant_payload,null,null,p_passport_photo_id);
  if not exists (select 1 from membership_private.application_photos p
    where p.id=p_passport_photo_id and p.applicant_auth_id=p_applicant_auth_id
      and p.application_id=v_application_id and p.state='attached') then
    raise exception using errcode='23514', message='valid_applicant_photo_required';
  end if;
  insert into membership_private.application_history
    (application_id,actor_kind,actor_auth_id,action,previous_status,resulting_status,correlation_id)
  values (v_application_id,'authenticated_user',p_applicant_auth_id,'submitted',null,'submitted',p_correlation_id);
  insert into membership_private.security_audit_events
    (actor_kind,actor_auth_id,target_application_id,action,outcome,correlation_id)
  values ('authenticated_user',p_applicant_auth_id,v_application_id,'membership_application.submit','succeeded',p_correlation_id);
  insert into membership_private.submission_idempotency
    (applicant_auth_id,operation,key_digest,payload_digest,application_id)
  values (p_applicant_auth_id,'membership_application.submit',p_idempotency_key_digest,p_payload_digest,v_application_id);
  return query select v_application_id,v_reference,'submitted'::text,false;
end;
$$;

revoke all on function public.register_membership_application_photo(uuid,uuid,uuid,uuid,text,integer,uuid)
  from public,anon,authenticated,service_role;
revoke all on function public.get_membership_application_photo(uuid,uuid,uuid,uuid)
  from public,anon,authenticated,service_role;
revoke all on function public.remove_membership_application_photo(uuid,uuid,uuid,uuid)
  from public,anon,authenticated,service_role;
revoke all on function public.verify_membership_application_photo(uuid,uuid,uuid,uuid)
  from public,anon,authenticated,service_role;
revoke all on function public.finalize_membership_application_photo_deletion(text)
  from public,anon,authenticated,service_role;
revoke all on function public.submit_membership_application(uuid,uuid,jsonb,bytea,bytea,uuid,uuid,boolean)
  from public,anon,authenticated,service_role;
grant execute on function public.register_membership_application_photo(uuid,uuid,uuid,uuid,text,integer,uuid) to service_role;
grant execute on function public.get_membership_application_photo(uuid,uuid,uuid,uuid) to service_role;
grant execute on function public.remove_membership_application_photo(uuid,uuid,uuid,uuid) to service_role;
grant execute on function public.verify_membership_application_photo(uuid,uuid,uuid,uuid) to service_role;
grant execute on function public.finalize_membership_application_photo_deletion(text) to service_role;
grant execute on function public.submit_membership_application(uuid,uuid,jsonb,bytea,bytea,uuid,uuid,boolean) to service_role;

comment on table membership_private.application_photos is
  'Private passport image metadata. Storage object access is server-only; submitted-photo retention is intentionally not inferred.';
