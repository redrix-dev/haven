-- DB-backed post-auth mobile onboarding campaigns.

create table if not exists public.onboarding_campaigns (
  key text primary key,
  feature_flag_key text not null references public.feature_flags_catalog(key) on delete restrict,
  title text not null,
  description text,
  target_community_id uuid references public.communities(id) on delete set null,
  target_flair_key text references public.flairs(key) on delete set null,
  required boolean not null default false,
  platform_scope text not null default 'all',
  distribution_scope text not null default 'all',
  min_app_version text,
  max_app_version text,
  is_active boolean not null default true,
  starts_at timestamptz,
  ends_at timestamptz,
  sort_order integer not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint onboarding_campaigns_key_format_check check (
    key ~ '^[a-z0-9][a-z0-9_:-]{1,79}$'
  ),
  constraint onboarding_campaigns_title_length_check check (
    char_length(trim(title)) between 1 and 120
  ),
  constraint onboarding_campaigns_description_length_check check (
    description is null or char_length(description) <= 500
  ),
  constraint onboarding_campaigns_platform_scope_check check (
    platform_scope in ('all', 'ios', 'android')
  ),
  constraint onboarding_campaigns_distribution_scope_check check (
    distribution_scope in ('all', 'development', 'preview', 'testflight', 'production')
  )
);

