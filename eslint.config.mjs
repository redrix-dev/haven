import tsPlugin from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";

const rendererBoundaryFiles = [
  "packages/shared/src/client/**/*.{ts,tsx,js,jsx}",
  "packages/shared/src/components/**/*.{ts,tsx,js,jsx}",
  "packages/shared/src/contexts/**/*.{ts,tsx,js,jsx}",
  "packages/shared/src/lib/hooks/**/*.{ts,tsx,js,jsx}",
  "packages/shared/src/lib/voice/**/*.{ts,tsx,js,jsx}",
];

const rendererBoundaryRestrictions = [
  {
    group: ["node:*"],
    message: "Renderer/features must not import Node built-ins.",
  },
];

/**
 * HavenCore architecture boundary restrictions.
 * The Nexus layer is the only authority that may touch backend factories,
 * Supabase clients, or persistence directly. Features and UI must read state
 * through `requireHavenCore()` / nexus hooks instead.
 */
const havenCoreDeprecatedImports = [
  {
    group: [
      "@mobile-data/session/navigationStore",
      "**/stores/navigationStore",
      "@shared/features/community/hooks/useCommunityWorkspace",
      "**/useCommunityWorkspace",
      "@shared/features/social/hooks/useSocialWorkspace",
      "**/useSocialWorkspace",
      "@shared/features/community/communityNavigation",
      "**/communityNavigation",
      "@shared/infrastructure/realtime/communityAccessBroadcastBridge",
      "**/communityAccessBroadcastBridge",
      "@shared/features/community/hooks/useChannelGroups",
      "**/useChannelGroups",
      "@shared/features/messaging/hooks/useMessageNexus",
      "**/useMessageNexus",
      "@shared/features/profile/hooks/useLiveProfiles",
      "**/useLiveProfiles",
      "**/useChatAppOrchestration",
    ],
    message:
      "Deprecated HavenCore migration shims are deleted. Use requireHavenCore().communities/channels for focus, uiStore for workspace UI, and core.social for social counts.",
  },
];

const havenCoreNexusBoundary = [
  {
    group: ["react-native-mmkv", "react-native-mmkv/*"],
    message:
      "Persistence must flow through NexusPersistence. Only @shared/core/persistence/createMmkvPersistence.ts may import react-native-mmkv.",
  },
  {
    group: [
      "@shared/runtime",
      "@shared/runtime/*",
      "@shared/infrastructure/runtime",
      "@shared/infrastructure/runtime/*",
      "@shared/lib/bootstrap/*",
      "@shared/infrastructure/bootstrap/*",
    ],
    message:
      "Legacy runtime/bootstrap modules have been removed. Use createHavenCore + requireHavenCore from @shared/core.",
  },
  {
    group: [
      "@shared/infrastructure/realtime/HavenEventBus",
      "**/HavenEventBus",
    ],
    message:
      "HavenEventBus is removed. Use requireHavenCore().routeEvent for ingestion and core.messages.* for reads.",
  },
];

/**
 * Temporary quarantine for known pre-finality migration seams. New UI/feature
 * files are held to the HavenCore -> Nexus -> UI Consumer boundary; remove
 * entries here as each existing seam is migrated.
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

const havenCoreBackendFactoryImportNames = [
  "getCommunityDataBackend",
  "getControlPlaneBackend",
  "getDirectMessageBackend",
  "getModerationBackend",
  "getNotificationBackend",
  "getServerModmailBackend",
  "getSocialBackend",
  "getVoiceTokenBackend",
];

const havenCoreConsumerRestrictedImportPaths = [
  {
    name: "@shared/lib/backend",
    importNames: havenCoreBackendFactoryImportNames,
    message:
      "UI/features must not import backend factories directly. Route reads/writes through useHavenCore()/requireHavenCore() and a domain Nexus/HavenCore command.",
  },
  {
    name: "@shared/infrastructure/client/createHavenSupabaseClient",
    message:
      "Supabase client construction belongs to host bootstrap. UI/features consume the registered HavenCore instead.",
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
  ...havenCoreDeprecatedImports,
  {
    group: ["@shared/core/persistence/*"],
    message:
      "Persistence adapters are injected into HavenCore/Nexus construction. UI/features must not import persistence directly.",
  },
  {
    group: ["@shared/nexus", "@shared/nexus/*"],
    message:
      "UI/features must access domain nexuses through useHavenCore()/requireHavenCore(), not by importing or constructing nexus classes.",
  },
];

const havenCoreConsumerRestrictedSyntax = [
  {
    selector: "Literal[value='postgres_changes']",
    message:
      "Domain realtime must use HavenCore.subscribeRealtime -> routeRealtimeEvent. Voice hooks are the documented exception.",
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
      "UI/features must not call Supabase RPC directly. Put the RPC behind a backend/Nexus/HavenCore command.",
  },
  {
    selector:
      "CallExpression[callee.property.name='rpc'][callee.object.name='client']",
    message:
      "UI/features must not call Supabase RPC directly. Put the RPC behind a backend/Nexus/HavenCore command.",
  },
  {
    selector:
      "CallExpression[callee.property.name='from'][callee.object.name='supabase']",
    message:
      "UI/features must not query Supabase directly. Put the query behind a backend/Nexus/HavenCore command.",
  },
  {
    selector:
      "CallExpression[callee.property.name='from'][callee.object.name='client']",
    message:
      "UI/features must not query Supabase directly. Put the query behind a backend/Nexus/HavenCore command.",
  },
  {
    selector:
      "CallExpression[callee.property.name='channel'][callee.object.name='supabase']",
    message:
      "UI/features must not subscribe to Supabase channels directly. Use HavenCore.subscribeRealtime -> routeRealtimeEvent.",
  },
  {
    selector:
      "CallExpression[callee.property.name='channel'][callee.object.name='client']",
    message:
      "UI/features must not subscribe to Supabase channels directly. Use HavenCore.subscribeRealtime -> routeRealtimeEvent.",
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
    ],
  },
  {
    files: [
      "apps/**/*.{ts,tsx,js,jsx}",
      "packages/**/*.{ts,tsx,js,jsx}",
      "tooling/**/*.{ts,tsx,js,jsx}",
      "services/**/*.{ts,tsx,js,jsx}",
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
            "Use getAppHost() from @shared/platform/appHost in app code; the legacy window.desktop Electron bridge is gone.",
        },
        {
          object: "window",
          property: "havenDesktop",
          message:
            "Use getAppHost() from @shared/platform/appHost instead of legacy window.havenDesktop access.",
        },
      ],
    },
  },
  {
    files: ["packages/shared/src/**/*.{ts,tsx}"],
    ignores: [
      "packages/shared/src/core/persistence/createMmkvPersistence.ts",
    ],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@platform/desktop/client",
              message:
                "Import getAppHost from @shared/platform/appHost instead. Each shell registers its own bridge at bootstrap.",
            },
          ],
          patterns: [...havenCoreNexusBoundary, ...havenCoreDeprecatedImports],
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
                "Import getAppHost from @shared/platform/appHost instead. Each shell registers its own bridge at bootstrap.",
            },
            ...havenCoreConsumerRestrictedImportPaths,
          ],
          patterns: [
            ...havenCoreNexusBoundary,
            ...havenCoreConsumerRestrictedImportPatterns,
          ],
        },
      ],
      "no-restricted-syntax": ["error", ...havenCoreConsumerRestrictedSyntax],
    },
  },
  {
    files: rendererBoundaryFiles,
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: rendererBoundaryRestrictions,
        },
      ],
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
            "Mobile code should use platform-safe abstractions from @shared/platform/appHost.",
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
];
