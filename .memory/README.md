# Asharu Digital Hub — Project Memory Index

Format version: 1
Last updated: 2026-08-24 12:35 (local time)

## Current State

- **Status:** Implementasi v0.1.0 production-ready SELESAI. Semua quality gates hijau: `lint` ✓, `typecheck` ✓, `test` 84/84 ✓, `build` 32 halaman statis ✓. Repo belum memiliki commit pertama.
- **Stack:** Next.js 15 App Router + React 19 + TS strict + Tailwind 3.4 + next-intl v4 + Zod. SSG penuh, tanpa database, tanpa backend form.
- **Halaman:** `/id` & `/en` (home), produk, properti (+detail `[slug]`, 6 listing × 2 locale = 12), tentang, kebijakan privasi, disclosure afiliasi, not-found terlokalisasi. Root `/` → 307 `/id`.
- **Analytics:** GA4 consent-gated opt-in via `NEXT_PUBLIC_GA_MEASUREMENT_ID`; 6 event type-safe tanpa PII; banner reopen dari footer.
- **Keamanan:** CSP `'unsafe-inline' script-src` (trade-off terdokumentasi), HSTS, frame-ancestors none, Permissions-Policy; URL eksternal https/mailto/tel only.

## Active Decisions

1. i18n: next-intl localized pathnames (`/id/produk` ↔ `/en/products`), `localeDetection:false` → root deterministik ke `/id` (crawler-safe).
2. Consent model GA: **opt-in** (dikonfirmasi user 2026-08-24); penarikan consent menyetel `ga-disable-*`.
3. Halaman detail properti `[slug]` dipertahankan di luar spek minimal (CTA "Lihat Detail" nyata + konteks RealEstateListing).
4. Placeholder gambar = SVG buatan sendiri (`unoptimized` untuk .svg); aset asli otomatis teroptimasi.
5. Tanpa harga fiktif: produk "Cek harga terbaru", properti "Hubungi untuk harga"; skema Zod menolak field price/rating/certificate pada data statis.
6. JSON-LD: Organization (bukan Person); tanpa Product/offers sampai harga terverifikasi ada.
7. Tidak ada commit/push tanpa instruksi eksplisit user.

## Open Items / Blockers

- [ ] Data placeholder (`src/data/*`, `public/images/*`) HARUS diganti data terverifikasi sebelum launch — lihat README §Mengganti Konten Placeholder & checklist.
- [ ] `NEXT_PUBLIC_WHATSAPP_URL`, `NEXT_PUBLIC_CONTACT_EMAIL`, `NEXT_PUBLIC_GA_MEASUREMENT_ID` masih kosong (fitur terkait otomatis disembunyikan/nonaktif).
- [ ] Deploy Vercel + hubungkan domain asharu.id belum dilakukan.
- [ ] Lighthouse manual run + uji screen reader/keyboard di perangkat nyata belum dilakukan (otomatisasi tercakup sebagian via test).

## Recent Entries

- [2026-08-24 123500-asharu-digital-hub-full-implementation.md](2026-08-24/123500-asharu-digital-hub-full-implementation.md) — implementasi lengkap end-to-end.

## Legacy Archive

Tidak ada `PROJECT_MEMORY.md` (format `.memory/` langsung dipakai sejak awal).
