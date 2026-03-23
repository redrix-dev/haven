-- Delete entire messages when attached media expires.
-- This keeps chat history consistent: expired media messages disappear as a single unit.

create or replace function public.cleanup_expired_message_attachments(p_limit integer default 200)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_limit integer := greatest(coalesce(p_limit, 200), 1);
  v_deleted integer := 0;
begin
  with expired_messages as (
    select
      ma.message_id,
      min(ma.expires_at) as first_expired_at
    from public.message_attachments ma
    where ma.bucket_name = 'message-media'
      and ma.expires_at <= timezone('utc', now())
    group by ma.message_id
    order by first_expired_at asc
    limit v_limit
  ),
  deleted_rows as (
    delete from public.messages m
    using expired_messages em
    where m.id = em.message_id
    returning m.id
  )
  select count(*)::integer
  into v_deleted
  from deleted_rows;

  return coalesce(v_deleted, 0);
end;
$$;

revoke all on function public.cleanup_expired_message_attachments(integer) from public;
grant execute on function public.cleanup_expired_message_attachments(integer) to authenticated;
