select test_support.note('fixtures/30_moderation: ensure platform_staff rows for active/inactive staff fixtures');

insert into public.platform_staff (
  user_id,
  staff_role,
  is_active,
  display_prefix,
  notes
)
values
  (
    test_support.fixture_user_id('platform_staff_active'),
    'support',
    true,
    'Haven',
    'Test fixture active staff'
  ),
  (
    test_support.fixture_user_id('platform_staff_inactive'),
    'support',
    false,
    'Haven',
    'Test fixture inactive staff'
  )
on conflict (user_id) do update
set
  staff_role = excluded.staff_role,
  is_active = excluded.is_active,
  display_prefix = excluded.display_prefix,
  notes = excluded.notes,
  updated_at = timezone('utc', now());

