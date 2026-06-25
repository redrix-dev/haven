-- Align direct-message paging and realtime with the community message contract:
-- backend pages return newest-first; nexuses normalize to oldest-first.

create or replace function public.list_dm_messages(
  p_conversation_id uuid,
  p_limit integer default 50,
  p_before_created_at timestamptz default null,
  p_before_message_id uuid default null
)
returns table(
  message_id uuid,
  conversation_id uuid,
  author_user_id uuid,
  author_username text,
  author_avatar_url text,
  content text,
  metadata jsonb,
  created_at timestamptz,
  edited_at timestamptz,
  deleted_at timestamptz,
  attachments jsonb
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_limit integer := greatest(1, least(coalesce(p_limit, 50), 100));
begin
  if auth.uid() is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  if p_conversation_id is null then
    raise exception 'DM conversation id is required.';
  end if;

  if not public.is_dm_conversation_member(p_conversation_id) then
    raise exception 'You do not have access to this DM conversation.' using errcode = '42501';
  end if;

  return query
  select
    m.id as message_id,
    m.conversation_id,
    m.author_user_id,
    p.username as author_username,
    p.avatar_url as author_avatar_url,
    m.content,
    m.metadata,
    m.created_at,
    m.edited_at,
    m.deleted_at,
    public.dm_message_attachments_json(m.id) as attachments
  from public.dm_messages m
  join public.profiles p
    on p.id = m.author_user_id
  where m.conversation_id = p_conversation_id
    and m.deleted_at is null
    and (
      p_before_created_at is null
      or m.created_at < p_before_created_at
      or (
        p_before_message_id is not null
        and m.created_at = p_before_created_at
        and m.id < p_before_message_id
      )
    )
  order by m.created_at desc, m.id desc
  limit v_limit;
end;
$$;

revoke all on function public.list_dm_messages(uuid, integer, timestamptz, uuid) from public;
grant execute on function public.list_dm_messages(uuid, integer, timestamptz, uuid) to authenticated;

create or replace function public.get_dm_message(
  p_conversation_id uuid,
  p_message_id uuid
)
returns table(
  message_id uuid,
  conversation_id uuid,
  author_user_id uuid,
  author_username text,
  author_avatar_url text,
  content text,
  metadata jsonb,
  created_at timestamptz,
  edited_at timestamptz,
  deleted_at timestamptz,
  attachments jsonb
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  if p_conversation_id is null or p_message_id is null then
    raise exception 'DM conversation id and message id are required.';
  end if;

  if not public.is_dm_conversation_member(p_conversation_id) then
    raise exception 'You do not have access to this DM conversation.' using errcode = '42501';
  end if;

  return query
  select
    m.id as message_id,
    m.conversation_id,
    m.author_user_id,
    p.username as author_username,
    p.avatar_url as author_avatar_url,
    m.content,
    m.metadata,
    m.created_at,
    m.edited_at,
    m.deleted_at,
    public.dm_message_attachments_json(m.id) as attachments
  from public.dm_messages m
  join public.profiles p
    on p.id = m.author_user_id
  where m.conversation_id = p_conversation_id
    and m.id = p_message_id
    and m.deleted_at is null
  limit 1;
end;
$$;

revoke all on function public.get_dm_message(uuid, uuid) from public;
grant execute on function public.get_dm_message(uuid, uuid) to authenticated;

drop trigger if exists trg_notify_dm_message_recipients on public.dm_messages;
drop function if exists public.notify_dm_message_recipients() cascade;

create function public.notify_dm_message_recipients()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  rec record;
begin
  for rec in
    select m.user_id
    from public.dm_conversation_members m
    where m.conversation_id = NEW.conversation_id
      and m.left_at is null
      and m.user_id <> NEW.author_user_id
  loop
    begin
      perform realtime.send(
        jsonb_build_object(
          'conversation_id', NEW.conversation_id::text,
          'message_id', NEW.id::text,
          'author_user_id', NEW.author_user_id::text,
          'content', NEW.content,
          'metadata', NEW.metadata,
          'created_at', NEW.created_at::text,
          'edited_at', NEW.edited_at::text,
          'deleted_at', NEW.deleted_at::text
        ),
        'DM_MESSAGE',
        'private_user:' || rec.user_id::text,
        true
      );
    exception when others then
      null;
    end;
  end loop;
  return NEW;
end;
$$;

create trigger trg_notify_dm_message_recipients
after insert on public.dm_messages
for each row
execute function public.notify_dm_message_recipients();
