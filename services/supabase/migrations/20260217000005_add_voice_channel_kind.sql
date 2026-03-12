-- Adds voice channels for P2P WebRTC MVP.

alter type public.channel_kind add value if not exists 'voice';
