# Haven Design System

> *"Your community deserves better."* — Haven tagline

This design system captures the visual + content language of **Haven**, a source-available community chat app by REDRIXX. It is built from the live codebases (see *Sources* below), not from screenshots.

---

## What Haven is

Haven is a cross-platform chat application featuring **Communities** — invite-only spaces with text and voice channels. Its mission is to provide an *"Owtlet"* (the owl pun is intentional) for communities who want a less privacy-intrusive alternative to platforms like Discord. Haven has a source-available codebase (BUSL-1.1) and strict policies on data usage.

The mascot is a **horned owl**, rendered as a friendly cartoon face on a rounded square blue tile.

### Products

Haven ships as **two distinct surfaces**, both represented in this design system:

1. **Haven app** (`ui_kits/app/`) — Electron desktop client + a browser-based web client. Built on React 19, Vite, Tailwind v4, shadcn/ui, Supabase (Auth, Postgres, Realtime, Edge Functions), WebRTC for voice. Custom title-bar chrome, a 72px server rail, a resizable channel sidebar, a chat area with a markdown-aware composer.
2. **Marketing site** (`ui_kits/site/`) — Next.js 16 + React 19. Dark, single-column landing page anchored on a **release-title card**, an honest copywriting block, a feature grid, and a download CTA. Includes a "What's New" release-notes page, plus Terms / Privacy.

---

## Sources

These were the input materials. Treat as reference; do not assume the reader has access.

- GitHub repo: **`redrix-dev/haven-site`** (master) — Next.js marketing + release notes. Files of note:
  - `app/globals.css` — color tokens (Tailwind v4 `@theme inline`)
  - `app/page.tsx`, `app/whats-new/page.tsx` — full marketing copy + layout
  - `app/layout.tsx` — Geist + Geist Mono via `next/font`
  - `lib/site.ts`, `lib/content/home.ts` — canonical product copy
  - `components/site-header.tsx`, `site-footer.tsx`, `release-title-card.tsx`, `haven-icon.tsx`, `ui/*` — shadcn/ui components (button, badge, card, input, etc.)
  - `public/icon-512.png`, `icon-192.png`, `Screenshot.png`, `GitHub_Invertocat_White.svg`
  - `content/releases/1-7-1.json` — release notes content shape
- GitHub repo: **`redrix-dev/haven`** (main) — Electron + web chat app. Files of note:
  - `packages/shared/src/styles/globals.css` — same tokens as the site, plus `desktop-app-shell`, `rainbow-border`, `status-breathe`
  - `packages/shared/src/app/components/{TitleBar,ServerList,Sidebar}.tsx` — chrome + rail + channel sidebar
  - `packages/shared/src/features/messaging/components/{ChatArea,MessageInput}.tsx` — chat + composer
  - `packages/shared/src/app/ui/*` — duplicate shadcn/ui components, app-side
- Site config (`lib/site.ts`):
  - `githubUrl: https://github.com/redrix-dev/haven`
  - `releasesUrl: https://github.com/redrix-dev/haven/releases/latest`
  - `browserUrl: https://haven.redrixx.com/`
  - `companyUrl: https://redrixx.com`

---

## Content Fundamentals

Haven's voice is **honest, plain-spoken, and a little weary of the genre's bullshit**. It writes like a single developer talking to a small audience — confident but not boastful, technical when it matters, dry rather than excited.

### Tone & casing
- **Sentence case**, almost everywhere. Buttons are sentence case ("Download for Windows", "Try it in browser", "File an Issue" — the latter is one of the few proper-cased CTAs).
- Section headings end with a period: *"Let's be straightforward about this.", "What Haven does today.", "Bring your community."* That terminal period is a deliberate motif.
- "We" / "you" / "I" all appear naturally; the *honest section* slips into first person ("we're building it right", "Just a developer who wanted something better"). It is not corporate "we".
- No exclamation points except for keyboard shortcuts ("Ctrl+B, Ctrl+I, Ctrl+U.")
- No emoji. Anywhere. Not in the codebase, not in marketing, not in the icon set. Status is communicated with colored dots, not faces.
- Apostrophes use the smart variant in source where possible ("What's", "Let's"). UTF-8 throughout.

### Specific copy patterns
- **Eyebrow** above big headings: caps, `0.18em` tracking, dim ("NOW SHIPPING", "WHAT'S NEW", "OVERVIEW"). Often paired with a 24-32px horizontal blue rule (`<span class="h-px w-8 bg-haven-blue">`).
- **Badges** above the eyebrow occasionally: pill, primary tint at 15%, primary border at 50%, with a 2px solid blue dot. ("● Public Release")
- **Honest copy** examples (from the home page) — these are the canonical voice samples:
  - "Discord was free because venture capital funded their growth. The plan was always to monetize later. They just did it on someone else's dime first. There's nothing wrong with that model, but it's worth being clear about what it is."
  - "Free isn't forever. But the communities that show up early won't be treated like strangers when that changes."
  - "Your data is not sold, shared, or processed for marketing campaigns you never signed up for. That is not a policy subject to revision."
  - "No roadmap theater. Here's what's actually shipped."
