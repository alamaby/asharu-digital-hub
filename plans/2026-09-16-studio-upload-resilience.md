# Studio Upload Resilience — Retry Storage + Pisahkan Fase Upload

Created: 2026-09-16 12:35:00

## Objective
Memperkuat worker Studio terhadap kegagalan transient saat upload hasil generate ke
Supabase Storage (kasus `c19c8d2f-faa8-4885-9df1-d7fa2f536b84`: Storage membalas HTTP 520,
generate Pixazo sebenarnya sukses) — dengan retry berjenjang, pemisahan fase upload dari
loop provider, dan pesan error yang diagnostik.

## Scope
- `src/lib/studio/storage.ts` — helper transient/diagnostic + `uploadUserImageWithRetry`
- `src/lib/studio/worker.ts` — pisahkan fase upload dari loop provider
- `src/lib/studio/storage.test.ts` — test baru
- `src/lib/studio/worker.test.ts` — update mock + test no-fallback-on-upload-fail

## Milestones
1. Helper di storage.ts (klasifikasi transient, deskripsi error, retry).
2. Worker: fase generate vs fase upload dipisah (upload gagal → failed jujur, bukan fallback).
3. Test + gate hijau + commit/push.

## Tasks
- [x] A. `storage.ts`: `StudioStorageError`, `isTransientStorageError`, `describeStorageError`, `uploadUserImageWithRetry` (2 retry, backoff 400ms/1200ms, hanya transient); `uploadUserImage` simpan `originalError` + pesan diagnostik.
- [x] B. `worker.ts`: pindahkan upload keluar dari `try` provider (fase 1 generate → `generated`, fase 2 upload); error Storage → `failStudioImage` + return (TIDAK `continue` ke provider berikutnya).
- [x] C. `storage.test.ts` baru: klasifikasi 520/500/429/408 transient vs 400/403 permanen, deskripsi `<none>` + status, retry sukses pada percobaan ke-3, menyerah pada error permanen tanpa retry.
- [x] D. `worker.test.ts`: mock `uploadUserImageWithRetry` + `StudioStorageError`; test Auto upload gagal → failed jujur & provider kedua tidak dipanggil.
- [x] E. Gate `npm run typecheck` + `npm run lint` + `npm test` — 692/692 hijau (81 file).

## Risks
- Retry menambah latensi maksimum ~1.6s per gambar gagal (masih jauh di bawah `maxDuration` 300s).
- Retry tidak menolong bila gangguan Storage sistematis; dalam kasus itu tetap `failed` jujur (bukan infinite retry).
- Item 4 (transient → `pending` auto-retry lintas cron) SENGAJA tidak diimplementasi: `claimPendingStudioImage` memakai `attempts < 3`; bila gagal terus, baris akan nyangkut `pending` selamanya tanpa terlihat. Butuh kolom/guard tambahan → di luar scope patch ini.
- Item 5 (`continue` alih-alih `break` di route cron) juga ditunda: perubahan perilaku antrean, bukan akar masalah.

## Progress Log
- 2026-09-16 12:35:00 — Plan dibuat setelah RCA `c19c8d2f`: edge_logs menunjukkan `POST /storage/v1/object/user-images/.../c19c8d2f-....png` → **520**; `storage.objects` tak punya baris itu; `net._http_response` cron mencatat `studio storage upload failed: <none>`.
- 2026-09-16 12:50:00 — Implementasi A–D selesai. Gate hijau: typecheck OK, lint OK, 692/692 test lulus (81 file, +11 test).

## Notes
- Tanpa migrasi DB.
- Proposal commit: `fix(studio): retry upload storage dan pisahkan fase upload dari waterfall provider`.
- Tindak lanjut yang SENGAJA ditunda (butuh keputusan terpisah): auto-retry lintas cron untuk error transient (butuh guard `attempts` agar tak nyangkut `pending`) dan `continue` alih-alih `break` di route cron.
