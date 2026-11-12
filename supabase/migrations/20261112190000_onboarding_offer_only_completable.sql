-- HAV-24: listing and completing an onboarding campaign now ask the same
-- question, in one place.
--
-- Before this, list_my_onboarding_campaigns and complete_onboarding_campaign
-- each had their own copy of "is this campaign offered?", and they disagreed:
-- listing offered a required campaign with no target community, and
-- completing refused it. A required campaign blocks the mobile app, so the
-- user was stuck. That happened on the dev backend (the seeded alpha_2026 has
-- no target) and would happen in production if the target community were
-- deleted (target_community_id is on delete set null).

-- 1. The one answer.
create or replace function public.onboarding_campaign_is_offered(
  p_campaign public.onboarding_campaigns,
  p_user_id uuid,
  p_platform text,
  p_distribution text,
  p_app_version text
)
returns boolean
language sql
stable
set search_path = public
as $$
  select
    p_user_id is not null
    and p_campaign.is_active
    and (p_campaign.starts_at is null or p_campaign.starts_at <= timezone('utc', now()))
    and (p_campaign.ends_at is null or p_campaign.ends_at > timezone('utc', now()))
    -- A required campaign has to put the user somewhere. Without a target
    -- community it cannot be completed, so it is not offered.
    and (not p_campaign.required or p_campaign.target_community_id is not null)
    and public.onboarding_platform_matches(p_campaign.platform_scope, p_platform)
    and (
      p_campaign.distribution_scope = 'all'
      or p_campaign.distribution_scope = public.normalize_onboarding_scope_value(
        p_distribution,
        array['all', 'development', 'preview', 'testflight', 'production'],
        'all'
      )
    )
    and public.onboarding_app_version_matches(
      p_app_version,
      p_campaign.min_app_version,
      p_campaign.max_app_version
    )
    and public.onboarding_campaign_is_enabled_for_user(p_user_id, p_campaign.feature_flag_key);
$$;

revoke all on function public.onboarding_campaign_is_offered(
  public.onboarding_campaigns, uuid, text, text, text
) from public, anon, authenticated;

-- 2. Listing uses it.
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
  where public.onboarding_campaign_is_offered(c, auth.uid(), p_platform, p_distribution, p_app_version)
    and not exists (
      select 1
      from public.user_onboarding_campaigns uc
      where uc.user_id = auth.uid()
        and uc.campaign_key = c.key
        and uc.status in ('completed', 'skipped')
    )
  order by c.sort_order asc, c.key asc;
$$;

-- 3. Completing uses it. Body is the live definition with its own copy of the
--    filter replaced by the predicate, and the now-unreachable "target
--    community is not configured" error removed.
CREATE OR REPLACE FUNCTION public.complete_onboarding_campaign(p_campaign_key text, p_platform text DEFAULT 'all'::text, p_distribution text DEFAULT 'all'::text, p_app_version text DEFAULT NULL::text)
 RETURNS TABLE(campaign_key text, status text, community_id uuid, community_name text, joined boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    and public.onboarding_campaign_is_offered(c, v_user_id, p_platform, p_distribution, p_app_version);

  if v_campaign.key is null then
    raise exception 'Onboarding campaign is not available.'
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
$function$;
