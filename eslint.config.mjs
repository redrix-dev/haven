import tsPlugin from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";
import reactHooks from "eslint-plugin-react-hooks";
import boundaries from "eslint-plugin-boundaries";

/**
 * The core boundary. Screens read the core's stores and call its commands;
 * only the host builds the core, its Supabase client and its device storage.
 * Shared code never touches a platform's storage.
 */
const sharedStorageBoundary = [
  {
    group: ["react-native-mmkv", "react-native-mmkv/*"],
    message:
      "Shared code does not touch device storage. The host passes a DevicePersistence when it builds the core.",
  },
];

/**
 * Files that build the core, its stores or its client, and tests, may reach
 * below the boundary.
 */
const havenCoreConsumerBoundaryIgnores = [
  "**/__tests__/**",
  "**/*.test.{ts,tsx,js,jsx}",
  "apps/mobile/src/auth/mobileAuthService.ts",
  "apps/mobile/src/data/**",
  "apps/mobile/src/lib/createMmkvPersistence.ts",
  "apps/mobile/src/lib/react-native-mmkv.d.ts",
  "apps/mobile/src/supabase/**",
];

const havenCoreConsumerRestrictedImportPaths = [
  {
    name: "@shared/lib/backend",
    importNames: ["createBackend"],
    message:
      "UI/features must not build a backend. Call the core's commands, or core.backend for a read no collection holds.",
  },
  {
    name: "@shared/lib/createHavenSupabaseClient",
    message:
      "Supabase client construction belongs to host bootstrap. UI/features consume the registered HavenCore instead.",
  },
  {
    name: "@supabase/supabase-js",
    importNames: ["createClient"],
    message:
      "UI/features must not create Supabase clients. Construct HavenCore at host bootstrap and consume it through @shared/core.",
  },
];

const havenCoreConsumerRestrictedImportPatterns = [
  {
    group: ["@shared/core/persistence/*"],
    message:
      "Device storage is passed to the core when the host builds it. UI/features must not import it directly.",
  },
];

const havenCoreConsumerRestrictedSyntax = [
  {
    selector: "Literal[value='postgres_changes']",
    message:
      "Realtime arrives through the core's topic (docs/architecture/REALTIME.md). Voice is the documented exception.",
  },
  {
    selector: "CallExpression[callee.name='createClient']",
    message:
      "UI/features must not create Supabase clients. Use the registered HavenCore from @shared/core.",
  },
  {
    selector: "CallExpression[callee.name='createHavenSupabaseClient']",
    message:
      "UI/features must not create Haven Supabase clients. Use host bootstrap + the registered HavenCore.",
  },
  {
    selector:
      "CallExpression[callee.property.name='rpc'][callee.object.name='supabase']",
    message:
      "UI/features must not call Supabase RPC directly. Put it in a backend client and call it through the core.",
  },
  {
    selector:
      "CallExpression[callee.property.name='rpc'][callee.object.name='client']",
    message:
      "UI/features must not call Supabase RPC directly. Put it in a backend client and call it through the core.",
  },
  {
    selector:
      "CallExpression[callee.property.name='from'][callee.object.name='supabase']",
    message:
      "UI/features must not query Supabase directly. Put it in a backend client and call it through the core.",
  },
  {
    selector:
      "CallExpression[callee.property.name='from'][callee.object.name='client']",
    message:
      "UI/features must not query Supabase directly. Put it in a backend client and call it through the core.",
  },
  {
    selector:
      "CallExpression[callee.property.name='channel'][callee.object.name='supabase']",
    message:
      "UI/features must not subscribe to Supabase channels directly. The core's event table applies every event (docs/architecture/REALTIME.md).",
  },
  {
    selector:
      "CallExpression[callee.property.name='channel'][callee.object.name='client']",
    message:
      "UI/features must not subscribe to Supabase channels directly. The core's event table applies every event (docs/architecture/REALTIME.md).",
  },
];

