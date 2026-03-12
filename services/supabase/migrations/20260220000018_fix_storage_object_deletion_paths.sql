-- Fix storage cleanup paths: avoid direct deletes on storage tables.
-- Storage objects should be removed via Storage API calls.

-- Remove DB trigger path that directly deletes from storage.objects.
drop trigger if exists trg_message_attachment_storage_cleanup on public.message_attachments;
drop function if exists public.delete_message_attachment_storage_object();

-- Allow moderators/community owners to delete message media objects via Storage API.
drop policy if exists storage_message_media_delete_sender on storage.objects;

create policy storage_message_media_delete_sender
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'message-media'
  and (
    owner = auth.uid()
    or public.is_community_owner(public.try_parse_uuid(split_part(name, '/', 1)))
    or public.user_has_permission(
      public.try_parse_uuid(split_part(name, '/', 1)),
      'manage_messages'
    )
  )
);

-- Expiry cleanup now removes metadata rows only; object deletion is handled by Storage API paths.
create or replace function public.cleanup_expired_message_attachments(p_limit integer default 200)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_limit integer := greatest(coalesce(p_limit, 200), 1);
  v_deleted integer := 0;
begin
  with expired as (
    select id
    from public.message_attachments
    where bucket_name = 'message-media'
      and expires_at <= timezone('utc', now())
    order by expires_at asc
    limit v_limit
  ),
  deleted_rows as (
    delete from public.message_attachments ma
    using expired e
    where ma.id = e.id
    returning ma.id
  )
  select count(*)::integer
  into v_deleted
  from deleted_rows;

  return coalesce(v_deleted, 0);
end;
$$;

revoke all on function public.cleanup_expired_message_attachments(integer) from public;
grant execute on function public.cleanup_expired_message_attachments(integer) to authenticated;

-- Account deletion now relies on regular row cascades and Storage API cleanup flows.
create or replace function public.delete_own_account()
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Not authenticated'
      using errcode = '42501';
  end if;

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
