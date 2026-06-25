-- Include the author's own private channel in the MESSAGE_INSERT fanout.
--
-- The original trigger (20260518200000) excluded the author
-- (`m.user_id <> NEW.author_user_id`) on the assumption that the sending
-- client renders its own message optimistically. That assumption breaks for
-- the same USER on a second device: a message sent from mobile never reaches
-- that user's open desktop/web session (and vice versa) — it only appears
-- after a channel refetch.
--
-- Clients dedupe naturally: the optimistic insert already carries the real
-- message id (returned by the send RPC), so the echo upserts over it by id.
-- Bonus: the echo's follow-up fetch upgrades the optimistic "…" identity
-- snapshot on the sending device too.
--
-- UPDATE/DELETE triggers already include the author; only INSERT differed.

create or replace function public.notify_community_message_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  rec record;
begin
  begin
    for rec in
      select m.user_id
      from public.community_members m
      where m.community_id = NEW.community_id
    loop
      perform realtime.send(
        jsonb_build_object(
          'community_id',   NEW.community_id::text,
          'channel_id',     NEW.channel_id::text,
          'message_id',     NEW.id::text,
          'author_user_id', NEW.author_user_id::text,
          'content',        NEW.content,
          'metadata',       NEW.metadata,
          'created_at',     NEW.created_at::text,
          'deleted_at',     NEW.deleted_at::text,
          'is_hidden',      NEW.is_hidden
        ),
        'MESSAGE_INSERT',
        'private_user:' || rec.user_id::text,
        true
      );
    end loop;
  exception when others then
    null;
  end;
  return NEW;
end;
$$;
