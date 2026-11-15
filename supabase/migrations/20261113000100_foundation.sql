-- Haven database. Contract and reasons: docs/architecture/DATABASE.md
--
-- 1 of 9. Foundation: who may touch what, and the small tools every later
-- file uses. Nothing here is a product feature.

-- pg_cron runs the periodic sweeps; pg_net lets the database wake a worker.
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

-- ── Two schemas ─────────────────────────────────────────────────────────────
-- public  = the contract with the apps. A table here is read only through its
--           RLS policy and written only through an RPC.
-- private = everything else: helpers, triggers, the job queue. The API does
--           not expose this schema, so a client cannot call anything in it.
--           (Supabase, "Securing your API": keep internals out of the exposed
--           schema.)
create schema private;
revoke all on schema private from public;
-- RLS policies run their helper functions as the person asking, so that role
-- needs to see the schema. Seeing it is not being able to call it over the API.
grant usage on schema private to authenticated, service_role;

-- ── Nothing is exposed by accident ──────────────────────────────────────────
-- Supabase grants every new table and function in public to anon and
-- authenticated. Turn that off: each grant in this database is written down
-- on purpose, next to the thing it grants.
alter default privileges for role postgres revoke execute on functions from public;
alter default privileges for role postgres in schema public revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on functions from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on sequences from anon, authenticated;

-- ── Ids ─────────────────────────────────────────────────────────────────────
-- Every id is a time-ordered UUID (version 7, RFC 9562). Sorting by id is
-- sorting by creation time, so a page of messages needs one index and "what
-- is newer than X" is a comparison of ids. PostgreSQL 18 has uuidv7() built
-- in; when the project moves to 18 this body becomes "select uuidv7()".
create function private.uuid_v7()
returns uuid
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_now numeric := extract(epoch from clock_timestamp()) * 1000;
  v_ms bigint := floor(v_now);
  -- 12 bits of the time inside the millisecond, so two ids made one after the
  -- other in one transaction still sort in the order they were made.
  v_sub integer := floor((v_now - v_ms) * 4096);
  v_bytes bytea := uuid_send(gen_random_uuid());
begin
  v_bytes := overlay(v_bytes placing substring(int8send(v_ms) from 3 for 6) from 1 for 6);
  v_bytes := set_byte(v_bytes, 6, 112 | (v_sub >> 8)); -- 0x7_ : version 7
  v_bytes := set_byte(v_bytes, 7, v_sub & 255);
  return encode(v_bytes, 'hex')::uuid;
end;
$$;

-- ── Errors ──────────────────────────────────────────────────────────────────
-- One way to refuse. The API turns the code into an HTTP status (PostgREST
-- "PTxxx" codes), "message" is a sentence for a person, and "details" is a
-- stable word the apps can switch on.
--   unauthenticated 401 · forbidden 403 · not_found 404 · conflict 409
--   rate_limited 429 · invalid 400
create function private.fail(p_kind text, p_reason text, p_message text)
returns void
language plpgsql
set search_path = ''
as $$
begin
  raise exception using
    errcode = case p_kind
      when 'unauthenticated' then 'PT401'
      when 'forbidden' then '42501'
      when 'not_found' then 'PT404'
      when 'conflict' then 'PT409'
      when 'rate_limited' then 'PT429'
      else '22023'
    end,
    message = p_message,
    detail = p_reason;
end;
$$;

-- ── Small shared pieces ─────────────────────────────────────────────────────
create function private.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Trimmed text, or null when nothing is left.
create function private.clean_text(p_value text)
returns text
language sql
immutable
set search_path = ''
as $$
  select nullif(btrim(p_value, E' \t\n\r'), '');
$$;

-- ── Rate limits ─────────────────────────────────────────────────────────────
-- One mechanism for "slow down": every limited action writes a hit, and the
-- next attempt counts the recent ones. Hits older than a day are swept.
-- A call that is refused rolls back, and its hit with it, so a limit counts
-- what succeeded. It bounds how fast someone can do a thing, not how often
-- they can try and fail.
create table private.rate_limit_hits (
  user_id uuid not null,
  action text not null,
  at timestamptz not null default now()
);
create index rate_limit_hits_recent on private.rate_limit_hits (user_id, action, at desc);

