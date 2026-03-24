alter table public.community_bans
  alter column banned_by_user_id drop not null;

alter table public.community_bans
  drop constraint if exists community_bans_banned_by_user_id_fkey;

alter table public.community_bans
  add constraint community_bans_banned_by_user_id_fkey
  foreign key (banned_by_user_id)
  references public.profiles(id)
  on delete set null;

alter table public.channel_groups
  alter column created_by_user_id drop not null;

alter table public.channel_groups
  drop constraint if exists channel_groups_created_by_user_id_fkey;

alter table public.channel_groups
  add constraint channel_groups_created_by_user_id_fkey
  foreign key (created_by_user_id)
  references public.profiles(id)
  on delete set null;

-- CHECKPOINT COMPLETE
