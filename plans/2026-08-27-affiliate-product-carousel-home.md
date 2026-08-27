# Affiliate Product Carousel (Homepage)

Created: 2026-08-27 22:10:00

## Objective
Ganti grid produk afiliasi *featured* di halaman utama dengan **carousel 1 kartu/per slide** yang **auto-advance setiap 10 detik**, dengan kontrol pause (hover/focus + tombol play/pause) dan menghormati `prefers-reduced-motion` — tetap menjaga prinsip static-first & WCAG.

## Keputusan (dikonfirmasi user)
- **Lokasi**: hanya home (featured 6 produk). Halaman `/products` tetap grid semua produk.
- **Perilaku**: auto-advance 10s + pause on hover/focus + tombol play/pause terlihat + hormati reduced-motion.
- **Layout**: 1 kartu per slide (max-w-3xl), panah prev/next + dots indikator.

## Tasks
- [x] i18n keys `product.carousel.*` (id + en) — prev, next, play, pause, slideLabel (ICU), regionLabel
- [x] `src/components/cards/ProductCarousel.tsx` (`'use client'`)
  - auto-advance 10s via `setInterval`, dimatikan saat `paused`/`prefers-reduced-motion`
  - pause on hover (`onMouseEnter/Leave`) & focus (`onFocusCapture` + `onBlurCapture` via relatedTarget)
  - tombol play/pause visible (aria-pressed), prev/next (Chevron icons), dots (aria-current, slideLabel)
  - transisi `translateX` per index, container `overflow-hidden`, slide tetap di DOM (SEO/JSON-LD aman)
- [x] `src/app/[locale]/page.tsx`: ganti grid featured → `<ProductCarousel products={featuredProducts} linkPosition="home-featured" />`; hapus import `ProductCard` tak terpakai; JSON-LD `productListSchema` tetap
- [x] Test `src/components/cards/ProductCarousel.test.tsx` (8 test) — render slide1, prev/next wrap, dot nav + aria-current, play/pause toggle, hover pause, reduced-motion via matchMedia mock
- [x] README: arsitektur "client components" + folder structure catat ProductCarousel
- [x] Gate: lint ✓ typecheck ✓ test **137/137** ✓ build ✓

## Risiko
- **wcag 2.2.2** — auto-play >5s wajib pause → tombol pause + hover/focus + reduced-motion ada. ✓
- **jsdom tanpa matchMedia** — dimock di test (`vi.stubGlobal`) untuk mencegah throw pada effect pertama. ✓
- **Hydration** — `index` awal `0` konsisten client/server (tanpa random) sehingga tanpa mismatch. ✓
- **1 kartu/slide desktop** — dibatasi `max-w-3xl` + `mx-auto` agar tidak melar. ✓
- **Tanpa penurunan SEO/SSG** — ke-6 kartu tetap dirender di DOM awal (hidden via translate-CSS, bukan unmount), JSON-LD dipertahankan. ✓

## Progress Log
- 2026-08-27 22:10 — Plan dibuat (mode plan). Keputusan user: hanya home, auto+pause WCAG, 1 kartu/slide.
- 2026-08-27 22:45 — Implementasi selesai dalam mode build. Komponen + test + integrasi home final. Gates hijau semua.
- 2026-08-27 23:10 — **Code review**: ditemukan slide non-aktif tetap ada di a11y tree & tab order (6 kartu/dokumen walau hanya 1 tampil) → **fix** `inert` pada slide non-aktif (topik SEO tetap di DOM, disabled utk keyboard/SR). Test baru ditambahkan (9 total). README/arsitektur sudah update. Gates hijau: lint ✓ typecheck ✓ test **138/138** ✓ build ✓. Commit & push.

## Notes
- Tanpa library carousel pihak ketiga (Embla dll) — implementasi manual zero-dependency, konsisten gaya komponen existing.
- `linkPosition="home-featured"` dipertahankan agar analytics event `click_affiliate_product` tidak berubah semantik.
- Detail teknis transisi: `useRef` untuk reduced-motion + guard di dalam interval effect agar listener preferensi tidak re-subscribe tiap detik.