- **Release notes** (`content/releases/*.json`) — frank, technical, occasionally self-deprecating. *"The one with admin functions, profile pictures and a deep appreciation for the process."* Engineering callouts ("The mobile situation") admit failure plainly: *"a significant chunk of work…ultimately got pulled before this release"*.
- **Microcopy in app** — short, functional. "Channel Settings", "Create server", "Join server", "Account settings", "Server Modmail". No verbs-as-nouns, no cute names.
- **Status labels**: "Online", "Away", "Do Not Disturb" — sentence case, never abbreviated in UI.
- **Brand suffix**: nearly every long-form mention is "Haven by REDRIXX". The studio is uppercase **REDRIXX** (one word, no space). The product is sentence case **Haven**.

---

## Visual Foundations

Haven is a **dark-only** product. Both the marketing site and the app run on near-black navy surfaces. There is a `.dark` class in tokens for a slightly deeper variant, but the default is already dark.

### Color
- **Single primary**: `#3f79d8` Haven blue. Used for CTAs, active states, focus rings, hyperlinks (slightly brighter `#59b7ff` on dark), and the brand mark. Hover deepens to `#325fae`.
- **Surfaces stack from dark to less-dark**: app bg `#0f1728` → card `#16233a` → muted `#1d2a42` → secondary `#22324d` → accent `#2a3d5d`. Channel sidebar `#1c2a43`, server rail `#142033`, chat area `#111a2b`. Each surface is a navy mixed with a small amount of blue — never pure black, never gray.
- **Status colors are blunt**: online `#44b894` (green), away `#f0a832` (amber), DND `#f04747` (red). Only used as 8-12px dots or pips. The 1-7-1 build introduced a "STAFF" label in amber `#f7c793` for moderators.
- **Destructive** is a desaturated brick `#b74a56` — never a pure red. Backgrounds for destructive UI use `#4a1f2c` and text `#fca5a5`.

### Type
- **Geist** (sans) + **Geist Mono**, both via `next/font` and Google Fonts. Body stays at 14-16px in the app, 16-18px on marketing.
- The hero treatment is the most distinctive: **Geist Extrabold, `letter-spacing: -0.05em`, line-height 1, two-line layout with the second line in primary blue**. Up to ~68px (`lg:text-[4.25rem]`).
- Eyebrows and overlines are **uppercase, 11px or smaller, 0.18em tracking, dim text** (`#7f90ac`).
- No serif anywhere. No display fonts beyond Geist.

### Backgrounds & ambient effects
- **No imagery for ambience.** The hero uses a **radial blue glow** behind the title card: `radial-gradient(circle, rgba(63,121,216,0.22) 0%, transparent 65%)` plus a wide `blur(140px)` blue blob below. That is the signature visual.
- **No textures, no grain, no patterns.** Surfaces are flat hex colors with the blue glow when ambience is needed.
- **Window-chrome motif on cards**: marketing cards (release notes, screenshot frame) include a fake macOS traffic-light row — three 12px dots, red `#b74a56` / amber `#c1964a` / green `#6bb48b`, with a small text label like "Haven release notes" or just "Haven". This frame is *the* visual signature of the marketing site.
- **Hand-drawn illustrations**: none. The brand has zero illustration vocabulary; the only character is the owl mascot.

### Borders, radii, shadows
- **Borders are thin (1px) and solid**, in `#304867`. A faded variant `#304867/40` is used on the fixed nav and footer rules.
- **Radii**: 6-10px on small controls (`rounded-md` is `--radius - 2px`), 12px on cards (`rounded-xl`), **16px on server avatar tiles** (`rounded-2xl`), and the bigger marketing cards use **28px** (`rounded-[28px]`). The owl logo uses `rounded-[22%]` so it follows the iOS-y squircle look.
- **Shadows are restrained.** App composer: `0 10px 24px rgba(3,9,20,0.22)`. Marketing cards: `shadow-2xl shadow-black/40`. There are no colored shadows.
- **Inner / dividing lines** rather than shadows are preferred for separating regions inside the app (titlebar 1px, channel header 1px, composer top 2px solid `#111a2b`).
- **Ring on focus**: 3px ring at `#5f8fdd/50` (`ring-ring/50`), with the border itself reverting to the ring color.

### Animation
- **Two named animations**, both subtle and infinite:
  1. `status-breathe` — a 4s breathing box-shadow (peaks at `0 0 20px rgba(63,121,216,0.3)`) on the user's status card in the sidebar footer.
  2. `rainbow-border` — opt-in conic-gradient border that rotates over 2s for a "developer mode" easter-egg state (you type `#dev` in the composer).
- Otherwise transitions are CSS defaults: `transition-colors`, `transition-opacity`, ~150ms. **No bounces, no spring physics, no overshoot.** Hover states are instant color swaps.

