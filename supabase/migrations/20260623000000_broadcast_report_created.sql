-- Live modmail: broadcast newly-created community reports to moderators so the
-- modmail inbox can surface them in realtime (not just on reload).
--
-- Mirrors public.broadcast_report_status_updated (the existing status-change
-- broadcast): fan a `report_created` event out to every community member's
-- private_user channel, which clients already subscribe to. The client filters
-- to communities it actually moderates (and RLS still gates the detail fetch),
-- so broadcasting to all members is safe and matches the status-update fan-out.
--
-- Only community-destined reports are broadcast. `haven_staff`-only reports are
-- platform moderation (handled by the admin site), never community modmail.
--
-- Best-effort: a broadcast failure must never block the report insert.

create or replace function public.trigger_support_report_created_broadcast()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  rec record;
begin
  if new.destination not in ('server_admins', 'both') then
    return new;
  end if;

  begin
    for rec in
      select m.user_id
      from public.community_members m
      where m.community_id = new.community_id
    loop
      perform realtime.send(
        jsonb_build_object(
          'community_id', new.community_id::text,
          'report_id', new.id::text
        ),
        'report_created',
        'private_user:' || rec.user_id::text,
        true
      );
    end loop;
  exception when others then
    raise log 'Report-created broadcast failed for report %: %', new.id, left(sqlerrm, 2000);
  end;

  return new;
exception when others then
  raise log 'Unexpected report-created broadcast failure for report %: %', new.id, left(sqlerrm, 2000);
  return new;
end;
$$;

drop trigger if exists trg_support_reports_created_broadcast on public.support_reports;
create trigger trg_support_reports_created_broadcast
after insert on public.support_reports
for each row execute function public.trigger_support_report_created_broadcast();
