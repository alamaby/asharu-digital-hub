# Async Workers & Queue Progress: Explicit FSM Transitions and Guarded Claims

Date: 2026-11-18 09:42:00 WIB
Plan: [plans/2026-11-18-explicit-state-machines.md](file:///C:/Works/github.com/alamaby/asharu-digital-hub/plans/2026-11-18-explicit-state-machines.md)

## Task & Masalah
- Mengatasi status implisit pada antrean asinkron worker gambar (`user_image_generations` dan `content_draft_images`) serta antrean multi-post media sosial (`social_post_queue`) (Gelombang 2 dari plan FSM).
- Pada antrean gambar studio dan draf, status database dibatasi constraint `CHECK (status IN ('pending', ...))` di mana status `'pending'` bersifat overloaded: mencakup antrean yang baru masuk (`attempts = 0`), antrean yang sedang aktif dirender oleh GPU provider (`attempts > 0`), dan antrean yang macet akibat serverless timeout. Hal ini berisiko memicu duplicate rendering jika tick worker berjalan tumpang tindih.
- Pada antrean publikasi media sosial multi-post Threads, tidak ada status eksplisit untuk progres rantai posting (`social_post_queue` hanya `queued`, `posting`, `posted`), sehingga pemantauan proses berantai harus merekonstruksi log manual.

## Berkas Penting yang Diubah
- `src/lib/studio/types.ts`: Menambahkan tipe `StudioPhase` (`queued` | `processing` | `ready` | `failed` | `stuck`) dan pure function `resolveStudioPhase` dengan komentar alasan bisnis.
- `src/lib/studio/worker.ts`: Menambahkan optimistic concurrency locking pada `claimPendingStudioImage` dengan guard window timeout (10 menit) dan merekam jejak `claimed_at` + `phase: 'processing'` pada `llm_meta`.
- `src/lib/studio/worker.test.ts`: Menambahkan unit test untuk transisi `resolveStudioPhase`.
- `src/components/studio/StudioHistory.tsx`: Menggunakan `resolveStudioPhase` untuk menampilkan badge diskrit `processing` dengan visual animasi pulse biru dan isolasi status `queued` (amber).
- `src/lib/image/types.ts`: Menambahkan tipe `DraftImagePhase` dan fungsi `resolveDraftImagePhase`.
- `src/lib/image/worker.ts`: Guard anti-reclaim konkurensi pada `claimPendingImage` + rekam `claimed_at` & `phase: 'processing'` pada `llm_meta`.
- `src/lib/image/worker.test.ts`: Unit test untuk `resolveDraftImagePhase`.
- `src/components/content/ImageHistoryCarousel.tsx`: Menggunakan `resolveDraftImagePhase` untuk timeline dan badge visual draf cover.
- `src/lib/social/queue.ts`: Menambahkan tipe `ThreadPublishProgress` dan fungsi `getThreadQueueProgress` untuk pelacakan progres penerbitan rantai multi-post.
- `src/lib/social/queue.test.ts`: Unit test untuk `getThreadQueueProgress`.
- `plans/2026-11-18-explicit-state-machines.md`: Update task dan progress log Gelombang 2.

## Keputusan Teknis & Bisnis
- Menggunakan pendekatan non-destruktif tanpa mengubah skema CHECK constraint basis data Postgres, memanfaatkan metadata `llm_meta` dan komputasi fase domain murni (`resolveStudioPhase` & `resolveDraftImagePhase`).
- Menambahkan concurrency guard pada batch kandidat claim worker: kandidat dengan `attempts > 0` yang masih berada dalam processing timeout window (10 menit) dilewati agar tidak dieksekusi ganda oleh tick cron yang tumpang tindih (hemat kuota berbayar GPU).
- Menyediakan visibilitas progres rantai multi-post (`partially_posted`) langsung melalui helper API `getThreadQueueProgress`.

## Asumsi & Risiko
- Asumsi: Timeout maksimal render GPU provider rata-rata di bawah 3 menit (maxDuration Vercel 180s), sehingga timeout window 10 menit aman sebagai batas klaim stale.
- Risiko: Nol risiko migrasi skema karena tidak mengubah struktur DDL Postgres yang sedang aktif.

## Blocker & Open Item
- Tidak ada blocker. Gelombang 2 selesai.
- Lanjut ke Gelombang 3 (Siklus Draf Artikel vs Penerbitan Publik & Multi-Chunk Research Pipeline Tracker) sesuai kebutuhan.

## Verifikasi yang Dilakukan
- Unit tests:
  - `src/lib/studio/worker.test.ts` (12 tests passed).
  - `src/components/studio/StudioUi.test.tsx` (31 tests passed).
  - `src/lib/image/worker.test.ts` (15 tests passed).
  - `src/components/content/ImageHistoryCarousel.test.tsx` (17 tests passed).
  - `src/lib/social/queue.test.ts` (13 tests passed).
- Repo verification gates:
  - `npm run typecheck` — 0 errors (sukses).
  - `npm run lint` — 0 warnings dengan `--max-warnings=0` (sukses).
  - `npm test` — 141 test files passed, 1387 tests passed (sukses).

## Proposed Conventional Commit
`feat(workers): implement explicit fsm lifecycle phases and claim guards for image and social queues`
