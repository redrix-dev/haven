-- Who a case involves, for the staff site. A staff account cannot call
-- get_profiles (it is for people, and a staff account never acts as one), and
-- the snapshot names the people in what was reported but not who reported it.
-- So staff ask through the case: the reporter, the person it is about, and
-- everyone in its log and its decisions. Only for a case they may read.
create function public.staff_case_people(p_case_id uuid)
returns setof public.profile_record
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.require_staff();
begin
  if not private.can_read_case(p_case_id, v_me) then
    perform private.fail('not_found', 'case_not_found', 'That case could not be found.');
  end if;
  return query
  select (private.profile_record(p)).*
  from public.profiles p
  -- The reporter is the actor of the "filed" event that starts every log.
  where p.id in (
    select c.subject_user_id from public.platform_cases c where c.id = p_case_id
    union select c.csam_flagged_by from public.platform_cases c where c.id = p_case_id
    union select e.actor_id from public.platform_case_events e where e.case_id = p_case_id
    union select d.decided_by from public.platform_case_decisions d where d.case_id = p_case_id
    union select d.reversed_by from public.platform_case_decisions d where d.case_id = p_case_id
  );
end;
$$;
grant execute on function public.staff_case_people(uuid) to authenticated;