### Hover & press states
- Hover on primary buttons: bg shifts darker (`#3f79d8` → `#325fae`), no scale change.
- Hover on outline / ghost buttons: surface lightens to `#1d2a42` or `#22334f`, text becomes pure white.
- Hover on icon buttons: bg `#304867` (border color used as hover surface) and text `#fff`.
- Server avatar tile: `bg-[#18243a]` idle → `bg-[#3f79d8]` hover, with the active tile staying primary.
- Press / active: no separate "pressed" treatment — `active` reuses hover or relies on `aria-pressed`. There is no scale-down.
- Keyboard focus is **always visible**: 3px ring at `#5f8fdd/50` plus border swap to `--ring`.

### Transparency & blur
- Used **only** in three places:
  - Fixed top nav on the marketing site: `bg-[#0f1728]/80 backdrop-blur-md`.
  - The titlebar in Electron: `bg-[#0d1626]/95 backdrop-blur-sm`.
  - Faded border variants (`/40`, `/60`) on the nav and footer.
- The blue glow under the hero uses high-blur radials but is non-interactive.
- Cards never use translucent backgrounds — they are always opaque, so they read as "frames" not "glass".

### Layout
- **Marketing**: max widths step down by section: hero `max-w-6xl`, screenshot `max-w-7xl`, honest section `max-w-3xl`, features `max-w-5xl`, CTA `max-w-2xl`. Vertical rhythm is `pb-24` (96px) between sections. Gutters are `px-6`. Nav is fixed to top with `pt-32` on the first section.
- **App** uses a fixed three-pane layout: 72px server rail · resizable channel sidebar (240-640px, persisted to localStorage as `haven:sidebar-width`) · flex-1 chat area. On desktop a 32px draggable titlebar sits above everything (`.desktop-app-shell` adds `padding-top: 32px`).
- **Cards on cards**: nested cards step the surface darker, not lighter — outer `#16233a`, inner `#121d31`. Border `#304867` is preserved on both.
- **Active state on rails**: the active tile is solid primary blue. Idle tiles share the rail color so the rail reads as a single tinted column.

### Imagery
- The only photographic / raster asset shipped is `Screenshot.png` — a screenshot of the app itself, framed by the fake traffic-light window chrome. Cool, blue, dark — matches everything else.
- No people, no stock photos, no abstract gradients. If imagery is needed, it should be a screenshot of the product.

---

## Iconography

Haven uses **`lucide-react`** as its icon set, on both the site and the app. The packages are pinned (site `^0.575.0`, app `^0.564.0`). Icons are linear, 1.5px stroke, rounded line caps, ~24×24 grid (the components default to `size-4` = 16px in dense UI, `size-5` = 20px in toolbars).

### Usage rules
- **Default size**: 16px (`size-4`) inline with text, 20px (`size-5`) for sidebar/rail buttons, 14px (`size-3.5`) inside small badges.
- **Stroke / fill**: stroke-only. Default Lucide weight (1.5px). Never filled.
- **Color follows the parent text color** (`currentColor`). On hover the icon inherits the new text color — there is no special icon hover treatment.
- **Common icons in use** (lifted from the codebase): `Download`, `ExternalLink`, `MessageSquare`, `Mic`, `Shield`, `Users`, `Zap`, `Lock` (marketing features); `Bell`, `MessageCircle`, `Plus`, `LogIn`, `ShieldAlert`, `Hash`, `Headphones`, `Settings`, `ChevronDown`, `ChevronRight` (app); custom mini SVGs only for window controls (close X, minimize bar, maximize square).
- **No icon font.** No emoji. No unicode glyph icons (`✓`, `→`, etc.). No PNG icon sprite.
- **One bespoke SVG**: a tiny inline owl in `TitleBar.tsx` — used because the title bar is so small that the PNG mascot becomes muddy at 16px.
- **Logo / mascot**: `assets/haven-owl-512.png` is the canonical mark. It is rendered as `rounded-[22%]` (squircle) and pairs with the wordmark **"Haven"** in 600/Geist. The "by REDRIXX" tag is an outline `Badge` next to the wordmark in the site header. A simplified `assets/haven-icon-fallback.svg` exists for tiny rendering.
- **GitHub mark**: `assets/github-mark.svg` (the upstream Invertocat, white) is used in the site header next to the GitHub link.

If a needed icon is not in Lucide: **substitute the closest Lucide match and flag it**. Do not introduce a second icon family.

---

## Index — what's in this folder

```
README.md                       ← you are here
SKILL.md                        ← Claude Code skill manifest
colors_and_type.css             ← all color + type + spacing tokens
assets/
  haven-owl-512.png             ← mascot, canonical
  haven-owl-192.png             ← mascot, smaller raster
  haven-icon-fallback.svg       ← simplified squircle for tiny sizes
  haven-app-screenshot.png      ← real screenshot of the app
  github-mark.svg               ← GitHub Invertocat (white)
preview/                        ← design-system tab cards (700×N)
ui_kits/
  app/                          ← Electron + web chat app (component kit)
    README.md
    index.html
    Components.jsx
  site/                         ← marketing + release-notes site
    README.md
    index.html
    Components.jsx
```

When designing for Haven: import `colors_and_type.css`, pull lucide-react via the standard CDN, copy assets out of `assets/`, and start from one of the `ui_kits/*/index.html` files rather than from scratch.
