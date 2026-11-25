-- 6 of 9. Communities: members, roles, permissions, invites, bans and the
-- record of what moderators did.

-- ── What a role can allow ───────────────────────────────────────────────────
create type public.community_permission as enum (
  'view_channels',
  'send_messages',
  'manage_channels',            -- create, edit, order and delete channels and categories
  'manage_channel_permissions', -- per-channel exceptions for a role or a member
  'manage_messages',            -- remove other people's messages
  'manage_members',             -- kick, nicknames, voice controls
  'manage_roles',
  'manage_community',           -- name, description, settings
  'manage_invites',
  'manage_bans',
  'create_reports',
  'manage_reports',
  'view_hidden_messages',       -- see the messages of someone who is banned
  'view_audit_log'
);

-- ── Tables ──────────────────────────────────────────────────────────────────
create table public.communities (
  id uuid primary key default private.uuid_v7(),
  name text not null check (char_length(name) between 1 and 100),
  description text check (char_length(description) <= 1000),
  -- The one owner. The owner can do everything and cannot be removed; handing
  -- the community over is changing this column (transfer_ownership).
  owner_id uuid not null references public.profiles (id),
  -- Off pauses joining by invite without deleting the invites.
  invites_enabled boolean not null default true,
  report_reason_required boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger communities_touch before update on public.communities
  for each row execute function private.touch_updated_at();

create table public.community_members (
  community_id uuid not null references public.communities (id) on delete cascade,
  user_id uuid not null references public.profiles (id),
  nickname text check (char_length(nickname) between 1 and 32),
  joined_at timestamptz not null default now(),
  primary key (community_id, user_id)
);
create index community_members_user on public.community_members (user_id);

-- The owner is always a member. Checked when the transaction ends, so creating
-- a community (community first, then its first member) and handing it over
-- both work, and removing the owner's membership never does.
alter table public.communities
  add constraint communities_owner_is_member
  foreign key (id, owner_id) references public.community_members (community_id, user_id)
  deferrable initially deferred;

create table public.roles (
  id uuid primary key default private.uuid_v7(),
  community_id uuid not null references public.communities (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 64),
  color text not null default '#99aab5' check (color ~ '^#[0-9a-fA-F]{6}$'),
  -- Higher outranks lower. Someone can only manage roles and members below
  -- their own highest role.
  position integer not null default 1 check (position >= 0),
  -- The role every member has without being given it. One per community,
  -- always at position 0, never deleted.
  is_everyone boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, community_id),
  constraint roles_everyone_is_lowest check (is_everyone = (position = 0))
);
create unique index roles_one_everyone on public.roles (community_id) where is_everyone;
create index roles_community on public.roles (community_id);
create trigger roles_touch before update on public.roles
  for each row execute function private.touch_updated_at();

create table public.role_permissions (
  role_id uuid not null,
  community_id uuid not null,
  permission public.community_permission not null,
  primary key (role_id, permission),
  foreign key (role_id, community_id) references public.roles (id, community_id) on delete cascade
);
create index role_permissions_community on public.role_permissions (community_id);

-- Roles a member was given. The everyone role is never stored here.
create table public.member_roles (
  community_id uuid not null,
  user_id uuid not null,
  role_id uuid not null,
  assigned_at timestamptz not null default now(),
  primary key (community_id, user_id, role_id),
  foreign key (community_id, user_id) references public.community_members (community_id, user_id) on delete cascade,
  foreign key (role_id, community_id) references public.roles (id, community_id) on delete cascade
);
create index member_roles_role on public.member_roles (role_id);

create table public.channel_categories (
  id uuid primary key default private.uuid_v7(),
  community_id uuid not null references public.communities (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 64),
  position integer not null default 0,
  created_at timestamptz not null default now(),
  unique (id, community_id)
);
create index channel_categories_community on public.channel_categories (community_id);

-- A category someone folded shut, remembered across their devices.
create table public.collapsed_categories (
  user_id uuid not null references public.profiles (id),
  category_id uuid not null references public.channel_categories (id) on delete cascade,
  primary key (user_id, category_id)
);

create table public.invites (
  id uuid primary key default private.uuid_v7(),
  community_id uuid not null references public.communities (id) on delete cascade,
  code text not null unique,
  created_by uuid not null references public.profiles (id),
  max_uses integer check (max_uses > 0),
  uses integer not null default 0,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);
create index invites_community on public.invites (community_id);
-- "The communities this person owns" (leaving Haven), and deleting a category.
create index communities_owner on public.communities (owner_id);
create index collapsed_categories_category on public.collapsed_categories (category_id);

