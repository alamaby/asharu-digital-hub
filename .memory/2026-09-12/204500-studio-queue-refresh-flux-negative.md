# Studio antrean refresh + fix Flux negative_prompt + retry key transient

- **Task:** (1) Setelah enqueue sukses, list riwayat Studio langsung me-refresh agar record `pending` tampil (sebelumnya tak muncul sampai reload/ubah filter — polling pun tak jalan karena `pendingImages.length===0`). (2) Perbaiki akar 2 generate gagal terakhir prod: `996dcd8c` (Cloudflare 400 — Flux menolak field `negative_prompt`) dan `f10d58e2` (`fetchOrderedImageKeys: Gateway Timeout` langsung fail). Scope opsi (d): A + B + C1 + C2.
- **Analisa prod (MCP supabase-asharu-be-production):** 9 record `user_image_generations`; 2 gagal terakhir di atas, 2 `ready` cloudflare (negative efektif kosong), 3 `ready` pixazo. Cron `asharu-studio-worker` sehat (*/5, succeeded); file sukses ada di bucket `user-images` (public); CSP `img-src` sudah izinkan host Supabase — masalah murni level job, bukan infra render.
- **RCA #1 Flux:** skema `flux-1-schnell` resmi hanya `prompt|steps|seed` (terverifikasi docs Cloudflare; SDXL/SD1.5-img2img memang dukung `negative_prompt`) — regresi commit `2ffc3d4` yang mengirim field ke semua model + test lama mengabadikan bug (mock fetch). Style manga/pencil ikut memicu karena style-negative ter-merge di worker (kasus `046327de`: row-negative null tapi tetap 400).
- **RCA #2 timeout:** transient PostgREST; desain "gagal jujur" langsung `failed` (attempts=1), sembuh via "Ulangi" manual.

## Key Files Changed

- `src/lib/image/providers/cloudflare.ts` — cabang text-to-image: Flux tanpa field `negative_prompt` (negative dilipat `Avoid:` + clamp 2048, konsisten gemini/bynara/pollinations); model SD tetap `negative_prompt` native; model SD tanpa referensi `steps` → `num_steps`.
- `src/lib/image/key-pool.ts` — `fetchOrderedImageKeys` retry 1x (500ms) khusus error transient (timeout/gateway/network/5xx); klasifikasi tangani objek error PostgREST `{message}` (bukan cuma `Error`) — bug klasifikasi ini tertangkap test sebelum fix.
- `src/components/studio/StudioForm.tsx` — prop `onEnqueued?: () => void`, dipanggil setelah `enqueueStudioImage` sukses (path error tidak).
- `src/components/studio/StudioPageClient.tsx` — state `historyRefreshKey` + `router.refresh()` (badge kuota) di `handleEnqueued`, diteruskan ke form & history.
- `src/components/studio/StudioHistory.tsx` — prop `refreshKey`, effect sekali-per-perubahan panggil `refresh()` existing (filter dihormati; polling 10-detik otomatis aktif setelah baris pending masuk).
- `src/lib/image/providers.test.ts` — test Flux lama (assert field `negative_prompt`) diganti: Avoid-fold + tanpa-field + tanpa-negative; tambah test SDXL `negative_prompt` + `num_steps` tanpa `steps`.
- `src/lib/image/key-pool.test.ts` (baru) — sukses langsung, Gateway Timeout→retry sukses, error non-transient tanpa retry, transient ganda→throw.
- `src/components/studio/StudioUi.test.tsx` — submit sukses panggil `onEnqueued` 1x; `refreshKey`→`listUserImages`→baris pending tampil.
- `vitest.setup.tsx` — mock router tambah `refresh` (dipakai `StudioPageClient`).
- `plans/2026-09-12-studio-queue-refresh-and-flux-negative-fix.md` — plan + progress log.

## Technical / Business Decisions

- Refresh eksplisit via server action (`listUserImages`) ala pola retry/filter, bukan prop-sync dari RSC — agar filter aktif user tidak tertimpa full-list.
- Flux negative → klausa `Avoid:` (bukan drop-silent): keputusan user; konsisten 3 adapter lain; worst-case filler prompt (Flux tanpa CFG-negative).
- Retry key-fetch dibatasi error transient + tepat 1x: menutup kelas error record `f10d58e2` tanpa ubah state machine failed→pending otomatis (sengaja ditolak: menunda honest-failure ±15 menit).
- SD text-mode `steps`→`num_steps` preventif (belum ada bukti failure prod; waterfall tak pernah pilih SD tanpa referensi) — 2 baris + 1 test, diterima sebagai hardening sekelas.

## Assumptions / Risks

- Klausa `Avoid:` sinyal lemah untuk Flux — verifikasi nyata via tombol "Ulangi" pasca-deploy (disetujui user).
- `Gateway Timeout` tak terreproduksi E2E; klasifikasi diuji via mock.
- Polling 10-detik tetap satu-satunya live-update (tanpa Realtime) — tak diubah.
- Quota badge ikut segar via `router.refresh()` (+1 roundtrip RSC per enqueue).

## Verification

- `npm run typecheck` hijau; `npm run lint` hijau; `npm test` 515 tests hijau (63 file) — rerun penuh setelah edit plan (aturan repo: tiap edit pasca-gate membatalkan gate).
- Test baru menangkap 2 bug nyata sebelum fix: (1) mock key-pool membuktikan klasifikasi transient gagal untuk error PostgREST non-`Error`; (2) test UI `rerender` butuh provider i18n eksplisit.

## Unresolved / Follow-up

- [USER ACTION] Setelah Vercel deploy commit `4a522ab`: di Studio klik "Ulangi" pada record `996dcd8c` (user-negative) dan `f10d58e2` (timeout) → keduanya harus `ready`. Untuk `996dcd8c`, prompt terkirim sebagai `... Avoid: text, watermark, ...`.
- R1 img2img lama tetap berlaku: verifikasi live format respons REST SD (JSON vs biner) saat generate ber-referensi pertama.

## Commit

- `fix(studio): refresh antrean setelah enqueue + Flux negative jadi Avoid + retry key transient` (`4a522ab`, pushed origin/main, 10 files +300/-26).
