# Asharu Digital Hub — Implementation Plan

Created: 2026-08-24 09:20:00

## Objective
Membangun production-ready bilingual (ID/EN) Digital Hub "Asharu" (asharu.id) dengan Next.js App Router: pusat tautan toko online, media sosial, etalase produk afiliasi, dan daftar properti — static-first, aksesibel (WCAG AA), technical SEO menyeluruh, GA4 + consent banner, secure-by-default, siap deploy ke Vercel free tier.

## Scope
- Next.js 15 App Router + TypeScript strict + React Server Components by default
- i18n next-intl v4: locale `id` (default) & `en`, localized pathnames (`/id/produk` ↔ `/en/products`), root `/` → `/id` tanpa loop
- Halaman: home, katalog produk, katalog properti + detail properti `[slug]`, tentang, kebijakan privasi, disclosure afiliasi, 404 dua bahasa
- Data type-safe di `src/data/` (tanpa database), placeholder ditandai jelas
- GA4 via `NEXT_PUBLIC_GA_MEASUREMENT_ID`, consent banner, event type-safe tanpa PII
- Technical SEO: metadata per-locale, canonical, hreflang id/en/x-default, sitemap, robots, manifest, JSON-LD (WebSite, Organization, ItemList, RealEstateListing, BreadcrumbList)
- Security headers (CSP kompatibel GA, nosniff, Referrer-Policy, Permissions-Policy, HSTS, frame-ancestors)
- Testing Vitest + Testing Library; quality gates: lint/typecheck/test/build
- README lengkap + .env.example + launch checklist

## Milestones
1. Scaffold & konfigurasi inti
2. Layout shell & komponen UI
3. Data layer + messages id/en
4. Halaman & fitur
5. SEO & structured data
6. Analytics & consent
7. Testing & quality gates
8. Dokumentasi & deployment prep

## Tasks
- [x] Persist plan file + .gitignore + .editorconfig + .env.example
- [x] package.json + configs (tsconfig, next.config + security headers, tailwind, postcss, eslint flat, vitest)
- [x] npm install
- [x] i18n core: routing (localePrefix always, localeDetection false, pathnames), request, navigation, middleware
- [x] messages/id.json + messages/en.json lengkap & paritas kunci
- [x] lib: env.ts (zod), safe-url, localizedHref + buildMetadata, analytics events + consent storage
- [x] data: shop-links, social-links, affiliate-products, properties + SVG placeholder
- [x] Komponen: Header, MobileNavigation, LanguageSwitcher, Footer, SkipToContent, SectionHeading, ExternalLink, EmptyState, JsonLd, ShopCard, SocialLink, ProductCard, PropertyCard, PropertyFilters, ContactCTA, ConsentBanner/Provider, AnalyticsClickTracker, GoogleAnalytics
- [x] Home page: hero, toko (#online-stores), sosial (#social-media), produk unggulan (#affiliate-products) + disclosure, properti unggulan (#properties) + filter ringan, tentang, kontak CTA
- [x] Halaman katalog produk, katalog + filter properti, detail properti `[slug]`, tentang, kebijakan privasi, disclosure, not-found
- [x] sitemap.ts, robots.ts, manifest.ts, icon.svg, apple-icon.svg, opengraph-image.tsx, JSON-LD
- [x] Analytics wiring + consent gating (GA hanya dimuat setelah consent)
- [x] Tests: env, safe-url, analytics, data integrity, messages parity, metadata, sitemap, robots, komponen (ExternalLink, ProductCard, PropertyFilters, LanguageSwitcher, MobileNavigation, ConsentBanner)
- [x] Quality gates hijau: npm run lint / typecheck / test / build
- [x] README.md lengkap (arsitektur, penggantian placeholder, GA4, deploy Vercel, domain, checklist, trade-offs)
- [x] Entry `.memory/` + update file rencana ini

## Risks
- Version drift npm → pin caret major stabil; verifikasi install bersih
- CSP memutus Next/GA → 'unsafe-inline' script-src + connect-src GA; verifikasi via build
- Localized pathnames + middleware matcher (eksklusi file ber-ekstensi) → matcher `'/((?!api|_next|_vercel|.*\..*).*)'`
- Tailwind v3 vs v4 → pilih v3.4 demi stabilitas konfigurasi
- Placeholder SVG via next/image → `unoptimized` eksplisit
- Lingkungan Windows → .gitignore/.editorconfig konsisten LF

## Progress Log
- 2026-08-24 09:20 — Rencana disetujui; mulai implementasi (scaffold).
- 2026-08-24 12:35 — Implementasi selesai end-to-end. Fondasi sesi pagi diverifikasi; dibangun: messages id/en (paritas diuji), 20+ komponen, seluruh halaman + [slug] detail properti, SEO routes (sitemap/robots/manifest/icon/OG), GA4 consent-gated, 16 file test / 84 assertion hijau. Bug ditemukan & diperbaiki lewat test: next.config.mjs berisi sintaks TS → next.config.ts; ekspor konstanta di page files → pindah ke config/content.ts; sitemap kini entri per-locale; URL JSON-LD properti berprefiks locale; rel sponsored pada CTA afiliasi; not-found guard params opsional; LanguageSwitcher aktif-locale tidak lagi disabled (keyboard-accessible). Gates final: lint ✓ typecheck ✓ test 84/84 ✓ build 32 halaman statis ✓. Smoke produksi: root 307→/id, header keamanan lengkap, hreflang/canonical benar, h1 tunggal, JSON-LD & disclosure hadir. Keputusan baru: consent model opt-in dikonfirmasi user; placeholder SVG buatan sendiri; README.md lengkap ditulis.

## Notes
- Standar arsitektur: proyek non-telecom → TOGAF diterapkan proporsional (dokumentasi + separation of concerns), tanpa ceremony enterprise untuk situs statis.
- Property detail page ditambahkan agar CTA "Lihat Detail" berfungsi nyata dan event `view_property` + JSON-LD RealEstateListing punya konteks.
- Kontak tanpa backend: WhatsApp + email dari env (opsional; CTA disembunyikan bila belum dikonfigurasi).
- Tanpa harga fiktif: produk "Cek harga terbaru", properti "Hubungi untuk harga".
- JSON-LD memakai Organization (brand hub), bukan Person.
- Tidak ada commit/push tanpa instruksi eksplisit user.
