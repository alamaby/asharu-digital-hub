# Studio: riwayat kronologis + enhance prompt LLM

- Request user: (1) riwayat kronologis + sort tanggal, (2) filter per parameter enqueue, (3) prompt penuh + reuse/copy, (4) timestamp zona-user, (5) link detail log gagal; form: tombol enhance prompt + pilihan provider/model LLM.
- Keputusan desain user: daftar kronologis (ganti carousel), side-by-side Terima/Batal, kuota enhance terpisah 30/jam, detail log expandable inline.

## Key files changed

- `src/lib/studio/actions.ts` — `listUserImages(StudioListOptions)` (status/sortBy/dir + 6 filter kolom via `.eq()`); `listStudioOptions` += `llmProviders/llmModels` aktif; `enhanceStudioPrompt` baru (requireUser, validasi prompt ≤ max_prompt_length, pin LLM aktif, style hint, rate-limit bucket `enhance_studio_prompt` 30/jam, `resolveStageModel('enhance_image_prompt', pin)`, retry gate 1x, increment setelah sukses).
- `src/lib/studio/types.ts` — `StudioListOptions`, `StudioEnhanceResult`, `StudioOptions.llmProviders/llmModels`.
- `src/lib/image/prompt.ts` — `buildStudioEnhanceMessages` (+ `StudioEnhanceInput`): POLISH tanpa konteks post (tanpa aturan missed-detail vs source), preservasi detail + enrichment (lighting/komposisi/mood).
- `src/components/studio/StudioHistory.tsx` — rewrite carousel → `<ol>` daftar kronologis: toolbar primer (status/provider/model/sort) + `<details>` Filter lanjutan (style/subject/camera/aspect + Atur ulang), timestamp `formatDateTime` zona-user, prompt + negative penuh, Salin (clipboard+fallback), Pakai ulang (`onReuse`), Unduh/Lihat/Ulangi/Hapus, detail log `<details>` (created/updated detik, attempts, dimensi, last_error penuh, llm_meta pretty). Polling pending membawa filter aktif. Dependensi embla dihapus dari file ini.
- `src/components/studio/StudioPageClient.tsx` — `timeZone` prop, `reuseRow` state, `onReuse` isi form + scroll top; riwayat selalu render (empty state di dalam).
- `src/components/studio/StudioForm.tsx` — `reuseRow` prop (isi sekali per klik + notice), panel enhance (picker provider/model LLM Auto=stage default, tombol Sempurnakan, side-by-side Terima/Batal/Urungkan).
- `src/app/[locale]/(admin)/studio/page.tsx` — `getDisplayTimezone()` + teruskan; limit awal 30→50.
- `src/messages/id.json` + `en.json` — `studio.form.reused`, `studio.enhance.*` (17 key), `studio.history.*` (+24 key); `prevSlide/nextSlide` dihapus (carousel hilang).
- Tests: `src/lib/studio/actions.test.ts` baru (filter/sort eq + builder enhance), `StudioUi.test.tsx` rewrite (12 tests: form+enhance Terima, daftar, timestamp WIB, detail log, pending, pin cloudflare, toolbar, onReuse).

## Technical / business decisions

- Filter server-side (bukan client) agar konsisten dengan polling + limit 50.
- Enhance Studio = stage `enhance_image_prompt` yang sama dengan review (default admin di `/admin/llm/stages` berlaku), tapi builder pesan terpisah karena tanpa source post; gate self-consistency (panjang + strategi) sama seperti review.
- Bucket rate-limit baru `enhance_studio_prompt` (bukan reuse `enhance_image_prompt`) agar kuota review tak termakan Studio — sesuai pilihan "terpisah".
- Pin LLM enhance = soft waterfall via `runLLMCompletion` (bukan strict-fail seperti pin image): untuk polish LLM, fallback dapat diterima; strict hanya untuk pilihan provider image.
- `Pakai ulang` mengisi semua parameter enqueue (provider/model/style/subject/camera/aspect), bukan cuma prompt.

## Assumptions / risks

- Carousel dihapus total di Studio (disengaja); review `ImageHistoryCarousel` tak tersentuh.
- Tanpa paginasi "muat lagi" (limit 50, di luar scope).
- `enhanceStudioPrompt` belum diuji live ke LLM (hanya unit + gate); risiko kecil karena reuse `runLLMCompletion` yang sudah teruji di review.

## Blockers / unresolved

- Tidak ada.

## Verification

- Gate: `typecheck` ✓, `lint` ✓ (0 err), `npm test` 489/489 ✓ (62 file), `next build` ✓ 61 halaman.
- Re-run `typecheck+lint` setelah stage akhir ✓.
- Diff pre-commit diinspeksi: tanpa secret (hanya kata "secret" di komentar).

## Conventional Commit

- `feat(studio): riwayat kronologis filter-sort + enhance prompt LLM` (`8adb83d`, pushed; termasuk update plan file)

## Related

- `plans/2026-09-12-studio-history-enhance-plan.md`
- Request user 12 Sep 2026 (5 poin riwayat + enhance prompt).
