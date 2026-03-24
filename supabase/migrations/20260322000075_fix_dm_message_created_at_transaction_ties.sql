alter table public.dm_messages
  alter column created_at set default timezone('utc', clock_timestamp());
