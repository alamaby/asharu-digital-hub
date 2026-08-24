# Asharu — Code Review Fixes

Created: 2026-08-24 12:55:00

## Objective
Menindaklanjuti review implementasi Asharu Digital Hub: menutup celah fungsional tracking (spek §8), bug layout mobile nav, inkonsistensi breadcrumb/kontak, dan polish kecil — tanpa mengubah API publik secara breaking.

## Scope
- Analytics: page_view client-side nav, view_property di detail properti, gating consent UI pada env GA
- Layout: anchoring panel MobileNav
- Konten/i18n: label breadcrumb daftar properti
- Polish: ContactCTA cleanup, NavMenu simplification, apple-icon, manifest lang
- Dokumentasi: README, plan induk, .memory

## Milestones
1. Fase 1 — Analytics lengkap (P1 #1–#3, P2 #5)
2. Fase 2 — Layout & konten (P1 #4, P2 #6–#9)
3. Fase 3 — Polish + dokumentasi
4. Fase 4 — Gates ulang + commit

## Tasks
- [x] `trackPageView()` di `events.ts` + test
- [x] `PageViewTracker` (client, Suspense-wrapped) + test
- [x] `ViewPropertyTracker` fire-once + test + pasang di `[slug]`
- [x] Gate ConsentBanner (`enabled` prop) + layout kondisional + test
- [x] Tombol kontak detail → `TrackedExternalLink` `click_property_contact`
- [x] MobileNav: hapus `relative` wrapper (anchor ke header)
- [x] Key `propertyPage.listTitle` (id/en) untuk breadcrumb name
- [x] ContactCTA: drop `data-link-position`, aria-label eksplisit
- [x] Simplify kondisi aktif `NavMenu`
- [x] `app/apple-icon.tsx` (ImageResponse 180×180)
- [x] `manifest.ts` + `lang`
- [x] README: tabel event + catatan tracker
- [x] Gates hijau: lint/typecheck/test/build
- [ ] Commit konvensional + entry `.memory/`

## Risks
- `useSearchParams` di layout statis wajib dibungkus `<Suspense>` (Next build error jika tidak)
- Perubahan `GtagFunction` menjadi loose-typed melemahkan tipe internal — mitigasi: `trackEvent` tetap strict di level API publik
- jsdom tidak menguji geometri anchoring MobileNav → QA manual 320px tetap wajib

## Progress Log
- 2026-08-24 12:55 — Plan disetujui user ("lanjut fix"); mulai Fase 1.
- 2026-08-24 13:10 — Fase 1–3 selesai. 9 temuan ditangani: PageViewTracker (Suspense-wrapped) & ViewPropertyTracker (fire-once) + 9 test baru; trackPageView di events.ts; ConsentBanner digate `enabled` (tidak tampil tanpa GA ID); kontak detail properti kini terlacak (`click_property_contact`, `link_position: property-detail`); MobileNav panel kini melekat ke header sticky (bug lebar wrapper); breadcrumb detail memakai key baru `propertyPage.listTitle`; ContactCTA aria-label eksplisit + attr tak terpakai dihapus; NavMenu dead condition dihapus; apple-icon.tsx (ImageResponse) → route `/apple-icon` + link tag terverifikasi; manifest `lang:"id"`; README tabel event diperbarui. Gates: lint ✓ typecheck ✓ test **93/93** ✓ build **33 halaman** ✓. Smoke prod: apple-touch-icon & icon link ada, manifest lang benar, tracker ada di chunk layout & payload detail.
- Pending: commit + entry .memory/ (eksekusi setelah log ini).

## Notes
- Keputusan disetujui: buat `apple-icon.tsx` via ImageResponse; TIDAK mengekstrak Hero jadi komponen (nilai rendah).
- Semua perubahan aditif; satu commit konvensional mencakup seluruh findings.
