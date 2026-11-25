-- 8 of 9. Safety: reports to a community's moderators, cases for Haven staff,
-- decisions, evidence, and the handling of apparent CSAM.
-- The product rules are in docs/architecture/REPORTING.md.

create type public.report_subject as enum ('message', 'member');
create type public.report_status as enum ('open', 'in_review', 'resolved', 'dismissed', 'escalated');
create type public.case_source as enum ('message', 'profile', 'escalation', 'media_scan');
create type public.case_status as enum ('open', 'in_review', 'actioned', 'no_action', 'dismissed');
create type public.case_action as enum ('content_removed', 'user_suspended', 'user_banned');
create type public.case_event_kind as enum (
  'filed', 'status_changed', 'note', 'decision', 'decision_reversed',
  'csam_flagged', 'ncmec_recorded', 'media_viewed', 'media_quarantined'
);

-- ── Community reports: for one community's moderators ───────────────────────
create table public.community_reports (
  id uuid primary key default private.uuid_v7(),
  community_id uuid not null references public.communities (id) on delete cascade,
  reporter_id uuid not null references public.profiles (id),
  subject_kind public.report_subject not null,
  -- The person reported, or the author of the reported message.
  subject_user_id uuid not null references public.profiles (id),
  subject_message_id uuid references public.messages (id) on delete set null,
  reason text check (char_length(reason) <= 2000),
  -- What was reported, as it was, written by the database when filing. It is
  -- still here after the message is deleted.
  snapshot jsonb not null,
  status public.report_status not null default 'open',
  escalated_case_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint community_reports_not_self check (reporter_id <> subject_user_id)
);
create index community_reports_community on public.community_reports (community_id, id desc);
create index community_reports_reporter on public.community_reports (reporter_id);
-- Deleting a message clears it from any report about it.
create index community_reports_message on public.community_reports (subject_message_id)
  where subject_message_id is not null;
create trigger community_reports_touch before update on public.community_reports
  for each row execute function private.touch_updated_at();
alter table public.community_reports enable row level security;
-- No policy: moderators read through list_community_reports, which leaves
-- out who filed the report.

