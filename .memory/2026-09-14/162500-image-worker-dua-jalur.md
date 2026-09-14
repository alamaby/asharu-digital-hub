# Worker image 2-jalur (generate prioritas + reasoning)

- Task: Generate manual antre di belakang reasoning cover auto (kasus e5866cc7: manual #21 dari 23, worker 1 row/5 mnt FIFO).
- Key files:
  - `src/lib/image/worker.ts` — `claimPendingImage(lane)` (`generate`: prompt terisi; `reasoning`: prompt kosong) + `excludeId` anti-klaim-ganda; `processOneImage` → `processImageTick` (1 generate prioritas + 1 reasoning per tick, generate dulu); body lama diekstrak ke `processClaimedImage`.
  - `src/app/api/image/generate/route.ts` — pakai `processImageTick` (return +`processed`).
  - `src/lib/image/worker.test.ts` (baru, 5 tests, fake Supabase client).
- Decisions: prioritas generate (aksi user) dulu tiap tick; reasoning tetap jalan 1/tick agar cover auto tak starving; tanpa migrasi; maxDuration 300 cukup untuk 2 panggilan berurutan.
- Verification: typecheck ✓, lint ✓, 583 tests ✓ (68 files, incl. 5 baru), build ✓ (63 pages).
- Catatan prod: deploy dulu agar tick berikut memakai jalur baru; antrean 23 pending lama akan terkuras ~2/tick (generate+reasoning) FIFO per jalur.
