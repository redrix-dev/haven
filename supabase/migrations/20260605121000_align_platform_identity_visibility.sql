-- Platform identity is operational app identity, not profile-detail data.
-- Authenticated users may see username/avatar for any user; profile privacy
-- controls richer profile fields through get_profile_card.can_view_details.

create or replace function public.can_view_profile_identity(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null and p_user_id is not null;
$$;

revoke all on function public.can_view_profile_identity(uuid) from public;
grant execute on function public.can_view_profile_identity(uuid) to authenticated, service_role;
