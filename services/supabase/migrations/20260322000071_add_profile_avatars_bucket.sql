insert into storage.buckets (id, name, public)
values ('profile-avatars', 'profile-avatars', true)
on conflict do nothing;

drop policy if exists storage_profile_avatars_select_public on storage.objects;
drop policy if exists storage_profile_avatars_insert_own_path on storage.objects;
drop policy if exists storage_profile_avatars_update_own_path on storage.objects;
drop policy if exists storage_profile_avatars_delete_own_path on storage.objects;

create policy storage_profile_avatars_select_public
on storage.objects
for select
to public
using (
  bucket_id = 'profile-avatars'
);

create policy storage_profile_avatars_insert_own_path
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'profile-avatars'
  and split_part(name, '/', 1) = auth.uid()::text
);

create policy storage_profile_avatars_update_own_path
on storage.objects
for update
to authenticated
using (
  bucket_id = 'profile-avatars'
  and split_part(name, '/', 1) = auth.uid()::text
)
with check (
  bucket_id = 'profile-avatars'
  and split_part(name, '/', 1) = auth.uid()::text
);

create policy storage_profile_avatars_delete_own_path
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'profile-avatars'
  and split_part(name, '/', 1) = auth.uid()::text
);

-- CHECKPOINT 1 COMPLETE