create table if not exists public.user_onboarding_campaigns (
  user_id uuid not null references public.profiles(id) on delete cascade,
  campaign_key text not null references public.onboarding_campaigns(key) on delete cascade,
  status text not null,
  completed_at timestamptz,
  skipped_at timestamptz,
  joined_community_id uuid references public.communities(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (user_id, campaign_key),
  constraint user_onboarding_campaigns_status_check check (
    status in ('completed', 'skipped')
  ),
  constraint user_onboarding_campaigns_completed_at_check check (
    (status <> 'completed') or completed_at is not null
  ),
  constraint user_onboarding_campaigns_skipped_at_check check (
    (status <> 'skipped') or skipped_at is not null
  )
);

create index if not exists idx_onboarding_campaigns_active_sort
  on public.onboarding_campaigns(is_active, sort_order, key);

create index if not exists idx_user_onboarding_campaigns_user_status
  on public.user_onboarding_campaigns(user_id, status);

drop trigger if exists trg_onboarding_campaigns_updated_at
  on public.onboarding_campaigns;
create trigger trg_onboarding_campaigns_updated_at
before update on public.onboarding_campaigns
for each row execute function public.set_updated_at();

drop trigger if exists trg_user_onboarding_campaigns_updated_at
  on public.user_onboarding_campaigns;
create trigger trg_user_onboarding_campaigns_updated_at
before update on public.user_onboarding_campaigns
for each row execute function public.set_updated_at();

alter table public.onboarding_campaigns enable row level security;
alter table public.user_onboarding_campaigns enable row level security;

drop policy if exists onboarding_campaigns_select_authenticated
  on public.onboarding_campaigns;
create policy onboarding_campaigns_select_authenticated
on public.onboarding_campaigns
for select
to authenticated
using (is_active = true);

drop policy if exists user_onboarding_campaigns_select_own
  on public.user_onboarding_campaigns;
create policy user_onboarding_campaigns_select_own
on public.user_onboarding_campaigns
for select
to authenticated
using (user_id = auth.uid());

revoke insert, update, delete on public.onboarding_campaigns from anon;
revoke insert, update, delete on public.onboarding_campaigns from authenticated;
revoke insert, update, delete on public.user_onboarding_campaigns from anon;
revoke insert, update, delete on public.user_onboarding_campaigns from authenticated;

grant select on public.onboarding_campaigns to authenticated;
grant select on public.user_onboarding_campaigns to authenticated;

insert into public.feature_flags_catalog (
  key,
  description,
  enabled_by_default
)
values (
  'mobile_onboarding_alpha',
  'Show the required mobile Alpha onboarding campaign.',
  true
)
on conflict (key)
do update set
  description = excluded.description,
  enabled_by_default = excluded.enabled_by_default,
  updated_at = timezone('utc', now());

insert into public.flairs (
  key,
  label,
  description,
  color_token,
  background_token,
  icon_key,
  scope,
  is_active,
  is_retired
)
values (
  'alpha',
  'ALPHA',
  'Joined the Haven Alpha.',
  'primary',
  'surface-card',
  'sparkles',
  'platform',
  true,
  false
)
on conflict (key)
do update set
  label = excluded.label,
  description = excluded.description,
  color_token = excluded.color_token,
  background_token = excluded.background_token,
  icon_key = excluded.icon_key,
  scope = excluded.scope,
  is_active = true,
  is_retired = false,
  updated_at = timezone('utc', now());

insert into public.onboarding_campaigns (
  key,
  feature_flag_key,
  title,
  description,
  target_flair_key,
  required,
  platform_scope,
  distribution_scope,
  is_active,
  sort_order
)
values (
  'alpha_2026',
  'mobile_onboarding_alpha',
  'Join the Haven Alpha',
  'Required mobile Alpha onboarding and community join.',
  'alpha',
  true,
  'all',
  'all',
  true,
  10
)
on conflict (key)
do update set
  feature_flag_key = excluded.feature_flag_key,
  title = excluded.title,
  description = excluded.description,
  target_flair_key = excluded.target_flair_key,
  required = excluded.required,
  platform_scope = excluded.platform_scope,
  distribution_scope = excluded.distribution_scope,
  is_active = excluded.is_active,
  sort_order = excluded.sort_order,
  updated_at = timezone('utc', now());

create or replace function public.normalize_onboarding_scope_value(
  p_value text,
  p_allowed text[],
  p_default text
)
returns text
language sql
immutable
set search_path = public
as $$
  select case
    when lower(coalesce(trim(p_value), '')) = any(p_allowed) then lower(trim(p_value))
    else p_default
  end;
$$;

create or replace function public.onboarding_semver_parts(p_value text)
returns integer[]
language sql
immutable
set search_path = public
as $$
  select case
    when coalesce(trim(p_value), '') ~ '^[0-9]+(\.[0-9]+){0,2}$' then array[
      split_part(trim(p_value), '.', 1)::integer,
      coalesce(nullif(split_part(trim(p_value), '.', 2), ''), '0')::integer,
      coalesce(nullif(split_part(trim(p_value), '.', 3), ''), '0')::integer
    ]
    else null
  end;
$$;

create or replace function public.onboarding_app_version_matches(
  p_app_version text,
  p_min_app_version text,
  p_max_app_version text
)
returns boolean
language sql
immutable
set search_path = public
as $$
  select
    (
      p_min_app_version is null
      or (
        public.onboarding_semver_parts(p_app_version) is not null
        and public.onboarding_semver_parts(p_app_version)
          >= public.onboarding_semver_parts(p_min_app_version)
      )
    )
    and
    (
      p_max_app_version is null
      or (
        public.onboarding_semver_parts(p_app_version) is not null
        and public.onboarding_semver_parts(p_app_version)
          <= public.onboarding_semver_parts(p_max_app_version)
      )
    );
$$;

create or replace function public.onboarding_campaign_is_enabled_for_user(
  p_user_id uuid,
  p_feature_flag_key text
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(flag_override.enabled, catalog.enabled_by_default, false)
  from public.feature_flags_catalog catalog
  left join public.user_feature_flag_overrides flag_override
    on flag_override.user_id = p_user_id
   and flag_override.flag_key = catalog.key
   and (flag_override.expires_at is null or flag_override.expires_at > timezone('utc', now()))
  where catalog.key = p_feature_flag_key;
$$;

create or replace function public.list_my_onboarding_campaigns(
  p_platform text default 'all',
  p_distribution text default 'all',
  p_app_version text default null
)
returns table (
  campaign_key text,
  feature_flag_key text,
  title text,
  description text,
  required boolean,
  target_community_id uuid,
  target_flair_key text,
  platform_scope text,
  distribution_scope text,
  sort_order integer
)
language sql
stable
security definer
set search_path = public
as $$
  with context as (
    select
      auth.uid() as user_id,
      public.normalize_onboarding_scope_value(
        p_platform,
        array['all', 'ios', 'android'],
        'all'
      ) as platform,
      public.normalize_onboarding_scope_value(
        p_distribution,
        array['all', 'development', 'preview', 'testflight', 'production'],
        'all'
      ) as distribution
  )
  select
    c.key as campaign_key,
    c.feature_flag_key,
    c.title,
    c.description,
    c.required,
    c.target_community_id,
    c.target_flair_key,
    c.platform_scope,
    c.distribution_scope,
    c.sort_order
  from public.onboarding_campaigns c
  cross join context ctx
  left join public.user_onboarding_campaigns uc
    on uc.user_id = ctx.user_id
   and uc.campaign_key = c.key
   and uc.status in ('completed', 'skipped')
  where ctx.user_id is not null
    and c.is_active = true
    and (c.starts_at is null or c.starts_at <= timezone('utc', now()))
    and (c.ends_at is null or c.ends_at > timezone('utc', now()))
    and (c.platform_scope = 'all' or c.platform_scope = ctx.platform)
    and (c.distribution_scope = 'all' or c.distribution_scope = ctx.distribution)
    and public.onboarding_app_version_matches(
      p_app_version,
      c.min_app_version,
      c.max_app_version
    )
    and public.onboarding_campaign_is_enabled_for_user(ctx.user_id, c.feature_flag_key)
    and uc.user_id is null
  order by c.sort_order asc, c.key asc;
$$;

create or replace function public.complete_onboarding_campaign(
  p_campaign_key text,
  p_platform text default 'all',
  p_distribution text default 'all',
  p_app_version text default null
)
returns table (
  campaign_key text,
  status text,
  community_id uuid,
  community_name text,
  joined boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_campaign public.onboarding_campaigns%rowtype;
  v_existing public.user_onboarding_campaigns%rowtype;
  v_joined boolean := false;
  v_inserted_count integer := 0;
begin
  if v_user_id is null then
    raise exception 'Not authenticated.'
      using errcode = '42501';
  end if;

  select *
  into v_existing
  from public.user_onboarding_campaigns uc
  where uc.user_id = v_user_id
    and uc.campaign_key = p_campaign_key
    and uc.status = 'completed';

  if v_existing.user_id is not null then
    return query
      select
        v_existing.campaign_key,
        v_existing.status,
        v_existing.joined_community_id,
        c.name,
        false
      from public.communities c
      where c.id = v_existing.joined_community_id;

    if not found then
      return query
        select
          v_existing.campaign_key,
          v_existing.status,
          null::uuid,
          null::text,
          false;
    end if;
    return;
  end if;

  select c.*
  into v_campaign
  from public.onboarding_campaigns c
  where c.key = p_campaign_key
    and c.is_active = true
    and (c.starts_at is null or c.starts_at <= timezone('utc', now()))
    and (c.ends_at is null or c.ends_at > timezone('utc', now()))
    and (
      c.platform_scope = 'all'
      or c.platform_scope = public.normalize_onboarding_scope_value(
        p_platform,
        array['all', 'ios', 'android'],
        'all'
      )
    )
    and (
      c.distribution_scope = 'all'
      or c.distribution_scope = public.normalize_onboarding_scope_value(
        p_distribution,
        array['all', 'development', 'preview', 'testflight', 'production'],
        'all'
      )
    )
    and public.onboarding_app_version_matches(
      p_app_version,
      c.min_app_version,
      c.max_app_version
    )
    and public.onboarding_campaign_is_enabled_for_user(v_user_id, c.feature_flag_key);

  if v_campaign.key is null then
    raise exception 'Onboarding campaign is not available.'
      using errcode = '22023';
  end if;

  if v_campaign.required and v_campaign.target_community_id is null then
    raise exception 'Onboarding campaign target community is not configured.'
      using errcode = '22023';
  end if;

  if v_campaign.target_community_id is not null then
    if not exists (
      select 1
      from public.communities c
      where c.id = v_campaign.target_community_id
    ) then
      raise exception 'Onboarding campaign target community does not exist.'
        using errcode = '22023';
    end if;

    if exists (
      select 1
      from public.community_bans cb
      where cb.community_id = v_campaign.target_community_id
        and cb.banned_user_id = v_user_id
        and cb.revoked_at is null
    ) then
      raise exception 'You cannot join this community.'
        using errcode = '42501';
    end if;

    insert into public.community_members (
      community_id,
      user_id,
      is_owner
    )
    values (
      v_campaign.target_community_id,
      v_user_id,
      false
    )
    on conflict on constraint community_members_community_id_user_id_key
    do nothing;

    get diagnostics v_inserted_count = row_count;
    v_joined := v_inserted_count > 0;
  end if;

  insert into public.user_onboarding_campaigns (
    user_id,
    campaign_key,
    status,
    completed_at,
    joined_community_id
  )
  values (
    v_user_id,
    v_campaign.key,
    'completed',
    timezone('utc', now()),
    v_campaign.target_community_id
  )
  on conflict on constraint user_onboarding_campaigns_pkey
  do update set
    status = 'completed',
    completed_at = coalesce(public.user_onboarding_campaigns.completed_at, excluded.completed_at),
    skipped_at = null,
    joined_community_id = excluded.joined_community_id,
    updated_at = timezone('utc', now());

  return query
    select
      v_campaign.key,
      'completed'::text,
      v_campaign.target_community_id,
      c.name,
      v_joined
    from public.communities c
    where c.id = v_campaign.target_community_id;

  if not found then
    return query
      select
        v_campaign.key,
        'completed'::text,
        null::uuid,
        null::text,
        v_joined;
  end if;
end;
$$;

revoke all on function public.normalize_onboarding_scope_value(text, text[], text) from public;
revoke all on function public.onboarding_semver_parts(text) from public;
revoke all on function public.onboarding_app_version_matches(text, text, text) from public;
revoke all on function public.onboarding_campaign_is_enabled_for_user(uuid, text) from public;
revoke all on function public.list_my_onboarding_campaigns(text, text, text) from public;
revoke all on function public.complete_onboarding_campaign(text, text, text, text) from public;

grant execute on function public.list_my_onboarding_campaigns(text, text, text)
  to authenticated;
grant execute on function public.complete_onboarding_campaign(text, text, text, text)
  to authenticated;
