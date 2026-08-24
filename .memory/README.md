# Asharu Digital Hub — Project Memory Index

Format version: 1
Last updated: 2026-08-24 13:10 (local time)

## Current State

- **Status:** v0.1.0 production-ready + 9 temuan code review telah diremediasi. Gates: lint ✓, typecheck ✓, test **93/93** ✓, build **33 halaman** ✓. Dua commit di `main`.
- **Stack:** Next.js 15 App Router + React 19 + TS strict + Tailwind 3.4 + next-intl v4 + Zod. SSG penuh, tanpa database, tanpa backend form.
- **Halaman:** `/id` & `/en` (home), produk, properti (+detail `[slug]`, 12 listing-lokale), tentang, kebijakan privasi, disclosure afiliasi, not-found terlokalisasi. Root `/` → 307 `/id`.
- **Analytics:** GA4 consent-gated opt-in; 6 event kustom + `page_view` (PageViewTracker) + `view_property` (ViewPropertyTracker di detail); banner digate env GA; footer preferences.
- **Keamanan:** CSP `'unsafe-inline' script-src` (trade-off terdokumentasi), HSTS, frame-ancestors none, Permissions-Policy; URL eksternal https/mailto/tel only.

## Active Decisions

1. i18n: next-intl localized pathnames (`/id/produk` ↔ `/en/products`), `localeDetection:false` → root deterministik ke `/id` (crawler-safe).
2. Consent model GA: **opt-in**; UI consent tidak dirender bila GA tidak dikonfigurasi.
3. Halaman detail properti `[slug]` dipertahankan di luar spek minimal (CTA "Lihat Detail" nyata + konteks RealEstateListing).
4. Placeholder gambar = SVG buatan sendiri (`unoptimized` untuk .svg); aset asli otomatis teroptimasi. Icon/apple-icon dibuat via SVG/ImageResponse tanpa aset biner.
5. Tanpa harga fiktif: produk "Cek harga terbaru", properti "Hubungi untuk harga"; skema Zod menolak field price/rating/certificate pada data statis.
6. JSON-LD: Organization (bukan Person); tanpa Product/offers sampai harga terverifikasi ada; breadcrumb detail memakai label halaman (bukan teks aksi).
7. GtagFunction wire-level loose, helper publik typed; tracker client islands kecil (PageView/ViewProperty).
8. Tidak ada commit/push ke remote tanpa instruksi eksplisit user.

## Open Items / Blockers

- [ ] Data placeholder (`src/data/*`, `public/images/*`) HARUS diganti data terverifikasi sebelum launch — README §Mengganti Konten Placeholder.
- [ ] `NEXT_PUBLIC_WHATSAPP_URL`, `NEXT_PUBLIC_CONTACT_EMAIL`, `NEXT_PUBLIC_GA_MEASUREMENT_ID` masih kosong (fitur terkait otomatis disembunyikan/nonaktif).
- [ ] Deploy Vercel + hubungkan domain asharu.id belum dilakukan.
- [ ] QA manual responsif (320px MobileNav panel) + Lighthouse + screen reader belum dijalankan di perangkat nyata.

## Recent Entries

- [2026-08-24 131000-asharu-code-review-fixes.md](2026-08-24/131000-asharu-code-review-fixes.md) — remediasi 9 temuan review.
- [2026-08-24 123500-asharu-digital-hub-full-implementation.md](2026-08-24/123500-asharu-digital-hub-full-implementation.md) — implementasi lengkap end-to-end.

## Legacy Archive

Tidak ada `PROJECT_MEMORY.md` (format `.memory/` langsung dipakai sejak awal).
