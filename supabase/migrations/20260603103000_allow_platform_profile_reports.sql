alter table public.support_reports
  alter column community_id drop not null;

drop policy if exists support_reports_insert_reporter on public.support_reports;
create policy support_reports_insert_reporter
on public.support_reports
for insert
to authenticated
with check (
  reporter_user_id = auth.uid()
  and (
    (
      community_id is not null
      and public.user_has_permission(community_id, 'create_reports')
    )
    or (
      community_id is null
      and destination = 'haven_staff'
    )
  )
);

create or replace function public.trigger_support_report_alert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_server_name text;
begin
  if new.community_id is null then
    v_server_name := 'Platform';
  else
    select coalesce(nullif(trim(c.name), ''), 'Unknown Server')
    into v_server_name
    from public.communities c
    where c.id = new.community_id
    limit 1;
  end if;

  perform public.enqueue_report_alert(
    new.id,
    'server',
    new.reporter_user_id,
    coalesce(v_server_name, 'Platform'),
    new.created_at
  );

  return new;
exception when others then
  raise log 'Support report alert trigger failed for report %: %', new.id, left(sqlerrm, 2000);
  return new;
end;
$$;
