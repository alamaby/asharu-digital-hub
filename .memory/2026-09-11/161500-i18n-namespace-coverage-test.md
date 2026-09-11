# Test Cakupan Namespace i18n Client

## Task
Tambah test yang memverifikasi setiap namespace yang dipakai komponen client sudah masuk `CLIENT_MESSAGE_NAMESPACES`, agar insiden label mentah `studio.*` tidak terulang. Assert 4 (tolak argumen dinamis) disetujui user sebagai gagal, bukan dokumentasi.

## Files Changed
- `src/lib/i18n/client-messages.test.ts` — blok baru `describe('client namespace coverage')`: walk rekursif `src/` (skip `*.test.*`), deteksi client via direktif `'use client'` atau boundary file (`error|loading|not-found|global-error.tsx`), ekstrak argumen literal `useTranslations('a.b')` via regex → root `a`. 4 assert: dinamis ditolak, root client ⊆ allow-list, root ada di `id.json`, entri allow-list ada di katalog. Pesan gagal menyebut file + namespace.
- `plans/2026-09-11-studio-generate-image.md` — Tasks + Progress Log.

## Decisions / Assumptions
- Hanya file client yang dipindai: server (`getTranslations`) baca katalog penuh via `request.ts`, tidak dipangkas.
- `useFormatter`/`useMessages` tidak dipakai di repo; `useLocale` tidak butuh namespace — di luar cakupan test.
- Semua pemakaian `useTranslations` saat ini literal (terverifikasi) — Assert 4 menjaga invarian ini.
- Batasan disengaja (dicatat di komentar test): komponen server tanpa direktif yang memakai namespace non-allow-list lalu diimpor komponen client tidak tertangkap — pola itu belum pernah terjadi.

## Risks / Open
- Regex statis: bila pola pemanggilan berubah (mis. alias import), test bisa false-negative — mitigasi Assert 4 + pesan gagal eksplisit.
- Audit saat ini: semua namespace client sudah tercakup tanpa ubah allow-list — tidak ada gap lain.
- Counter-argument: mewajibkan SEMUA root (termasuk server-only `meta`/`hero`/`footer`) masuk allow-list ditolak — menggembungkan payload RSC.

## Verification
- typecheck ✓, lint ✓, test 457 passed (58 files; 4 assert baru di `client-messages.test.ts` → 9 test total file itu) ✓.
- Uji negatif: namespace fiktif `studioXXXX` di file simulasi membuat 2 assert gagal (allow-list + katalog) — file simulasi dihapus setelahnya.
- Build tidak di-run (tidak ada perubahan runtime — hanya file test + plan).

## Commit Proposal
test(i18n): verifikasi namespace client tercakup allow-list
