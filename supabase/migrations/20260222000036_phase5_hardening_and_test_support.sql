-- Phase 5 hardening pass
-- Focus: abuse controls, moderation status-transition enforcement, mention safeguards,
-- username case-insensitive uniqueness hardening, and notification retention maintenance.

-- 1) Username case-insensitive uniqueness hardening (precheck + unique index).
do $$
declare
  v_conflicts text;
begin
  select string_agg(conflict_line, E'\n')
  into v_conflicts
  from (
    select format(
      '%s => %s',
      normalized_username,
      usernames
    ) as conflict_line
    from (
      select
        lower(trim(p.username)) as normalized_username,
        string_agg(p.username || ' [' || p.id::text || ']', ', ' order by p.username, p.id) as usernames,
        count(*) as duplicate_count
      from public.profiles p
      group by lower(trim(p.username))
      having count(*) > 1
      order by lower(trim(p.username))
      limit 10
    ) collisions
  ) formatted;

  if v_conflicts is not null then
    raise exception
      'Cannot enforce case-insensitive username uniqueness. Resolve these collisions first:%',
      E'\n' || v_conflicts;
  end if;
end $$;

create unique index if not exists idx_profiles_username_normalized_unique
  on public.profiles ((lower(trim(username))));

-- 2) Abuse-control helpers (DB-enforced rate limiting for high-risk mutation RPCs).
create or replace function public.assert_friend_request_rate_limit(p_user_id uuid default auth.uid())
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count_last_minute integer := 0;
  v_count_last_hour integer := 0;
begin
  if p_user_id is null then
    return;
  end if;

  select count(*)::integer
  into v_count_last_minute
  from public.friend_requests fr
  where fr.sender_user_id = p_user_id
    and fr.created_at >= timezone('utc', now()) - interval '1 minute';

  if v_count_last_minute >= 5 then
    raise exception 'Too many friend requests. Please wait a minute before trying again.';
  end if;

  select count(*)::integer
  into v_count_last_hour
  from public.friend_requests fr
  where fr.sender_user_id = p_user_id
    and fr.created_at >= timezone('utc', now()) - interval '1 hour';

  if v_count_last_hour >= 20 then
    raise exception 'Friend request rate limit reached for the last hour. Please try again later.';
  end if;
end;
$$;

create or replace function public.assert_dm_send_rate_limit(p_user_id uuid default auth.uid())
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count_last_minute integer := 0;
  v_count_last_ten_minutes integer := 0;
begin
  if p_user_id is null then
    return;
  end if;

  select count(*)::integer
  into v_count_last_minute
  from public.dm_messages dm
  where dm.author_user_id = p_user_id
    and dm.created_at >= timezone('utc', now()) - interval '1 minute';

  if v_count_last_minute >= 30 then
    raise exception 'Too many direct messages sent in the last minute. Please slow down.';
  end if;

  select count(*)::integer
  into v_count_last_ten_minutes
  from public.dm_messages dm
  where dm.author_user_id = p_user_id
    and dm.created_at >= timezone('utc', now()) - interval '10 minutes';

  if v_count_last_ten_minutes >= 200 then
    raise exception 'Direct message rate limit reached. Please try again shortly.';
  end if;
end;
$$;

create or replace function public.assert_dm_report_rate_limit(p_user_id uuid default auth.uid())
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count_last_ten_minutes integer := 0;
  v_count_last_day integer := 0;
begin
  if p_user_id is null then
    return;
  end if;

  select count(*)::integer
  into v_count_last_ten_minutes
  from public.dm_message_reports r
  where r.reporter_user_id = p_user_id
    and r.created_at >= timezone('utc', now()) - interval '10 minutes';

  if v_count_last_ten_minutes >= 5 then
    raise exception 'Too many DM reports submitted recently. Please wait before sending another report.';
  end if;

  select count(*)::integer
  into v_count_last_day
  from public.dm_message_reports r
  where r.reporter_user_id = p_user_id
    and r.created_at >= timezone('utc', now()) - interval '1 day';

  if v_count_last_day >= 20 then
    raise exception 'Daily DM report limit reached. Please try again tomorrow.';
  end if;
end;
$$;

revoke all on function public.assert_friend_request_rate_limit(uuid) from public;
revoke all on function public.assert_dm_send_rate_limit(uuid) from public;
revoke all on function public.assert_dm_report_rate_limit(uuid) from public;
grant execute on function public.assert_friend_request_rate_limit(uuid) to authenticated, service_role;
grant execute on function public.assert_dm_send_rate_limit(uuid) to authenticated, service_role;
grant execute on function public.assert_dm_report_rate_limit(uuid) to authenticated, service_role;

