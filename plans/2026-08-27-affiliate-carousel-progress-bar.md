# Visual Progress Bar untuk Auto-Advance Carousel

Created: 2026-08-27 23:30:00

## Objective
Menampilkan progress bar linear di bawah kartu carousel yang menunjukkan sisa waktu (10 detik) sampai auto-advance ke produk berikutnya — mengisi 0→100% smooth via `requestAnimationFrame`, freeze saat pause/hover/focus/reduced-motion, dan reset setiap pindah slide.

## Keputusan (dikonfirmasi user)
- **Bentuk**: linear bar (A), **di bawah kartu**.
- **Smooth**: `requestAnimationFrame` (fallback `setTimeout` untuk jsdom safety).
- **Freeze saat pause** (hover/focus/tombol): bar berhenti di nilai saat ini, lanjut dari nilai sama saat resume.
- **Reduced-motion**: bar statis 0, auto-play mati (konsisten behavior existing).
- **Reset** ke 0 setiap pindah slide (auto-advance maupun manual panah/dots).

## Scope
- Hanya `src/components/cards/ProductCarousel.tsx` + `ProductCarousel.test.tsx` + plan file.
- Tidak mengubah data, schema, page, JSON-LD, atau i18n (bar dekoratif, `aria-hidden`).

## Tasks
- [ ] State: `progress` (0..100), `startRef` (timestamp), `elapsedRef` (akumulasi saat pause)
- [ ] Ganti `setInterval` auto-advance dengan loop rAF tunggal (satu sumber kebenaran avoid double-advance):
  - `!paused && !reducedMotion && hasMultiple` → `requestAnimationFrame` menghitung `elapsed`, set `progress`, trigger advance saat >= 100 lalu reset
  - saat `paused` → cancel rAF, freeze `elapsedRef`
  - saat `index` berubah dari luar → reset `startRef`/`elapsedRef`/`progress`
- [ ] Helper `resetProgress()` dipanggil oleh `step`/`goTo` sebelum `setIndex`
- [ ] Render bar dekoratif di bawah track (antara slide & kontrol): `h-1 max-w-3xl bg-line`, fill `bg-primary`, `aria-hidden`, `transition-none`
- [ ] Test: progress bertambah (fake timers), reset saat klik berikutnya, freeze saat mouseEnter
- [ ] Gate: lint ✓ typecheck ✓ test ✓ build ✓

## Risiko
- **rAF di jsdom** — fallback `window.requestAnimationFrame ?? setTimeout`.
- **Double-advance** — hanya satu loop rAF (hapus `setInterval`).
- **Hydration** — `progress=0` statis SSR, tanpa mismatch.
- **Perf** — rAF murah; skip update bila delta < 1% guna kurangi re-render; berhenti saat pause/reduced-motion.
- **Reduced-motion** — `reducedRef` existing dipakai; bar tetap 0.

## Progress Log
- 2026-08-27 23:30 — Plan dibuat. Keputusan: linear bar bawah kartu, rAF smooth, freeze saat pause, reset saat pindah slide, statis saat reduced-motion.
- 2026-08-28 09:00 — Implementasi selesai. rAF loop menggantikan `setInterval`; progress bar dekoratif di bawah kartu (`h-1 max-w-3xl`, fill `bg-primary`, `aria-hidden`); freeze/resume via `elapsedRef` snapshot; reset di `goTo` (index bukan dep effect → avoid double-advance). 4 test baru (total 13). Gate hijau: lint ✓ typecheck ✓ test **142/142** ✓ build ✓. Commit & push.

## Notes
- Bar dekoratif → `aria-hidden`; status slide sudah diberi tahu via live region existing (tidak tambah noise SR).
- Warna token: `bg-primary` (fill), `bg-line` (track) — konsisten gaya komponen.