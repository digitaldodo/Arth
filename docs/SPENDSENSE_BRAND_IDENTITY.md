# SpendSense brand identity

## Mark

The SpendSense mark combines a folded ledger page with a geometric S and a restrained copper ledger rule. Evergreen (`#193F37`), archival paper (`#F6F4ED`), and copper (`#B67645`) keep it aligned with Ledger Minimal. The S and page are designed as one symbol; the mark contains no small lettering.

The public preview sheet is [`frontend/public/brand/spendsense-brand-preview.png`](../frontend/public/brand/spendsense-brand-preview.png). Wordmark variants use Inter where available with an Arial fallback. The dark variant changes the wordmark for a dark surface; the standalone symbol always retains the same geometry.

## Asset inventory

- `frontend/public/brand/spendsense-logo.svg`: light horizontal wordmark.
- `frontend/public/brand/spendsense-logo-dark.svg`: dark-surface horizontal wordmark.
- `frontend/public/brand/spendsense-logo-monochrome.svg`: monochrome lockup.
- `frontend/public/brand/spendsense-symbol.svg`: standalone symbol.
- `frontend/public/brand/spendsense-og.png`: 1200 × 630 social sharing image.
- `frontend/public/brand/spendsense-brand-preview.png`: review sheet for lockups, backgrounds, favicon, and launcher.
- `frontend/public/favicon.svg`, `favicon.ico`, `favicon-16.png`, `favicon-32.png`, `favicon-48.png`: browser-tab assets.
- `frontend/public/icons/`: 180 Apple touch, 192 and 512 PWA, and 512 maskable PNGs.
- `android/app/src/main/res/mipmap-*`: legacy launcher sizes from 48 through 192 px, plus adaptive icon background and safe-zone foreground resources for API 26+.
- `frontend/src/app/icon.svg`: Next.js file-convention icon, kept visually identical to the canonical symbol.

`scripts/generate_spendsense_brand_assets.py` regenerates the icon family with Pillow installed. The 512 maskable icon uses a full-bleed green background and keeps the page symbol within the centered safe area. The Android application ID, namespace, signing alias, and native auth scheme are unchanged.

## UI application

The existing shared `ArthLogo` component now renders the SpendSense mark and wordmark. Existing login, landing, transaction shell, loading, privacy, app-lock, password-update, and download views therefore share the same mark without separate logo implementations. The Next.js metadata references the browser icons, Apple touch icon, and social image. PWA manifest colors and Android TWA launcher branding use the same palette. Customer-facing authentication templates use the same Ledger Minimal colors and wordmark text without remote image dependencies.

## Validation

Run `py scripts/validate_spendsense_brand_assets.py` to check PNG dimensions, all manifest icon URLs, SVG parsing, obsolete logo removal, and Android density/adaptive resources. Run `py scripts/generate_spendsense_brand_assets.py` after changing the normalized mark geometry. The production frontend build refreshes the generated static offline shell and service-worker cache version after icon and UI assets change.
