# Studio img2img: cek Storage via `storage.exists()` (fix PGRST schema)

- **Task:** Lanjutan RCA img2img — fix `c8b156a` ternyata masih gagal (laporan user "masih belum bisa"). Ditemukan akar sebenarnya via probe REST langsung ke project prod.
- **RCA (dibuktikan):** `assertFreshReferenceExists` memakai `supabase.from('storage.objects')`. Schema `storage` tidak diekspos PostgREST:
  - `GET /rest/v1/storage.objects` → **404 PGRST205** `Could not find the table 'public.storage.objects'`
  - `GET /rest/v1/objects` + `Accept-Profile: storage` → **406 PGRST106** `Only the following schemas are exposed: public, graphql_public`
  Jadi query selalu error → `data=null` → throw → enqueue gagal pre-insert (dikonfirmasi: 0 baris baru di DB).
- **Bonus terverifikasi:** `996dcd8c` kini `ready` (fix Flux-`Avoid:` bekerja); `f10d58e2` gagal `NSFW 8007` (moderasi Cloudflare terhadap prompt, bukan bug).

## Key Files Changed

- `src/lib/studio/storage.ts` — `assertFreshReferenceExists` → `supabase.storage.from(STUDIO_IMAGES_BUCKET).exists(path)`; best-effort (error transient → lanjut, `false` → tolak). Komentar mencatat jebakan PGRST.
- `src/lib/studio/actions.test.ts` — mock `client.storage.from().exists()` (Set path) ganti mock tabel `storage.objects`; +1 test error transient best-effort.
- `plans/2026-09-13-studio-img2img-storage-exists-fix.md` — plan + progress log.

## Technical / Business Decisions

- `exists()` (HEAD request) best-effort, bukan strict: prefix `ref/{userId}/` + regex URL sudah jadi batas keamanan, jangan blokir enqueue karena gangguan infra Storage.
- Alasan test lama lolos: mock membuat tabel `storage.objects` palsu → tidak merepresentasikan PostgREST nyata. Kini mock memakai API Storage asli.
- Pesan error asli masih ter-masking digest di production (perilaku framework) — di luar scope.

## Assumptions / Risks

- `exists()` v2.114: 400/404 → `{data:false}`, error lain throw → ditangkap `catch` → lanjut.

## Verification

- `npm run typecheck` hijau; `npm run lint` hijau; `npm test` 526 tests hijau (63 file; actions.test 12 tests).
- Verifikasi REST read-only prod: file ada → HEAD 200, hilang → 400; `or=` filter URL → 200.
- [USER ACTION] Setelah deploy: ulangi generate img2img dari upload baru ⇒ baris `pending` muncul lalu `ready`.

## Commit

- `fix(studio): cek file referensi via storage.exists bukan storage.objects` (`c2f7bad`, pushed origin/main, 3 files +85/-18).
