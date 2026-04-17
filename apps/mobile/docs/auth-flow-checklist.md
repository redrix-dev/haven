# Mobile Auth Flow Checklist

Use this checklist before shipping auth-related changes on mobile.

## Core login and signup

- Sign in with valid credentials reaches authenticated app.
- Sign in with invalid credentials shows a safe user-facing error.
- Sign up requires legal acceptance and matching passwords.
- Sign up success switches to "Check your email" confirmation state.
- Sign up metadata includes username and current ToS version.

## Password reset request flow

- Reset request requires a non-empty email.
- Reset request success switches to "Check your email" confirmation state.
- Reset request failure shows an actionable user-facing error.
- Reset email links target the shared auth confirm redirect URL.

## Password recovery completion flow

- Recovery deep link works on cold start (`Linking.getInitialURL` path).
- Recovery deep link works while app is already open (`Linking.useURL` path).
- Duplicate processing of the same deep link is ignored.
- Recovery deep links route into the set-new-password flow.
- New password flow requires min length and matching confirmation.
- Successful password update clears recovery gate and exits the flow.
- Sign out from recovery clears recovery gate and signs user out.

## Session and safety checks

- Session persists after app restart (storage adapter active).
- Signed out event clears recovery gate state.
- Auth URL processing errors do not log token contents directly.
