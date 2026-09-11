# Carousel Riwayat Visual di Layar Konten/Review

Created: 2026-09-11 08:30:00

## Objective
Mengganti tampilan riwayat generate visual di layar konten/review dari daftar yang menumpuk ke bawah menjadi carousel: hasil terbaru tampil paling pertama, user bisa geser (swipe) untuk melihat prompt + hasil generate sebelumnya, dengan info provider & model per slide.

## Scope
- `DraftImageCard.tsx` (cover, post 0): hapus blok gambar terpilih terpisah + `<ul>` riwayat → carousel jadi satu-satunya area visual.
- `PostImageControl.tsx` (per-reply): gambar tunggal → carousel riwayat per post_index.
- Komponen shared baru `ImageHistoryCarousel.tsx` + test.
- Dependency baru: `embla-carousel-react`.

## Milestones
1. Persiapan: plan file + install embla-carousel-react.
2. Komponen carousel + test.
3. Integrasi cover (DraftImageCard).
4. Integrasi per-reply (PostImageControl + ContentDraftCard + halaman review).
5. Gate + commit + push.

## Tasks
- [x] Simpan plan file ke plans/2026-09-11-image-history-carousel-plan.md
- [x] Install embla-carousel-react
- [x] Buat ImageHistoryCarousel.tsx + test
- [x] Refactor DraftImageCard.tsx pakai carousel
- [x] Refactor PostImageControl + ContentDraftCard + halaman review
- [x] Gate: typecheck, lint, test, build
- [x] Commit + push + laporan
- [x] (Follow-up) Tombol Unduh (download via blob) + Lihat (open new tab) di tiap slide

## Desain
- Slide per baris riwayat, terbaru di index 0 (query DB sudah `order created_at desc`).
- Tiap slide: gambar (`max-h-80` cover / `max-h-48` reply, `object-cover`) atau placeholder status (`pending`/`prompt_ready`/`failed` + error), badge status, info `provider · model · style`, prompt (+negative), strategi/reasoning ringkas.
- Badge "Terpilih" pada slide yang jadi cover/lampiran social.
- Aksi per slide: Lihat (buka URL), Pilih (selectDraftImage), Ulangi (retryFailedImage — hanya failed).
- Navigasi: swipe/touch (native embla), chevron prev/next, counter `n/N`, dots, keyboard ArrowLeft/Right. Tanpa auto-advance.
- Setelah refresh/generate, index kembali ke 0 (terbaru).

## Risks
- Tidak ada field/secret baru terekspos ke client — `replyImages` memakai `DraftImageRow` sama dengan `coverImages` yang sudah dikirim hari ini.
- Embla v8: container `overflow-hidden` + track `display:flex` + `touch-action: pan-y` — murni Tailwind, tanpa CSS eksternal.
- Draft 0 gambar: carousel tidak dirender, pesan placeholder tetap.
- Label hardcoded Bahasa Indonesia mengikuti konvensi kedua komponen (tanpa i18n baru).

## Progress Log
- 2026-09-11 08:30:00 — Rencana dibuat setelah eksplorasi DraftImageCard/PostImageControl/ContentDraftCard/halaman review + konfirmasi user (hapus blok terpilih, ikutkan per-reply, embla).
- 2026-09-11 08:55:00 — embla-carousel-react 8.6.0 terinstall; `ImageHistoryCarousel.tsx` dibuat (embla + chevron + counter + dots + keyboard + inert slide non-aktif + placeholder per status). Test 7/7 pass setelah stub matchMedia/IntersectionObserver/ResizeObserver (jsdom) — pola stub mengikuti ProductCarousel.test.tsx.
- 2026-09-11 09:00:00 — Integrasi selesai: DraftImageCard (blok gambar terpilih terpisah + `<ul>` riwayat dihapus → carousel), PostImageControl (props `imageUrl` → `initialHistory`, tambah select/retryOne, `refreshOne` sync seluruh history), ContentDraftCard (`postImages` → `replyImages`), halaman review (`replyImages` filter post_index ≥ 1, tanpa query baru).
- 2026-09-11 09:05:00 — Gate hijau: typecheck OK, lint OK, test 389/389 pass (51 file), build sukses.
- 2026-09-11 09:45:00 — Commit `9ea92c4` `feat(review): carousel riwayat visual dengan info provider/model` dipush ke origin/main; entri memory `.memory/2026-09-11/094000-image-history-carousel.md` dibuat + README.md index diperbarui.
- 2026-09-11 09:10:00 — Follow-up (request user): tombol **Unduh** di tiap slide (download via fetch → blob → object URL karena URL Storage lintas origin; nama file = basename URL, fallback `visual-<id>.png`; busy state "Mengunduh..."; fallback `window.open` tab baru bila fetch/CORS gagal) + **Lihat** (sudah ada = open in new tab). +2 test (alur blob + fallback). Gate hijau: 391/391 test + build; commit & push.

## Notes
- Data per baris sudah tersedia (provider_slug, model_id, style_slug, image_prompt, negative_prompt, status, reasoning) — tanpa query baru; halaman review hanya memfilter `replyImages` dari `draftImages` yang sudah di-fetch.
- `refreshOne` PostImageControl kini me-refresh seluruh history per post_index, bukan hanya URL terpilih.
