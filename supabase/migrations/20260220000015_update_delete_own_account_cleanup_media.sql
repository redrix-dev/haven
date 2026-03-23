-- Ensure account deletion also removes media objects from storage.

create or replace function public.delete_own_account()
returns void
language plpgsql
security definer
set search_path = public, auth, storage
as $$
declare
  v_user_id uuid := auth.uid();
  v_attachment record;
begin
  if v_user_id is null then
    raise exception 'Not authenticated'
      using errcode = '42501';
  end if;

  for v_attachment in
    select distinct ma.bucket_name, ma.object_path
    from public.message_attachments ma
    where ma.owner_user_id = v_user_id
      or ma.community_id in (
        select c.id
        from public.communities c
        where c.created_by_user_id = v_user_id
      )
  loop
    delete from storage.objects
    where bucket_id = v_attachment.bucket_name
      and name = v_attachment.object_path;
  end loop;

  -- Keep community channels intact when a non-owner channel creator deletes their account.
  update public.channels as c
  set created_by_user_id = community.created_by_user_id
  from public.communities as community
  where c.community_id = community.id
    and c.created_by_user_id = v_user_id
    and community.created_by_user_id <> v_user_id;

  -- Remove rows that have restrictive profile references.
  delete from public.invites
  where created_by_user_id = v_user_id;

  delete from public.support_reports
  where reporter_user_id = v_user_id;

  -- If the user owns communities, remove them and all dependent data.
  delete from public.communities
  where created_by_user_id = v_user_id;

  delete from auth.users
  where id = v_user_id;

  if not found then
    raise exception 'Account not found'
      using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.delete_own_account() from public;
grant execute on function public.delete_own_account() to authenticated;
