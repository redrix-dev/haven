# UniWind on mobile (Haven)

This app uses [UniWind](https://docs.uniwind.dev/) with Tailwind-style utilities on React Native. Use the decision tree below so theme tokens stay consistent and ESLint stays green.

## Decision tree

1. **Layout, typography, backgrounds on built-ins that support `className`**  
   Use `className` with normal utilities ([Supported classNames](https://docs.uniwind.dev/class-names.md), e.g. [View](https://docs.uniwind.dev/components/view.md)).

2. **React Native “extra” color props** (`color`, `tintColor`, …) on UniWind-wrapped components  
   Use `*ClassName` props with the **`accent-*`** prefix so values resolve to theme colors ([accent prefix](https://docs.uniwind.dev/class-names.md), e.g. [ActivityIndicator](https://docs.uniwind.dev/components/activity-indicator.md)). Prefer the shared **`Spinner`** (`@/components/ui/spinner`) with `colorClassName` instead of raw `ActivityIndicator`.

3. **APIs that only accept style objects or plain color strings** (React Navigation `screenOptions`, Reanimated `useAnimatedStyle`, some third-party props)  
   Use **`useResolveClassNames('…')`** and/or **`useCSSVariable` / `getCSSVariable`** ([useResolveClassNames](https://docs.uniwind.dev/api/use-resolve-class-names.md), [useCSSVariable](https://docs.uniwind.dev/api/use-css-variable.md)). For repeated navigation chrome, use **`useNavigationChromeStyles()`** from `@/theme-rn`.

4. **Icons**  
   In **haven-rev2**, import **`ThemedIonicons`** from `@/theme-rn` (never raw `Ionicons` from `@expo/vector-icons`). Pass **`colorClassName="accent-…"`** (semantic token name after `accent-`).

5. **Third-party components without `className`**  
   Prefer **`withUniwind`** ([withUniwind](https://docs.uniwind.dev/api/with-uniwind.md)) or feed string colors from `useCSSVariable` / small hooks (see `useComposerRnemCssVariables` for react-native-enriched-markdown).

## Token source

Semantic colors live in **`apps/mobile/global.css`** as CSS variables (e.g. `--foreground`, `--primary`, `--muted`, `--ring`, `--text-dim`). Tailwind utilities and `accent-*` map to the same tokens.

### `theme-rn` helpers

| Helper | Role |
|--------|------|
| `useNavigationChromeStyles` | Drawer + stack header/scene styles from `useResolveClassNames` + `useCSSVariable`. |
| `ThemedIonicons` | `withUniwind(Ionicons)` + required `colorClassName`. |
| `useComposerRnemCssVariables` | String colors for RNEM markdown input (selection, spoiler bg via `bg-muted/20`, etc.). |
| `useFloatingDmPlaceholderChannels` / `useDmBubbleSheetChrome` | DM bubble / sheet chrome aligned to CSS vars. |

## Anti-patterns

- Hardcoded hex in **haven-rev2** for spinners, nav tint, or composer chrome when a semantic token or hook exists.
- Importing **`ActivityIndicator`** or **`Ionicons`** under `apps/mobile/src/haven-rev2/` (ESLint **`no-restricted-imports`**).

## Official docs

- [Installation / getting started](https://docs.uniwind.dev/)  
- [classNames & accent](https://docs.uniwind.dev/class-names.md)  
- [useResolveClassNames](https://docs.uniwind.dev/api/use-resolve-class-names.md)  
- [useCSSVariable](https://docs.uniwind.dev/api/use-css-variable.md)
