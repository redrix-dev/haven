-- Canonical Alpha flair catalog row. Environment-specific community assignment
-- is controlled separately through community_flair_grant_rules.

insert into public.flairs (
  key,
  label,
  description,
  color_token,
  background_token,
  icon_key,
  scope,
  community_id,
  is_active,
  is_retired
)
values (
  'alpha',
  'ALPHA',
  'Joined during the public alpha.',
  'primary',
  'surface-card',
  null,
  'platform',
  null,
  true,
  false
)
on conflict (key) do update
set
  label = excluded.label,
  description = excluded.description,
  color_token = excluded.color_token,
  background_token = excluded.background_token,
  icon_key = excluded.icon_key,
  scope = excluded.scope,
  community_id = excluded.community_id,
  is_active = true,
  is_retired = false;
