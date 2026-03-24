begin;

delete from public.role_permissions
where permission_key in ('manage_developer_access', 'mention_haven_developers');

delete from public.permissions_catalog
where key in ('manage_developer_access', 'mention_haven_developers');

update public.permissions_catalog
set description = 'Manually regenerate link previews for messages'
where key = 'refresh_link_previews';

commit;

-- CHECKPOINT 4 COMPLETE
