-- Optimize channel timeline queries that ignore deleted rows.
-- This supports future cursor pagination and reduces heap scans on hot paths.

create index if not exists idx_messages_channel_visible_created_id_desc
  on public.messages(channel_id, created_at desc, id desc)
  where deleted_at is null;