create index if not exists idx_friend_requests_sender_created_at
  on public.friend_requests(sender_user_id, created_at desc);

-- 3) DM report dedupe hardening.
with ranked as (
  select
    r.id,
    row_number() over (
      partition by r.message_id, r.reporter_user_id, r.kind
      order by r.created_at asc, r.id asc
    ) as rn
  from public.dm_message_reports r
)
delete from public.dm_message_reports r
using ranked
where ranked.id = r.id
  and ranked.rn > 1;

create unique index if not exists idx_dm_message_reports_unique_reporter_message_kind
  on public.dm_message_reports(message_id, reporter_user_id, kind);

-- 4) Moderation status transition matrix.
create or replace function public.can_transition_dm_message_report_status(
  p_from public.dm_message_report_status,
  p_to public.dm_message_report_status
)
returns boolean
language sql
immutable
as $$
  select
    case
      when p_from is null or p_to is null then false
      when p_from = p_to then false
      when p_from = 'open' and p_to in ('triaged', 'in_review', 'dismissed') then true
      when p_from = 'triaged' and p_to in ('in_review', 'resolved_actioned', 'resolved_no_action', 'dismissed') then true
      when p_from = 'in_review' and p_to in ('resolved_actioned', 'resolved_no_action', 'dismissed', 'triaged') then true
      when p_from in ('resolved_actioned', 'resolved_no_action') and p_to = 'in_review' then true
      when p_from = 'dismissed' and p_to in ('in_review', 'triaged') then true
      else false
    end;
$$;

revoke all on function public.can_transition_dm_message_report_status(public.dm_message_report_status, public.dm_message_report_status) from public;
grant execute on function public.can_transition_dm_message_report_status(public.dm_message_report_status, public.dm_message_report_status)
  to authenticated, service_role;

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

  if not public.can_transition_dm_message_report_status(v_report.status, p_status) then
    raise exception 'Invalid DM report status transition: % -> %', v_report.status, p_status;
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

