create or replace function test_support.set_jwt_claims(
  p_user_id uuid,
  p_role text default 'authenticated'
)
returns void
language plpgsql
as $$
begin
  perform set_config('request.jwt.claim.role', coalesce(p_role, 'authenticated'), true);
  perform set_config('request.jwt.claim.sub', coalesce(p_user_id::text, ''), true);
  perform set_config(
    'request.jwt.claims',
    jsonb_build_object(
      'role', coalesce(p_role, 'authenticated'),
      'sub', coalesce(p_user_id::text, '')
    )::text,
    true
  );
end;
$$;

create or replace function test_support.clear_jwt_claims()
returns void
language plpgsql
as $$
begin
  perform set_config('request.jwt.claim.role', '', true);
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '{}'::jsonb::text, true);
end;
$$;