const mobileBoundaryRestrictions = [
  {
    group: ["@platform/desktop/*", "**/platform/desktop/*"],
    message: "Mobile code must not import desktop platform bridges.",
  },
  {
    group: ["@solid-client/*", "solid-js", "solid-js/*"],
    message: "Mobile code must not import Solid modules.",
  },
  {
    group: ["node:*"],
    message: "Mobile runtime code must not import Node built-ins.",
  },
];

export default [
  {
    ignores: [
      "node_modules/**",
      "dist/**",
      "**/dist/**",
      // Rust/Tauri build output — generated codegen assets, not source.
      "**/src-tauri/target/**",
    ],
  },
  {
    files: [
      "apps/**/*.{ts,tsx,js,jsx}",
      "packages/**/*.{ts,tsx,js,jsx}",
      "tooling/**/*.{ts,tsx,js,jsx}",
    ],
    languageOptions: {
      parser: tsParser,
      sourceType: "module",
      ecmaVersion: "latest",
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
    plugins: {
      "@typescript-eslint": tsPlugin,
    },
    rules: {
      "no-restricted-properties": [
        "error",
        {
          object: "window",
          property: "desktop",
          message:
            "Use getAppHost() from @shared/infrastructure/platform/appHost in app code; the legacy window.desktop Electron bridge is gone.",
        },
        {
          object: "window",
          property: "havenDesktop",
          message:
            "Use getAppHost() from @shared/infrastructure/platform/appHost instead of legacy window.havenDesktop access.",
        },
      ],
    },
  },
  {
    files: ["packages/shared/src/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@platform/desktop/client",
              message:
                "Import getAppHost from @shared/infrastructure/platform/appHost instead. Each shell registers its own bridge at bootstrap.",
            },
          ],
          patterns: sharedStorageBoundary,
        },
      ],
    },
  },
  {
    files: ["packages/shared/src/features/**/*.{ts,tsx,js,jsx}"],
    ignores: havenCoreConsumerBoundaryIgnores,
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@platform/desktop/client",
              message:
                "Import getAppHost from @shared/infrastructure/platform/appHost instead. Each shell registers its own bridge at bootstrap.",
            },
            ...havenCoreConsumerRestrictedImportPaths,
          ],
          patterns: [
            ...sharedStorageBoundary,
            ...havenCoreConsumerRestrictedImportPatterns,
          ],
        },
      ],
      "no-restricted-syntax": ["error", ...havenCoreConsumerRestrictedSyntax],
    },
  },
  {
    files: ["apps/mobile/**/*.{ts,tsx,js,jsx}"],
    ignores: [],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: mobileBoundaryRestrictions,
        },
      ],
      "no-restricted-globals": [
        "error",
        {
          name: "window",
          message:
            "Mobile code should use platform-safe abstractions from @shared/infrastructure/platform/appHost.",
        },
        {
          name: "document",
          message: "Mobile code cannot rely on DOM globals.",
        },
        {
          name: "localStorage",
          message:
            "Mobile code cannot use localStorage; use AsyncStorage-backed abstractions.",
        },
      ],
    },
  },
  {
    files: ["apps/mobile/src/**/*.{ts,tsx,js,jsx}"],
    ignores: havenCoreConsumerBoundaryIgnores,
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: havenCoreConsumerRestrictedImportPaths,
          patterns: [
            ...mobileBoundaryRestrictions,
            ...havenCoreConsumerRestrictedImportPatterns,
          ],
        },
      ],
      "no-restricted-syntax": ["error", ...havenCoreConsumerRestrictedSyntax],
    },
  },
  {
    // ── Solid client shape boundaries ──────────────────────────────────────
    // The committed folder shape of packages/solid-client and the one-way
    // dependency flow between its layers. Full reasoning + the shape itself:
    // docs/architecture/SOLID_CLIENT_SHAPE.md. If a rule here blocks you, the
    // answer is almost always "move the shared thing DOWN a layer", not "allow
    // the import".
    files: ["packages/solid-client/src/**/*.{ts,tsx}"],
    plugins: { boundaries },
    settings: {
      "import/resolver": {
        typescript: {
          project: "packages/solid-client/tsconfig.json",
        },
      },
      "boundaries/elements": [
        // Order matters: first match wins, so deeper/more-specific first.
        {
          type: "feature",
          pattern: "packages/solid-client/src/features/*",
          mode: "folder",
          capture: ["featureName"],
        },
        {
          type: "routes",
          pattern: "packages/solid-client/src/routes",
          mode: "folder",
        },
        {
          type: "ui",
          pattern: "packages/solid-client/src/components/ui",
          mode: "folder",
        },
        {
          type: "contexts",
          pattern: "packages/solid-client/src/contexts",
          mode: "folder",
        },
        {
          type: "auth",
          pattern: "packages/solid-client/src/auth",
          mode: "folder",
        },
        {
          type: "core",
          pattern: "packages/solid-client/src/core",
          mode: "folder",
        },
        {
          type: "data",
          pattern: "packages/solid-client/src/data",
          mode: "folder",
        },
        {
          type: "app",
          pattern: "packages/solid-client/src/*.{ts,tsx}",
          mode: "file",
        },
      ],
    },
    rules: {
      "boundaries/dependencies": [
        "error",
        {
          // Anything not explicitly allowed is a violation.
          default: "disallow",
          message:
            "${file.type} may not import this from ${dependency.type}. Dependencies flow one way (app → routes → features → data/ui/contexts/auth/core), and features are entered only through their index barrel. See docs/architecture/SOLID_CLIENT_SHAPE.md.",
          rules: [
            // App.tsx mounts providers + routes + chrome. It does not reach
            // into features or data — that's how it stays small forever.
            // (app → app covers root files importing each other, e.g. bridge.ts.)
            {
              from: { type: "app" },
              allow: {
                to: { type: ["app", "routes", "contexts", "core", "ui"] },
              },
            },
            // routes/ is the registration point: maps addresses to feature
            // views. The only layer above features — and it may only enter a
            // feature through its index barrel (the feature's public surface).
            {
              from: { type: "routes" },
              allow: { to: { type: ["contexts", "core", "ui"] } },
            },
            {
              from: { type: "routes" },
              allow: {
                to: { type: "feature", internalPath: "index.{ts,tsx}" },
              },
            },
            // Features import shared infrastructure, never each other.
            // (Same-feature imports are internal and always fine.) If two
            // features need the same thing, it moves down a layer.
            {
              from: { type: "feature" },
              allow: {
                to: { type: ["data", "ui", "contexts", "auth", "core"] },
              },
            },
            {
              from: { type: "contexts" },
              // ui is the bottom layer (dumb primitives): a context that shows an
              // app-wide dialog, like PeopleProvider, renders with it.
              allow: { to: { type: ["core", "auth", "data", "ui"] } },
            },
            { from: { type: "auth" }, allow: { to: { type: "core" } } },
            { from: { type: "core" }, allow: { to: { type: "data" } } },
            // data and ui appear in no `from` rule on purpose: they are the
            // bottom — they import @shared and solid-js, never upward.
          ],
        },
      ],
      // Shell-agnosticism and framework purity, enforced. solid-client must
      // run identically under Tauri and a plain browser tab.
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@tauri-apps/*"],
              message:
                "solid-client is shell-agnostic: it must run under Tauri AND a plain browser. Shell capabilities are injected at bootstrap (see bridge.ts / apps/tauri).",
            },
            {
              group: ["react", "react-dom", "react-native", "react-*"],
              message:
                "solid-client is a Solid app. React belongs to mobile only.",
            },
            {
              group: ["@mobile-data/*"],
              message:
                "Reactive caches are never shared across frameworks. Solid reads its own data layer (@solid-client/data).",
            },
          ],
        },
      ],
    },
  },
  {
    // React hooks correctness — scoped to mobile (the only React app).
    // rules-of-hooks catches genuine bugs (conditional/looped/class hooks) and
    // is clean, so it's enforced as error. exhaustive-deps is advisory (warn):
    // it has known false positives on Reanimated shared values, which are stable
    // refs that intentionally stay out of dependency arrays.
    files: ["apps/mobile/**/*.{ts,tsx,js,jsx}"],
    plugins: { "react-hooks": reactHooks },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
    },
  },
];
