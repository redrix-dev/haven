create schema if not exists test_support;
grant usage on schema test_support to public;

create or replace function test_support.note(p_message text)
returns void
language plpgsql
as $$
begin
  raise notice '[test] %', coalesce(p_message, '(no message)');
end;
$$;

create or replace function test_support.assert_true(p_condition boolean, p_message text)
returns void
language plpgsql
as $$
begin
  if coalesce(p_condition, false) is not true then
    raise exception '[assert_true] %', coalesce(p_message, 'condition was false');
  end if;
end;
$$;

create or replace function test_support.assert_false(p_condition boolean, p_message text)
returns void
language plpgsql
as $$
begin
  if coalesce(p_condition, false) is true then
    raise exception '[assert_false] %', coalesce(p_message, 'condition was true');
  end if;
end;
$$;

create or replace function test_support.assert_not_null(p_value anyelement, p_message text)
returns void
language plpgsql
as $$
begin
  if p_value is null then
    raise exception '[assert_not_null] %', coalesce(p_message, 'value was null');
  end if;
end;
$$;

create or replace function test_support.assert_eq_int(p_actual bigint, p_expected bigint, p_message text)
returns void
language plpgsql
as $$
begin
  if coalesce(p_actual, -9223372036854775808) <> coalesce(p_expected, -9223372036854775808) then
    raise exception '[assert_eq_int] % (actual=% expected=%)',
      coalesce(p_message, 'integer values differ'),
      p_actual,
      p_expected;
  end if;
end;
$$;

create or replace function test_support.assert_eq_text(p_actual text, p_expected text, p_message text)
returns void
language plpgsql
as $$
begin
  if p_actual is distinct from p_expected then
    raise exception '[assert_eq_text] % (actual=% expected=%)',
      coalesce(p_message, 'text values differ'),
      p_actual,
      p_expected;
  end if;
end;
$$;

create or replace function test_support.expect_exception(
  p_sql text,
  p_expected_message_substring text default null
)
returns void
language plpgsql
as $$
declare
  v_error text;
begin
  begin
    execute p_sql;
  exception when others then
    v_error := sqlerrm;
  end;

  if v_error is null then
    raise exception '[expect_exception] statement succeeded but failure was expected: %', p_sql;
  end if;

  if p_expected_message_substring is not null
     and position(lower(p_expected_message_substring) in lower(v_error)) = 0 then
    raise exception '[expect_exception] expected error containing "%" but got "%"',
      p_expected_message_substring,
      v_error;
  end if;
end;
$$;

create or replace function test_support.assert_query_count(
  p_sql text,
  p_expected bigint,
  p_message text
)
returns void
language plpgsql
as $$
declare
  v_actual bigint;
begin
  execute format('select count(*)::bigint from (%s) q', p_sql) into v_actual;
  perform test_support.assert_eq_int(v_actual, p_expected, p_message);
end;
$$;

grant execute on all functions in schema test_support to public;

