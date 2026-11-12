-- HAV-17: a report sent to Haven staff survives the deletion of the community
-- it came from. Before this, support_reports.community_id cascaded, so deleting
-- a community (directly, or through delete_own_account for every community the
-- owner had) deleted the staff record with it.
--
-- After this:
--   * staff reports (destination = 'haven_staff') keep their row and evidence
--     snapshot; community_id becomes null, like a profile report filed with no
--     community. Staff read them through platform_staff, not the community.
--   * community reports still go with the community. Nobody could read one
--     afterwards: their only audience is that community's moderators.
--   * a check constraint states the rule: only a staff report has no community.

-- 1. Community reports are deleted with their community, explicitly. A cascade
--    cannot tell the two destinations apart, so this runs before the delete.
--    Security definer because the owner deleting through RLS may not hold the
--    delete policy on every report row; a cascade would not have asked either.
create or replace function public.delete_community_reports_with_community()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.support_reports
  where community_id = old.id
    and destination <> 'haven_staff';
  return old;
end;
$$;

revoke all on function public.delete_community_reports_with_community() from public, anon, authenticated;

drop trigger if exists trg_communities_delete_community_reports on public.communities;
create trigger trg_communities_delete_community_reports
before delete on public.communities
for each row execute function public.delete_community_reports_with_community();

-- 2. What is left for the community is staff reports: unlink them instead of
--    deleting them.
alter table public.support_reports
  drop constraint support_reports_community_id_fkey,
  add constraint support_reports_community_id_fkey
    foreign key (community_id) references public.communities(id) on delete set null;

-- 3. A surviving staff report may point at the community report it was paired
--    with, which step 1 just deleted. Without this the delete would fail on the
--    dangling link instead of silently losing the staff report.
alter table public.support_reports
  drop constraint support_reports_source_report_id_fkey,
  add constraint support_reports_source_report_id_fkey
    foreign key (source_report_id) references public.support_reports(id) on delete set null;

-- 4. Only a staff report may have no community. The insert policy already
--    requires this of clients; this makes it true of every writer.
alter table public.support_reports
  add constraint support_reports_community_required
    check (community_id is not null or destination = 'haven_staff');
