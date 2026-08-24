# Implementasi lengkap Asharu Digital Hub

- **Timestamp:** 2026-08-24 12:35:00
- **Topik:** Penyelesaian end-to-end digital hub bilingual asharu.id (melanjutkan scaffold sesi pagi)

## Task / Problem

Membangun production-ready digital hub "Asharu" sesuai spek lengkap (18 bagian): halaman ID/EN, produk afiliasi, properti, SEO teknikal, GA4 + consent, security headers, testing, deployment Vercel.

## Key Files Changed

- `src/messages/id.json`, `en.json` — seluruh copy UI dua bahasa (paritas kunci diuji otomatis).
- `next.config.ts` — **di-rename dari `.mjs`** (berisi sintaks TS; .mjs gagal dimuat saat build).
- `src/app/[locale]/**` — layout (html lang, font, provider), home, products, properties(+`[slug]`), about, privacy, disclosure, not-found, `[...rest]`.
- `src/components/**` — layout (Header/NavMenu/MobileNav/LanguageSwitcher/Footer/SkipLink/ConsentSettingsButton), ui (ExternalLink/TrackedExternalLink/SectionHeading/ResponsiveImage/JsonLd/EmptyState/PlatformIcon), cards (ProductCard/PropertyCard/PropertyBrowser), analytics (GoogleAnalytics consent-gated/ConsentBanner), home (ShopCard/SocialLinksGrid/AffiliateDisclosure/ContactCTA).
- `src/lib/**` — jsonld.ts builders, title.ts pageHeading, env.test dst.
- `src/app/sitemap.ts|robots.ts|manifest.ts|icon.svg|opengraph-image.tsx`, `globals.css`.
- `public/images/{products,properties}/placeholder-{1..3}.svg`.
- 16 file test (`*.test.ts(x)`) + helper `src/test/utils.tsx`.
- `README.md` (arsitektur, GA4 setup, deploy, domain, checklist, trade-offs), `.memory/*`, plan file updated.

## Technical / Business Decisions

- next-intl pathnames + middleware; localeDetection off → root `/id` deterministik.
- GA opt-in consent-gated; `ga-disable-*` saat ditarik; footer preferences via CustomEvent.
- Property `[slug]` detail statis (`dynamicParams:false`) untuk CTA nyata + RealEstateListing JSON-LD.
- Tanpa Product/offers JSON-LD & tanpa harga fiktif sampai data terverifikasi ada.

## Assumptions / Risks

- CSP `'unsafe-inline'` script-src diterima (tanpa form/input user); nonce-CSP butuh middleware per-request.
- Warning build `metadataBase` berasal dari route internal `/_not-found`; kosmetik.
- Node 25 global localStorage di jsdom tidak lengkap → test mem-stub `window.localStorage`.

## Blockers / Unresolved

- Data placeholder belum diganti data riil; kontak & GA env masih kosong; deploy Vercel + domain belum dieksekusi; Lighthouse manual pending.

## Verification Performed

- `npm run lint` ✓ · `npm run typecheck` ✓ · `npm run test` 84/84 ✓ · `npm run build` ✓ (32 static pages).
- Smoke prod: root 307→/id; security headers lengkap; canonical+hreflang id/en/x-default benar; h1 tunggal; disclosure afiliasi tampil; `sponsored nofollow` pada CTA afiliasi; RealEstateListing muncul di detail EN; sitemap.xml 24 URL ber-alternates; robots.txt OK.
- Bug yang ditangkap oleh test (semuanya sudah diperbaiki): TS-in-.mjs config, export konstanta di page file, sitemap tanpa entri per-locale, URL JSON-LD tanpa prefiks locale, rel sponsored hilang, not-found params undefined, tombol aktif language switcher disabled (tidak keyboard-accessible).

## Commit Proposal

```
feat: complete bilingual Asharu digital hub (i18n, SEO, GA4 consent, a11y, tests)
```

## Related Plans / Specs

- `plans/2026-08-24-asharu-digital-hub-build.md` (progress log diperbarui)
