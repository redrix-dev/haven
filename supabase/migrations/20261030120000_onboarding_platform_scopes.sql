-- Onboarding campaigns can target web and desktop, and "mobile" (iOS and
-- Android together). The Alpha campaign becomes mobile-only: it was built as
-- the TestFlight Alpha onboarding, but desktop and web reached it too because
-- the server read their "web"/"desktop" platform as "all".
--
-- Matching (onboarding_platform_matches): a campaign scoped "all" reaches
-- every client; "mobile" reaches ios and android; any other scope must equal
-- the client's platform. A client that sends no or an unknown platform only
-- gets "all" campaigns, as before.

alter table public.onboarding_campaigns
  drop constraint onboarding_campaigns_platform_scope_check;
alter table public.onboarding_campaigns
  add constraint onboarding_campaigns_platform_scope_check check (
    platform_scope in ('all', 'mobile', 'ios', 'android', 'web', 'desktop')
  );

create or replace function public.onboarding_platform_matches(
  p_scope text,
  p_platform text
)
returns boolean
language sql
immutable
set search_path = public
as $$
  with client as (
    select public.normalize_onboarding_scope_value(
      p_platform,
      array['ios', 'android', 'web', 'desktop'],
      null
    ) as platform
  )
  select coalesce(
    p_scope = 'all'
    or p_scope = client.platform
    or (p_scope = 'mobile' and client.platform in ('ios', 'android')),
    false
  )
  from client;
$$;

revoke all on function public.onboarding_platform_matches(text, text) from public;

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
      p_platform as platform,
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
    and public.onboarding_platform_matches(c.platform_scope, ctx.platform)
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
  v_already_member boolean := false;
  v_joined boolean := false;
  v_inserted_count integer := 0;
  v_rule record;
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
    and public.onboarding_platform_matches(c.platform_scope, p_platform)
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

    select exists (
      select 1
      from public.community_members cm
      where cm.community_id = v_campaign.target_community_id
        and cm.user_id = v_user_id
    )
    into v_already_member;

    if not v_already_member and exists (
      select 1
      from public.community_bans cb
      where cb.community_id = v_campaign.target_community_id
        and cb.banned_user_id = v_user_id
        and cb.revoked_at is null
    ) then
      raise exception 'You cannot join this community.'
        using errcode = '42501';
    end if;

    if v_already_member then
      for v_rule in
        select r.flair_id, r.grant_source
        from public.community_flair_grant_rules r
        join public.flairs f on f.id = r.flair_id
        where r.community_id = v_campaign.target_community_id
          and r.is_active = true
          and f.is_active = true
          and f.is_retired = false
      loop
        perform public.ensure_user_flair_grant(
          v_user_id,
          v_rule.flair_id,
          v_rule.grant_source,
          v_campaign.target_community_id,
          null
        );
      end loop;
    else
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

revoke all on function public.list_my_onboarding_campaigns(text, text, text) from public;
revoke all on function public.list_my_onboarding_campaigns(text, text, text) from anon;
revoke all on function public.complete_onboarding_campaign(text, text, text, text) from public;
revoke all on function public.complete_onboarding_campaign(text, text, text, text) from anon;
grant execute on function public.list_my_onboarding_campaigns(text, text, text)
  to authenticated;
grant execute on function public.complete_onboarding_campaign(text, text, text, text)
  to authenticated;

update public.onboarding_campaigns
set platform_scope = 'mobile',
    updated_at = timezone('utc', now())
where key = 'alpha_2026';