-- A row is a ban in force. Lifting it deletes the row; the audit log keeps
-- who banned and unbanned.
create table public.community_bans (
  community_id uuid not null references public.communities (id) on delete cascade,
  user_id uuid not null references public.profiles (id),
  banned_by uuid not null references public.profiles (id),
  reason text not null check (char_length(reason) between 1 and 1000),
  created_at timestamptz not null default now(),
  primary key (community_id, user_id)
);

create type public.audit_action as enum (
  'member_kicked',
  'member_banned',
  'member_unbanned',
  'message_removed',
  'roles_assigned',
  'role_changed',
  'channel_changed',
  'community_changed',
  'ownership_transferred'
);

-- What moderators did, in order. Rows are only ever added.
create table public.community_audit_log (
  id uuid primary key default private.uuid_v7(),
  community_id uuid not null references public.communities (id) on delete cascade,
  actor_id uuid not null references public.profiles (id),
  action public.audit_action not null,
  target_user_id uuid references public.profiles (id),
  target_id uuid,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index community_audit_log_community on public.community_audit_log (community_id, id desc);

-- ── Who can do what ─────────────────────────────────────────────────────────
create function private.my_community_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.community_id from public.community_members m where m.user_id = auth.uid();
$$;

create function private.is_member(p_community_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.community_members m
    where m.community_id = p_community_id and m.user_id = p_user_id
  );
$$;

-- The owner has every permission. Anyone else has what their roles, plus the
-- everyone role, allow. Someone who is not a member has none.
create function private.has_permission(
  p_community_id uuid,
  p_user_id uuid,
  p_permission public.community_permission
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.communities c where c.id = p_community_id and c.owner_id = p_user_id)
    or exists (
      select 1
      from public.community_members m
      join public.roles r on r.community_id = m.community_id
      join public.role_permissions rp on rp.role_id = r.id
      where m.community_id = p_community_id
        and m.user_id = p_user_id
        and rp.permission = p_permission
        and (
          r.is_everyone
          or exists (
            select 1 from public.member_roles mr
            where mr.community_id = m.community_id and mr.user_id = m.user_id and mr.role_id = r.id
          )
        )
    );
$$;

-- A member's rank: the owner outranks everyone, otherwise the highest role
-- they hold, otherwise 0 (the everyone role). Null for a non-member.
create function private.rank(p_community_id uuid, p_user_id uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when c.owner_id = m.user_id then 2147483647
    else coalesce((
      select max(r.position)
      from public.member_roles mr
      join public.roles r on r.id = mr.role_id
      where mr.community_id = m.community_id and mr.user_id = m.user_id
    ), 0)
  end
  from public.community_members m
  join public.communities c on c.id = m.community_id
  where m.community_id = p_community_id and m.user_id = p_user_id;
$$;

grant execute on function private.my_community_ids() to authenticated;
grant execute on function private.has_permission(uuid, uuid, public.community_permission) to authenticated;

create function private.require_permission(
  p_community_id uuid,
  p_user_id uuid,
  p_permission public.community_permission
)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.is_member(p_community_id, p_user_id) then
    -- Not telling a stranger whether the community exists.
    perform private.fail('not_found', 'community_not_found', 'That community could not be found.');
  end if;
  if not private.has_permission(p_community_id, p_user_id, p_permission) then
    perform private.fail('forbidden', 'missing_permission', 'You do not have permission to do that.');
  end if;
end;
$$;

-- For acting on another member: they must be a member, not the owner, and
-- ranked below the person acting.
create function private.require_outranks(p_community_id uuid, p_actor_id uuid, p_target_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_target integer := private.rank(p_community_id, p_target_id);
begin
  if v_target is null then
    perform private.fail('not_found', 'member_not_found', 'That person is not a member.');
  end if;
  if v_target >= private.rank(p_community_id, p_actor_id) then
    perform private.fail('forbidden', 'outranked', 'That member is not below you.');
  end if;
end;
$$;

create function private.audit(
  p_community_id uuid,
  p_actor_id uuid,
  p_action public.audit_action,
  p_target_user_id uuid default null,
  p_target_id uuid default null,
  p_detail jsonb default '{}'::jsonb
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.community_audit_log (community_id, actor_id, action, target_user_id, target_id, detail)
  values (p_community_id, p_actor_id, p_action, p_target_user_id, p_target_id, coalesce(p_detail, '{}'::jsonb));
$$;

-- ── Row level security ──────────────────────────────────────────────────────
alter table public.communities enable row level security;
alter table public.community_members enable row level security;
alter table public.roles enable row level security;
alter table public.role_permissions enable row level security;
alter table public.member_roles enable row level security;
alter table public.channel_categories enable row level security;
alter table public.collapsed_categories enable row level security;
alter table public.invites enable row level security;
alter table public.community_bans enable row level security;
alter table public.community_audit_log enable row level security;

create policy "members" on public.communities
  for select to authenticated using (id in (select private.my_community_ids()));
create policy "members" on public.community_members
  for select to authenticated using (community_id in (select private.my_community_ids()));
create policy "members" on public.roles
  for select to authenticated using (community_id in (select private.my_community_ids()));
create policy "members" on public.role_permissions
  for select to authenticated using (community_id in (select private.my_community_ids()));
create policy "members" on public.member_roles
  for select to authenticated using (community_id in (select private.my_community_ids()));
create policy "members" on public.channel_categories
  for select to authenticated using (community_id in (select private.my_community_ids()));
create policy "own" on public.collapsed_categories
  for select to authenticated using (user_id = (select auth.uid()));
create policy "invite managers" on public.invites
  for select to authenticated
  using (private.has_permission(community_id, (select auth.uid()), 'manage_invites'));
create policy "ban managers" on public.community_bans
  for select to authenticated
  using (private.has_permission(community_id, (select auth.uid()), 'manage_bans'));
create policy "audit readers" on public.community_audit_log
  for select to authenticated
  using (private.has_permission(community_id, (select auth.uid()), 'view_audit_log'));

grant select on
  public.communities, public.community_members, public.roles, public.role_permissions,
  public.member_roles, public.channel_categories, public.collapsed_categories,
  public.invites, public.community_bans, public.community_audit_log
to authenticated;

-- ── Realtime ────────────────────────────────────────────────────────────────
create function private.community_member_ids(p_community_id uuid)
returns uuid[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(m.user_id), '{}'::uuid[])
  from public.community_members m where m.community_id = p_community_id;
$$;

-- For tables whose rows every member of the community may see: tell the
-- members that a row was created, updated or deleted, with the row.
-- The first trigger argument is the event name's first half.
create function private.announce_community_row()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row jsonb := case tg_op when 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  v_community_id uuid := coalesce((v_row ->> 'community_id')::uuid, (v_row ->> 'id')::uuid);
begin
  perform private.broadcast(
    private.community_member_ids(v_community_id),
    tg_argv[0] || '.' || case tg_op when 'INSERT' then 'created' when 'UPDATE' then 'updated' else 'deleted' end,
    v_row);
  return null;
end;
$$;

create trigger communities_announce after update on public.communities
  for each row execute function private.announce_community_row('community');
create trigger roles_announce after insert or update or delete on public.roles
  for each row execute function private.announce_community_row('role');
create trigger channel_categories_announce after insert or update or delete on public.channel_categories
  for each row execute function private.announce_community_row('category');

-- Deleting a community: tell the members before their rows are gone.
create function private.announce_community_deleted()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.broadcast(
    private.community_member_ids(old.id), 'community.deleted', jsonb_build_object('id', old.id));
  return old;
end;
$$;
create trigger communities_announce_deleted before delete on public.communities
  for each row execute function private.announce_community_deleted();

-- Joining and leaving. The person who left is told too: that event is how
-- their app learns it lost the community.
create function private.announce_membership()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    -- Skip when the whole community is going; community.deleted covered it.
    if exists (select 1 from public.communities c where c.id = old.community_id) then
      perform private.broadcast(
        private.community_member_ids(old.community_id) || old.user_id, 'member.left', to_jsonb(old));
    end if;
  else
    perform private.broadcast(
      private.community_member_ids(new.community_id),
      case tg_op when 'INSERT' then 'member.joined' else 'member.updated' end,
      to_jsonb(new));
  end if;
  return null;
end;
$$;
create trigger community_members_announce after insert or update or delete on public.community_members
  for each row execute function private.announce_membership();

-- Anything that can change what someone may see or do sends one
-- "access.changed" per community per statement. The app answers by reloading
-- that community's roles, permissions and channels.
create function private.announce_access_changed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_community_id uuid;
begin
  for v_community_id in
    select distinct t.community_id from changed_rows t
  loop
    perform private.broadcast(
      private.community_member_ids(v_community_id), 'access.changed',
      jsonb_build_object('community_id', v_community_id));
  end loop;
  return null;
end;
$$;
create trigger role_permissions_access_ins after insert on public.role_permissions
  referencing new table as changed_rows for each statement execute function private.announce_access_changed();
create trigger role_permissions_access_del after delete on public.role_permissions
  referencing old table as changed_rows for each statement execute function private.announce_access_changed();
create trigger member_roles_access_ins after insert on public.member_roles
  referencing new table as changed_rows for each statement execute function private.announce_access_changed();
create trigger member_roles_access_del after delete on public.member_roles
  referencing old table as changed_rows for each statement execute function private.announce_access_changed();

create function private.announce_ban()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.community_bans := case tg_op when 'DELETE' then old else new end;
begin
  perform private.broadcast(
    private.community_member_ids(v_row.community_id),
    case tg_op when 'INSERT' then 'member.banned' else 'member.unbanned' end,
    jsonb_build_object('community_id', v_row.community_id, 'user_id', v_row.user_id));
  return null;
end;
$$;
create trigger community_bans_announce after insert or delete on public.community_bans
  for each row execute function private.announce_ban();

-- A new owner changes what two people may do, whichever path changed it
-- (transfer_ownership, or the old owner's account being deleted).
create function private.announce_owner_changed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.broadcast(
    private.community_member_ids(new.id), 'access.changed', jsonb_build_object('community_id', new.id));
  return null;
end;
$$;
create trigger communities_owner_changed after update of owner_id on public.communities
  for each row when (old.owner_id is distinct from new.owner_id)
  execute function private.announce_owner_changed();

-- ── RPCs: the community itself ──────────────────────────────────────────────
create function public.create_community(p_name text, p_description text default null)
returns public.communities
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.require_user();
  v_name text := private.clean_text(p_name);
  v_row public.communities;
  v_admin uuid;
  v_moderator uuid;
  v_everyone uuid;
begin
  if v_name is null or char_length(v_name) > 100 then
    perform private.fail('invalid', 'name_invalid', 'A community name is 1 to 100 characters.');
  end if;
  perform private.rate_limit(v_me, 'create_community', 5, interval '1 day');

  insert into public.communities (name, description, owner_id)
  values (v_name, private.clean_text(p_description), v_me)
  returning * into v_row;
  insert into public.community_members (community_id, user_id) values (v_row.id, v_me);

  insert into public.roles (community_id, name, position, is_everyone)
  values (v_row.id, 'everyone', 0, true) returning id into v_everyone;
  insert into public.roles (community_id, name, color, position)
  values (v_row.id, 'Admin', '#43b581', 90) returning id into v_admin;
  insert into public.roles (community_id, name, color, position)
  values (v_row.id, 'Moderator', '#faa61a', 80) returning id into v_moderator;

  insert into public.role_permissions (role_id, community_id, permission)
  select v_everyone, v_row.id, p from unnest(array['view_channels', 'send_messages', 'create_reports']::public.community_permission[]) p
  union all
  select v_admin, v_row.id, p from unnest(enum_range(null::public.community_permission)) p
  union all
  select v_moderator, v_row.id, p
  from unnest(array['manage_messages', 'manage_reports', 'view_hidden_messages', 'view_audit_log']::public.community_permission[]) p;

  -- The first channel. private.create_channel is defined in 7_channels.
  perform private.create_channel(v_row.id, 'text', 'general', null, null);
  return v_row;
end;
$$;

create function public.update_community(
  p_community_id uuid,
  p_name text default null,
  p_description text default null,
  p_invites_enabled boolean default null,
  p_report_reason_required boolean default null
)
returns public.communities
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.require_user();
  v_row public.communities;
begin
  perform private.require_permission(p_community_id, v_me, 'manage_community');
  if p_name is not null and (private.clean_text(p_name) is null or char_length(private.clean_text(p_name)) > 100) then
    perform private.fail('invalid', 'name_invalid', 'A community name is 1 to 100 characters.');
  end if;
  update public.communities c
  set name = coalesce(private.clean_text(p_name), c.name),
      description = case when p_description is null then c.description else private.clean_text(p_description) end,
      invites_enabled = coalesce(p_invites_enabled, c.invites_enabled),
      report_reason_required = coalesce(p_report_reason_required, c.report_reason_required)
  where c.id = p_community_id
  returning * into v_row;
  perform private.audit(p_community_id, v_me, 'community_changed');
  return v_row;
end;
$$;

create function private.require_owner(p_community_id uuid, p_user_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.is_member(p_community_id, p_user_id) then
    perform private.fail('not_found', 'community_not_found', 'That community could not be found.');
  end if;
  if not exists (select 1 from public.communities c where c.id = p_community_id and c.owner_id = p_user_id) then
    perform private.fail('forbidden', 'owner_only', 'Only the owner can do that.');
  end if;
end;
$$;

create function public.delete_community(p_community_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.require_user();
begin
  perform private.require_owner(p_community_id, v_me);
  delete from public.communities c where c.id = p_community_id;
end;
$$;

create function public.transfer_ownership(p_community_id uuid, p_user_id uuid)
returns public.communities
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.require_user();
  v_row public.communities;
begin
  perform private.require_owner(p_community_id, v_me);
  if not private.is_member(p_community_id, p_user_id) then
    perform private.fail('not_found', 'member_not_found', 'That person is not a member.');
  end if;
  update public.communities c set owner_id = p_user_id where c.id = p_community_id returning * into v_row;
  perform private.audit(p_community_id, v_me, 'ownership_transferred', p_user_id);
  return v_row;
end;
$$;

create function public.get_my_permissions(p_community_id uuid)
returns setof public.community_permission
language sql
stable
security definer
set search_path = ''
as $$
  select p
  from unnest(enum_range(null::public.community_permission)) p
  where private.has_permission(p_community_id, auth.uid(), p);
$$;

-- ── RPCs: members ───────────────────────────────────────────────────────────
create function public.leave_community(p_community_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.require_user();
begin
  if exists (select 1 from public.communities c where c.id = p_community_id and c.owner_id = v_me) then
    perform private.fail('conflict', 'owner_cannot_leave', 'Hand the community to someone else, or delete it, before leaving.');
  end if;
  delete from public.community_members m where m.community_id = p_community_id and m.user_id = v_me;
end;
$$;

create function public.kick_member(p_community_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.require_user();
begin
  perform private.require_permission(p_community_id, v_me, 'manage_members');
  perform private.require_outranks(p_community_id, v_me, p_user_id);
  delete from public.community_members m where m.community_id = p_community_id and m.user_id = p_user_id;
  perform private.audit(p_community_id, v_me, 'member_kicked', p_user_id);
end;
$$;

-- A ban removes the member and keeps them from joining again. Someone who
-- already left can be banned too. While the ban stands their messages are
-- hidden from everyone without view_hidden_messages (see 7_channels).
create function public.ban_member(p_community_id uuid, p_user_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.require_user();
  v_reason text := private.clean_text(p_reason);
begin
  perform private.require_permission(p_community_id, v_me, 'manage_bans');
  if v_reason is null or char_length(v_reason) > 1000 then
    perform private.fail('invalid', 'reason_invalid', 'A ban needs a reason of at most 1000 characters.');
  end if;
  if p_user_id = v_me or not exists (select 1 from public.profiles p where p.id = p_user_id) then
    perform private.fail('not_found', 'user_not_found', 'That person could not be found.');
  end if;
  if private.is_member(p_community_id, p_user_id) then
    perform private.require_outranks(p_community_id, v_me, p_user_id);
  end if;
  insert into public.community_bans (community_id, user_id, banned_by, reason)
  values (p_community_id, p_user_id, v_me, v_reason)
  on conflict (community_id, user_id) do nothing;
  if not found then
    perform private.fail('conflict', 'already_banned', 'That person is already banned.');
  end if;
  delete from public.community_members m where m.community_id = p_community_id and m.user_id = p_user_id;
  perform private.audit(p_community_id, v_me, 'member_banned', p_user_id, null, jsonb_build_object('reason', v_reason));
end;
$$;

create function public.unban_member(p_community_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.require_user();
begin
  perform private.require_permission(p_community_id, v_me, 'manage_bans');
  delete from public.community_bans b where b.community_id = p_community_id and b.user_id = p_user_id;
  if found then
    perform private.audit(p_community_id, v_me, 'member_unbanned', p_user_id);
  end if;
end;
$$;

-- Your own nickname, or with manage_members someone's below you.
-- An empty nickname clears it.
create function public.set_nickname(p_community_id uuid, p_user_id uuid, p_nickname text)
returns public.community_members
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.require_user();
  v_nickname text := private.clean_text(p_nickname);
  v_row public.community_members;
begin
  if p_user_id = v_me then
    if not private.is_member(p_community_id, v_me) then
      perform private.fail('not_found', 'community_not_found', 'That community could not be found.');
    end if;
  else
    perform private.require_permission(p_community_id, v_me, 'manage_members');
    perform private.require_outranks(p_community_id, v_me, p_user_id);
  end if;
  if char_length(v_nickname) > 32 then
    perform private.fail('invalid', 'nickname_invalid', 'A nickname is at most 32 characters.');
  end if;
  update public.community_members m set nickname = v_nickname
  where m.community_id = p_community_id and m.user_id = p_user_id
  returning * into v_row;
  return v_row;
end;
$$;

-- ── RPCs: roles ─────────────────────────────────────────────────────────────
-- Someone managing roles can only touch roles below their own rank, and can
-- only hand out permissions they hold themselves. Without the second rule,
-- manage_roles would be a way to give yourself everything.
create function private.require_can_manage_role(p_role public.roles, p_actor_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_role.id is null then
    perform private.fail('not_found', 'role_not_found', 'That role could not be found.');
  end if;
  perform private.require_permission(p_role.community_id, p_actor_id, 'manage_roles');
  if p_role.position >= private.rank(p_role.community_id, p_actor_id) then
    perform private.fail('forbidden', 'outranked', 'That role is not below you.');
  end if;
end;
$$;

create function public.create_role(p_community_id uuid, p_name text, p_color text default null, p_position integer default 1)
returns public.roles
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.require_user();
  v_row public.roles;
begin
  perform private.require_permission(p_community_id, v_me, 'manage_roles');
  if coalesce(p_position, 1) < 1 or coalesce(p_position, 1) >= private.rank(p_community_id, v_me) then
    perform private.fail('forbidden', 'outranked', 'A new role must sit below you.');
  end if;
  if private.clean_text(p_name) is null or char_length(private.clean_text(p_name)) > 64 then
    perform private.fail('invalid', 'name_invalid', 'A role name is 1 to 64 characters.');
  end if;
  insert into public.roles (community_id, name, color, position)
  values (p_community_id, private.clean_text(p_name), coalesce(p_color, '#99aab5'), coalesce(p_position, 1))
  returning * into v_row;
  perform private.audit(p_community_id, v_me, 'role_changed', null, v_row.id, jsonb_build_object('change', 'created'));
  return v_row;
end;
$$;

create function public.update_role(
  p_role_id uuid,
  p_name text default null,
  p_color text default null,
  p_position integer default null
)
returns public.roles
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.require_user();
  v_row public.roles;
begin
  select * into v_row from public.roles r where r.id = p_role_id;
  perform private.require_can_manage_role(v_row, v_me);
  if v_row.is_everyone and (p_name is not null or p_position is not null) then
    perform private.fail('invalid', 'everyone_role_fixed', 'The everyone role cannot be renamed or moved.');
  end if;
  if p_position is not null and (p_position < 1 or p_position >= private.rank(v_row.community_id, v_me)) then
    perform private.fail('forbidden', 'outranked', 'A role must stay below you.');
  end if;
  update public.roles r
  set name = coalesce(private.clean_text(p_name), r.name),
      color = coalesce(p_color, r.color),
      position = coalesce(p_position, r.position)
  where r.id = p_role_id
  returning * into v_row;
  perform private.audit(v_row.community_id, v_me, 'role_changed', null, v_row.id, jsonb_build_object('change', 'updated'));
  return v_row;
end;
$$;

create function public.delete_role(p_role_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.require_user();
  v_row public.roles;
begin
  select * into v_row from public.roles r where r.id = p_role_id;
  perform private.require_can_manage_role(v_row, v_me);
  if v_row.is_everyone then
    perform private.fail('invalid', 'everyone_role_fixed', 'The everyone role cannot be deleted.');
  end if;
  delete from public.roles r where r.id = p_role_id;
  perform private.audit(v_row.community_id, v_me, 'role_changed', null, v_row.id,
                        jsonb_build_object('change', 'deleted', 'name', v_row.name));
end;
$$;

-- Replace the whole set of permissions a role allows.
create function public.set_role_permissions(p_role_id uuid, p_permissions public.community_permission[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.require_user();
  v_role public.roles;
  v_wanted public.community_permission[] := coalesce(p_permissions, '{}');
begin
  select * into v_role from public.roles r where r.id = p_role_id;
  if v_role.id is not null and v_role.is_everyone then
    -- The everyone role sits at 0, below every manager, so only the
    -- permission and the "hold it yourself" rule apply.
    perform private.require_permission(v_role.community_id, v_me, 'manage_roles');
  else
    perform private.require_can_manage_role(v_role, v_me);
  end if;
  if exists (
    select 1
    from unnest(v_wanted) p
    where not private.has_permission(v_role.community_id, v_me, p)
      and not exists (select 1 from public.role_permissions rp where rp.role_id = p_role_id and rp.permission = p)
  ) then
    perform private.fail('forbidden', 'cannot_grant', 'You can only give out permissions you have yourself.');
  end if;

  delete from public.role_permissions rp
  where rp.role_id = p_role_id and not (rp.permission = any (v_wanted));
  insert into public.role_permissions (role_id, community_id, permission)
  select p_role_id, v_role.community_id, p from unnest(v_wanted) p
  on conflict do nothing;
  perform private.audit(v_role.community_id, v_me, 'role_changed', null, p_role_id,
                        jsonb_build_object('change', 'permissions', 'permissions', to_jsonb(v_wanted)));
end;
$$;

-- Replace the set of roles a member holds. Every role added or taken away
-- must be below the person doing it, and so must the member (unless it is
-- themselves): a role can carry a channel "no", so handing one to someone
-- above you would be a way to take their access away.
create function public.set_member_roles(p_community_id uuid, p_user_id uuid, p_role_ids uuid[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.require_user();
  v_wanted uuid[] := coalesce(p_role_ids, '{}');
  v_my_rank integer;
begin
  perform private.require_permission(p_community_id, v_me, 'manage_roles');
  if p_user_id <> v_me then
    -- Also refuses someone who is not a member.
    perform private.require_outranks(p_community_id, v_me, p_user_id);
  end if;
  v_my_rank := private.rank(p_community_id, v_me);

  if exists (
    select 1 from unnest(v_wanted) w
    where not exists (
      select 1 from public.roles r
      where r.id = w and r.community_id = p_community_id and not r.is_everyone
    )
  ) then
    perform private.fail('invalid', 'role_not_found', 'One of those roles does not exist here.');
  end if;
  -- The roles that would change: wanted but not held, or held but not wanted.
  if exists (
    select 1
    from public.roles r
    where r.community_id = p_community_id
      and r.position >= v_my_rank
      and (r.id = any (v_wanted)) <> exists (
        select 1 from public.member_roles mr
        where mr.community_id = p_community_id and mr.user_id = p_user_id and mr.role_id = r.id
      )
  ) then
    perform private.fail('forbidden', 'outranked', 'You can only give or take roles below your own.');
  end if;

  delete from public.member_roles mr
  where mr.community_id = p_community_id and mr.user_id = p_user_id and not (mr.role_id = any (v_wanted));
  insert into public.member_roles (community_id, user_id, role_id)
  select p_community_id, p_user_id, w from unnest(v_wanted) w
  on conflict do nothing;
  perform private.audit(p_community_id, v_me, 'roles_assigned', p_user_id, null,
                        jsonb_build_object('role_ids', to_jsonb(v_wanted)));
end;
$$;

-- ── RPCs: invites ───────────────────────────────────────────────────────────
-- Ten characters from an alphabet without look-alikes (no 0/O, 1/I/L).
create function private.new_invite_code()
returns text
language sql
volatile
set search_path = ''
as $$
  select string_agg(substr('ABCDEFGHJKMNPQRSTUVWXYZ23456789', 1 + (get_byte(b, i) % 31), 1), '')
  from (select extensions.gen_random_bytes(10) as b) bytes, generate_series(0, 9) i;
$$;

create function public.create_invite(
  p_community_id uuid,
  p_max_uses integer default null,
  p_expires_in_hours integer default 24
)
returns public.invites
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.require_user();
  v_row public.invites;
begin
  perform private.require_permission(p_community_id, v_me, 'manage_invites');
  if p_max_uses is not null and p_max_uses < 1 then
    perform private.fail('invalid', 'max_uses_invalid', 'The number of uses must be at least 1.');
  end if;
  if p_expires_in_hours is not null and p_expires_in_hours not between 1 and 8760 then
    perform private.fail('invalid', 'expiry_invalid', 'An invite lasts between an hour and a year.');
  end if;
  insert into public.invites (community_id, code, created_by, max_uses, expires_at)
  values (p_community_id, private.new_invite_code(), v_me, p_max_uses,
          now() + make_interval(hours => p_expires_in_hours))
  returning * into v_row;
  return v_row;
end;
$$;

create function public.revoke_invite(p_invite_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.require_user();
  v_community_id uuid;
begin
  select i.community_id into v_community_id from public.invites i where i.id = p_invite_id;
  if v_community_id is null then
    return;
  end if;
  perform private.require_permission(v_community_id, v_me, 'manage_invites');
  delete from public.invites i where i.id = p_invite_id;
end;
$$;

-- Join with a code. Every way a code can fail gives the same answer, so a
-- refusal says nothing about why, except a ban, which the person is told
-- about. Guessing a code is not a risk: there are 31^10 of them.
create function public.join_community(p_code text)
returns public.communities
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.require_user();
  v_invite public.invites;
  v_row public.communities;
begin
  perform private.rate_limit(v_me, 'join_community', 20, interval '10 minutes');
  select * into v_invite from public.invites i
  where i.code = upper(private.clean_text(p_code)) for update;
  select * into v_row from public.communities c where c.id = v_invite.community_id;

  if v_invite.id is not null and private.is_member(v_row.id, v_me) then
    return v_row;
  end if;
  if v_invite.id is null
     or (v_invite.expires_at is not null and v_invite.expires_at <= now())
     or (v_invite.max_uses is not null and v_invite.uses >= v_invite.max_uses)
     or not v_row.invites_enabled then
    perform private.fail('not_found', 'invite_invalid', 'That invite is not valid any more.');
  end if;
  if exists (select 1 from public.community_bans b where b.community_id = v_row.id and b.user_id = v_me) then
    perform private.fail('forbidden', 'banned', 'You are banned from this community.');
  end if;

  insert into public.community_members (community_id, user_id) values (v_row.id, v_me);
  update public.invites i set uses = i.uses + 1 where i.id = v_invite.id;
  return v_row;
end;
$$;

-- ── RPCs: categories ────────────────────────────────────────────────────────
create function public.save_category(
  p_community_id uuid,
  p_name text,
  p_position integer default 0,
  p_category_id uuid default null
)
returns public.channel_categories
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.require_user();
  v_name text := private.clean_text(p_name);
  v_row public.channel_categories;
begin
  perform private.require_permission(p_community_id, v_me, 'manage_channels');
  if v_name is null or char_length(v_name) > 64 then
    perform private.fail('invalid', 'name_invalid', 'A category name is 1 to 64 characters.');
  end if;
  if p_category_id is null then
    insert into public.channel_categories (community_id, name, position)
    values (p_community_id, v_name, coalesce(p_position, 0))
    returning * into v_row;
  else
    update public.channel_categories c set name = v_name, position = coalesce(p_position, c.position)
    where c.id = p_category_id and c.community_id = p_community_id
    returning * into v_row;
    if v_row.id is null then
      perform private.fail('not_found', 'category_not_found', 'That category could not be found.');
    end if;
  end if;
  perform private.audit(p_community_id, v_me, 'channel_changed', null, v_row.id, jsonb_build_object('change', 'category'));
  return v_row;
end;
$$;

create function public.delete_category(p_category_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.require_user();
  v_community_id uuid;
begin
  select c.community_id into v_community_id from public.channel_categories c where c.id = p_category_id;
  if v_community_id is null then
    return;
  end if;
  perform private.require_permission(v_community_id, v_me, 'manage_channels');
  delete from public.channel_categories c where c.id = p_category_id;
  perform private.audit(v_community_id, v_me, 'channel_changed', null, p_category_id, jsonb_build_object('change', 'category_deleted'));
end;
$$;

create function public.set_category_collapsed(p_category_id uuid, p_collapsed boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.require_user();
begin
  if not exists (
    select 1 from public.channel_categories c
    where c.id = p_category_id and private.is_member(c.community_id, v_me)
  ) then
    perform private.fail('not_found', 'category_not_found', 'That category could not be found.');
  end if;
  if coalesce(p_collapsed, false) then
    insert into public.collapsed_categories (user_id, category_id) values (v_me, p_category_id)
    on conflict do nothing;
  else
    delete from public.collapsed_categories c where c.user_id = v_me and c.category_id = p_category_id;
  end if;
end;
$$;

grant execute on function public.create_community(text, text) to authenticated;
grant execute on function public.update_community(uuid, text, text, boolean, boolean) to authenticated;
grant execute on function public.delete_community(uuid) to authenticated;
grant execute on function public.transfer_ownership(uuid, uuid) to authenticated;
grant execute on function public.get_my_permissions(uuid) to authenticated;
grant execute on function public.leave_community(uuid) to authenticated;
grant execute on function public.kick_member(uuid, uuid) to authenticated;
grant execute on function public.ban_member(uuid, uuid, text) to authenticated;
grant execute on function public.unban_member(uuid, uuid) to authenticated;
grant execute on function public.set_nickname(uuid, uuid, text) to authenticated;
grant execute on function public.create_role(uuid, text, text, integer) to authenticated;
grant execute on function public.update_role(uuid, text, text, integer) to authenticated;
grant execute on function public.delete_role(uuid) to authenticated;
grant execute on function public.set_role_permissions(uuid, public.community_permission[]) to authenticated;
grant execute on function public.set_member_roles(uuid, uuid, uuid[]) to authenticated;
grant execute on function public.create_invite(uuid, integer, integer) to authenticated;
grant execute on function public.revoke_invite(uuid) to authenticated;
grant execute on function public.join_community(text) to authenticated;
grant execute on function public.save_category(uuid, text, integer, uuid) to authenticated;
grant execute on function public.delete_category(uuid) to authenticated;
grant execute on function public.set_category_collapsed(uuid, boolean) to authenticated;
