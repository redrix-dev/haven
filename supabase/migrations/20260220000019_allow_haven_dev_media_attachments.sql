-- Allow Haven developer messages to carry media attachments while preserving ownership checks.

drop policy if exists message_attachments_insert_sender on public.message_attachments;

create policy message_attachments_insert_sender
on public.message_attachments
for insert
to authenticated
with check (
  owner_user_id = auth.uid()
  and bucket_name = 'message-media'
  and exists (
    select 1
    from public.messages m
    where m.id = message_attachments.message_id
      and m.community_id = message_attachments.community_id
      and m.channel_id = message_attachments.channel_id
      and m.deleted_at is null
      and (
        (
          m.author_type = 'user'
          and m.author_user_id = auth.uid()
          and public.can_send_in_channel(channel_id)
        )
        or (
          m.author_type = 'haven_dev'
          and public.can_post_haven_dev_message(auth.uid())
          and coalesce(m.metadata->>'sent_by_user_id', '') = auth.uid()::text
        )
      )
  )
  and exists (
    select 1
    from storage.objects so
    where so.bucket_id = message_attachments.bucket_name
      and so.name = message_attachments.object_path
      and so.owner = auth.uid()
  )
);
