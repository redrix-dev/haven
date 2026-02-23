-- DM moderation review workflow (Phase 2)
-- Adds Haven staff review/status/action workflow for dm_message_reports.
-- Keeps reporter self-access while adding staff-only review RPCs and audit trail.

do $$
begin
  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public'
      and t.typname = 'dm_message_report_status'
  ) then
    create type public.dm_message_report_status as enum (
      'open',
      'triaged',
      'in_review',
      'resolved_actioned',
      'resolved_no_action',
      'dismissed'
    );
  end if;
end $$;

alter table public.dm_message_reports
  add column if not exists assigned_to_user_id uuid references public.profiles(id) on delete set null,
  add column if not exists assigned_at timestamptz,
  add column if not exists updated_at timestamptz not null default timezone('utc', now()),
  add column if not exists resolution_notes text;

do $$
declare
  v_status_udt text;
begin
  select c.udt_name
  into v_status_udt
  from information_schema.columns c
  where c.table_schema = 'public'
    and c.table_name = 'dm_message_reports'
    and c.column_name = 'status'
  limit 1;

  if v_status_udt = 'text' then
    alter table public.dm_message_reports
      alter column status drop default;

    alter table public.dm_message_reports
      alter column status type public.dm_message_report_status
      using (
        case
          when status in (
            'open',
            'triaged',
            'in_review',
            'resolved_actioned',
            'resolved_no_action',
            'dismissed'
          ) then status::public.dm_message_report_status
          else 'open'::public.dm_message_report_status
        end
      );
  end if;
end $$;

alter table public.dm_message_reports
  alter column status set default 'open';

update public.dm_message_reports
set updated_at = coalesce(updated_at, created_at, timezone('utc', now()))
where updated_at is null;

drop trigger if exists trg_dm_message_reports_updated_at on public.dm_message_reports;
create trigger trg_dm_message_reports_updated_at
before update on public.dm_message_reports
for each row execute function public.set_updated_at();

create index if not exists idx_dm_message_reports_status_created_at
  on public.dm_message_reports(status, created_at desc);

create index if not exists idx_dm_message_reports_assigned_status
  on public.dm_message_reports(assigned_to_user_id, status, created_at desc);

