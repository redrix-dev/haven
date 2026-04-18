-- tos_acceptances: remove client self-insert; keep rows created only via signup trigger.
-- Tighten trigger (C1): require allowlisted tos_version and a client-provided acceptance timestamp.

drop policy if exists tos_acceptances_insert_self on public.tos_acceptances;

revoke insert on public.tos_acceptances from anon;
revoke insert on public.tos_acceptances from authenticated;

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

  if v_tos_version is null or v_tos_version = '' then
    return new;
  end if;

  if v_accepted_at is null then
    return new;
  end if;

  -- Add new versions here when CURRENT_TOS_VERSION changes (see packages/shared policies).
  if v_tos_version not in ('2026-03-24') then
    return new;
  end if;

  insert into public.tos_acceptances (user_id, accepted_at, tos_version, ip_address)
  values (
    new.id,
    v_accepted_at,
    v_tos_version,
    null
  );

  return new;
end;
$$;
