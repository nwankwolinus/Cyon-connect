-- Durable, short-lived one-time request IDs for the protected photo cleanup worker.
-- The application verifies HMAC before calling the consume RPC.

create table membership_private.photo_cleanup_request_replays (
  request_id uuid primary key,
  accepted_until timestamptz not null,
  created_at timestamptz not null default clock_timestamp(),
  constraint photo_cleanup_replay_window_ck check (
    accepted_until > created_at
    and accepted_until <= created_at + interval '10 minutes'
  )
);

create index photo_cleanup_request_replays_expiry_idx
  on membership_private.photo_cleanup_request_replays(accepted_until);

alter table membership_private.photo_cleanup_request_replays enable row level security;
revoke all on membership_private.photo_cleanup_request_replays
  from public, anon, authenticated, service_role;

create function public.consume_membership_photo_cleanup_request(
  p_request_id uuid,
  p_accepted_until timestamptz
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'photo_cleanup_not_authorized';
  end if;
  if p_request_id is null or p_accepted_until is null
     or p_accepted_until <= clock_timestamp()
     or p_accepted_until > clock_timestamp() + interval '10 minutes' then
    return false;
  end if;

  -- The validity window is at most ten minutes (five-minute clock skew plus five
  -- minutes after the signed timestamp). Remove expired rows on accepted requests.
  delete from membership_private.photo_cleanup_request_replays
  where accepted_until <= clock_timestamp();

  -- The primary key arbitrates concurrent copies: exactly one call can consume an ID.
  insert into membership_private.photo_cleanup_request_replays(request_id, accepted_until)
  values (p_request_id, p_accepted_until)
  on conflict (request_id) do nothing;
  return found;
end;
$$;

revoke all on function public.consume_membership_photo_cleanup_request(uuid, timestamptz)
  from public, anon, authenticated, service_role;
grant execute on function public.consume_membership_photo_cleanup_request(uuid, timestamptz)
  to service_role;

comment on table membership_private.photo_cleanup_request_replays is
  'Private short-lived ledger of HMAC-verified, one-time cleanup request IDs; expired rows are pruned by the protected invocation and scheduled maintenance job.';

-- Keep replay-state retention bounded even if no valid cleanup request arrives.
-- The cron job is owned by the migration execution role (expected postgres) and
-- invokes this private, non-client-callable pruning function every 15 minutes.
create function membership_private.prune_membership_photo_cleanup_request_replays()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  deleted_count integer;
begin
  delete from membership_private.photo_cleanup_request_replays
  where accepted_until <= clock_timestamp();
  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;

revoke all on function membership_private.prune_membership_photo_cleanup_request_replays()
  from public, anon, authenticated, service_role;

select cron.schedule(
  'cyon-prune-membership-photo-cleanup-replays',
  '*/15 * * * *',
  'select membership_private.prune_membership_photo_cleanup_request_replays()'
);
