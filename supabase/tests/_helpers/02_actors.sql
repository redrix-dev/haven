-- Who is acting, what was refused, and what was broadcast.

-- The nine accounts made by tooling/scripts/test/bootstrap-local-auth-users.mjs.
-- staff_active and staff_inactive are staff accounts (they never act as a
-- person); staff_person is staff_active's own account; stranger shares nothing
-- with anyone.
create or replace function test_support.user_id(p_key text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select u.id
  from auth.users u
  where u.email = case p_key
    when 'owner' then 'rls-owner@example.test'
    when 'member_a' then 'rls-member-a@example.test'
    when 'member_b' then 'rls-member-b@example.test'
    when 'non_member' then 'rls-non-member@example.test'
    when 'server_mod' then 'rls-server-mod@example.test'
    when 'staff_active' then 'rls-staff-active@example.test'
    when 'staff_inactive' then 'rls-staff-inactive@example.test'
    when 'staff_person' then 'rls-staff-person@example.test'
    when 'stranger' then 'rls-stranger@example.test'
  end;
$$;

-- Act as one of them, through the same role and claims the API uses, so RLS
-- and grants apply. become(null) goes back to the superuser to look at the
-- truth. p_aal 'aal2' is a sign-in with a second factor, which staff work needs.
drop function if exists test_support.become(text);
create or replace function test_support.become(p_key text, p_aal text default 'aal1')
returns void
language plpgsql
as $$
begin
  if p_key is null then
    perform set_config('role', 'postgres', true);
    perform test_support.clear_jwt_claims();
    return;
  end if;
  if test_support.user_id(p_key) is null then
    raise exception '[become] no fixture user "%". Run npm run test:db:users.', p_key;
  end if;
  perform set_config('role', 'postgres', true);
  perform test_support.set_jwt_claims(test_support.user_id(p_key), 'authenticated', p_aal);
  perform set_config('role', 'authenticated', true);
end;
$$;

-- The statement must be refused, and for the stated reason. p_reason is the
-- stable word in the error's "details" (see private.fail). For refusals that
-- come from Postgres itself (a missing grant, a constraint) it is matched
-- against the message instead.
create or replace function test_support.expect_error(p_sql text, p_reason text)
returns void
language plpgsql
as $$
declare
  v_message text;
  v_detail text;
begin
  begin
    execute p_sql;
  exception when others then
    get stacked diagnostics v_message = message_text, v_detail = pg_exception_detail;
  end;
  if v_message is null then
    raise exception '[expect_error] succeeded, expected "%": %', p_reason, p_sql;
  end if;
  if v_detail is distinct from p_reason and position(lower(p_reason) in lower(v_message)) = 0 then
    raise exception '[expect_error] expected "%", got "%" (details "%"): %', p_reason, v_message, v_detail, p_sql;
  end if;
end;
$$;

-- realtime.send() writes realtime.messages, so a broadcast made inside a
-- test's transaction can be counted there.
create or replace function test_support.sent(p_user_key text, p_event text)
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)
  from realtime.messages m
  where m.topic = 'user:' || test_support.user_id(p_user_key)::text
    and m.event = p_event
    and m.private;
$$;

-- The payload of the latest broadcast of an event to someone.
create or replace function test_support.last_sent(p_user_key text, p_event text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select m.payload
  from realtime.messages m
  where m.topic = 'user:' || test_support.user_id(p_user_key)::text and m.event = p_event
  order by m.inserted_at desc, m.id desc
  limit 1;
$$;

-- Forget earlier broadcasts, so the next assertion is about one action.
create or replace function test_support.clear_sent()
returns void
language sql
security definer
set search_path = ''
as $$
  delete from realtime.messages where true;
$$;

-- Put a file where an upload slot says it should be, as the storage service
-- would after a real upload.
create or replace function test_support.fake_upload(p_media_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into storage.objects (bucket_id, name, owner, metadata)
  select m.bucket, m.object_path, m.owner_id,
         jsonb_build_object('size', m.size_bytes, 'mimetype', m.mime_type)
  from public.media m where m.id = p_media_id;
$$;

grant execute on all functions in schema test_support to public;

-- Privacy starts closed: nobody can send a friend request (1_people,
-- user_settings). A suite about something else opens requests for the people
-- it uses, straight in the table, before it starts counting events.
create or replace function test_support.take_friend_requests(variadic p_keys text[])
returns void
language sql
security definer
set search_path = ''
as $$
  update public.user_settings s set friend_requests_from = 'everyone'
  where s.user_id in (select test_support.user_id(k) from unnest(p_keys) k);
$$;
