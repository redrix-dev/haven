-- Route child-table visibility through parent message visibility.

drop policy if exists message_reactions_select_visible_channel on public.message_reactions;
create policy message_reactions_select_visible_channel
on public.message_reactions
for select
to authenticated
using (
  exists (
    select 1
    from public.messages m
    where m.id = message_reactions.message_id
  )
);

drop policy if exists message_attachments_select_visible_channel on public.message_attachments;
create policy message_attachments_select_visible_channel
on public.message_attachments
for select
to authenticated
using (
  expires_at > timezone('utc', now())
  and exists (
    select 1
    from public.messages m
    where m.id = message_attachments.message_id
  )
);

drop policy if exists message_link_previews_select_visible_channel on public.message_link_previews;
create policy message_link_previews_select_visible_channel
on public.message_link_previews
for select
to authenticated
using (
  exists (
    select 1
    from public.messages m
    where m.id = message_link_previews.message_id
  )
);
