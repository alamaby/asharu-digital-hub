# RCA draf 2d2a5b31 "visualisasi tidak berhasil" — pending macet (attempts habis) + fix reaper/requeue/timeout

- Task: User tanya kenapa visualisasi draf `2d2a5b31-6793-49f3-8463-b6d479224418` (artikel, "Wallpaper Dinding Estetik") tidak berhasil. Investigasi via MCP `supabase-asharu-be-production`.
- **RCA (root cause berlapis):**
  1. Baris cover `content_draft_images.546a8a47` macet `status='pending'` + `attempts=3` + `last_error=NULL`, `provider_slug`/`model_id` kosong.
  2. Worker claim mensyaratkan `.lt('attempts', MAX_ATTEMPTS=3)` → baris exhausted **tak akan pernah diklaim lagi** (dead end), dan karena status bukan `failed`, UI tak menampilkan tombol Ulangi (`retryFailedImage` juga menolak non-failed).
  3. Penyebab attempts habis: tick `/api/image/generate` (maxDuration 300s) mengklaim row lalu memanggil waterfall LLM `image_prompt`. Provider terdepan **naraya/agnes-2.5-flash** menggantung: `llm_call_logs` 25 Sep 09:46–10:13 UTC menunjukkan 3× empty response (138s/161s/300s) + 520/525 + "terminated". Fallback cloudflare/gemma-sea-lion sehat (3–20s). Invocation Vercel dibunuh di tengah → row tetap pending, attempts naik, tanpa error tersimpan (3 tick ≈ 10:06/10:10/10:15 UTC).
  4. Efek lanjutan: automation run `3189f7c5` (slot sore) `failed` "cover melewati batas waktu" (60 menit) karena `ensureCover` hanya me-requeue status `failed`; pending macet dianggap "masih diproses".
- **Fix A (data recovery, prod via MCP):** `attempts=0, last_error=null` untuk row `546a8a47`. Terverifikasi: worker memprosesnya → `selected`, pixazo/flux-1-schnell 1024×1024, `public_url` Storage; draf → `approved` + `selected_image_id` terisi; run `3189f7c5` pulih → `published` (artikel `9570ef9c` live dengan cover).
- **Fix B (guard code):**
  - `src/lib/image/types.ts` — `IMAGE_MAX_ATTEMPTS=3`, `IMAGE_STUCK_MINUTES=10`, `isExhaustedPending(status, attempts)` (shared server+client).
  - `src/lib/image/worker.ts` — `reapStuckImages()`: pending + attempts ≥ max + `updated_at` lebih tua dari 10 menit → `failed` + pesan "worker tick timeout/terputus — attempts habis"; dipanggil di awal `processImageTick()`. Guard 10 menit agar tick yang sedang jalan tidak ditandai.
  - `src/lib/image/actions.ts` — `retryFailedImage` menerima `failed` DAN pending-exhausted (`.in('status', ['failed','pending'])`).
  - `src/components/content/ImageHistoryCarousel.tsx` — badge "Macet" + placeholder & timeline khusus + tombol **Ulangi** untuk pending-exhausted (sebelumnya hanya `failed`).
  - `src/lib/automation/runner.ts` `ensureCover` — cabang pending-exhausted: requeue (`attempts:0`) + `cover_attempts+1` selama budget `coverMaxAttempts`, else `failCover` jujur → automation tidak lagi menunggu 60 menit sia-sia.
- **Fix C (mitigasi akar masalah):**
  - Pin `llm_stage_defaults.image_prompt` → provider cloudflare / `@cf/aisingapore/gemma-sea-lion-v4-27b-it` (applied prod via MCP; soft waterfall tetap jalan bila pin gagal).
  - `src/lib/llm/fetch-timeout.ts` (baru) — `fetchWithTimeout` + `LLM_CALL_TIMEOUT_MS=90_000`, dipakai `providers/openai-compatible.ts`, `cloudflare.ts`, `gemini.ts` agar 1 provider lambat gagal cepat & waterfall lanjut (bukan menghabiskan budget 300s tick).
- Key files: (lihat daftar di atas) + tests: `worker.test.ts` (3 test reaper), `runner.test.ts` (3 test ensureCover pending-exhausted), `fetch-timeout.test.ts` (4 test).
- Verification: typecheck ✓, lint ✓ (0 error), **118 file / 1165 tests ✓**, prod terverifikasi end-to-end (cover render → artikel published).
- Catatan: `retryFailedImage` tetap tidak menyentuh pending yang masih claimable; guard 10 menit di reaper penting agar tidak bentrok dengan tick lain.
- [USER ACTION] Deploy Vercel agar reaper + tombol Ulangi + timeout aktif di prod.
