-- Theme preference for user profiles (values validated in application code).
alter table public.profiles
  add column theme text not null default 'default';

alter table public.profiles
  add constraint profiles_theme_not_empty
  check (trim(theme) <> '');
