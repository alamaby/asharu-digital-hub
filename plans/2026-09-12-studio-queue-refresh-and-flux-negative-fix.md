# Studio: refresh antrean setelah enqueue + fix Flux negative_prompt

Created: 2026-09-12 15:30:00

## Objective

1. Setelah user berhasil mendaftarkan generate image di Studio, list riwayat langsung me-refresh sehingga record `pending` (menunggu worker) tampil — hari ini tidak muncul sampai reload/ubah filter manual.
2. Perbaiki akar kegagalan 2 generate terakhir (`996dcd8c`, `f10d58e2`): adapter Cloudflare mengirim `negative_prompt` ke model Flux yang menolaknya (HTTP 400 deterministik), dan query key Supabase yang timeout langsung menggagalkan job tanpa retry.

## Scope

- `src/components/studio/StudioForm.tsx` — prop `onEnqueued`, dipanggil setelah `enqueueStudioImage` sukses.
- `src/components/studio/StudioPageClient.tsx` — token `historyRefreshKey` + `router.refresh()` (kuota) diteruskan ke form & history.
- `src/components/studio/StudioHistory.tsx` — prop `refreshKey`, effect sekali-per-perubahan memanggil `refresh()` yang sudah ada (filter user dihormati; polling otomatis jalan setelah baris pending muncul).
- `src/lib/image/providers/cloudflare.ts` — Flux: `negative_prompt` dilipat jadi klausa `Avoid:` di prompt (clamp 2048); model SD: tetap field `negative_prompt` native; model SD tanpa referensi: `steps` → `num_steps`.
- `src/lib/image/key-pool.ts` — `fetchOrderedImageKeys` retry 1x (jeda 500ms) untuk error transient saja.
- Test: `providers.test.ts`, `StudioUi.test.tsx`, (+ `key-pool.test.ts` bila belum ada).
- Tanpa migrasi DB (pure code). Verifikasi live: tombol "Ulangi" pada 2 record failed setelah deploy (disetujui user).

## Milestones

1. Workstream B+C1: fix adapter Cloudflare + test hijau
2. Workstream C2: retry key-fetch + test hijau
3. Workstream A: refresh list + test hijau
4. Gate penuh → commit → push → memory

## Tasks

- [x] Workstream B: Flux `negative_prompt` → `Avoid:`, SD tetap native, SD text-mode `num_steps`
- [x] Workstream C1: (tergabung di B) test SDXL kirim `negative_prompt` + `num_steps`
- [x] Workstream C2: retry 1x `fetchOrderedImageKeys` untuk error transient + test
- [x] Workstream A: `onEnqueued` → `historyRefreshKey` → `refresh()` + `router.refresh()` kuota
- [x] Test UI: submit sukses panggil `onEnqueued`; `refreshKey` memicu `listUserImages` + baris pending tampil
- [x] Gate: `npm run typecheck`, `npm run lint`, `npm test` hijau
- [ ] Commit (Conventional Commits, 1 baris) + push origin/main
- [ ] Entri `.memory/` + update `.memory/README.md`
- [ ] Panduan verifikasi live via tombol "Ulangi" (user action)

## Risks

- Klausa `Avoid:` adalah sinyal lemah untuk Flux (arsitektur tanpa CFG-negative), tapi konsisten dengan 3 adapter lain dan worst-case hanya filler prompt — alternatif drop-silent ditolak user.
- Sync angka kuota via `router.refresh()` menambah 1 roundtrip RSC per enqueue; diterima demi badge kuota akurat.
- Error `Gateway Timeout` tak bisa direproduksi di test E2E; klasifikasi transient diuji via mock.
- Polling 10-detik tetap satu-satunya mekanisme live-update (tanpa Realtime) — tidak diubah dalam scope ini.

## Progress Log

- 2026-09-12 15:30:00 — Plan dibuat dari fase plan-mode; investigasi baca-saja selesai (DB prod via MCP, docs Cloudflare, git history). Menunggu eksekusi workstream B → C2 → A.
- 2026-09-12 20:45:00 — Eksekusi selesai: B (Flux Avoid + SD num_steps), C2 (retry key 1x), A (onEnqueued→refreshKey→refresh + router.refresh kuota). Gate hijau: typecheck + lint + 515 tests/63 files. Siap commit.

## Notes

- RCA record `996dcd8c`: `cloudflare image 400 … Additional or unevaluated properties '/negative_prompt'` — Flux schema hanya `prompt|steps|seed` (terverifikasi docs resmi); regresi dari commit `2ffc3d4`; test lama justru mengabadikan bug (mock fetch). Style manga/pencil ikut memicu karena style-negative ter-merge di worker.
- RCA record `f10d58e2`: `fetchOrderedImageKeys: Gateway Timeout` — transient Supabase; desain "gagal jujur" langsung `failed` (attempts=1), sembuh via retry manual.
- Sengaja TIDAK mengubah state machine failed→pending otomatis: menunda honest-failure error konten ±15 menit (3 tick) — ditolak sebagai trade-off.
- Cron `asharu-studio-worker` sehat (*/5, succeeded); bucket `user-images` public + file sukses ada; CSP `img-src` sudah mengizinkan host Supabase.
