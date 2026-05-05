# Haven Design System — Skill

Use this skill when designing anything for **Haven**: chat-app surfaces (Electron / web), the marketing site, release notes, social cards, or future products in the Haven family.

## Before you draw anything

1. **Read `README.md`** in this project — it has Content Fundamentals, Visual Foundations, and Iconography rules. Voice and visual choices flow from there, not from your training data.
2. **Skim `colors_and_type.css`** for the exact tokens (don't eyeball hex values).
3. **Pick the right kit:**
   - Building app surfaces (chat, channels, voice, settings) → start from `ui_kits/app/index.html`.
   - Building marketing / release-notes / legal pages → start from `ui_kits/site/index.html`.
   - Both kits already wire up `colors_and_type.css`, `Icon.jsx`, `Button.jsx`, and the asset paths.
4. **Copy, don't reinvent.** The component files (`*.jsx` next to each `index.html`) export to `window.*` and are the source of truth for chrome, headers, cards, and composer.

## Hard rules (do not violate)

- **Dark only.** Never produce a light variant. Surfaces are navy, not gray, never pure black.
- **One primary color.** `#3f79d8` blue. No secondary brand color. Status dots (green / amber / red) are the only other accents.
- **No emoji.** Anywhere — copy, status, reactions placeholder, microcopy. Status uses colored dots.
- **No serif type.** Geist + Geist Mono only.
- **Lucide icons only**, stroke-only, 1.5px weight, currentColor. If a needed icon isn't in Lucide, substitute the closest match and flag it — do not introduce a second icon family.
- **Sentence case for buttons and headings**, with terminal periods on section headings (a deliberate motif: *"Let's be straightforward about this."*).
- **No illustrations, stock photos, gradients-as-decoration, textures, or grain.** The only ambient effect is the radial blue glow under the marketing hero.
- **Brand suffix:** "Haven by REDRIXX". Studio is uppercase REDRIXX.

## Voice cheat sheet

Honest, plain-spoken, dry. Single-developer-talking-to-an-audience. Confident, not boastful. Admit limitations directly ("a significant chunk of work…ultimately got pulled before this release"). No marketing froth, no exclamation points, no "we're excited to announce". Drop into first person ("I", "we") naturally on long-form copy.

## Layout cheat sheet

- **App:** 32px draggable titlebar (Electron only) · 72px server rail · 240–640px channel sidebar · flex chat area · optional 240px member list.
- **Marketing:** fixed nav (`#0f1728/80` + backdrop blur) · hero with release-title card · screenshot in fake macOS window chrome · honest copy block · feature grid · download CTA · footer.
- **Cards:** outer `#16233a`, inner `#121d31`, border `#304867`, radius 12–28px depending on hierarchy.
- **Server tiles:** 48×48, `rounded-2xl` (16px). Active = solid primary blue + 4×32 white pip on the left edge.
- **Status card** in sidebar footer uses the `havenBreathe` 4s animation.

## When the user wants a new surface

- Mock it inside `ui_kits/app/index.html` (Tweaks pattern) or as a new screen in a fresh HTML beside it. Do **not** modify the kit components casually — extend them.
- Copy the exact tokens from `colors_and_type.css`. If you need a new shade, derive it via `oklch()` from an existing surface, don't invent it.
- Reuse `<Button>` and `<Icon.X>` from the site kit (they're path-imported into the app kit too).
- For copy, write a draft in the honest voice, then cut 30%.

## Before you ship

- Re-read your output's copy out loud. If it sounds like a press release, rewrite.
- Check that every CTA is sentence case and every section heading ends with a period.
- Verify no emoji slipped in.
- Verify icon stroke width matches Lucide default (1.5).
- Verify hover states are color swaps, not scale changes.
