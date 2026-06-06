-- Keep post-auth onboarding RPCs callable only after authentication.

revoke all on function public.list_my_onboarding_campaigns(text, text, text) from public;
revoke all on function public.list_my_onboarding_campaigns(text, text, text) from anon;
revoke all on function public.complete_onboarding_campaign(text, text, text, text) from public;
revoke all on function public.complete_onboarding_campaign(text, text, text, text) from anon;

grant execute on function public.list_my_onboarding_campaigns(text, text, text)
  to authenticated;
grant execute on function public.complete_onboarding_campaign(text, text, text, text)
  to authenticated;
