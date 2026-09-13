# Studio img2img: ganti cek Storage ke `storage.exists()` (fix PGRST schema)

Created: 2026-09-13 01:35:00

## Objective

Perbaiki fix `c8b156a` yang masih gagal: `assertFreshReferenceExists` memakai `supabase.from('storage.objects')`, padahal schema `storage` **tidak diekspos** ke PostgREST → query selalu error → `data=null` → upload-baru selalu ditolak ("Referensi harus dari upload atau histori milik Anda").

## Scope

- `src/lib/studio/storage.ts` — `assertFreshReferenceExists` pakai Storage API `supabase.storage.from(bucket).exists(path)` (best-effort: error transient → lanjut; `false` → tolak).
- `src/lib/studio/actions.test.ts` — mock `storage.from().exists()` (Set path) ganti mock tabel `storage.objects`; +1 test error transient best-effort.
- Tanpa migrasi DB.

## Milestones

1. Ganti API + test hijau
2. Gate → commit → push → memory

## Tasks

- [x] `exists()` best-effort di storage.ts
- [x] Mock + test (lolos/tolak/file-hilang/reuse/transient)
- [x] Gate: typecheck + lint + 526 tests hijau
- [ ] Commit + push origin/main
- [ ] Entri `.memory/` + update README

## Risks

- `exists()` = 1 HEAD request per enqueue ber-referensi baru (murah). Error transient sengaja tidak memblokir — prefix `ref/{userId}/` + regex tetap batas keamanan.
- Pesan error asli masih ter-masking di production (framework); di luar scope.

## Progress Log

- 2026-09-13 01:35:00 — RCA dibuktikan via REST prod: `GET /rest/v1/storage.objects` → 404 PGRST205; `Accept-Profile: storage` → 406 PGRST106 ("Only the following schemas are exposed: public, graphql_public"). `exists()` terverifikasi: file ada → HEAD 200, hilang → 400.

## Notes

- RCA awal (`c8b156a`) benar soal *logika* ownership (upload-baru tak pernah dicek), tapi *implementasi* cek Storage-nya salah API. Test lama gagal menangkap karena mock membuat tabel `storage.objects` palsu.
- Bonus terverifikasi: `996dcd8c` ready (fix `Avoid:` bekerja); `f10d58e2` gagal `NSFW 8007` (moderasi Cloudflare, bukan bug).
