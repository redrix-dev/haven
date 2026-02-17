# `voice-ice` Edge Function

This function returns WebRTC ICE server config for voice calls.

It is provider-agnostic at the app layer:
- Current provider: Xirsys
- Fallback: public Google STUN if Xirsys is unavailable

## Required secrets

Set these in Supabase project secrets:

1. `XIRSYS_IDENT`
2. `XIRSYS_SECRET`
3. `XIRSYS_CHANNEL`

Optional:

4. `XIRSYS_GATEWAY` (defaults to `global.xirsys.net`)

## Example deploy flow

```bash
npx supabase functions deploy voice-ice --no-verify-jwt --project-ref <PROJECT_REF>
supabase secrets set XIRSYS_IDENT=... XIRSYS_SECRET=... XIRSYS_CHANNEL=...
```

## Notes

- The client should call this function via `supabase.functions.invoke('voice-ice')`.
- Do not expose Xirsys `ident/secret` in renderer code.
- Function currently returns `source: "xirsys"` or `source: "fallback"` plus `iceServers`.
- This function performs its own bearer-token validation with `auth.getUser(token)`.
  `--no-verify-jwt` is used to bypass gateway JWT verification issues while keeping auth enforced in function code.
