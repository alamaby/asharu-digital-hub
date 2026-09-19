# Lihat Riset Langsung ke Detail Admin

Created: 2026-09-14 20:30:00

## Objective

Keluhan user: setelah submit riset berhasil, panel "Riset berhasil dimulai" punya tombol "Lihat riset" yang mengarah ke `/konten/riset/[sessionId]`. Halaman itu minimalis — hanya judul + `Status: pending` + link kecil "Lihat detail admin →". User harus klik 2x untuk sampai ke detail lengkap di `/admin/riset/[sessionId]`.

Keputusan user (via Q&A): **opsi A — "Langsung ke detail admin"**. Untuk admin, tombol sukses harus langsung link ke `/admin/riset/[sessionId]`. Non-admin tetap ke `/konten/riset/[sessionId]` (karena `/admin/*` me-redirect non-admin ke `/masuk`).

Hasil akhir yang diharapkan: 1 klik dari panel sukses → detail lengkap (stepper, topik, draf, log, metrik) untuk admin.

## Scope

- In:
  - `src/components/content/ContentRequestForm.tsx` blok sukses (baris ~268-283).
  - `src/components/content/ContentRequestForm.test.tsx` tambah test cabang admin vs non-admin.
  - Cek paritas `src/messages/id.json` + `src/messages/en.json` (reuse key `successViewList`, tidak tambah key baru kecuali diminta).
- Out (jangan dikerjakan):
  - Perubahan `src/app/[locale]/(admin)/konten/riset/[sessionId]/page.tsx`.
  - Perubahan `src/middleware.ts`, `src/i18n/routing.ts`.
  - Perubahan pipeline riset / server action `createResearchSession`.
  - Auto-redirect di halaman status (follow-up opsional, lihat Notes).

## Milestones

1. Fix link sukses bercabang admin/non-admin.
2. Test unit kedua cabang hijau.
3. Gate hijau (`typecheck` + `lint` + `test`).

## Tasks

- [ ] T1 — Edit `src/components/content/ContentRequestForm.tsx` blok sukses.
  - Lokasi tepat:
    ```tsx
    // src/components/content/ContentRequestForm.tsx:268-283 (saat ini)
    <div className="mt-5 flex flex-wrap gap-2">
      {sessionId ? (
        <Link
          href={{ pathname: '/konten/riset/[sessionId]', params: { sessionId } }}
          className="btn-primary px-4 py-2 text-sm"
        >
          {t('successViewList')}
        </Link>
      ) : (
        <Link
          href={{ pathname: '/admin/riset' }}
          className="btn-primary px-4 py-2 text-sm"
        >
          {t('successViewList')}
        </Link>
      )}
    ```
  - Konteks penting: komponen sudah menerima prop `isAdmin` (baris 19, 22) dan page `src/app/[locale]/(admin)/konten/baru/page.tsx:97,128` sudah mengisi `isAdmin={isAdminUser}` via `await isAdmin()`. Tidak perlu fetch auth baru.
  - Ganti menjadi:
    ```tsx
    <div className="mt-5 flex flex-wrap gap-2">
      {sessionId ? (
        <Link
          href={
            isAdmin
              ? { pathname: '/admin/riset/[sessionId]', params: { sessionId } }
              : { pathname: '/konten/riset/[sessionId]', params: { sessionId } }
          }
          className="btn-primary px-4 py-2 text-sm"
        >
          {t('successViewList')}
        </Link>
      ) : (
        <Link
          href={{ pathname: '/admin/riset' }}
          className="btn-primary px-4 py-2 text-sm"
        >
          {t('successViewList')}
        </Link>
      )}
    ```
  - Aturan:
    - Jangan ubah label (`t('successViewList')` dipakai ulang, id: "Lihat riset", en: "View research").
    - Jangan ubah fallback tanpa `sessionId`.
    - Jangan ubah styling/class.
    - Pathname harus persis `/admin/riset/[sessionId]` (sudah terdaftar di `src/i18n/routing.ts:81-84`, jadi `Link` i18n akan melokalkan otomatis ke `/id/admin/riset/...` atau `/en/admin/research/...`).
- [ ] T2 — Verifikasi tidak ada caller lain.
  - Jalankan grep `ContentRequestForm` di `src/`. Harapan: hanya `src/app/[locale]/(admin)/konten/baru/page.tsx` yang me-render. Jika ada caller baru, pastikan mereka juga mengoper `isAdmin` dengan benar.
