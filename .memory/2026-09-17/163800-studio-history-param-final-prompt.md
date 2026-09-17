# Studio riwayat: parameter enqueue + prompt final terkirim

- **Task:** setiap record Riwayat Generate (`/studio`) menampilkan Preset style, Template subjek, Camera angle, Aspek rasio (nama tampilan, bukan slug), plus full teks prompt + negative yang benar-benar dikirim ke model. Keduanya hide-by-default di `<details>`, dengan 2 tombol salin (input + final).
- **Keputusan user (terkunci):** (1) snapshot DB setuju — tambah `final_prompt`/`final_negative`; (2) layout hide-by-default; (3) 2 tombol salin.
- **File diubah:**
  - `supabase/migrations/20260918000004_studio_final_prompt.sql` (baru, aditif, CHECK 4000/1000, tanpa ubah RLS) — submodule commit `c9b6de2`, pushed.
  - `src/lib/studio/types.ts` — 2 field nullable di `StudioGenerationRow`.
  - `src/lib/studio/worker.ts` — `failStudioImage` terima snapshot opsional; `processOneStudioImage` simpan `composed`/`finalNegative` di jalur `ready` + semua jalur `failed` (referensi gagal, provider gagal, upload gagal, catch-all).
  - `src/components/studio/StudioHistory.tsx` — `<details> paramDetails` (4 baris `<dl>` via `paramLabels()`, fallback slug+`(nonaktif)`/Auto) + seksi prompt/negative final + `copyFinalPrompt()` + fallback pending/legacy.
  - `src/messages/id.json`, `src/messages/en.json` — 13 key baru namespace `studio.history`.
  - `src/components/studio/StudioUi.test.tsx` — helper `genRow` + 3 test baru (details 4 atribut + 2 tombol, pending fallback, legacy fallback).
  - `src/lib/studio/worker.test.ts` — 2 test baru (snapshot di ready + failed).
- **Asumsi/risiko:** katalog bisa berubah pasca-generate → snapshot, bukan live-resolve (duplikasi data diterima demi audit). Backfill tidak dilakukan (risiko sejarah palsu). Record lama `final_prompt=NULL` → fallback eksplisit.
- **Blocker:** migrasi BELUM di-apply ke prod (butuh MCP apply setelah deploy kode, atau via Dashboard).
- **Verifikasi:** `npm run typecheck` hijau, `npm run lint` hijau, `npm test` 772/772 hijau (89 files), `npm run build` hijau (74 halaman, warning metadataBase pre-existing).
- **Commit:** parent `20b939a` `feat(studio): info parameter dan prompt final di riwayat generate` (pushed origin/main, 8 files +221/-7).
- **USER ACTION:** (1) apply migrasi `20260918000004` ke prod; (2) deploy Vercel; (3) verifikasi live: expand "Parameter & prompt terkirim" di 1 record ready baru (final terisi), 1 pending (fallback worker), 1 lama (fallback legacy); (4) uji 2 tombol salin.
