# Asharu Digital Hub — Project Memory Index

Format version: 1
Last updated: 2026-08-25 10:00 (local time)

## Current State

- **Status:** LIVE di Vercel (preview domain `https://asharu-digital-hub.vercel.app`) dan **terverifikasi visual benar oleh user** setelah fix `globals.css` import (commit `7606c2f`). Gates: lint ✓, typecheck ✓, test 95/95 ✓, build 33 halaman ✓. Tiga commit terakhir ter-push ke `origin/main`.
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

- [ ] Data placeholder (`src/data/*`, `public/images/*`) HARUS diganti data terverifikasi sebelum launch publik — README §Mengganti Konten Placeholder. Status toko: Shopee = publish (Asharu x Nopi.NY); Tokopedia/TikTok Shop/web-store = `hidden: true` sampai URL riil ada (hapus flag untuk menampilkan).
- [ ] Set `NEXT_PUBLIC_*` di Vercel Environment Variables (Production) — `.env.local` lokal tidak otomatis ikut; saat ini deploy berjalan tanpa GA/kontak (CTA WhatsApp/email tersembunyi, banner consent nonaktif).
- [ ] Hubungkan domain produksi asharu.id (saat ini preview `asharu-digital-hub.vercel.app`); setelah itu set `NEXT_PUBLIC_SITE_URL=https://asharu.id` + redeploy agar canonical/hreflang/sitemap benar.
- [ ] QA manual: Lighthouse ≥90/95/95/95, screen reader/keyboard di perangkat nyata.

## Recent Entries

- [2026-08-25 111000-shopee-review-fixes.md](2026-08-25/111000-shopee-review-fixes.md) — identitas riil Shopee + perbaikan accessible name.
- [2026-08-25 104500-shopee-store-integration.md](2026-08-25/104500-shopee-store-integration.md) — Shopee riil: kanonis + affiliate fallback + kartu branded.
- [2026-08-24 131000-asharu-code-review-fixes.md](2026-08-24/131000-asharu-code-review-fixes.md) — remediasi 9 temuan review.
- [2026-08-24 123500-asharu-digital-hub-full-implementation.md](2026-08-24/123500-asharu-digital-hub-full-implementation.md) — implementasi lengkap end-to-end.

## Legacy Archive

Tidak ada `PROJECT_MEMORY.md` (format `.memory/` langsung dipakai sejak awal).
