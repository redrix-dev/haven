# Local native feel testing

Build the intended `staging` commit on each native host. Keep a separate worktree
when the usual checkout has unfinished changes. Preserve `.env`, dependencies,
and app data when cleaning generated build output.

## Desktop

Use the Node/npm versions in `package.json`, then `npm ci`. The repository-root
`.env` must contain `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` before
building. Vite embeds these values into the packaged client.

Clear Rust output with:

```sh
cargo clean --manifest-path apps/tauri/src-tauri/Cargo.toml
```

`dist/` is also generated and can be removed before building. Do not use a broad
`git clean` on a checkout containing local configuration or unfinished work.

For local packages without updater signing, save this JSON outside the repo as
`local-bundle.json` and pass its absolute path to `--config`:

```json
{ "bundle": { "createUpdaterArtifacts": false } }
```

Using a file avoids PowerShell/npm stripping quotes from inline JSON arguments.

```sh
# macOS
npm run tauri:build -- --bundles app --config /absolute/path/local-bundle.json
# Windows
corepack npm run tauri:build -- --bundles nsis --config C:/absolute/path/local-bundle.json
```

Outputs are under `apps/tauri/src-tauri/target/release/`: Mac
`bundle/macos/Haven.app`, Windows `bundle/nsis/` and `haven-tauri.exe`.
These are local test builds, not signed/notarized release candidates.

Verify the Mac bundle signature with `codesign --verify --deep --strict`.
If the local bundle's inherited signature is invalid, apply an ad hoc signature:

```sh
codesign --force --deep --sign - --entitlements apps/tauri/src-tauri/Entitlements.plist apps/tauri/src-tauri/target/release/bundle/macos/Haven.app
codesign --verify --deep --strict apps/tauri/src-tauri/target/release/bundle/macos/Haven.app
open apps/tauri/src-tauri/target/release/bundle/macos/Haven.app
```

If Windows' `.cargo/bin/cargo.exe` cannot execute but the installed toolchain's
binary works, prepend that toolchain's `bin` directory to PATH for the build
process. Do not reinstall Rust or change global PATH just for this symptom.

## Mobile without Metro

Use Release builds to embed JavaScript. `--no-bundler` alone does not turn a
Debug development client into a standalone app. The EAS `development` profile
also builds a development client; `preview` is the internal standalone profile.

From the repository root, install mobile dependencies and regenerate native
projects so current config plugins, including native voice sounds, are applied:

```sh
npm run setup:mobile
npm run mobile:native:prebuild
```

Keep `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` in
`apps/mobile/.env`. On Mac, use a UTF-8 locale for prebuild/pods. If pods were
skipped, run `LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 pod install` from
`apps/mobile/ios`.

### Physical iPhone, built on Mac

Connect/unlock the phone, enable Developer Mode, and use the existing Apple team
and development provisioning in Xcode. Run from the repository root:

```sh
node tooling/scripts/mobile/run-in-mobile.mjs npx expo run:ios --device --configuration Release --no-bundler
```

This builds and installs a locally signed app with embedded JavaScript; it does
not create an App Store submission. If signing needs interaction, open
`apps/mobile/ios/HavenMobile.xcworkspace` in Xcode, select the phone and team,
and use Release for the scheme's Run configuration. Never disable signing for a
physical iPhone install. No Metro server is needed after installation.

For an internally distributed IPA instead, use:

```sh
npm run mobile:eas:build -- --profile preview --platform ios
```

EAS internal iOS distribution needs the iPhone registered for its provisioning
profile. This is a separate cloud build, not required for the local install.

### Android emulator

Start an Android Studio virtual device on the build host, then run:

```sh
node tooling/scripts/mobile/run-in-mobile.mjs npx expo run:android --device --variant release --no-bundler
```

Select the emulator. The APK is normally
`apps/mobile/android/app/build/outputs/apk/release/app-release.apk` and can be
reinstalled with `adb install -r <apk-path>`. The generated local release variant
uses the debug keystore, which is suitable for emulator testing, not publishing.

### Confirm the tested JavaScript

Mobile config currently enables the production OTA channel. Check the app's
update diagnostics for **Embedded binary** / **Running the embedded build**
before evaluating staging. A downloaded production update can change the running
JavaScript after restart. Do not apply an OTA during staging feel testing. If
the app is running a cached update, a fresh install clears app data and cached
updates; only do that when losing local session/settings is acceptable.

The mobile commands above were checked against the installed Expo CLI options
and generated native configuration; this desktop build pass did not execute
mobile builds or device/emulator tests.
