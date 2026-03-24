drop policy if exists support_reports_select_visible on public.support_reports;
create policy support_reports_select_visible
on public.support_reports
for select
to authenticated
using (
  reporter_user_id = auth.uid()
  or (
    destination in ('server_admins', 'both')
    and (
      public.is_community_owner(community_id)
      or public.user_has_permission(community_id, 'manage_reports')
    )
  )
  or (
    destination in ('haven_staff', 'both')
    and exists (
      select 1
      from public.platform_staff ps
      where ps.user_id = auth.uid()
        and ps.is_active = true
    )
  )
);

drop policy if exists support_reports_update_manager_only on public.support_reports;
create policy support_reports_update_manager_only
on public.support_reports
for update
to authenticated
using (
  destination in ('server_admins', 'both')
  and (
    public.is_community_owner(community_id)
    or public.user_has_permission(community_id, 'manage_reports')
  )
)
with check (
  destination in ('server_admins', 'both')
  and (
    public.is_community_owner(community_id)
    or public.user_has_permission(community_id, 'manage_reports')
  )
);

drop policy if exists support_reports_delete_manager_only on public.support_reports;
create policy support_reports_delete_manager_only
on public.support_reports
for delete
to authenticated
using (
  destination in ('server_admins', 'both')
  and (
    public.is_community_owner(community_id)
    or public.user_has_permission(community_id, 'manage_reports')
  )
);

drop policy if exists support_report_channels_select_visible on public.support_report_channels;
create policy support_report_channels_select_visible
on public.support_report_channels
for select
to authenticated
using (
  exists (
    select 1
    from public.support_reports sr
    where sr.id = support_report_channels.report_id
      and (
        sr.reporter_user_id = auth.uid()
        or (
          sr.destination in ('server_admins', 'both')
          and (
            public.is_community_owner(sr.community_id)
            or public.user_has_permission(sr.community_id, 'manage_reports')
          )
        )
        or (
          sr.destination in ('haven_staff', 'both')
          and exists (
            select 1
            from public.platform_staff ps
            where ps.user_id = auth.uid()
              and ps.is_active = true
          )
        )
      )
  )
);

drop policy if exists support_report_channels_insert_visible on public.support_report_channels;
create policy support_report_channels_insert_visible
on public.support_report_channels
for insert
to authenticated
with check (
  exists (
    select 1
    from public.support_reports sr
    where sr.id = support_report_channels.report_id
      and (
        sr.reporter_user_id = auth.uid()
        or (
          sr.destination in ('server_admins', 'both')
          and (
            public.is_community_owner(sr.community_id)
            or public.user_has_permission(sr.community_id, 'manage_reports')
          )
        )
      )
  )
);

drop policy if exists support_report_channels_update_manager_only on public.support_report_channels;
create policy support_report_channels_update_manager_only
on public.support_report_channels
for update
to authenticated
using (
  exists (
    select 1
    from public.support_reports sr
    where sr.id = support_report_channels.report_id
      and sr.destination in ('server_admins', 'both')
      and (
        public.is_community_owner(sr.community_id)
        or public.user_has_permission(sr.community_id, 'manage_reports')
      )
  )
)
with check (
  exists (
    select 1
    from public.support_reports sr
    where sr.id = support_report_channels.report_id
      and sr.destination in ('server_admins', 'both')
      and (
        public.is_community_owner(sr.community_id)
        or public.user_has_permission(sr.community_id, 'manage_reports')
      )
  )
);

drop policy if exists support_report_channels_delete_manager_only on public.support_report_channels;
create policy support_report_channels_delete_manager_only
on public.support_report_channels
for delete
to authenticated
using (
  exists (
    select 1
    from public.support_reports sr
    where sr.id = support_report_channels.report_id
      and sr.destination in ('server_admins', 'both')
      and (
        public.is_community_owner(sr.community_id)
        or public.user_has_permission(sr.community_id, 'manage_reports')
      )
  )
);

drop policy if exists support_report_messages_select_visible on public.support_report_messages;
create policy support_report_messages_select_visible
on public.support_report_messages
for select
to authenticated
using (
  exists (
    select 1
    from public.support_reports sr
    where sr.id = support_report_messages.report_id
      and (
        sr.reporter_user_id = auth.uid()
        or (
          sr.destination in ('server_admins', 'both')
          and (
            public.is_community_owner(sr.community_id)
            or public.user_has_permission(sr.community_id, 'manage_reports')
          )
        )
        or (
          sr.destination in ('haven_staff', 'both')
          and exists (
            select 1
            from public.platform_staff ps
            where ps.user_id = auth.uid()
              and ps.is_active = true
          )
        )
      )
  )
);

drop policy if exists support_report_messages_insert_visible on public.support_report_messages;
create policy support_report_messages_insert_visible
on public.support_report_messages
for insert
to authenticated
with check (
  exists (
    select 1
    from public.support_reports sr
    where sr.id = support_report_messages.report_id
      and (
        sr.reporter_user_id = auth.uid()
        or (
          sr.destination in ('server_admins', 'both')
          and (
            public.is_community_owner(sr.community_id)
            or public.user_has_permission(sr.community_id, 'manage_reports')
          )
        )
      )
  )
);

drop policy if exists support_report_messages_update_manager_only on public.support_report_messages;
create policy support_report_messages_update_manager_only
on public.support_report_messages
for update
to authenticated
using (
  exists (
    select 1
    from public.support_reports sr
    where sr.id = support_report_messages.report_id
      and sr.destination in ('server_admins', 'both')
      and (
        public.is_community_owner(sr.community_id)
        or public.user_has_permission(sr.community_id, 'manage_reports')
      )
  )
)
with check (
  exists (
    select 1
    from public.support_reports sr
    where sr.id = support_report_messages.report_id
      and sr.destination in ('server_admins', 'both')
      and (
        public.is_community_owner(sr.community_id)
        or public.user_has_permission(sr.community_id, 'manage_reports')
      )
  )
);

drop policy if exists support_report_messages_delete_manager_only on public.support_report_messages;
create policy support_report_messages_delete_manager_only
on public.support_report_messages
for delete
to authenticated
using (
  exists (
    select 1
    from public.support_reports sr
    where sr.id = support_report_messages.report_id
      and sr.destination in ('server_admins', 'both')
      and (
        public.is_community_owner(sr.community_id)
        or public.user_has_permission(sr.community_id, 'manage_reports')
      )
  )
);

-- CHECKPOINT 2 COMPLETE