create function private.rate_limit(p_user_id uuid, p_action text, p_max integer, p_window interval)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (
    select count(*)
    from private.rate_limit_hits h
    where h.user_id = p_user_id and h.action = p_action and h.at > now() - p_window
  ) >= p_max then
    perform private.fail('rate_limited', 'rate_limited', 'You are doing that too fast. Try again in a moment.');
  end if;
  insert into private.rate_limit_hits (user_id, action) values (p_user_id, p_action);
end;
$$;

-- ── Settings the database needs to call out ─────────────────────────────────
-- Stored in Supabase Vault (encrypted at rest). Used for the address and
-- shared secret of the worker functions.
create function private.setting(p_name text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select s.decrypted_secret from vault.decrypted_secrets s where s.name = 'haven.' || p_name;
$$;

create function private.set_setting(p_name text, p_value text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  select s.id into v_id from vault.secrets s where s.name = 'haven.' || p_name;
  if v_id is null then
    perform vault.create_secret(p_value, 'haven.' || p_name);
  else
    perform vault.update_secret(v_id, p_value);
  end if;
end;
$$;

-- ── Jobs: one way to say "do this later" ────────────────────────────────────
-- Push, link previews, file deletion, evidence moves and mail are all rows
-- here. A worker (an Edge Function with the service role) claims rows of its
-- kind, does the work, and reports back.
create table private.jobs (
  id uuid primary key default private.uuid_v7(),
  kind text not null check (
    kind in ('push_send', 'link_preview', 'media_delete', 'media_quarantine', 'email_send', 'media_scan')
  ),
  payload jsonb not null default '{}'::jsonb,
  -- At most one unfinished job per (kind, dedupe_key).
  dedupe_key text,
  status text not null default 'pending' check (status in ('pending', 'running', 'done', 'failed')),
  attempts integer not null default 0,
  max_attempts integer not null default 8,
  run_at timestamptz not null default now(),
  locked_until timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  finished_at timestamptz
);
create unique index jobs_one_live_per_key on private.jobs (kind, dedupe_key)
  where dedupe_key is not null and status in ('pending', 'running');
create index jobs_claimable on private.jobs (kind, run_at) where status in ('pending', 'running');
create index jobs_finished on private.jobs (finished_at) where status in ('done', 'failed');

-- Which Edge Function works each kind of job.
create function private.worker_for(p_kind text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case p_kind
    when 'push_send' then 'push-worker'
    when 'email_send' then 'mail-worker'
    when 'link_preview' then 'link-preview-worker'
    when 'media_scan' then 'scan-worker'
    else 'media-worker'
  end;
$$;

-- Ask a worker to run now instead of waiting for the next minute. Does
-- nothing until the operator has stored where the functions live
-- (private.set_setting('edge_base_url', ...) and 'worker_secret'). The HTTP
-- call is made by pg_net after this transaction commits, so a worker never
-- looks for a job that is not visible yet. At most one wake per function
-- every two seconds.
create table private.worker_wakes (
  worker text primary key,
  last_at timestamptz not null
);

create function private.wake_worker(p_worker text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_base text := private.setting('edge_base_url');
  v_secret text := private.setting('worker_secret');
  v_woken text;
begin
  if v_base is null or v_secret is null then
    return;
  end if;
  insert into private.worker_wakes as w (worker, last_at) values (p_worker, now())
  on conflict (worker) do update set last_at = now()
    where w.last_at < now() - interval '2 seconds'
  returning w.worker into v_woken;
  if v_woken is null then
    return;
  end if;
  perform net.http_post(
    url := rtrim(v_base, '/') || '/' || p_worker,
    body := '{}'::jsonb,
    headers := jsonb_build_object('content-type', 'application/json', 'x-haven-worker-secret', v_secret)
  );
end;
$$;

create function private.enqueue_job(
  p_kind text,
  p_payload jsonb,
  p_dedupe_key text default null,
  p_run_at timestamptz default now()
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into private.jobs (kind, payload, dedupe_key, run_at)
  values (p_kind, coalesce(p_payload, '{}'::jsonb), p_dedupe_key, coalesce(p_run_at, now()))
  on conflict (kind, dedupe_key) where dedupe_key is not null and status in ('pending', 'running')
  do nothing;
  if found and coalesce(p_run_at, now()) <= now() then
    perform private.wake_worker(private.worker_for(p_kind));
  end if;
end;
$$;

-- The fallback: once a minute, wake any worker that has work waiting. This is
-- what picks up retries, expired leases and anything a wake call lost.
create function private.wake_due_workers()
returns void
language sql
security definer
set search_path = ''
as $$
  select private.wake_worker(due.worker)
  from (
    select distinct private.worker_for(j.kind) as worker
    from private.jobs j
    where (j.status = 'pending' and j.run_at <= now())
       or (j.status = 'running' and j.locked_until < now())
  ) due;
$$;

-- Hand a worker up to p_limit jobs. A job whose worker died is handed out
-- again once its lease runs out. "skip locked" lets two workers claim at once
-- without waiting on each other.
create function public.worker_claim_jobs(p_kind text, p_limit integer default 20, p_lease_seconds integer default 120)
returns table (id uuid, kind text, payload jsonb, attempts integer)
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
  with claimable as (
    select j.id
    from private.jobs j
    where j.kind = p_kind
      and (
        (j.status = 'pending' and j.run_at <= now())
        or (j.status = 'running' and j.locked_until < now())
      )
    order by j.run_at, j.id
    limit least(greatest(coalesce(p_limit, 20), 1), 100)
    for update skip locked
  )
  update private.jobs j
  set status = 'running',
      attempts = j.attempts + 1,
      locked_until = now() + make_interval(secs => least(greatest(coalesce(p_lease_seconds, 120), 10), 900))
  from claimable
  where j.id = claimable.id
  returning j.id, j.kind, j.payload, j.attempts;
end;
$$;

-- Report how a claimed job went. No error means done. An error retries with a
-- growing delay until max_attempts, then the job is 'failed' and stays for a
-- person to look at.
create function public.worker_finish_job(p_job_id uuid, p_error text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update private.jobs j
  set status = case
        when p_error is null then 'done'
        when j.attempts >= j.max_attempts then 'failed'
        else 'pending'
      end,
      last_error = p_error,
      locked_until = null,
      run_at = case
        when p_error is null or j.attempts >= j.max_attempts then j.run_at
        else now() + make_interval(secs => least(30 * (2 ^ j.attempts)::integer, 3600))
      end,
      finished_at = case when p_error is null or j.attempts >= j.max_attempts then now() end
  where j.id = p_job_id and j.status = 'running';
end;
$$;

grant execute on function public.worker_claim_jobs(text, integer, integer) to service_role;
grant execute on function public.worker_finish_job(uuid, text) to service_role;

-- ── Realtime: one private topic per person ──────────────────────────────────
-- The database decides who hears about a change and sends it to each of those
-- people's topic. Deciding at send time means someone who just lost access
-- stops hearing on the very next event (Supabase checks topic access only when
-- a client joins; see DATABASE.md, "Realtime").
create function private.broadcast(p_user_ids uuid[], p_event text, p_payload jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform realtime.send(p_payload, p_event, 'user:' || recipient.id::text, true)
  from (select distinct u as id from unnest(p_user_ids) as u where u is not null) recipient;
end;
$$;

-- A person may listen to their own topic and to nothing else.
create policy "own topic" on realtime.messages
  for select to authenticated
  using (
    realtime.messages.extension = 'broadcast'
    and realtime.topic() = 'user:' || (select auth.uid())::text
  );

-- ── Housekeeping ────────────────────────────────────────────────────────────
create function private.sweep()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from private.rate_limit_hits where at < now() - interval '1 day';
  delete from private.jobs where status = 'done' and finished_at < now() - interval '7 days';
  delete from cron.job_run_details where end_time < now() - interval '2 days';
  -- Uploads that were started and never used (3_media).
  perform private.sweep_abandoned_uploads();
  -- Notifications older than 90 days (4_notifications).
  perform private.sweep_old_notifications();
  -- Friend links that expired: told once, then dropped (5_social).
  perform private.sweep_expired_friend_links();
end;
$$;

select cron.schedule('haven_sweep_daily', '19 4 * * *', 'select private.sweep()');
select cron.schedule('haven_wake_workers', '* * * * *', 'select private.wake_due_workers()');
