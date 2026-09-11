# Fix Label Mentah Studio (i18n Allow-List)

## Task
User lapor label studio masih mentah (`studio.title`, `studio.form.promptLabel`, dst.) di UI. Investigasi + perbaiki sampai label tampil terjemahan.

## Files Changed
- `src/lib/i18n/client-messages.ts` — tambah `'studio'` ke `CLIENT_MESSAGE_NAMESPACES` (**akar masalah**: locale layout memangkas katalog client via allow-list; komponen studio pakai `useTranslations('studio*')` tapi namespace tidak diteruskan → fallback key mentah)
- `src/messages/id.json`, `en.json` — 7 key baru `studio.history.*`: `downloading`, `processing`, `noImage`, `loadError`, `imageAlt`, `prevSlide`, `nextSlide`
- `src/components/studio/StudioForm.tsx` — quota-exhausted pakai `quota.exhausted` (bukan `quota.used` yang ambigu); counter via `promptChar`/`negativeChar`; `fieldsDisabled` terpisah dari `isSubmitDisabled` (**bug nyata**: textarea/select ter-disable saat prompt kosong → user tidak bisa mengetik; tombol submit tetap disable sampai prompt valid); rapikan indentasi
- `src/components/studio/StudioHistory.tsx` — `metaLabel` via template `history.meta` + `noStyle`; placeholder pending/error/kosong via key; `aria-label` region/slide + `alt` gambar via key
- `src/components/studio/StudioUi.test.tsx` — baru, 6 test (label terjemahan tanpa key mentah, warning inline <10 char, kuota habis disable, badge/meta/error history, placeholder pending)
- `src/lib/i18n/client-messages.test.ts` — extend: `studio` di allow-list + diteruskan `pickClientMessages`

## Decisions / Assumptions
- Pola allow-list dipertahankan (bukan kirim full katalog) — payload RSC tetap ramping; cukup tambah namespace.
- `metaLabel` provider/model fallback `'auto'` tetap hardcoded (slug teknis, bukan copy UI) — hanya `noStyle` yang di-i18n-kan.
- `negativeChar` template hanya `{current}` (max 500 implisit di teks) — konsisten dengan katalog existing.

## Risks / Open
- Test menemukan 2 bug yang sudah diperbaiki; tidak ada perubahan skema/DB di follow-up ini.
- QA manual `/id/studio` + `/en/studio` di prod setelah deploy (label EN + allow-list runtime).

## Verification
- typecheck ✓, lint ✓, test 453 passed (58 files; 6 baru StudioUi + 1 baru allow-list) ✓, build ✓ (`/id/studio`, `/en/studio` SSG OK).

## Commit Proposal
fix(studio): kirim namespace studio ke client + sinkron key i18n