- [ ] T3 — Tambah test di `src/components/content/ContentRequestForm.test.tsx`.
  - Kondisi awal file: hanya test render form (required fields, checkbox, mechanism, template). Belum ada test state sukses.
  - Server action yang dipakai form: `createResearchSession(formData)` dari `@/lib/content/actions` (return `{ success, sessionId?, error?, fieldErrors? }`, lihat `src/lib/content/actions.ts:26-31,164`).
  - Cara termudah yang stabil: mock modul `@/lib/content/actions` dengan `vi.mock` agar `createResearchSession` return `{ success: true, sessionId: 'sess-123' }`, lalu isi field wajib minimal dan submit form via `fireEvent`/`userEvent`, tunggu panel sukses muncul (`successTitle`), lalu assert `href` link "Lihat riset".
  - Field wajib minimal untuk lolos validasi client: `topic`, minimal 1 platform (default sudah all-checked), `audience`, `purpose` (lihat `handleSubmit` + `processForm` di `ContentRequestForm.tsx:167-246`). Jika submit via UI terlalu rapuh, alternatif yang diterima: refactor minimal agar blok sukses bisa diuji (mis. export komponen `ResearchSuccessPanel` murni dengan props `{ sessionId, isAdmin }`), lalu test panel itu langsung. Pilih salah satu, jangan keduanya.
  - Test yang wajib ada:
    1. `isAdmin={true}` + `sessionId='sess-123'` → link "Lihat riset" punya `href` mengandung `/admin/riset/sess-123` (atau `/admin/research/sess-123` bila locale en — test memakai `renderWithMessages` locale `id` dari `src/test/utils.tsx:7-13`, jadi harapkan `/id/admin/riset/sess-123` atau substring `/admin/riset/sess-123`).
    2. `isAdmin={false}` (atau omit → default false) + `sessionId='sess-123'` → link mengandung `/konten/riset/sess-123`.
  - Assert via `screen.getByRole('link', { name: /Lihat riset/ })` lalu `getAttribute('href')`.
  - Jangan merusak 5 test existing.
- [ ] T4 — Gate sebelum commit.
  - `npm run typecheck`
  - `npm run lint`
  - `npm test` (atau minimal `npx vitest run src/components/content/ContentRequestForm.test.tsx` dulu, lalu full `npm test` sebelum commit).
  - Semua harus hijau. Jika edit setelah gate hijau (sekecil apa pun), re-run `typecheck` + `lint` (aturan repo: fix kecil pernah mematahkan build Vercel).
  - Jangan commit `.env*`, key `sb_secret_*`/`sb_publishable_*`, `CRON_SECRET`.

## Risks

- Risk 1 — Cabang terbalik mengirim non-admin ke `/admin/*` → mental ke `/masuk` (guard di `src/middleware.ts:174-189` + `admin/riset/[sessionId]/page.tsx:73-75`). Mitigasi: test kedua cabang (T3) + manual cek satu sesi sebagai admin.
- Risk 2 — `Link` i18n dengan object `pathname` + `params` salah eja → 404 atau unlocalized URL. Mitigasi: pakai string pathname persis dari `routing.ts` (`/admin/riset/[sessionId]`, `/konten/riset/[sessionId]`), jangan hardcode `/id/...`.
- Risk 3 — Test submit form rapuh karena validasi/async. Mitigasi: boleh extract panel sukses murni agar test deterministik (lihat T3 alternatif). Jangan mock `next-intl` — pakai `renderWithMessages` yang sudah ada.
- Risk 4 — Label "Lihat riset" tetap dipakai untuk target detail admin, sedikit ambigu. Diterima (keputusan: reuse key, tanpa key i18n baru). Jangan tambah key `successViewDetail` kecuali user meminta.

## Progress Log

- 2026-09-14 20:30:00 — Plan dibuat dari investigasi read-only. Pilihan user: langsung ke detail admin. Belum diimplementasi; menunggu small model eksekusi T1-T4.

## Notes

- Fakta pendukung (jangan diubah dalam plan ini):
  - `src/middleware.ts:36-40` menaruh `/konten/riset` di `ADMIN_INTERNAL_PATHS` (prefix-match), jadi `/konten/riset/[sessionId]` saat ini pun admin-only. Transit 2-klik murni friksi.
  - Halaman status (`konten/riset/[sessionId]/page.tsx:32-36,58-82`) hanya select `id, status, topic, error_message` + 20 log; halaman admin (`admin/riset/[sessionId]/page.tsx:85-262`) query session lengkap + topics + drafts + llm/search logs + stepper/params/charts.
  - `isAdmin` di form hanya dipakai untuk field model per-stage (baris 112, 180, 959); pemakaian baru di blok sukses konsisten dengan maksud prop tersebut.
- Follow-up opsional (di luar plan ini): tambah redirect server di `konten/riset/[sessionId]/page.tsx` setelah `const admin = await isAdmin()` — jika `admin` true, `redirect` ke `/admin/riset/[sessionId]` agar bookmark/deep-link lama juga 1-klik. Jangan kerjakan tanpa instruksi user karena user memilih fix tombol saja.
- Standar repo yang relevan: Conventional Commits satu baris tanpa trailer `Co-authored-by:`; auto commit+push setelah gate hijau (cek `git status --short`, `git diff`, `git log --oneline -10`, stage hanya file dimaksud). Contoh pesan: `fix(content): arahkan tombol lihat riset admin ke detail admin`.
- Counter-argument tercatat: opsi B (auto-redirect) akan menutup lubang deep-link tapi menyentuh halaman status; opsi C (perkaya halaman status dengan stepper/topik) duplikasi berat halaman admin. Opsi A dipilih karena terkecil, teraman, dan memakai `isAdmin` yang sudah ada.
