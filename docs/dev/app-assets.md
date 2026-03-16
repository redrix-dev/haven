# App assets

Haven now defines desktop + web/mobile icon paths in one source of truth:

- `packages/shared/src/config/appAssets.json`

Regenerate web/mobile outputs with:

```bash
node tooling/scripts/assets/generate-app-assets.mjs
```

Generated outputs:

- `apps/web-mobile/public/app-assets.generated.json`
- `apps/web-mobile/public/app-assets.generated.js`
- `apps/web-mobile/src/generated/appAssets.generated.ts`
