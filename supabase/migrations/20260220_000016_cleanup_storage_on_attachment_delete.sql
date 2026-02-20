-- Ensure attachment storage objects are removed whenever attachment rows are deleted.

create or replace function public.delete_message_attachment_storage_object()
returns trigger
language plpgsql
security definer
set search_path = public, storage
as $$
begin
  if old.bucket_name is not null and old.object_path is not null then
    delete from storage.objects
    where bucket_id = old.bucket_name
      and name = old.object_path;
  end if;

  return old;
end;
$$;

drop trigger if exists trg_message_attachment_storage_cleanup on public.message_attachments;

create trigger trg_message_attachment_storage_cleanup
after delete on public.message_attachments
for each row
execute function public.delete_message_attachment_storage_object();
