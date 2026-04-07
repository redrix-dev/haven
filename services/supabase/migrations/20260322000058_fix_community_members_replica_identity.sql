-- Enable REPLICA IDENTITY FULL on community_members so Realtime DELETE
-- events include the full old row, allowing client-side membership loss
-- detection to function correctly on mid-session bans and revocations.
ALTER TABLE public.community_members REPLICA IDENTITY FULL;