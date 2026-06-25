-- Private Realtime broadcast channels (private_user:{uid}) require SELECT
-- policies on realtime.messages before clients can receive server-sent events.

alter table if exists realtime.messages enable row level security;

drop policy if exists "authenticated can receive private_user broadcasts"
  on realtime.messages;

create policy "authenticated can receive private_user broadcasts"
on realtime.messages
for select
to authenticated
using (
  realtime.messages.extension = 'broadcast'
  and realtime.topic() = 'private_user:' || auth.uid()::text
);
