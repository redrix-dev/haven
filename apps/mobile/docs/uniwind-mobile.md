# UniWind on mobile (Haven)

This app uses [UniWind](https://docs.uniwind.dev/) with Tailwind-style utilities on React Native. Use the decision tree below so theme tokens stay consistent.

## Decision tree

1. **Layout, typography, backgrounds on built-ins that support `className`**  
   Use `className` with normal utilities ([Supported classNames](https://docs.uniwind.dev/class-names.md), e.g. [View](https://docs.uniwind.dev/components/view.md)).

2. **React Native “extra” color props** (`color`, `tintColor`, …) on UniWind-wrapped components  
   Use `*ClassName` props with the **`accent-*`** prefix so values resolve to theme colors ([accent prefix](https://docs.uniwind.dev/class-names.md)).

3. **APIs that only accept style objects or plain color strings** (React Navigation `screenOptions`, Reanimated `useAnimatedStyle`, some third-party props)  
   Use **`useResolveClassNames('…')`** and/or **`useCSSVariable` / `getCSSVariable`** ([useResolveClassNames](https://docs.uniwind.dev/api/use-resolve-class-names.md), [useCSSVariable](https://docs.uniwind.dev/api/use-css-variable.md)).

4. **Icons in themed surfaces**  
   Import **`ThemedIonicons`** from `@/theme-rn` when you need semantic icon colors via **`colorClassName="accent-…"`**.

5. **Third-party components without `className`**  
   Prefer **`withUniwind`** ([withUniwind](https://docs.uniwind.dev/api/with-uniwind.md)) or feed string colors from `useCSSVariable` / small hooks in `@/theme-rn`.

## Token source

Semantic colors live in **`apps/mobile/global.css`** (generated from `packages/shared/src/themes` via `npm run themes:generate`). Tailwind utilities and `accent-*` map to the same tokens.

### `theme-rn` helpers

| Helper | Role |
|--------|------|
| `ThemedIonicons` | `withUniwind(Ionicons)` + required `colorClassName`. |
| `useFloatingDmPlaceholderChannels` / `useDmBubbleSheetChrome` | DM floating bubble / sheet chrome aligned to CSS vars. |

## Official docs

- [Installation / getting started](https://docs.uniwind.dev/)  
- [classNames & accent](https://docs.uniwind.dev/class-names.md)  
- [useResolveClassNames](https://docs.uniwind.dev/api/use-resolve-class-names.md)  
- [useCSSVariable](https://docs.uniwind.dev/api/use-css-variable.md)
