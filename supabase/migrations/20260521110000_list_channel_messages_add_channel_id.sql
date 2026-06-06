-- Add channel_id to list_channel_messages return type
-- The RPC is already scoped to a single channel; this echoes it back for client consistency.

drop function if exists public.list_channel_messages(uuid, uuid, integer, timestamptz, uuid);

create or replace function public.list_channel_messages(
  p_community_id uuid,
  p_channel_id uuid,
  p_limit integer default 50,
  p_before_created_at timestamptz default null,
  p_before_message_id uuid default null
)
returns table (
  id uuid,
  channel_id uuid,
  author_user_id uuid,
  display_name text,
  avatar_snapshot_url text,
  content text,
  metadata jsonb,
  reply_to_message_id uuid,
  created_at timestamptz,
  edited_at timestamptz,
  deleted_at timestamptz,
  is_hidden boolean,
  is_platform_staff boolean,
  reactions jsonb,
  attachment jsonb,
  link_preview jsonb
)
language sql
stable
security definer
set search_path to ''
as $$
  with lim as (
    select least(greatest(coalesce(p_limit, 50), 1), 100) as n
  ),
  base as (
    select m.*
    from public.messages m, lim
    where m.channel_id = p_channel_id
      and m.community_id = p_community_id
      and exists (
        select 1
        from public.channels c
        where c.id = p_channel_id
          and c.community_id = p_community_id
      )
      and public.can_view_channel(p_channel_id)
      and (
        not m.is_hidden
        or public.user_has_permission(p_community_id, 'can_view_ban_hidden')
      )
      and (
        p_before_created_at is null
        or m.created_at < p_before_created_at
        or (
          m.created_at = p_before_created_at
          and p_before_message_id is not null
          and m.id < p_before_message_id
        )
      )
    order by m.created_at desc, m.id desc
    limit (select n from lim)
  )
  select
    b.id,
    b.channel_id,
    b.author_user_id,
    b.display_name,
    b.avatar_snapshot_url,
    b.content,
    b.metadata,
    b.reply_to_message_id,
    b.created_at,
    b.edited_at,
    b.deleted_at,
    b.is_hidden,
    b.is_platform_staff,
    (
      select jsonb_agg(to_jsonb(mr))
      from public.message_reactions mr
      where mr.message_id = b.id
    ) as reactions,
    (
      select to_jsonb(row_to_json(s))
      from (
        select *
        from public.message_attachments ma
        where ma.message_id = b.id
          and ma.expires_at > timezone('utc', now())
        order by ma.created_at desc, ma.id desc
        limit 1
      ) s
    ) as attachment,
    (
      select to_jsonb(row_to_json(lp))
      from (
        select *
        from public.message_link_previews mlp
        where mlp.message_id = b.id
        limit 1
      ) lp
    ) as link_preview
  from base b
  order by b.created_at desc, b.id desc;
$$;