create table if not exists public.dm_message_report_actions (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.dm_message_reports(id) on delete cascade,
  acted_by_user_id uuid not null references public.profiles(id) on delete cascade,
  action_type text not null check (char_length(trim(action_type)) between 1 and 64),
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_dm_message_report_actions_report_created_at
  on public.dm_message_report_actions(report_id, created_at desc, id desc);

create index if not exists idx_dm_message_report_actions_actor_created_at
  on public.dm_message_report_actions(acted_by_user_id, created_at desc);

create or replace function public.is_haven_moderator(p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.platform_staff ps
    where ps.user_id = p_user_id
      and ps.is_active = true
  );
$$;

revoke all on function public.is_haven_moderator(uuid) from public;
grant execute on function public.is_haven_moderator(uuid) to authenticated, service_role;

alter table public.dm_message_report_actions enable row level security;

drop policy if exists dm_message_reports_select_reporter on public.dm_message_reports;
drop policy if exists dm_message_reports_select_reporter_or_staff on public.dm_message_reports;
create policy dm_message_reports_select_reporter_or_staff
on public.dm_message_reports
for select
to authenticated
using (
  reporter_user_id = auth.uid()
  or public.is_haven_moderator(auth.uid())
);

drop policy if exists dm_message_reports_update_staff on public.dm_message_reports;
create policy dm_message_reports_update_staff
on public.dm_message_reports
for update
to authenticated
using (public.is_haven_moderator(auth.uid()))
with check (public.is_haven_moderator(auth.uid()));

drop policy if exists dm_message_report_actions_select_staff on public.dm_message_report_actions;
create policy dm_message_report_actions_select_staff
on public.dm_message_report_actions
for select
to authenticated
using (public.is_haven_moderator(auth.uid()));

create or replace function public.add_dm_message_report_action(
  p_report_id uuid,
  p_action_type text,
  p_notes text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_report_exists boolean := false;
  v_action_type text := trim(coalesce(p_action_type, ''));
  v_notes text := nullif(trim(coalesce(p_notes, '')), '');
  v_action_id uuid;
begin
  if v_me is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  if not public.is_haven_moderator(v_me) then
    raise exception 'Only Haven staff can add DM moderation actions.' using errcode = '42501';
  end if;

  if p_report_id is null then
    raise exception 'Report id is required.';
  end if;

  if char_length(v_action_type) < 1 or char_length(v_action_type) > 64 then
    raise exception 'Action type must be between 1 and 64 characters.';
  end if;

  select exists (
    select 1
    from public.dm_message_reports r
    where r.id = p_report_id
  )
  into v_report_exists;

  if not v_report_exists then
    raise exception 'DM message report not found.';
  end if;

  insert into public.dm_message_report_actions (
    report_id,
    acted_by_user_id,
    action_type,
    notes,
    metadata
  )
  values (
    p_report_id,
    v_me,
    v_action_type,
    v_notes,
    coalesce(p_metadata, '{}'::jsonb)
  )
  returning id into v_action_id;

  return v_action_id;
end;
$$;

revoke all on function public.add_dm_message_report_action(uuid, text, text, jsonb) from public;
grant execute on function public.add_dm_message_report_action(uuid, text, text, jsonb) to authenticated;

create or replace function public.list_dm_message_reports_for_review(
  p_statuses public.dm_message_report_status[] default null,
  p_limit integer default 50,
  p_before_created_at timestamptz default null,
  p_before_report_id uuid default null
)
returns table(
  report_id uuid,
  conversation_id uuid,
  message_id uuid,
  status public.dm_message_report_status,
  kind text,
  comment text,
  created_at timestamptz,
  updated_at timestamptz,
  reporter_user_id uuid,
  reporter_username text,
  reporter_avatar_url text,
  reported_user_id uuid,
  reported_username text,
  reported_avatar_url text,
  assigned_to_user_id uuid,
  assigned_to_username text,
  assigned_at timestamptz,
  message_created_at timestamptz,
  message_deleted_at timestamptz,
  message_preview text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  if not public.is_haven_moderator(auth.uid()) then
    raise exception 'Only Haven staff can review DM reports.' using errcode = '42501';
  end if;

  return query
  with bounded as (
    select greatest(1, least(coalesce(p_limit, 50), 100)) as next_limit
  )
  select
    r.id as report_id,
    r.conversation_id,
    r.message_id,
    r.status,
    r.kind,
    r.comment,
    r.created_at,
    r.updated_at,
    r.reporter_user_id,
    reporter.username as reporter_username,
    reporter.avatar_url as reporter_avatar_url,
    r.reported_user_id,
    reported.username as reported_username,
    reported.avatar_url as reported_avatar_url,
    r.assigned_to_user_id,
    assignee.username as assigned_to_username,
    r.assigned_at,
    dm.created_at as message_created_at,
    dm.deleted_at as message_deleted_at,
    case
      when char_length(dm.content) > 220 then substring(dm.content from 1 for 220) || '...'
      else dm.content
    end as message_preview
  from public.dm_message_reports r
  join public.dm_messages dm
    on dm.id = r.message_id
  left join public.profiles reporter
    on reporter.id = r.reporter_user_id
  left join public.profiles reported
    on reported.id = r.reported_user_id
  left join public.profiles assignee
    on assignee.id = r.assigned_to_user_id
  cross join bounded b
  where (
      p_statuses is null
      or coalesce(array_length(p_statuses, 1), 0) = 0
      or r.status = any (p_statuses)
    )
    and (
      p_before_created_at is null
      or r.created_at < p_before_created_at
      or (
        p_before_report_id is not null
        and r.created_at = p_before_created_at
        and r.id < p_before_report_id
      )
    )
  order by r.created_at desc, r.id desc
  limit (select next_limit from bounded);
end;
$$;

revoke all on function public.list_dm_message_reports_for_review(
  public.dm_message_report_status[],
  integer,
  timestamptz,
  uuid
) from public;
grant execute on function public.list_dm_message_reports_for_review(
  public.dm_message_report_status[],
  integer,
  timestamptz,
  uuid
) to authenticated;

create or replace function public.get_dm_message_report_detail(p_report_id uuid)
returns table(
  report_id uuid,
  conversation_id uuid,
  message_id uuid,
  status public.dm_message_report_status,
  kind text,
  comment text,
  resolution_notes text,
  created_at timestamptz,
  updated_at timestamptz,
  reporter_user_id uuid,
  reporter_username text,
  reporter_avatar_url text,
  reported_user_id uuid,
  reported_username text,
  reported_avatar_url text,
  assigned_to_user_id uuid,
  assigned_to_username text,
  assigned_at timestamptz,
  message_author_user_id uuid,
  message_author_username text,
  message_author_avatar_url text,
  message_content text,
  message_metadata jsonb,
  message_created_at timestamptz,
  message_edited_at timestamptz,
  message_deleted_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  if not public.is_haven_moderator(auth.uid()) then
    raise exception 'Only Haven staff can review DM reports.' using errcode = '42501';
  end if;

  return query
  select
    r.id as report_id,
    r.conversation_id,
    r.message_id,
    r.status,
    r.kind,
    r.comment,
    r.resolution_notes,
    r.created_at,
    r.updated_at,
    r.reporter_user_id,
    reporter.username as reporter_username,
    reporter.avatar_url as reporter_avatar_url,
    r.reported_user_id,
    reported.username as reported_username,
    reported.avatar_url as reported_avatar_url,
    r.assigned_to_user_id,
    assignee.username as assigned_to_username,
    r.assigned_at,
    dm.author_user_id as message_author_user_id,
    author.username as message_author_username,
    author.avatar_url as message_author_avatar_url,
    dm.content as message_content,
    dm.metadata as message_metadata,
    dm.created_at as message_created_at,
    dm.edited_at as message_edited_at,
    dm.deleted_at as message_deleted_at
  from public.dm_message_reports r
  join public.dm_messages dm
    on dm.id = r.message_id
  left join public.profiles reporter
    on reporter.id = r.reporter_user_id
  left join public.profiles reported
    on reported.id = r.reported_user_id
  left join public.profiles assignee
    on assignee.id = r.assigned_to_user_id
  left join public.profiles author
    on author.id = dm.author_user_id
  where r.id = p_report_id
  limit 1;
end;
$$;

revoke all on function public.get_dm_message_report_detail(uuid) from public;
grant execute on function public.get_dm_message_report_detail(uuid) to authenticated;

create or replace function public.list_dm_message_report_actions(p_report_id uuid)
returns table(
  action_id uuid,
  report_id uuid,
  acted_by_user_id uuid,
  acted_by_username text,
  acted_by_avatar_url text,
  action_type text,
  notes text,
  metadata jsonb,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  if not public.is_haven_moderator(auth.uid()) then
    raise exception 'Only Haven staff can review DM report actions.' using errcode = '42501';
  end if;

  return query
  select
    a.id as action_id,
    a.report_id,
    a.acted_by_user_id,
    actor.username as acted_by_username,
    actor.avatar_url as acted_by_avatar_url,
    a.action_type,
    a.notes,
    a.metadata,
    a.created_at
  from public.dm_message_report_actions a
  left join public.profiles actor
    on actor.id = a.acted_by_user_id
  where a.report_id = p_report_id
  order by a.created_at desc, a.id desc;
end;
$$;

revoke all on function public.list_dm_message_report_actions(uuid) from public;
grant execute on function public.list_dm_message_report_actions(uuid) to authenticated;

create or replace function public.list_dm_message_context(
  p_message_id uuid,
  p_before integer default 20,
  p_after integer default 20
)
returns table(
  message_id uuid,
  conversation_id uuid,
  author_user_id uuid,
  author_username text,
  author_avatar_url text,
  content text,
  metadata jsonb,
  created_at timestamptz,
  edited_at timestamptz,
  deleted_at timestamptz,
  is_target boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_before integer := greatest(0, least(coalesce(p_before, 20), 100));
  v_after integer := greatest(0, least(coalesce(p_after, 20), 100));
begin
  if auth.uid() is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  if not public.is_haven_moderator(auth.uid()) then
    raise exception 'Only Haven staff can review DM context.' using errcode = '42501';
  end if;

  if p_message_id is null then
    raise exception 'DM message id is required.';
  end if;

  return query
  with target as (
    select dm.id, dm.conversation_id
    from public.dm_messages dm
    where dm.id = p_message_id
    limit 1
  ),
  ordered as (
    select
      dm.id as message_id,
      dm.conversation_id,
      dm.author_user_id,
      p.username as author_username,
      p.avatar_url as author_avatar_url,
      dm.content,
      dm.metadata,
      dm.created_at,
      dm.edited_at,
      dm.deleted_at,
      row_number() over (order by dm.created_at asc, dm.id asc) as row_num
    from public.dm_messages dm
    join target t
      on t.conversation_id = dm.conversation_id
    left join public.profiles p
      on p.id = dm.author_user_id
  ),
  target_row as (
    select o.row_num
    from ordered o
    where o.message_id = p_message_id
    limit 1
  )
  select
    o.message_id,
    o.conversation_id,
    o.author_user_id,
    o.author_username,
    o.author_avatar_url,
    o.content,
    o.metadata,
    o.created_at,
    o.edited_at,
    o.deleted_at,
    (o.message_id = p_message_id) as is_target
  from ordered o
  cross join target_row tr
  where o.row_num between greatest(1, tr.row_num - v_before) and (tr.row_num + v_after)
  order by o.created_at asc, o.message_id asc;

  if not found then
    raise exception 'DM message not found.';
  end if;
end;
$$;

revoke all on function public.list_dm_message_context(uuid, integer, integer) from public;
grant execute on function public.list_dm_message_context(uuid, integer, integer) to authenticated;

create or replace function public.assign_dm_message_report(
  p_report_id uuid,
  p_assignee_user_id uuid default null,
  p_notes text default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_report public.dm_message_reports%rowtype;
  v_now timestamptz := timezone('utc', now());
  v_notes text := nullif(trim(coalesce(p_notes, '')), '');
begin
  if v_me is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  if not public.is_haven_moderator(v_me) then
    raise exception 'Only Haven staff can assign DM reports.' using errcode = '42501';
  end if;

  if p_report_id is null then
    raise exception 'DM report id is required.';
  end if;

  if p_assignee_user_id is not null and not public.is_haven_moderator(p_assignee_user_id) then
    raise exception 'Assignee must be active Haven staff.';
  end if;

  select *
  into v_report
  from public.dm_message_reports r
  where r.id = p_report_id
  for update;

  if not found then
    raise exception 'DM message report not found.';
  end if;

  update public.dm_message_reports
  set
    assigned_to_user_id = p_assignee_user_id,
    assigned_at = case when p_assignee_user_id is null then null else v_now end,
    updated_at = v_now
  where id = p_report_id;

  perform public.add_dm_message_report_action(
    p_report_id,
    case when p_assignee_user_id is null then 'unassign' else 'assign' end,
    v_notes,
    jsonb_build_object(
      'previousAssigneeUserId', v_report.assigned_to_user_id,
      'nextAssigneeUserId', p_assignee_user_id
    )
  );

  return true;
end;
$$;

revoke all on function public.assign_dm_message_report(uuid, uuid, text) from public;
grant execute on function public.assign_dm_message_report(uuid, uuid, text) to authenticated;

create or replace function public.update_dm_message_report_status(
  p_report_id uuid,
  p_status public.dm_message_report_status,
  p_notes text default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_report public.dm_message_reports%rowtype;
  v_now timestamptz := timezone('utc', now());
  v_notes text := nullif(trim(coalesce(p_notes, '')), '');
begin
  if v_me is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  if not public.is_haven_moderator(v_me) then
    raise exception 'Only Haven staff can update DM report status.' using errcode = '42501';
  end if;

  if p_report_id is null then
    raise exception 'DM report id is required.';
  end if;

  if p_status is null then
    raise exception 'DM report status is required.';
  end if;

  select *
  into v_report
  from public.dm_message_reports r
  where r.id = p_report_id
  for update;

  if not found then
    raise exception 'DM message report not found.';
  end if;

  update public.dm_message_reports
  set
    status = p_status,
    resolution_notes = case
      when p_status in ('resolved_actioned', 'resolved_no_action', 'dismissed') and v_notes is not null
        then v_notes
      else resolution_notes
    end,
    updated_at = v_now
  where id = p_report_id;

  perform public.add_dm_message_report_action(
    p_report_id,
    'status_change',
    v_notes,
    jsonb_build_object(
      'previousStatus', v_report.status,
      'nextStatus', p_status
    )
  );

  return true;
end;
$$;

revoke all on function public.update_dm_message_report_status(uuid, public.dm_message_report_status, text) from public;
grant execute on function public.update_dm_message_report_status(uuid, public.dm_message_report_status, text)
  to authenticated;

-- Realtime publication for staff review panel refreshes.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'dm_message_reports'
    ) then
      alter publication supabase_realtime add table public.dm_message_reports;
    end if;

    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'dm_message_report_actions'
    ) then
      alter publication supabase_realtime add table public.dm_message_report_actions;
    end if;
  end if;
end $$;
