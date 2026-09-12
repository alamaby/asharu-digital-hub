# Studio img2img: upload-baru selalu ditolak ownership check

- **Task:** RCA + fix error generate dengan image reference dari upload baru (laporan user + 3 screenshot): form terisi + referensi ter-upload, klik Generate → teks generik "An error occurred in the Server Components render", tanpa baris baru di DB.
- **RCA (MCP supabase-asharu-be-production):** tak ada baris baru ~10:45 UTC ⇒ gagal pre-insert di `enqueueStudioImage`. Blok ownership (`actions.ts:211`) hanya query histori (`public_url`/`reference_public_url`) — URL fresh-upload (`user-images/ref/{userId}/{refId}.ext`) belum ada di baris mana pun ⇒ `owned=null` ⇒ selalu throw. Komentar kode menjanjikan "ATAU ref/ milik sendiri" tapi cabangnya tak pernah ditulis. Hanya "Pakai ulang dari riwayat" yang lolos — menjelaskan R1 img2img tak pernah terverifikasi. Pesan asli ter-masking jadi digest generik di production build (perilaku framework).
- **Sampingan dari data yang sama:** `996dcd8c` kini `ready` (fix Flux-`Avoid:` + "Ulangi" terverifikasi live); `f10d58e2` kini gagal NSFW 8007 (filter moderasi Cloudflare terhadap prompt, bukan bug — panduan: edit prompt, "Ulangi").

## Key Files Changed

- `src/lib/studio/storage.ts` — `resolveFreshReferenceStoragePath` murni (prefix publik bucket + `ref/{userId}/`, regex ketat `UUID.(jpg|jpeg|png|webp)`, tolak traversal/ekstensi liar) + `assertFreshReferenceExists` (cek `storage.objects` service-role).
- `src/lib/studio/actions.ts` — ownership: histori-reuse dulu, else verifikasi upload-baru (derivasi path server-side, nol kepercayaan ke client; `input.referenceStoragePath` tetap didukung).
- `src/lib/studio/actions.test.ts` — mock `next/cache`; rantai mock `or`/`insert`/`single`; 2 describe baru, 6 test (murni + enqueue lolos/tolak/file-hilang/reuse).
- `plans/2026-09-12-studio-img2img-fresh-upload-fix.md` — plan + progress log.

## Technical / Business Decisions

- Derivasi server-side, BUKAN kirim `referenceStoragePath` dari form (deviasi dari plan awal — lebih aman, tanpa perubahan client).
- Anti-tempel URL asing dipertahankan: prefix check + verifikasi eksistensi file; pesan error sama.
- PostgREST `or=` aman: refId UUID server-generated tanpa koma/kurung.
- TIDAK ubah masking error prod & state machine worker (di luar scope).

## Assumptions / Risks

- Format `getPublicUrl` supabase-js stabil (`.../storage/v1/object/public/{bucket}/{path}`); trailing slash env di-strip.
- `storage.objects` readable service-role — konsisten dengan file ini.

## Verification

- `npm run typecheck` hijau; `npm run lint` hijau; `npm test` 525 tests hijau (63 file; actions.test 11 tests).
- Test sempat menangkap typo konstanta + mock aspek tanpa `is_active` sebelum fix.
- [USER ACTION] Setelah deploy: ulangi generate img2img yang sama dari upload baru ⇒ baris `pending` harus langsung tampil (fix refresh kemarin) lalu `ready`.

## Commit

- `fix(studio): izinkan referensi upload-baru milik sendiri di ownership check` (`c8b156a`, pushed origin/main, 4 files +226/-7).
