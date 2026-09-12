# Studio img2img: upload-baru selalu ditolak ownership check

Created: 2026-09-12 22:15:00

## Objective

Perbaiki generate image dengan image reference (img2img) dari **upload baru** yang selalu gagal: `enqueueStudioImage` melempar `Referensi harus dari upload atau histori milik Anda.` karena URL fresh-upload tak pernah cocok dengan query histori. Di production error ter-masking jadi teks generik "An error occurred in the Server Components render".

## Scope

- `src/lib/studio/storage.ts` — helper murni `resolveFreshReferenceStoragePath` (prefix `ref/{userId}/` + regex nama file) + `assertFreshReferenceExists` (cek `storage.objects` via service-role).
- `src/lib/studio/actions.ts` — blok ownership: histori-reuse dulu, else verifikasi upload-baru (derivasi path server-side, nol kepercayaan ke client).
- `src/lib/studio/actions.test.ts` — mock `next/cache`; rantai `or`/`insert`/`single`; 2 describe baru (6 test).
- Tanpa migrasi DB. Tanpa perubahan client (`StudioForm` tak perlu kirim `referenceStoragePath` — deviasi dari plan awal yang lebih baik).

## Milestones

1. Helper + ownership fallback + test hijau
2. Gate penuh → commit → push → memory

## Tasks

- [x] Helper `resolveFreshReferenceStoragePath` + `assertFreshReferenceExists`
- [x] Ownership fallback di `enqueueStudioImage`
- [x] 6 test baru (murni + enqueue: lolos/tolak/reuse)
- [x] Gate: typecheck + lint + 525 tests hijau
- [ ] Commit + push origin/main
- [ ] Entri `.memory/` + update `.memory/README.md`

## Risks

- `storage.objects` dibaca via service-role (RLS dilewati) — konsisten dengan seluruh file ini; hanya `select name` + eq bucket/name.
- PostgREST `or=` dengan URL: aman karena refId UUID server-generated (tanpa koma/kurung).

## Progress Log

- 2026-09-12 22:15:00 — RCA dari screenshot + DB prod (tanpa baris baru = gagal pre-insert) + baca kode. Eksekusi langsung (build mode).

## Notes

- RCA: komentar kode menjanjikan "ATAU ref/ milik sendiri" tapi tak ada cabang kodenya — hanya query histori. Upload baru ⇒ `owned=null` ⇒ selalu throw.
- Sampingan: `996dcd8c` kini `ready` (fix Avoid terverifikasi live); `f10d58e2` kini gagal NSFW 8007 (filter moderasi Cloudflare, bukan bug — panduan: edit prompt, "Ulangi").
- Sengaja TIDAK ubah masking error prod (perilaku framework) dan state machine worker.
