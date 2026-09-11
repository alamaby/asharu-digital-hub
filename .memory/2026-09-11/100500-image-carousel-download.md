# Tombol Unduh + Open in New Tab untuk Visual di Carousel Review

Tanggal: 2026-09-11
Follow-up dari [094000-image-history-carousel.md](094000-image-history-carousel.md) (commit `9ea92c4`).

## Tugas / Masalah
User minta fitur download dan open-in-new-tab untuk image hasil generate di layar konten/review.

## Solusi
- Tombol **Lihat** (sudah ada sejak `9ea92c4`) = open in new tab (`<a target="_blank">`) — dipertahankan apa adanya.
- Tombol baru **Unduh** di `ImageHistoryCarousel.tsx` (berlaku cover + per-reply, hanya slide yang punya `public_url`):
  - Download via `fetch(url) → blob → URL.createObjectURL → anchor.click()` karena URL Supabase Storage lintas origin (atribut `download` pada `<a>` diabaikan browser untuk lintas origin).
  - Nama file: basename dari pathname URL Storage bila berekstensi; fallback `visual-<id8>.png` (helper `filenameFor`, murni).
  - State feedback: busy state "Mengunduh..." + `disabled` semua tombol Unduh saat satu unduhan berjalan (submission prevention) + `aria-busy`.
  - Fallback: bila fetch gagal (network/CORS) → `window.open(url, '_blank', 'noreferrer')` agar user tetap bisa menyimpan manual.

## File Utama
- `src/components/content/ImageHistoryCarousel.tsx` — state `downloadingId`, handler `download()`, helper `filenameFor()`, tombol Unduh di baris aksi slide.
- `src/components/content/ImageHistoryCarousel.test.tsx` — +2 test: (1) alur blob (fetch dipanggil dgn URL, `createObjectURL`/`revokeObjectURL` ter-called; `HTMLAnchorElement.prototype.click` di-spy agar jsdom tidak memicu warning navigation), (2) fallback `window.open` saat fetch reject. Stub `matchMedia`/`IntersectionObserver`/`ResizeObserver` dipindah dari module-level ke `beforeEach` + `afterEach` unstub.

## Keputusan Teknis
- Tanpa query/server action baru — murni client-side; tidak ada perubahan props (carousel sudah menerima `public_url`).
- Tanpa i18n baru: label "Unduh"/"Mengunduh..." hardcoded, konsisten dengan konvensi komponen.

## Risiko / Catatan
- CORS: Supabase Storage public bucket membolehkan `Access-Control-Allow-Origin: *`, jadi fetch dari browser seharusnya sukses; fallback tab baru menutup kasus lain.
- Image besar di-download ke memori (blob) — ukuran visual generate (≤ beberapa MB) aman untuk admin tool.

## Verifikasi
- `npm run typecheck` ✓, `npm run lint` ✓, `npm test` 391/391 (51 file) ✓, `npm run build` ✓.

## Proposal Commit
`feat(review): unduh + buka tab baru untuk visual carousel` (sudah dipakai)

## Terkait
- Plan: `plans/2026-09-11-image-history-carousel-plan.md`
