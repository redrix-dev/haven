create table if not exists public.tos_acceptances (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  accepted_at timestamptz not null default now(),
  tos_version text not null default '2026-03-24',
  ip_address text null
);

alter table public.tos_acceptances enable row level security;

create policy tos_acceptances_insert_self
on public.tos_acceptances
for insert
to authenticated
with check (user_id = auth.uid());

create policy tos_acceptances_select_self
on public.tos_acceptances
for select
to authenticated
using (user_id = auth.uid());

create policy tos_acceptances_select_platform_staff
on public.tos_acceptances
for select
to authenticated
using (
  exists (
    select 1
    from public.platform_staff staff
    where staff.user_id = auth.uid()
      and staff.is_active = true
  )
);

create or replace function public.record_signup_tos_acceptance()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tos_version text := nullif(trim(new.raw_user_meta_data->>'tos_version'), '');
  v_tos_accepted boolean := coalesce((new.raw_user_meta_data->>'accepted_tos')::boolean, false);
  v_accepted_at timestamptz := nullif(new.raw_user_meta_data->>'tos_accepted_at', '')::timestamptz;
begin
  if not v_tos_accepted then
    return new;
  end if;

  insert into public.tos_acceptances (user_id, accepted_at, tos_version, ip_address)
  values (
    new.id,
    coalesce(v_accepted_at, now()),
    coalesce(v_tos_version, '2026-03-24'),
    null
  );

  return new;
end;
$$;

drop trigger if exists trg_record_signup_tos_acceptance on auth.users;
create trigger trg_record_signup_tos_acceptance
after insert on auth.users
for each row execute function public.record_signup_tos_acceptance();

-- CHECKPOINT 5 COMPLETE
