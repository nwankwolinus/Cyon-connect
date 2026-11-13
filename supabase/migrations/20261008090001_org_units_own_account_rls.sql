-- Correct the organisation-unit policy so it is explicitly scoped to the caller's
-- own active user-account/member relationship rather than relying on nested RLS.
-- No table grants or other RLS policies are changed.

drop policy if exists org_units_select_own_unit on public.org_units;

create policy org_units_select_own_unit on public.org_units
  for select to authenticated
  using (exists (
    select 1
    from public.members m
    join public.user_accounts ua on ua.member_id = m.id
    where m.org_unit_id = org_units.id
      and ua.auth_user_id = (select auth.uid())
      and ua.account_status = 'active'
  ));
