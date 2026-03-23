-- channels: filtered by community_id on DELETE, not a PK column
ALTER TABLE public.channels REPLICA IDENTITY FULL;

-- channel_groups: filtered by community_id on DELETE, not a PK column
ALTER TABLE public.channel_groups REPLICA IDENTITY FULL;

-- channel_group_channels: filtered by community_id on DELETE; FULL keeps payloads
-- consistent even though the composite PK already contains the filtered column
ALTER TABLE public.channel_group_channels REPLICA IDENTITY FULL;

-- friend_requests: filtered by sender_user_id/recipient_user_id on DELETE, neither
-- of which is part of the default replica identity
ALTER TABLE public.friend_requests REPLICA IDENTITY FULL;

-- notification_recipients: filtered by recipient_user_id on DELETE, not a PK column
ALTER TABLE public.notification_recipients REPLICA IDENTITY FULL;

-- dm_messages: filtered by conversation_id on DELETE, not a PK column
ALTER TABLE public.dm_messages REPLICA IDENTITY FULL;

-- CHECKPOINT 1 COMPLETE
