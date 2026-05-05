# Haven — Marketing Site UI Kit

Faithful recreation of the **redrix-dev/haven-site** Next.js marketing surface, lifted from the live source (not from screenshots). Renders inside a single `index.html` via React 18 + Babel + the project's `colors_and_type.css`.

## Files

- `index.html` — full landing page: header, hero (release-title card), screenshot frame, "honest" section, feature grid, CTA, footer.
- `Header.jsx`, `Footer.jsx` — chrome.
- `ReleaseTitleCard.jsx` — the marquee marketing card. Two radial blue glows, badge, eyebrow + 24px blue rule, two-line extrabold hero, feature pills with green dots, footer + actions row.
- `ScreenshotFrame.jsx` — the fake-macOS window chrome around `Screenshot.png`.
- `HonestSection.jsx`, `FeatureGrid.jsx`, `CTACard.jsx` — content sections, copy lifted from `lib/content/home.ts`.
- `Button.jsx`, `Badge.jsx`, `Icon.jsx` — primitives matching shadcn/ui defaults from the repo.

## Design notes

- **Tokens** all come from `../../colors_and_type.css`. No new color invented.
- **Icons** are inlined Lucide SVGs at 1.5px stroke (Download, ExternalLink, MessageSquare, Mic, Shield, Users, Zap, Lock).
- **Copy** is verbatim from `lib/content/home.ts` so this reads like the real product.
- The hero glow is a `radial-gradient(circle, rgba(63,121,216,0.22), transparent 65%)` plus a wide `blur(140px)` blue blob — this is Haven's *only* ambient effect.
- **Cosmetic only.** Buttons don't navigate.

Open `index.html` to see the kit. The page is full-width responsive but designed at ~1280px.
