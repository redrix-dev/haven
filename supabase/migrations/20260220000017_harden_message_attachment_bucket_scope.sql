-- Harden attachment storage scope so cleanup paths cannot touch unrelated buckets.

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'message_attachments_bucket_name_check'
      and conrelid = 'public.message_attachments'::regclass
  ) then
    alter table public.message_attachments
      add constraint message_attachments_bucket_name_check
      check (bucket_name = 'message-media');
  end if;
end $$;

drop policy if exists message_attachments_insert_sender on public.message_attachments;

create policy message_attachments_insert_sender
on public.message_attachments
for insert
to authenticated
with check (
  owner_user_id = auth.uid()
  and bucket_name = 'message-media'
  and public.can_send_in_channel(channel_id)
  and exists (
    select 1
    from public.messages m
    where m.id = message_attachments.message_id
      and m.community_id = message_attachments.community_id
      and m.channel_id = message_attachments.channel_id
      and m.deleted_at is null
  )
  and exists (
    select 1
    from storage.objects so
    where so.bucket_id = message_attachments.bucket_name
      and so.name = message_attachments.object_path
      and so.owner = auth.uid()
  )
);

create or replace function public.cleanup_expired_message_attachments(p_limit integer default 200)
returns integer
language plpgsql
security definer
set search_path = public, storage
as $$
declare
  v_limit integer := greatest(coalesce(p_limit, 200), 1);
  v_deleted integer := 0;
  v_attachment record;
begin
  for v_attachment in
    select id, bucket_name, object_path
    from public.message_attachments
    where bucket_name = 'message-media'
      and expires_at <= timezone('utc', now())
    order by expires_at asc
    limit v_limit
  loop
    delete from storage.objects
    where bucket_id = v_attachment.bucket_name
      and name = v_attachment.object_path;

    delete from public.message_attachments
    where id = v_attachment.id;

    v_deleted := v_deleted + 1;
  end loop;

  return v_deleted;
end;
$$;

revoke all on function public.cleanup_expired_message_attachments(integer) from public;
grant execute on function public.cleanup_expired_message_attachments(integer) to authenticated;

create or replace function public.delete_message_attachment_storage_object()
returns trigger
language plpgsql
security definer
set search_path = public, storage
as $$
begin
  if old.bucket_name = 'message-media' and old.object_path is not null then
    delete from storage.objects
    where bucket_id = old.bucket_name
      and name = old.object_path;
  end if;

  return old;
end;
$$;

drop trigger if exists trg_message_attachment_storage_cleanup on public.message_attachments;

create trigger trg_message_attachment_storage_cleanup
after delete on public.message_attachments
for each row
execute function public.delete_message_attachment_storage_object();

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
    where ma.bucket_name = 'message-media'
      and (
        ma.owner_user_id = v_user_id
        or ma.community_id in (
          select c.id
          from public.communities c
          where c.created_by_user_id = v_user_id
        )
      )
  loop
    delete from storage.objects
    where bucket_id = v_attachment.bucket_name
      and name = v_attachment.object_path;
  end loop;

  update public.channels as c
  set created_by_user_id = community.created_by_user_id
  from public.communities as community
  where c.community_id = community.id
    and c.created_by_user_id = v_user_id
    and community.created_by_user_id <> v_user_id;

  delete from public.invites
  where created_by_user_id = v_user_id;

  delete from public.support_reports
  where reporter_user_id = v_user_id;

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
