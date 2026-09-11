# Carousel Riwayat Visual di Layar Konten/Review

Tanggal: 2026-09-11
Commit: `9ea92c4` — `feat(review): carousel riwayat visual dengan info provider/model`

## Tugas / Masalah
Di layar `/konten/review/[draftId]`, setiap regenerate visual menambah baris yang menumpuk ke bawah (daftar `<ul>` di `DraftImageCard`), sulit dibandingkan dengan hasil sebelumnya. User ingin: carousel dengan hasil terbaru paling depan, bisa digeser/swipe untuk melihat prompt + hasil generate sebelumnya, plus info provider & model per slide.

## Keputusan (konfirmasi user)
1. Blok gambar terpilih yang terpisah di atas kartu DIHAPUS — carousel jadi satu-satunya area visual (slide terpilih diberi badge "Terpilih").
2. Carousel juga diterapkan pada visual per-reply (`PostImageControl`) — sebelumnya hanya menampilkan 1 gambar tanpa riwayat.
3. Implementasi pakai dependency `embla-carousel-react` 8.6.0 (bukan buat sendiri).

## File Utama
- `src/components/content/ImageHistoryCarousel.tsx` (BARU) — komponen shared carousel: embla (swipe native), chevron prev/next, counter `n/N`, dots, keyboard ArrowLeft/Right, slide non-aktif `inert`, badge status + Terpilih, info `provider · model · style`, prompt + negative + strategi, aksi per slide (Lihat/Pilih/Ulangi), placeholder per status (pending/prompt_ready/failed/gambar rusak), variant `cover` (max-h-80, prompt penuh) vs `reply` (max-h-48, prompt line-clamp-3).
- `src/components/content/DraftImageCard.tsx` — blok gambar terpilih terpisah + `<ul>` riwayat dihapus → render carousel dari state `images`; `statusBadge` dipindah ke carousel.
- `src/components/content/PostImageControl.tsx` — prop `imageUrl` diganti `initialHistory: DraftImageRow[]`; state `history` + derived `selected`; `refreshOne` kini sync seluruh history per post_index (bukan hanya URL); tambah `select()`/`retryOne()` (sebelumnya reply tidak punya retry).
- `src/components/content/ContentDraftCard.tsx` — prop `postImages` diganti `replyImages: DraftImageRow[]`; filter per post_index ke `PostImageControl`.
- `src/app/[locale]/konten/review/[draftId]/page.tsx` — kirim `replyImages={draftImages.filter(i => (i.post_index ?? 0) >= 1)}` (data sudah di-fetch, tanpa query baru).
- `src/components/content/ImageHistoryCarousel.test.tsx` (BARU) — 7 test: urutan terbaru dulu, badge Terpilih, aksi per status, callback onSelect, counter/dots, single-slide tanpa kontrol, placeholder status.

## Keputusan Teknis
- Urutan slide: data DB sudah `order created_at desc` → index 0 = terbaru, tanpa sort ulang.
- Posisi slide saat rows berubah: kalau `rows[0].id` berubah (generate baru masuk antrean) → jump ke slide 0 (terbaru); kalau terbaru sama (mis. status update setelah Pilih) → pertahankan slide yang sedang dilihat by id (`focusIdRef`). Efek via `emblaApi.reInit()` + scrollTo jump.
- `inert` pada slide non-aktif (pola ProductCarousel) agar tombol Pilih/Ulangi/Lihat slide tersembunyi tidak tabbable.
- Tanpa auto-advance (alat review admin; ProductCarousel auto-play tidak relevan).
- Tanpa i18n baru: label hardcoded Bahasa Indonesia, konsisten dengan konvensi kedua komponen.
- Tidak ada ekspos secret baru: `replyImages` memakai `DraftImageRow` yang sama dengan `coverImages` yang sudah dikirim ke client sebelumnya.

## Gotcha Penting (untuk test mendatang)
- jsdom (vitest) TIDAK punya `matchMedia`, `IntersectionObserver`, `ResizeObserver` — embla butuh ketiganya saat init. Stub ketiganya via `vi.stubGlobal` di test file (pola `mockMatchMedia` sudah ada di `ProductCarousel.test.tsx`; ditambah stub IO+RO di `ImageHistoryCarousel.test.tsx`).
- tsconfig `noUncheckedIndexedAccess` aktif → akses array di test harus lewat helper yang melempar error (`slideAt`) atau cast eksplisit.

## Risiko / Catatan
- Teks slide per-reply di-clamp 3 baris (`line-clamp-3`) — prompt penuh masih terlihat di variant cover; bila user butuh prompt penuh di reply, tambah tombol expand.
- Embla drag mouse di desktop bisa memicu seleksi teks saat drag di atas prompt (perilaku bawaan embla) — minor, belum di-klaim fix.
- `PostImageControl` masih pola "Muat ulang manual" (bukan sync prop reaktif), sama seperti sebelumnya — realtime via `supabase.channel` tetap open item.

## Verifikasi
- `npm run typecheck` ✓, `npm run lint` ✓, `npm test` 389/389 (51 file) ✓, `npm run build` ✓.
- Push `9ea92c4` ke origin/main sukses.

## Proposal Commit
`feat(review): carousel riwayat visual dengan info provider/model` (sudah dipakai, commit `9ea92c4`)

## Terkait
- Plan: `plans/2026-09-11-image-history-carousel-plan.md`
- [163000-image-prompt-reasoning-before.md](2026-09-07/163000-image-prompt-reasoning-before.md) — kolom reasoning yang kini tampil di slide.
- [165000-image-styles-manga-pencil.md](2026-09-10/165000-image-styles-manga-pencil.md) — style preset yang tampil sebagai info per slide.