create table public.community_report_notes (
  id uuid primary key default private.uuid_v7(),
  report_id uuid not null references public.community_reports (id) on delete cascade,
  author_id uuid not null references public.profiles (id),
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index community_report_notes_report on public.community_report_notes (report_id);
alter table public.community_report_notes enable row level security;

-- What a moderator sees of a report: everything except the reporter.
create type public.community_report_record as (
  id uuid,
  community_id uuid,
  subject_kind public.report_subject,
  subject_user_id uuid,
  subject_message_id uuid,
  reason text,
  snapshot jsonb,
  status public.report_status,
  created_at timestamptz,
  updated_at timestamptz
);

-- ── Platform cases: for Haven staff ─────────────────────────────────────────
create table public.platform_cases (
  id uuid primary key default private.uuid_v7(),
  source public.case_source not null,
  -- Null only when a scanner opened the case.
  reporter_id uuid references public.profiles (id),
  subject_user_id uuid not null references public.profiles (id),
  community_id uuid references public.communities (id) on delete set null,
  community_report_id uuid references public.community_reports (id) on delete set null,
  subject_message_id uuid references public.messages (id) on delete set null,
  reason text check (char_length(reason) <= 2000),
  snapshot jsonb not null,
  status public.case_status not null default 'open',
  csam_flagged_at timestamptz,
  csam_flagged_by uuid references public.profiles (id),
  ncmec_report_id text,
  -- Before this date nothing can delete the case or its files, not even SQL.
  preserve_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint platform_cases_not_self check (reporter_id is null or reporter_id <> subject_user_id)
);
create index platform_cases_status on public.platform_cases (status, id desc);
create index platform_cases_reporter on public.platform_cases (reporter_id);
create index platform_cases_subject on public.platform_cases (subject_user_id);
create index platform_cases_message on public.platform_cases (subject_message_id)
  where subject_message_id is not null;
create trigger platform_cases_touch before update on public.platform_cases
  for each row execute function private.touch_updated_at();

alter table public.community_reports
  add constraint community_reports_case_fk
  foreign key (escalated_case_id) references public.platform_cases (id) on delete set null;

-- Everything that happened to a case, in order. Rows are only ever added.
create table public.platform_case_events (
  id uuid primary key default private.uuid_v7(),
  case_id uuid not null references public.platform_cases (id) on delete cascade,
  kind public.case_event_kind not null,
  actor_id uuid references public.profiles (id),
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index platform_case_events_case on public.platform_case_events (case_id, id);

-- The outcome. A case has at most one decision in force; a reversed one stays
-- as history.
create table public.platform_case_decisions (
  id uuid primary key default private.uuid_v7(),
  case_id uuid not null references public.platform_cases (id) on delete cascade,
  -- Empty means "looked at, no action".
  actions public.case_action[] not null default '{}',
  rule text check (char_length(rule) <= 500),
  -- Shown to the person the decision is about.
  reason text check (char_length(reason) <= 2000),
  decided_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  reversed_at timestamptz,
  reversed_by uuid references public.profiles (id),
  reversal_reason text
);
create unique index platform_case_decisions_one_live on public.platform_case_decisions (case_id)
  where reversed_at is null;

-- The files a case holds as evidence. While a row is here the file cannot be
-- deleted, whatever happens to the message, the account or the community.
create table public.case_media (
  case_id uuid not null references public.platform_cases (id) on delete cascade,
  media_id uuid not null references public.media (id),
  primary key (case_id, media_id)
);
create index case_media_media on public.case_media (media_id);

alter table public.account_restrictions
  add constraint account_restrictions_case_fk foreign key (case_id) references public.platform_cases (id),
  add constraint account_restrictions_decision_fk foreign key (decision_id) references public.platform_case_decisions (id);
alter table public.notifications
  add constraint notifications_case_fk foreign key (case_id) references public.platform_cases (id) on delete cascade;

create function private.media_is_held(p_media_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.case_media cm where cm.media_id = p_media_id);
$$;

-- The preservation hold. This is a trigger, not a missing grant, so it also
-- stops the service role and a person at a SQL prompt.
create function private.block_preserved_delete()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_until timestamptz;
begin
  if tg_table_name = 'platform_cases' then
    v_until := old.preserve_until;
  else
    select c.preserve_until into v_until from public.platform_cases c where c.id = old.case_id;
  end if;
  if v_until is not null and v_until > now() then
    raise exception 'This case is under a preservation hold until %.', v_until
      using errcode = '42501', detail = 'preservation_hold';
  end if;
  return old;
end;
$$;
create trigger platform_cases_hold before delete on public.platform_cases
  for each row execute function private.block_preserved_delete();
create trigger case_media_hold before delete on public.case_media
  for each row execute function private.block_preserved_delete();

-- ── Row level security ──────────────────────────────────────────────────────
-- Nobody handles a report about themselves: a moderator does not see the
-- reports about them, and a staff member does not see the cases about them.
-- These two functions are that rule, for RLS and for every RPC below.
create function private.can_read_report(p_report_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.community_reports r
    where r.id = p_report_id
      and r.subject_user_id <> p_user_id
      and private.has_permission(r.community_id, p_user_id, 'manage_reports')
  );
$$;

create function private.can_read_case(p_case_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_staff(p_user_id) and exists (
    select 1 from public.platform_cases c
    where c.id = p_case_id and not private.staff_is(p_user_id, c.subject_user_id)
  );
$$;
grant execute on function private.can_read_report(uuid, uuid) to authenticated;
grant execute on function private.can_read_case(uuid, uuid) to authenticated;

alter table public.platform_cases enable row level security;
alter table public.platform_case_events enable row level security;
alter table public.platform_case_decisions enable row level security;
alter table public.case_media enable row level security;

create policy "staff" on public.platform_cases
  for select to authenticated
  using (private.is_staff_session() and not private.staff_is((select auth.uid()), subject_user_id));
create policy "staff" on public.platform_case_events
  for select to authenticated
  using (private.has_second_factor() and private.can_read_case(case_id, (select auth.uid())));
create policy "staff" on public.platform_case_decisions
  for select to authenticated
  using (private.has_second_factor() and private.can_read_case(case_id, (select auth.uid())));
create policy "staff" on public.case_media
  for select to authenticated
  using (private.has_second_factor() and private.can_read_case(case_id, (select auth.uid())));
create policy "report managers" on public.community_report_notes
  for select to authenticated using (private.can_read_report(report_id, (select auth.uid())));

grant select on public.platform_cases, public.platform_case_events, public.platform_case_decisions,
  public.case_media, public.community_report_notes to authenticated;

-- ── Helpers ─────────────────────────────────────────────────────────────────
-- The first line of every staff RPC: an active staff account, signed in with
-- a second factor. A password alone does no staff work.
create function private.require_staff()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.require_account();
begin
  if not private.is_staff(v_me) then
    perform private.fail('forbidden', 'staff_only', 'Only Haven staff can do that.');
  end if;
  if not private.has_second_factor() then
    perform private.fail('forbidden', 'second_factor_required',
      'Sign in with your authenticator app to do staff work.');
  end if;
  return v_me;
end;
$$;

create function private.staff_ids()
returns uuid[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(s.user_id), '{}'::uuid[]) from public.platform_staff s where s.active;
$$;

create function private.add_case_event(
  p_case_id uuid,
  p_kind public.case_event_kind,
  p_actor_id uuid,
  p_detail jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.platform_case_events (case_id, kind, actor_id, detail)
  values (p_case_id, p_kind, p_actor_id, coalesce(p_detail, '{}'::jsonb));
  perform private.broadcast(
    array(select s from unnest(private.staff_ids()) s where private.can_read_case(p_case_id, s)),
    'case.changed', jsonb_build_object('id', p_case_id));
end;
$$;

-- The case, locked, if this staff member may handle it.
create function private.require_case(p_case_id uuid, p_user_id uuid)
returns public.platform_cases
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.platform_cases;
begin
  select * into v_row from public.platform_cases c where c.id = p_case_id for update;
  if v_row.id is null or private.staff_is(p_user_id, v_row.subject_user_id) then
    perform private.fail('not_found', 'case_not_found', 'That case could not be found.');
  end if;
  return v_row;
end;
$$;

-- Five reports in ten minutes and twenty in a day, across both kinds.
create function private.report_rate_limit(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.rate_limit(p_user_id, 'report', 5, interval '10 minutes');
  perform private.rate_limit(p_user_id, 'report_daily', 20, interval '1 day');
end;
$$;

create function private.person_snapshot(p_user_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object('id', p.id, 'username', p.username, 'bio', p.bio, 'avatar_media_id', p.avatar_media_id)
  from public.profiles p where p.id = p_user_id;
$$;

-- The reported message with up to ten messages before and after it, the
-- names involved, and where it was said.
create function private.message_snapshot(p_message_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'message', jsonb_build_object(
      'id', m.id, 'body', m.body, 'created_at', m.created_at, 'edited_at', m.edited_at,
      'attachments', coalesce((
        select jsonb_agg(jsonb_build_object('media_id', f.id, 'filename', f.filename, 'mime_type', f.mime_type))
        from public.media f where f.message_id = m.id
      ), '[]'::jsonb)),
    'author', private.person_snapshot(m.author_id),
    'channel', jsonb_build_object('id', ch.id, 'kind', ch.kind, 'name', ch.name),
    'community', (select jsonb_build_object('id', c.id, 'name', c.name) from public.communities c where c.id = ch.community_id),
    'context', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', n.id, 'author_id', n.author_id, 'username', p.username, 'body', n.body, 'created_at', n.created_at
      ) order by n.id)
      from (
        (select * from public.messages b where b.channel_id = m.channel_id and b.id < m.id order by b.id desc limit 10)
        union all
        (select * from public.messages a where a.channel_id = m.channel_id and a.id > m.id order by a.id limit 10)
      ) n
      join public.profiles p on p.id = n.author_id
    ), '[]'::jsonb))
  from public.messages m
  join public.channels ch on ch.id = m.channel_id
  where m.id = p_message_id;
$$;

-- Who reads a community's reports: the owner and holders of manage_reports,
-- never the person the report is about.
create function private.report_reader_ids(p_community_id uuid, p_subject_user_id uuid)
returns uuid[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(m.user_id), '{}'::uuid[])
  from public.community_members m
  where m.community_id = p_community_id
    and m.user_id <> p_subject_user_id
    and private.has_permission(p_community_id, m.user_id, 'manage_reports');
$$;

create function private.community_report_record(r public.community_reports)
returns public.community_report_record
language sql
immutable
set search_path = ''
as $$
  select row(r.id, r.community_id, r.subject_kind, r.subject_user_id, r.subject_message_id,
             r.reason, r.snapshot, r.status, r.created_at, r.updated_at)::public.community_report_record;
$$;

create function private.announce_report(p_report public.community_reports, p_event text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.broadcast(
    private.report_reader_ids(p_report.community_id, p_report.subject_user_id),
    p_event, to_jsonb(private.community_report_record(p_report)));
end;
$$;

-- Open a case: the row, its first log line, the files it holds, the mail to
-- staff, and the "received" notice to whoever reported it.
create function private.open_case(
  p_source public.case_source,
  p_reporter_id uuid,
  p_subject_user_id uuid,
  p_community_id uuid,
  p_community_report_id uuid,
  p_subject_message_id uuid,
  p_reason text,
  p_snapshot jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_case_id uuid;
begin
  insert into public.platform_cases (
    source, reporter_id, subject_user_id, community_id, community_report_id, subject_message_id, reason, snapshot)
  values (
    p_source, p_reporter_id, p_subject_user_id, p_community_id, p_community_report_id, p_subject_message_id,
    p_reason, p_snapshot)
  returning id into v_case_id;

  insert into public.case_media (case_id, media_id)
  select v_case_id, f.id from public.media f where f.message_id = p_subject_message_id
  union
  select v_case_id, p.avatar_media_id from public.profiles p
  where p_source = 'profile' and p.id = p_subject_user_id and p.avatar_media_id is not null;

  perform private.add_case_event(v_case_id, 'filed', p_reporter_id, jsonb_build_object('source', p_source));
  perform private.enqueue_job('email_send',
    jsonb_build_object('template', 'staff_case_opened', 'case_id', v_case_id), 'case-opened:' || v_case_id);
  perform private.notify(p_reporter_id, 'report_received', null, 'Report received',
    'Haven staff will review your report.', null, null, null, v_case_id);
  return v_case_id;
end;
$$;

-- ── RPCs for members ────────────────────────────────────────────────────────
-- "This breaks this community's rules." Goes to the community's moderators.
create function public.file_community_report(
  p_community_id uuid,
  p_subject_kind public.report_subject,
  p_subject_id uuid,
  p_reason text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.require_user();
  v_reason text := left(private.clean_text(p_reason), 2000);
  v_message public.messages;
  v_subject_user_id uuid;
  v_snapshot jsonb;
  v_row public.community_reports;
begin
  perform private.require_permission(p_community_id, v_me, 'create_reports');
  if v_reason is null and (select c.report_reason_required from public.communities c where c.id = p_community_id) then
    perform private.fail('invalid', 'reason_required', 'Say what is wrong so the moderators know what to look at.');
  end if;

  if p_subject_kind = 'message' then
    select m.* into v_message
    from public.messages m join public.channels ch on ch.id = m.channel_id
    where m.id = p_subject_id and ch.community_id = p_community_id;
    if v_message.id is null or not private.can_view_channel(v_message.channel_id, v_me) then
      perform private.fail('not_found', 'message_not_found', 'That message could not be found.');
    end if;
    v_subject_user_id := v_message.author_id;
    v_snapshot := private.message_snapshot(v_message.id);
  else
    if not private.is_member(p_community_id, p_subject_id) then
      perform private.fail('not_found', 'member_not_found', 'That person is not a member.');
    end if;
    v_subject_user_id := p_subject_id;
    v_snapshot := jsonb_build_object('member', private.person_snapshot(p_subject_id));
  end if;
  if v_subject_user_id = v_me then
    perform private.fail('invalid', 'cannot_report_self', 'You cannot report yourself.');
  end if;

  -- A second tap returns the report that is already open.
  select * into v_row from public.community_reports r
  where r.community_id = p_community_id and r.reporter_id = v_me and r.status in ('open', 'in_review')
    and r.subject_kind = p_subject_kind and r.subject_user_id = v_subject_user_id
    and r.subject_message_id is not distinct from v_message.id;
  if v_row.id is not null then
    return v_row.id;
  end if;

  perform private.report_rate_limit(v_me);
  insert into public.community_reports (
    community_id, reporter_id, subject_kind, subject_user_id, subject_message_id, reason, snapshot)
  values (p_community_id, v_me, p_subject_kind, v_subject_user_id, v_message.id, v_reason, v_snapshot)
  returning * into v_row;
  perform private.announce_report(v_row, 'report.created');
  return v_row.id;
end;
$$;

-- "This is illegal or dangerous", or a report about a profile. Goes to Haven
-- staff. Any message the reporter can see, in a community or a conversation.
create function public.file_platform_case(
  p_subject_kind public.case_source,
  p_subject_id uuid,
  p_reason text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.require_user();
  v_reason text := left(private.clean_text(p_reason), 2000);
  v_message public.messages;
  v_subject_user_id uuid;
  v_community_id uuid;
  v_snapshot jsonb;
  v_case_id uuid;
begin
  if p_subject_kind = 'message' then
    select * into v_message from public.messages m where m.id = p_subject_id for update;
    if v_message.id is null or not private.can_view_channel(v_message.channel_id, v_me) then
      perform private.fail('not_found', 'message_not_found', 'That message could not be found.');
    end if;
    v_subject_user_id := v_message.author_id;
    select ch.community_id into v_community_id from public.channels ch where ch.id = v_message.channel_id;
    v_snapshot := private.message_snapshot(v_message.id);
  elsif p_subject_kind = 'profile' then
    if not exists (select 1 from public.profiles p where p.id = p_subject_id and p.deleted_at is null) then
      perform private.fail('not_found', 'user_not_found', 'That person could not be found.');
    end if;
    v_subject_user_id := p_subject_id;
    v_snapshot := jsonb_build_object('profile', private.person_snapshot(p_subject_id));
  else
    perform private.fail('invalid', 'subject_invalid', 'Report a message or a profile.');
  end if;
  if v_subject_user_id = v_me then
    perform private.fail('invalid', 'cannot_report_self', 'You cannot report yourself.');
  end if;

  select c.id into v_case_id from public.platform_cases c
  where c.reporter_id = v_me and c.status in ('open', 'in_review') and c.source = p_subject_kind
    and c.subject_user_id = v_subject_user_id and c.subject_message_id is not distinct from v_message.id;
  if v_case_id is not null then
    return v_case_id;
  end if;

  perform private.report_rate_limit(v_me);
  return private.open_case(p_subject_kind, v_me, v_subject_user_id, v_community_id, null, v_message.id, v_reason, v_snapshot);
end;
$$;

-- The status, and for a case the outcome, of everything the caller reported.
create function public.list_my_reports()
returns table (id uuid, audience text, status text, created_at timestamptz, updated_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select r.id, 'community', r.status::text, r.created_at, r.updated_at
  from public.community_reports r where r.reporter_id = auth.uid()
  union all
  select c.id, 'haven', c.status::text, c.created_at, c.updated_at
  from public.platform_cases c where c.reporter_id = auth.uid()
  order by 1 desc;
$$;

-- Decisions in force about the caller, with the rule and the reason.
create function public.list_decisions_about_me()
returns table (
  case_id uuid, actions public.case_action[], rule text, reason text,
  restricted_until timestamptz, decided_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select d.case_id, d.actions, d.rule, d.reason, r.ends_at, d.created_at
  from public.platform_case_decisions d
  join public.platform_cases c on c.id = d.case_id
  left join public.account_restrictions r on r.decision_id = d.id
  where c.subject_user_id = auth.uid() and d.reversed_at is null and cardinality(d.actions) > 0
  order by d.id desc;
$$;

-- ── RPCs for moderators ─────────────────────────────────────────────────────
create function private.require_report(p_report_id uuid, p_user_id uuid)
returns public.community_reports
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.community_reports;
begin
  select * into v_row from public.community_reports r where r.id = p_report_id for update;
  if v_row.id is null or not private.can_read_report(p_report_id, p_user_id) then
    perform private.fail('not_found', 'report_not_found', 'That report could not be found.');
  end if;
  return v_row;
end;
$$;

create function public.list_community_reports(p_community_id uuid)
returns setof public.community_report_record
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.require_user();
begin
  perform private.require_permission(p_community_id, v_me, 'manage_reports');
  return query
  select (private.community_report_record(r)).*
  from public.community_reports r
  where r.community_id = p_community_id and r.subject_user_id <> v_me
  order by r.id desc;
end;
$$;

-- Escalated is final from the community's side. When a report is closed the
-- person who filed it is told that it was looked at, not what was decided.
create function public.set_community_report_status(p_report_id uuid, p_status public.report_status)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.require_user();
  v_row public.community_reports := private.require_report(p_report_id, v_me);
  v_was public.report_status := v_row.status;
begin
  if v_row.status = 'escalated' or p_status = 'escalated' then
    perform private.fail('conflict', 'report_escalated', 'An escalated report is with Haven staff. Use escalate to send one.');
  end if;
  update public.community_reports r set status = p_status where r.id = p_report_id returning * into v_row;
  perform private.announce_report(v_row, 'report.updated');
  if p_status in ('resolved', 'dismissed') and v_was not in ('resolved', 'dismissed') then
    perform private.notify(v_row.reporter_id, 'report_outcome', null, 'Your report was reviewed',
      'The moderators of ' || (select c.name from public.communities c where c.id = v_row.community_id)
        || ' reviewed your report.',
      v_row.community_id);
  end if;
end;
$$;

create function public.add_community_report_note(p_report_id uuid, p_body text)
returns public.community_report_notes
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.require_user();
  v_row public.community_reports := private.require_report(p_report_id, v_me);
  v_note public.community_report_notes;
begin
  if private.clean_text(p_body) is null or char_length(private.clean_text(p_body)) > 2000 then
    perform private.fail('invalid', 'note_invalid', 'A note is 1 to 2000 characters.');
  end if;
  insert into public.community_report_notes (report_id, author_id, body)
  values (p_report_id, v_me, private.clean_text(p_body))
  returning * into v_note;
  perform private.announce_report(v_row, 'report.updated');
  return v_note;
end;
$$;

-- Hand a report to Haven staff. One transaction: the case, the link both
-- ways, and the report marked escalated. The moderator becomes the case's
-- reporter; who first reported it is kept in the snapshot for staff.
create function public.escalate_community_report(p_report_id uuid, p_reason text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.require_user();
  v_row public.community_reports := private.require_report(p_report_id, v_me);
  v_case_id uuid;
begin
  if v_row.status = 'escalated' then
    return v_row.escalated_case_id;
  end if;
  v_case_id := private.open_case(
    'escalation', v_me, v_row.subject_user_id, v_row.community_id, v_row.id, v_row.subject_message_id,
    coalesce(left(private.clean_text(p_reason), 2000), v_row.reason),
    v_row.snapshot || jsonb_build_object(
      'original_report', jsonb_build_object(
        'reporter', private.person_snapshot(v_row.reporter_id), 'reason', v_row.reason, 'filed_at', v_row.created_at)));
  update public.community_reports r set status = 'escalated', escalated_case_id = v_case_id
  where r.id = p_report_id returning * into v_row;
  perform private.announce_report(v_row, 'report.updated');
  return v_case_id;
end;
$$;

-- ── RPCs for staff ──────────────────────────────────────────────────────────
create function public.staff_set_case_status(p_case_id uuid, p_status public.case_status)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.require_staff();
  v_case public.platform_cases := private.require_case(p_case_id, v_me);
begin
  if p_status in ('actioned', 'no_action') then
    perform private.fail('invalid', 'needs_decision', 'Record a decision to close a case with an outcome.');
  end if;
  update public.platform_cases c set status = p_status where c.id = p_case_id;
  perform private.add_case_event(p_case_id, 'status_changed', v_me,
    jsonb_build_object('from', v_case.status, 'to', p_status));
end;
$$;

create function public.staff_add_case_note(p_case_id uuid, p_body text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.require_staff();
begin
  perform private.require_case(p_case_id, v_me);
  if private.clean_text(p_body) is null then
    perform private.fail('invalid', 'note_invalid', 'A note cannot be empty.');
  end if;
  perform private.add_case_event(p_case_id, 'note', v_me, jsonb_build_object('body', left(private.clean_text(p_body), 4000)));
end;
$$;

-- Take the reported thing down: the message; for a profile report the
-- picture and bio; and the person's picture whenever it is one of the case's
-- files (a scanner match on a picture). The files stay as evidence because
-- the case holds them.
create function private.remove_case_content(p_case public.platform_cases)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_avatar uuid;
begin
  if p_case.subject_message_id is not null then
    perform private.delete_message(p_case.subject_message_id);
  end if;

  select p.avatar_media_id into v_avatar from public.profiles p where p.id = p_case.subject_user_id;
  if p_case.source = 'profile' then
    update public.profiles p set avatar_media_id = null, bio = null where p.id = p_case.subject_user_id;
  elsif exists (select 1 from public.case_media cm where cm.case_id = p_case.id and cm.media_id = v_avatar) then
    update public.profiles p set avatar_media_id = null where p.id = p_case.subject_user_id;
  else
    v_avatar := null;
  end if;
  if v_avatar is not null then
    perform private.release_media(v_avatar);
  end if;
end;
$$;

-- Record the outcome and apply it. Actions: remove the content, suspend the
-- person for 1 to 365 days, ban them. No actions means "no action".
-- The reporter is told the outcome; the person actioned is told what, which
-- rule and why, in the app and by email (they may no longer be able to sign in).
create function public.staff_record_decision(
  p_case_id uuid,
  p_actions public.case_action[],
  p_rule text default null,
  p_reason text default null,
  p_suspend_days integer default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.require_staff();
  v_case public.platform_cases := private.require_case(p_case_id, v_me);
  v_actions public.case_action[] := coalesce(p_actions, '{}');
  v_decision_id uuid;
  v_ends_at timestamptz;
begin
  if private.staff_is(v_me, v_case.reporter_id) then
    perform private.fail('forbidden', 'own_case', 'You cannot decide a case you reported.');
  end if;
  if exists (select 1 from public.platform_case_decisions d where d.case_id = p_case_id and d.reversed_at is null) then
    perform private.fail('conflict', 'already_decided', 'This case has a decision. Reverse it before recording another.');
  end if;
  if 'user_suspended' = any (v_actions) and 'user_banned' = any (v_actions) then
    perform private.fail('invalid', 'actions_invalid', 'Suspend or ban, not both.');
  end if;
  if 'user_suspended' = any (v_actions) and (p_suspend_days is null or p_suspend_days not between 1 and 365) then
    perform private.fail('invalid', 'suspend_days_invalid', 'A suspension lasts 1 to 365 days.');
  end if;
  if cardinality(v_actions) > 0 and (private.clean_text(p_rule) is null or private.clean_text(p_reason) is null) then
    perform private.fail('invalid', 'reason_required', 'An action needs the rule broken and a reason.');
  end if;
  if 'content_removed' = any (v_actions)
     and v_case.subject_message_id is null and v_case.source <> 'profile'
     and not exists (select 1 from public.case_media cm where cm.case_id = p_case_id) then
    perform private.fail('invalid', 'nothing_to_remove', 'This case has no content left to remove.');
  end if;

  insert into public.platform_case_decisions (case_id, actions, rule, reason, decided_by)
  values (p_case_id, v_actions, private.clean_text(p_rule), private.clean_text(p_reason), v_me)
  returning id into v_decision_id;

  if 'content_removed' = any (v_actions) then
    perform private.remove_case_content(v_case);
  end if;
  if 'user_suspended' = any (v_actions) or 'user_banned' = any (v_actions) then
    v_ends_at := case when 'user_suspended' = any (v_actions) then now() + make_interval(days => p_suspend_days) end;
    insert into public.account_restrictions (user_id, ends_at, case_id, decision_id)
    values (v_case.subject_user_id, v_ends_at, p_case_id, v_decision_id);
    -- Their apps sign out when they hear this.
    perform private.broadcast(array[v_case.subject_user_id], 'account.restricted',
                              jsonb_build_object('ends_at', v_ends_at));
  end if;

  update public.platform_cases c
  set status = case when cardinality(v_actions) > 0 then 'actioned' else 'no_action' end::public.case_status
  where c.id = p_case_id;
  perform private.add_case_event(p_case_id, 'decision', v_me,
    jsonb_build_object('decision_id', v_decision_id, 'actions', to_jsonb(v_actions)));

  perform private.notify(v_case.reporter_id, 'report_outcome', null, 'Your report was reviewed',
    case when cardinality(v_actions) > 0 then 'Haven staff took action on your report.'
         else 'Haven staff reviewed your report and did not find a violation.' end,
    null, null, null, p_case_id);
  if cardinality(v_actions) > 0 then
    perform private.notify(v_case.subject_user_id, 'moderation_decision', null, 'Haven staff took action on your account',
      'Rule: ' || private.clean_text(p_rule) || '. ' || private.clean_text(p_reason), null, null, null, p_case_id);
    perform private.enqueue_job('email_send',
      jsonb_build_object('template', 'statement_of_reasons', 'case_id', p_case_id, 'decision_id', v_decision_id),
      'decision:' || v_decision_id);
  end if;
  return v_decision_id;
end;
$$;

-- Undo a decision. The restriction that decision created is lifted, and only
-- that one. Removed content is not restored: it was deleted.
create function public.staff_reverse_decision(p_decision_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.require_staff();
  v_decision public.platform_case_decisions;
begin
  select * into v_decision from public.platform_case_decisions d
  where d.id = p_decision_id and d.reversed_at is null for update;
  if v_decision.id is null then
    perform private.fail('not_found', 'decision_not_found', 'That decision could not be found or was already reversed.');
  end if;
  perform private.require_case(v_decision.case_id, v_me);
  if private.clean_text(p_reason) is null then
    perform private.fail('invalid', 'reason_required', 'Say why the decision is being reversed.');
  end if;
  update public.platform_case_decisions d
  set reversed_at = now(), reversed_by = v_me, reversal_reason = private.clean_text(p_reason)
  where d.id = p_decision_id;
  update public.account_restrictions r set lifted_at = now(), lifted_by = v_me
  where r.decision_id = p_decision_id and r.lifted_at is null;
  update public.platform_cases c set status = 'in_review' where c.id = v_decision.case_id;
  perform private.add_case_event(v_decision.case_id, 'decision_reversed', v_me,
    jsonb_build_object('decision_id', p_decision_id, 'reason', private.clean_text(p_reason)));
end;
$$;

-- Mark a case as apparent CSAM. From this moment: its files are served to
-- nobody but a CSAM reviewer and are queued to be moved out of the buckets
-- people read from; the content is taken down; and nothing can delete the
-- case or its files for a year (18 U.S.C. 2258A(h)). Never cleared.
create function private.flag_csam(p_case_id uuid, p_actor_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_case public.platform_cases;
begin
  select * into v_case from public.platform_cases c where c.id = p_case_id for update;
  if v_case.csam_flagged_at is not null then
    return;
  end if;
  update public.platform_cases c
  set csam_flagged_at = now(), csam_flagged_by = p_actor_id, preserve_until = now() + interval '1 year'
  where c.id = p_case_id;
  update public.media f set withheld_at = now()
  where f.id in (select cm.media_id from public.case_media cm where cm.case_id = p_case_id) and f.withheld_at is null;
  perform private.enqueue_job('media_quarantine', jsonb_build_object('media_id', cm.media_id), cm.media_id::text)
  from public.case_media cm where cm.case_id = p_case_id;
  perform private.remove_case_content(v_case);
  perform private.add_case_event(p_case_id, 'csam_flagged', p_actor_id);
end;
$$;

create function public.staff_flag_csam(p_case_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.require_staff();
begin
  perform private.require_case(p_case_id, v_me);
  perform private.flag_csam(p_case_id, v_me);
end;
$$;

create function public.staff_record_ncmec_report(p_case_id uuid, p_ncmec_report_id text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.require_staff();
begin
  perform private.require_case(p_case_id, v_me);
  if private.clean_text(p_ncmec_report_id) is null then
    perform private.fail('invalid', 'report_id_required', 'Enter the CyberTipline report number.');
  end if;
  update public.platform_cases c set ncmec_report_id = private.clean_text(p_ncmec_report_id)
  where c.id = p_case_id and c.csam_flagged_at is not null;
  if not found then
    perform private.fail('conflict', 'not_flagged', 'Flag the case as CSAM before recording a report number.');
  end if;
  perform private.add_case_event(p_case_id, 'ncmec_recorded', v_me,
    jsonb_build_object('ncmec_report_id', private.clean_text(p_ncmec_report_id)));
end;
$$;

-- Open one evidence file. Writing the log line is what unlocks the file: the
-- storage policy below serves it only to someone with a view logged in the
-- last ten minutes. So there is no way to look without leaving a record.
create function public.staff_view_case_media(p_case_id uuid, p_media_id uuid)
returns table (bucket text, object_path text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.require_staff();
  v_media public.media;
begin
  perform private.require_case(p_case_id, v_me);
  select f.* into v_media
  from public.media f join public.case_media cm on cm.media_id = f.id
  where cm.case_id = p_case_id and f.id = p_media_id;
  if v_media.id is null then
    perform private.fail('not_found', 'media_not_found', 'That file is not part of this case.');
  end if;
  if v_media.withheld_at is not null
     and not exists (select 1 from public.platform_staff s where s.user_id = v_me and s.active and s.can_review_csam) then
    perform private.fail('forbidden', 'csam_reviewer_only', 'Only a CSAM reviewer can open this file.');
  end if;
  perform private.add_case_event(p_case_id, 'media_viewed', v_me, jsonb_build_object('media_id', p_media_id));
  return query select v_media.bucket, v_media.object_path;
end;
$$;

create function private.staff_can_read_evidence(p_bucket text, p_object_path text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.has_second_factor() and exists (
    select 1
    from public.media f
    join public.case_media cm on cm.media_id = f.id
    join public.platform_case_events e on e.case_id = cm.case_id
    join public.platform_staff s on s.user_id = e.actor_id and s.active
    where f.bucket = p_bucket
      and f.object_path = p_object_path
      and e.kind = 'media_viewed'
      and e.actor_id = auth.uid()
      and (e.detail ->> 'media_id')::uuid = f.id
      and e.created_at > now() - interval '10 minutes'
      and (f.withheld_at is null or s.can_review_csam)
  );
$$;
grant execute on function private.staff_can_read_evidence(text, text) to authenticated;

create policy "staff read evidence they just opened" on storage.objects
  for select to authenticated
  using (bucket_id in ('media', 'avatars', 'evidence') and private.staff_can_read_evidence(bucket_id, name));

-- ── Workers ─────────────────────────────────────────────────────────────────
-- The quarantine job moved a withheld file into the evidence bucket (same
-- path). Signed links to the old place stop working at that moment.
create function public.worker_media_to_quarantine(p_media_id uuid)
returns table (bucket text, object_path text)
language sql
stable
security definer
set search_path = ''
as $$
  select f.bucket, f.object_path from public.media f
  where f.id = p_media_id and f.withheld_at is not null and f.bucket <> 'evidence';
$$;

create function public.worker_media_quarantined(p_media_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.media f set bucket = 'evidence' where f.id = p_media_id and f.withheld_at is not null;
  perform private.add_case_event(cm.case_id, 'media_quarantined', null, jsonb_build_object('media_id', p_media_id))
  from public.case_media cm where cm.media_id = p_media_id;
end;
$$;

-- The scanner's answer for one file. A match opens a case that is already
-- CSAM-flagged; nothing else changes anything a person can see.
create function public.worker_record_media_scan(
  p_media_id uuid,
  p_status public.media_scan_status,
  p_vendor text,
  p_detail jsonb default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_media public.media;
  v_case_id uuid;
begin
  update public.media f
  set scan_status = p_status, scan_vendor = p_vendor, scan_detail = p_detail, scanned_at = now()
  where f.id = p_media_id
  returning * into v_media;
  if v_media.id is null or p_status <> 'match' then
    return null;
  end if;
  v_case_id := private.open_case(
    'media_scan', null, v_media.owner_id,
    (select ch.community_id from public.messages m join public.channels ch on ch.id = m.channel_id
     where m.id = v_media.message_id),
    null, v_media.message_id, 'Automatic scan match (' || coalesce(p_vendor, 'scanner') || ')',
    coalesce(private.message_snapshot(v_media.message_id), jsonb_build_object('profile', private.person_snapshot(v_media.owner_id)))
      || jsonb_build_object('scan', jsonb_build_object('media_id', p_media_id, 'vendor', p_vendor, 'detail', p_detail)));
  insert into public.case_media (case_id, media_id) values (v_case_id, p_media_id) on conflict do nothing;
  perform private.flag_csam(v_case_id, null);
  return v_case_id;
end;
$$;

-- When a scanner is switched on (private.set_setting('media_scan', 'on')),
-- every file is queued for it the moment it is put to use.
create function private.queue_media_scan()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if private.setting('media_scan') = 'on' then
    update public.media f set scan_status = 'pending' where f.id = new.id;
    perform private.enqueue_job('media_scan', jsonb_build_object('media_id', new.id), new.id::text);
  end if;
  return null;
end;
$$;
create trigger media_queue_scan after update of status on public.media
  for each row when (old.status = 'pending' and new.status = 'attached')
  execute function private.queue_media_scan();

-- What the mail worker sends for one job. to_email is null for mail to staff;
-- the worker knows the staff address.
create function public.worker_email_content(p_template text, p_case_id uuid, p_decision_id uuid default null)
returns table (to_email text, subject text, body text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_template = 'staff_case_opened' then
    return query
    select null::text,
           'New Haven case (' || c.source || ')',
           'A case was opened.' || E'\n\nCase: ' || c.id || E'\nSource: ' || c.source
             || E'\nReason: ' || coalesce(c.reason, '(none given)')
    from public.platform_cases c where c.id = p_case_id;
  elsif p_template = 'statement_of_reasons' then
    return query
    select u.email::text,
           'Haven staff took action on your account',
           'Haven staff reviewed a report about your account or content and took action.'
             || E'\n\nAction: ' || array_to_string(d.actions, ', ')
             || coalesce(E'\nUntil: ' || to_char(r.ends_at at time zone 'utc', 'YYYY-MM-DD HH24:MI "UTC"'), '')
             || E'\nRule: ' || d.rule || E'\nReason: ' || d.reason
             || E'\n\nIf you think this is a mistake, reply to this email.'
    from public.platform_case_decisions d
    join public.platform_cases c on c.id = d.case_id
    join auth.users u on u.id = c.subject_user_id
    left join public.account_restrictions r on r.decision_id = d.id
    where d.id = p_decision_id and c.id = p_case_id;
  end if;
end;
$$;

grant execute on function public.file_community_report(uuid, public.report_subject, uuid, text) to authenticated;
grant execute on function public.file_platform_case(public.case_source, uuid, text) to authenticated;
grant execute on function public.list_my_reports() to authenticated;
grant execute on function public.list_decisions_about_me() to authenticated;
grant execute on function public.list_community_reports(uuid) to authenticated;
grant execute on function public.set_community_report_status(uuid, public.report_status) to authenticated;
grant execute on function public.add_community_report_note(uuid, text) to authenticated;
grant execute on function public.escalate_community_report(uuid, text) to authenticated;
grant execute on function public.staff_set_case_status(uuid, public.case_status) to authenticated;
grant execute on function public.staff_add_case_note(uuid, text) to authenticated;
grant execute on function public.staff_record_decision(uuid, public.case_action[], text, text, integer) to authenticated;
grant execute on function public.staff_reverse_decision(uuid, text) to authenticated;
grant execute on function public.staff_flag_csam(uuid) to authenticated;
grant execute on function public.staff_record_ncmec_report(uuid, text) to authenticated;
grant execute on function public.staff_view_case_media(uuid, uuid) to authenticated;
grant execute on function public.worker_media_to_quarantine(uuid) to service_role;
grant execute on function public.worker_media_quarantined(uuid) to service_role;
grant execute on function public.worker_record_media_scan(uuid, public.media_scan_status, text, jsonb) to service_role;
grant execute on function public.worker_email_content(text, uuid, uuid) to service_role;
