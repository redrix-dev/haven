-- Add ban-hidden message state and update message visibility policy.

alter table public.messages
  add column if not exists is_hidden boolean not null default false;

create index if not exists idx_messages_community_hidden
  on public.messages (community_id, is_hidden);

drop policy if exists messages_select_visible_channel on public.messages;
create policy messages_select_visible_channel
on public.messages
for select
to authenticated
using (
  public.can_view_channel(channel_id)
  and (
    not is_hidden
    or public.user_has_permission(community_id, 'can_view_ban_hidden')
  )
);
