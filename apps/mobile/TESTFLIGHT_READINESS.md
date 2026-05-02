# TestFlight readiness — read-only sweep (2026-05-01)

This document satisfies the plan’s **read-only repo sweep** and **TestFlight grading** (no plan file edits). Scope: `apps/mobile/src` and mobile-relevant touchpoints.

## Readiness grade: **Ready with known gaps**

**Rationale:** Username save uses `updateUserProfile`; voice settings row is hidden until the feature exists; avatar pick timing logs only run in dev when `AVATAR_PICK_DEBUG` is true (`__DEV__` gate). Remaining notes are low-severity operational `console.warn` paths.


| Priority | file                                                     | line (approx.) | problem                                          | potential fix                                             | net benefit                                      |
| -------- | -------------------------------------------------------- | -------------- | ------------------------------------------------ | --------------------------------------------------------- | ------------------------------------------------ |
| Done     | `src/components/HavenComposer.tsx`                       | —              | Was logging full markdown on every keystroke.    | Removed.                                                  | No PII / draft content in device logs.           |
| Done     | `src/features/user-profile/UserSettingsContainer.tsx`    | —              | Username change stub.                            | Wired to `updateUserProfile` + live profile upsert.       | Real profile edits.                              |
| Done     | `src/navigation/HavenTabNavigator.tsx`                   | —              | Voice settings placeholder.                      | Voice row removed from settings until implemented.        | No dead affordance.                              |
| Done     | `src/features/user-profile/avatarPickInstrumentation.ts` | —              | Release/TestFlight logging risk.                 | Instrumentation only when `__DEV__ && AVATAR_PICK_DEBUG`. | Quiet production bundles.                        |
| Low      | `src/auth/mobileAuthService.ts`                          | 97             | `console.warn` on sign-out after delete failure. | Optional: route to crash reporting only.                  | Keeps operator signal without user-facing noise. |
| Low      | `src/hooks/useMobileExpoPushRegistration.ts`             | various        | `console.warn` for push token / config issues.   | Same as above; often acceptable for ops.                  | Easier field debugging.                          |
| Low      | `src/hooks/useMobileVoipFoundation.ts`                   | 46             | `console.warn` on CallKeep setup failure.        | Feature-flag VoIP or downgrade log level in prod.         | Aligns logs with shipped features.               |


### Search methodology (scripted / manual)

- **Patterns:** `TODO`, `FIXME`, `XXX`, `console.log`, `debugger`, `@ts-ignore`, `eslint-disable`, `password`, `secret`, `apiKey`, `localhost`, empty `catch` in auth paths (spot-checked).
- **Findings:** No `debugger` or `@ts-ignore` in `apps/mobile/src` beyond avatar pick eslint pragma (dev-only when `AVATAR_PICK_DEBUG` is on). Residual `console.`* are mostly `warn` on failure paths (acceptable with discipline).

### Criteria checklist (abbreviated)


| Criterion                                | Status                                                           |
| ---------------------------------------- | ---------------------------------------------------------------- |
| Auth + session (sign-out / delete) wired | OK — verify on device                                            |
| Stray debug logs in release bundles      | Improved — remove remaining dev-only logs                        |
| Permissions hydrated before gated UI     | OK — `useMobileCommunityPermissionsHydration` in `RootNavigator` |
| Report / ModMail error handling          | Verify on device — backend-dependent                             |


Re-run this sweep after major profile/navigation changes or before each TestFlight build.