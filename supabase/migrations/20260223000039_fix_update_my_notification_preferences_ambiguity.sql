-- Hotfix: resolve PL/pgSQL OUT parameter/table-column ambiguity in
-- update_my_notification_preferences (OUT column name `user_id`).

create or replace function public.update_my_notification_preferences(
  p_friend_request_in_app_enabled boolean,
  p_friend_request_sound_enabled boolean,
  p_dm_in_app_enabled boolean,
  p_dm_sound_enabled boolean,
  p_mention_in_app_enabled boolean,
  p_mention_sound_enabled boolean
)
returns table(
  user_id uuid,
  friend_request_in_app_enabled boolean,
  friend_request_sound_enabled boolean,
  dm_in_app_enabled boolean,
  dm_sound_enabled boolean,
  mention_in_app_enabled boolean,
  mention_sound_enabled boolean,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  perform public.ensure_user_notification_preferences_row(auth.uid());

  update public.user_notification_preferences as p
  set
    friend_request_in_app_enabled = p_friend_request_in_app_enabled,
    friend_request_sound_enabled = p_friend_request_sound_enabled,
    dm_in_app_enabled = p_dm_in_app_enabled,
    dm_sound_enabled = p_dm_sound_enabled,
    mention_in_app_enabled = p_mention_in_app_enabled,
    mention_sound_enabled = p_mention_sound_enabled,
    updated_at = timezone('utc', now())
  where p.user_id = auth.uid();

  return query
  select * from public.get_my_notification_preferences();
end;
$$;

revoke all on function public.update_my_notification_preferences(boolean, boolean, boolean, boolean, boolean, boolean) from public;
grant execute on function public.update_my_notification_preferences(boolean, boolean, boolean, boolean, boolean, boolean)
  to authenticated;