-- 5) Patch social/DM/report mutation RPCs with rate-limit checks.
create or replace function public.send_friend_request(p_username text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_query text := lower(trim(coalesce(p_username, '')));
  v_sender_user_id uuid := auth.uid();
  v_target_user_id uuid;
  v_target_username text;
  v_match_count integer := 0;
  v_pair_low uuid;
  v_pair_high uuid;
  v_existing_pending public.friend_requests%rowtype;
  v_request_id uuid;
  v_sender_profile public.profiles%rowtype;
  v_deliver_in_app boolean := true;
  v_deliver_sound boolean := false;
  v_notification_event_id uuid;
begin
  if v_sender_user_id is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  if char_length(v_query) < 2 then
    raise exception 'Username is required.';
  end if;

  perform public.assert_friend_request_rate_limit(v_sender_user_id);

  select count(*)::integer
  into v_match_count
  from public.profiles p
  where lower(trim(p.username)) = v_query;

  if v_match_count = 0 then
    raise exception 'No user found with that username.';
  end if;

  if v_match_count > 1 then
    raise exception 'Multiple users matched that username. Case-insensitive username uniqueness must be enforced before using friend search.';
  end if;

  select p.id, p.username
  into v_target_user_id, v_target_username
  from public.profiles p
  where lower(trim(p.username)) = v_query
  limit 1;

  if v_target_user_id is null then
    raise exception 'No user found with that username.';
  end if;

  if v_target_user_id = v_sender_user_id then
    raise exception 'You cannot send a friend request to yourself.';
  end if;

  if public.is_blocked_either_direction(v_sender_user_id, v_target_user_id) then
    raise exception 'Friend requests are not available for this user.';
  end if;

  if public.are_friends(v_sender_user_id, v_target_user_id) then
    raise exception 'You are already friends with this user.';
  end if;

  v_pair_low := least(v_sender_user_id, v_target_user_id);
  v_pair_high := greatest(v_sender_user_id, v_target_user_id);

  select *
  into v_existing_pending
  from public.friend_requests fr
  where fr.pair_user_low_id = v_pair_low
    and fr.pair_user_high_id = v_pair_high
    and fr.status = 'pending'
  order by fr.created_at desc
  limit 1
  for update;

  if found then
    if v_existing_pending.sender_user_id = v_sender_user_id then
      raise exception 'Friend request already pending.';
    end if;
    raise exception 'This user already sent you a friend request.';
  end if;

  insert into public.friend_requests (
    sender_user_id,
    recipient_user_id,
    status
  )
  values (
    v_sender_user_id,
    v_target_user_id,
    'pending'
  )
  returning id into v_request_id;

  select *
  into v_sender_profile
  from public.profiles p
  where p.id = v_sender_user_id
  limit 1;

  select r.deliver_in_app, r.deliver_sound
  into v_deliver_in_app, v_deliver_sound
  from public.resolve_notification_delivery_for_user(v_target_user_id, 'friend_request_received') r
  limit 1;

  if coalesce(v_deliver_in_app, false) or coalesce(v_deliver_sound, false) then
    insert into public.notification_events (
      kind,
      source_kind,
      source_id,
      actor_user_id,
      payload
    )
    values (
      'friend_request_received',
      'friend_request',
      v_request_id,
      v_sender_user_id,
      jsonb_build_object(
        'friendRequestId', v_request_id,
        'senderUserId', v_sender_user_id,
        'senderUsername', coalesce(v_sender_profile.username, 'Unknown User'),
        'recipientUserId', v_target_user_id,
        'title', 'Friend request received',
        'message', coalesce(v_sender_profile.username, 'Someone') || ' sent you a friend request.'
      )
    )
    returning id into v_notification_event_id;

    insert into public.notification_recipients (
      event_id,
      recipient_user_id,
      deliver_in_app,
      deliver_sound
    )
    values (
      v_notification_event_id,
      v_target_user_id,
      coalesce(v_deliver_in_app, true),
      coalesce(v_deliver_sound, false)
    );
  end if;

  return v_request_id;
end;
$$;

revoke all on function public.send_friend_request(text) from public;
grant execute on function public.send_friend_request(text) to authenticated;

create or replace function public.send_dm_message(
  p_conversation_id uuid,
  p_content text,
  p_metadata jsonb default '{}'::jsonb
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
  deleted_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_content text := trim(coalesce(p_content, ''));
  v_message public.dm_messages%rowtype;
  v_sender_profile public.profiles%rowtype;
  v_delivery record;
  v_recipient record;
  v_notification_event_id uuid;
  v_message_preview text;
begin
  if v_me is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  if p_conversation_id is null then
    raise exception 'DM conversation id is required.';
  end if;

  if char_length(v_content) < 1 or char_length(v_content) > 4000 then
    raise exception 'DM content must be between 1 and 4000 characters.';
  end if;

  if not public.can_send_dm_in_conversation(p_conversation_id) then
    raise exception 'You cannot send messages in this DM conversation.' using errcode = '42501';
  end if;

  perform public.assert_dm_send_rate_limit(v_me);

  insert into public.dm_messages (
    conversation_id,
    author_user_id,
    content,
    metadata
  )
  values (
    p_conversation_id,
    v_me,
    v_content,
    coalesce(p_metadata, '{}'::jsonb)
  )
  returning * into v_message;

  update public.dm_conversations
  set
    last_message_at = v_message.created_at,
    updated_at = timezone('utc', now())
  where id = p_conversation_id;

  update public.dm_conversation_members
  set last_read_at = timezone('utc', now())
  where conversation_id = p_conversation_id
    and user_id = v_me;

  select *
  into v_sender_profile
  from public.profiles p
  where p.id = v_me
  limit 1;

  v_message_preview := case
    when char_length(v_content) > 180 then substring(v_content from 1 for 180) || '...'
    else v_content
  end;

  for v_recipient in
    select m.user_id
    from public.dm_conversation_members m
    where m.conversation_id = p_conversation_id
      and m.user_id <> v_me
      and m.left_at is null
  loop
    if public.is_blocked_either_direction(v_me, v_recipient.user_id) then
      continue;
    end if;

    select deliver_in_app, deliver_sound
    into v_delivery
    from public.resolve_dm_notification_delivery_for_user(v_recipient.user_id, p_conversation_id)
    limit 1;

    if coalesce(v_delivery.deliver_in_app, false) or coalesce(v_delivery.deliver_sound, false) then
      insert into public.notification_events (
        kind,
        source_kind,
        source_id,
        actor_user_id,
        payload
      )
      values (
        'dm_message',
        'dm_message',
        v_message.id,
        v_me,
        jsonb_build_object(
          'dmMessageId', v_message.id,
          'conversationId', p_conversation_id,
          'title', 'Direct message',
          'message', v_message_preview
        )
      )
      returning id into v_notification_event_id;

      insert into public.notification_recipients (
        event_id,
        recipient_user_id,
        deliver_in_app,
        deliver_sound
      )
      values (
        v_notification_event_id,
        v_recipient.user_id,
        coalesce(v_delivery.deliver_in_app, true),
        coalesce(v_delivery.deliver_sound, false)
      );
    end if;
  end loop;

  return query
  select
    v_message.id,
    v_message.conversation_id,
    v_message.author_user_id,
    v_sender_profile.username,
    v_sender_profile.avatar_url,
    v_message.content,
    v_message.metadata,
    v_message.created_at,
    v_message.edited_at,
    v_message.deleted_at;
end;
$$;

revoke all on function public.send_dm_message(uuid, text, jsonb) from public;
grant execute on function public.send_dm_message(uuid, text, jsonb) to authenticated;

create or replace function public.report_dm_message(
  p_message_id uuid,
  p_kind text,
  p_comment text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_message public.dm_messages%rowtype;
  v_kind text := trim(coalesce(p_kind, ''));
  v_comment text := trim(coalesce(p_comment, ''));
  v_report_id uuid;
begin
  if v_me is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  if v_kind not in ('content_abuse', 'bug') then
    raise exception 'Unsupported DM report kind.';
  end if;

  if char_length(v_comment) < 1 or char_length(v_comment) > 2000 then
    raise exception 'DM report comment must be between 1 and 2000 characters.';
  end if;

  perform public.assert_dm_report_rate_limit(v_me);

  select *
  into v_message
  from public.dm_messages dm
  where dm.id = p_message_id
    and dm.deleted_at is null
  limit 1;

  if not found then
    raise exception 'DM message not found.';
  end if;

  if not public.is_dm_conversation_member(v_message.conversation_id) then
    raise exception 'You do not have access to this DM message.' using errcode = '42501';
  end if;

  insert into public.dm_message_reports (
    conversation_id,
    message_id,
    reporter_user_id,
    reported_user_id,
    kind,
    comment
  )
  values (
    v_message.conversation_id,
    v_message.id,
    v_me,
    v_message.author_user_id,
    v_kind,
    v_comment
  )
  on conflict (message_id, reporter_user_id, kind) do update
  set
    comment = excluded.comment,
    updated_at = timezone('utc', now())
  returning id into v_report_id;

  return v_report_id;
end;
$$;

revoke all on function public.report_dm_message(uuid, text, text) from public;
grant execute on function public.report_dm_message(uuid, text, text) to authenticated;

-- 6) Mention trigger guardrails (cap unique processed mentions per message to limit fan-out).
create or replace function public.extract_mentioned_user_ids_from_message(
  p_content text,
  p_community_id uuid
)
returns table(
  user_id uuid,
  username text,
  avatar_url text
)
language sql
stable
security definer
set search_path = public
as $$
  with handles as (
    select distinct lower(mention_match.parts[2]) as mention_handle
    from regexp_matches(
      coalesce(p_content, ''),
      '(^|[^[:alnum:]_])@([[:alnum:]_]{2,32})',
      'g'
    ) as mention_match(parts)
  ),
  limited_handles as (
    select h.mention_handle
    from handles h
    order by h.mention_handle
    limit 20
  )
  select
    p.id as user_id,
    p.username,
    p.avatar_url
  from limited_handles h
  join public.profiles p
    on lower(trim(p.username)) = h.mention_handle
  join public.community_members cm
    on cm.user_id = p.id
   and cm.community_id = p_community_id
  order by lower(p.username), p.id;
$$;

revoke all on function public.extract_mentioned_user_ids_from_message(text, uuid) from public;
grant execute on function public.extract_mentioned_user_ids_from_message(text, uuid)
  to authenticated, service_role;

-- 7) Notification retention/maintenance RPC (service-role intended).
create or replace function public.dismiss_old_read_notifications_before(
  p_before timestamptz default timezone('utc', now()) - interval '90 days'
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text := coalesce(auth.role(), current_user);
  v_updated_count integer := 0;
begin
  if v_role not in ('postgres', 'service_role', 'supabase_admin') then
    raise exception 'Not authorized to run notification retention maintenance'
      using errcode = '42501';
  end if;

  update public.notification_recipients nr
  set dismissed_at = coalesce(nr.dismissed_at, timezone('utc', now()))
  where nr.dismissed_at is null
    and nr.read_at is not null
    and nr.created_at < coalesce(p_before, timezone('utc', now()) - interval '90 days');

  get diagnostics v_updated_count = row_count;
  return v_updated_count;
end;
$$;

revoke all on function public.dismiss_old_read_notifications_before(timestamptz) from public;
grant execute on function public.dismiss_old_read_notifications_before(timestamptz)
  to postgres, service_role;

