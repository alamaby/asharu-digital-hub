# Studio Upload Resilience — RCA `c19c8d2f` + Patch Retry Storage

- Tanggal: 2026-09-16 13:02 (local)
- Plan: `plans/2026-09-16-studio-upload-resilience.md`
- Commit: `7788f57` — `fix(studio): retry upload storage dan pisahkan fase upload dari waterfall provider`

## Masalah
Studio generation `c19c8d2f-faa8-4885-9df1-d7fa2f536b84` berstatus `failed` dengan
`last_error = "studio storage upload failed: <none>"`.

## RCA (via MCP Supabase production, read-only)
- **Bukti kunci — `edge_logs`:** `POST https://hljjmmejmirqikmbaryl.supabase.co/storage/v1/object/user-images/d4406141-.../c19c8d2f-....png` → **HTTP 520** @ `2026-09-16T04:25:28.603Z`.
- `storage.objects` tidak punya baris `c19c8d2f...` → upload tak pernah commit.
- `storage_logs` tidak punya entri upload `user-images` → request gagal di edge/gateway, tak sampai worker Storage.
- `net._http_response` cron 04:25:00: `{"ok":true,"processed":[],"count":0,"lastError":"studio storage upload failed: <none>"}`.
- **Kesimpulan:** Pixazo (Flux 1 Schnell) sukses generate; yang gagal upload bytes ke Storage karena blip 520 transient. Baris user yang sama sukses upload ke `user-images` pukul 02:40 & 03:00; worker konten sukses upload `draft-images` 4 detik sebelumnya (04:25:24). Satu-satunya 5xx Storage di edge_logs.
- Akar literasi `<none>`: body error Storage untuk 520 tanpa pesan, diekstrak storage-js `_getErrorMessage`.

## Celah Ketahanan yang Diperbaiki
1. **Tidak ada retry upload** — satu blip 520 mematikan generate yang sudah sukses.
2. **Upload failure diperlakukan sebagai provider failure** — di dalam `try` yang `catch`-nya `continue`; pada baris non-pinned ini memicu generate ulang di provider lain (biaya + gambar berbeda) hanya karena Storage hiccup.
3. **Pesan error kehilangan status** — hanya `.message` = `<none>`.

## Perubahan Kunci
- `src/lib/studio/storage.ts`
  - `StudioStorageError` (bawa `message`, `status`, `statusCode`, `storageError`, `originalError`).
  - `isTransientStorageError` — 5xx/408/429 retry; 4xx permanen langsung lempar.
  - `describeStorageError` — sisipkan `HTTP <status>` + `code=`; buang `storage=none`.
  - `uploadUserImageWithRetry` — 2 retry (backoff 400ms/1200ms) hanya untuk transient.
  - `uploadUserImage` melempar `StudioStorageError` (bukan `new Error(message)`).
- `src/lib/studio/worker.ts` — **fase 1 generate** (loop provider → `generated`) dan **fase 2 upload** dipisah. Upload gagal → `failStudioImage` + return; TIDAK `continue` ke provider berikutnya.
- `src/lib/studio/storage.test.ts` (baru) + `worker.test.ts` — 11 test baru, termasuk kasus 520 dan no-fallback-on-upload-fail.

## Verifikasi
- `npm run typecheck` bersih; `npm run lint` bersih; `npm test` **692/692 lulus (81 file)**.

## Risiko / Tindak Lanjut Ditunda
- Retry menambah latensi maksimum ~1.6s per upload gagal (jauh di bawah `maxDuration` 300s).
- Retry tidak menolong bila gangguan Storage sistematis → tetap `failed` jujur.
- **Ditunda:** auto-retry lintas cron untuk transient (butuh guard `attempts` agar tak nyangkut `pending` tanpa terlihat) dan `continue` alih-alih `break` di `/api/studio/process`.
- **USER ACTION:** klik "Ulangi" pada baris `c19c8d2f` di riwayat Studio agar gambar diregenerasi (bytes lama tidak disimpan).
