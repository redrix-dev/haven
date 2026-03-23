-- Ensure UPDATE events include enough row data for Realtime + RLS evaluation.
-- Without REPLICA IDENTITY FULL, UPDATE payloads may omit channel_id, which can prevent
-- message_link_previews pending->ready transitions from reaching subscribed clients.

alter table public.message_link_previews replica identity full;
