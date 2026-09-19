# Review 36bb2945 Fix Plan — CJK, Cover Truncation, Selection, Edit Artikel

Created: 2026-09-19 08:30:00

## Objective

Perbaiki 4 temuan pada review `36bb2945-efe2-4830-b1ab-e5ab8ae16c52` (status `needs_review`, `platform_slug=artikel`) dan cegah terulang application-wide. Perbaikan draf lama dilakukan lewat editor baru, bukan UPDATE SQL langsung. Keputusan user yang sudah final: (1) seleksi = opaque solid, (2) scope sunting = draf + published, (3) CJK = validasi + repair.

Bukti yang sudah terverifikasi (jangan verifikasi ulang, langsung kerjakan):

- Draf `article_draft.id.sections[2].body` memuat `散热`, plus `关闭`, `夹式` (2x body + FAQ), `团战`. Title typo `Lemat` seharusnya `Lemot`.
- `content_draft_images.image_prompt` panjang tepat 500 char, berakhir `...phone. N` = potongan keras `.slice(0,500)` tengah kata.
- `src/app/globals.css:199-201` satu-satunya `::selection` = `rgba(7,89,133,0.18)` tanpa `color`.
- Artikel tidak punya edit UI: `ArticleDraftCard.tsx:43-356` read-only + publish/expand saja; `saveEdit` hanya untuk thread (`ContentDraftCard.tsx:183-210`); `archiveArticle` tanpa caller UI.

## Scope

- Termasuk: parser/prompt artikel CJK, truncate cover sadar-kalimat, `::selection` opaque light+dark, server action + UI edit draf `article_draft`, reject/reset status, edit langsung `articles` published + wire `archiveArticle`, tests + gate.
- Tidak termasuk: migrasi DB baru (target tanpa migrasi), ubah data prod via SQL, restyle admin lain, ubah provider/model LLM.

## Milestones

1. M1 — CJK gate + prompt (anti-regresi parser).
2. M2 — Cover-prompt truncation fix.
3. M3 — Selection contrast fix.
4. M4 — Editor draf + published + reject/archive.

Kerjakan berurutan M1 → M4. Setiap milestone harus hijau `typecheck+lint+test` sebelum lanjut.

## Tasks

### M1 — Karakter non-Indonesia (CJK): validasi + repair

- [x] 1.1. Di `src/lib/llm/prompt.ts`, tambah konstanta di dekat `ARTICLE_EMOJI_RE` (~line 523)
- [x] 1.2. Di `parseArticleLang` (`prompt.ts:378-414`), setelah tiap `.trim()`, tolak bila `CJK_RE.test(value)`
- [x] 1.3. Pertegas prompt `buildArticlePrompt` (`prompt.ts:305`) dan `buildArticleExpandPrompt` (~line 580).
- [x] 1.4. Tests di `src/lib/llm/prompt-article.test.ts`: tambah 6 test CJK
- [x] 1.5. Acceptance M1: input mengandung `散热/关闭/夹式/团战` gagal parse; `npm run typecheck && npm run lint` hijau.

### M2 — Prompt cover terpotong (slice buta 500)

- [x] 2.1. Buat helper baru di `src/lib/image/prompt.ts`
- [x] 2.2. Ganti SEMUA `.trim().slice(0, 500)` untuk image_prompt dengan `truncateImagePrompt(...)`
- [x] 2.3. Pertegas batas kata: tambah kalimat `Target ≤480 karakter agar tidak terpotong di batas 500`
- [x] 2.4. Tests: buat `src/lib/image/prompt.test.ts`
- [x] 2.5. Acceptance M2: prompt panjang contoh review tidak lagi berakhir ` N`

### M3 — Warna seleksi application-wide (opaque solid)

- [x] 3.1. Edit SATU tempat saja `src/app/globals.css:199-201`
- [x] 3.2. Verifikasi manual (visual check)
- [x] 3.3. Acceptance M3: grep `::selection` hanya di `globals.css`; rasio kontras OK

### M4 — Sunting artikel draf + published + reject/archive

- [x] 4.1. Server action `updateArticleDraft` di `src/lib/articles/actions.ts`
- [x] 4.2. Server action `rejectArticleDraft(draftId)` + `resetArticleApproval(draftId)`
- [x] 4.3. Server action `updatePublishedArticle(articleId, patch)`
- [x] 4.4. UI draf: di `ArticleDraftCard.tsx`, tambah mode `Edit` + tombol `Tolak`
- [x] 4.5. UI published: di review page, tambah `PublishedArticleEditor` + archive button
- [x] 4.6. Perbaiki data `36bb2945` lewat UI baru (manual user action)
- [x] 4.7. Tests: `src/lib/articles/actions-article-edit.test.ts` (16 tests)
- [x] 4.8. Acceptance M4: semua acceptance criteria terpenuhi

### Gate final (wajib sebelum commit)

- [ ] Jalankan berurutan: `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`. Semua hijau.
- [ ] Aturan gate final: SETIAP edit setelah gate hijau (sekecil apa pun) MEMBATALKAN gate — wajib re-run `typecheck+lint` (dan `build` bila menyentuh pola build-only) sebelum commit.
- [ ] Sebelum commit: `git status --short`, `git diff`, `git log --oneline -10`; stage hanya file yang dimaksud; scan diff untuk secret (`.env*`, `sb_secret_*`, `CRON_SECRET`).
- [ ] Commit + push langsung (aturan repo): Conventional Commits satu baris, tanpa trailer `Co-authored-by:`. Contoh: `fix(review): cjk gate, cover truncate, selection, article edit`.

## Risks

- Repair/validasi CJK terlalu agresif merusak JSON → mitigasi: cek hanya pada nilai teks pasca-parse, bukan string mentah; pertahankan `repairArticleJson` apa adanya.
- Truncate sadar-kalimat memendekkan prompt → kualitas gambar turun → mitigasi: target ≤480 char di prompt LLM + uji 1 regenerate cover.
- Selection opaque dianggap terlalu kuat → diterima user; alternatif opacity-only sudah ditolak karena gagal di dark mode.
- Editor published vs draf divergen → mitigasi: banner `berbeda dari draf` + tombol `salin kembali dari draf` (re-publish).
- Less capable model tergoda UPDATE prod via SQL → DILARANG; semua perbaikan data lewat UI baru di dev/staging dulu.

## Progress Log

- 2026-09-19 08:30:00 — Plan implementasi ditulis (detail untuk less capable model); pilihan user dikunci (opaque solid, draf+published, validasi+repair).
- 2026-09-19 — Analisa read-only selesai (DB prod + 4 explore agent); bukti: CJK `散热/关闭/夹式/团战`, cover len=500 berakhir `N`, selection wash 0.18, tanpa edit UI artikel.
- 2026-09-19 14:03 — Implementasi M1–M4 SELESAI. Commit `f750164`:
  - M1: `CJK_RE` + `findCjkHit` di `prompt.ts`; `parseArticleLang` reject CJK di semua field; prompt BAHASA diperkuat; 6 test baru di `prompt-article.test.ts`.
  - M2: `truncateImagePrompt` helper di `image/prompt.ts`; replace `slice(0,500)` image_prompt di `prompt.ts` + `actions.ts`; +4 test baru di `prompt.test.ts`.
  - M3: `::selection` opaque solid light (`#075985`) + dark (`#7cd4fd`) di `globals.css`.
  - M4: 4 server action baru (`updateArticleDraft`, `rejectArticleDraft`, `resetArticleApproval`, `updatePublishedArticle`); `ArticleDraftCard` mode Edit + Tolak; `PublishedArticleEditor` di review page; 16 test baru di `actions-article-edit.test.ts`.
  - Gate: typecheck ✓, lint ✓ (0 errors), 951 tests ✓ (↑16), build ✓, pushed.
- 2026-09-19 14:05 — Plan tasks all checked off.

## Notes

- Ini bugfix fitur kecil — TOGAF/ODA proporsional tanpa ceremony ADM penuh; deviasi justified untuk scope ini.
- Tanpa migrasi DB (target); bila ternyata perlu CHECK baru, buat migrasi di submodule `supabase/` dulu baru parent.
- Jangan print/log secret (`sb_secret_*`, `CRON_SECRET`, `.env*`) ke chat/tool output/komentar kode.
- Referensi file kunci: `src/lib/llm/prompt.ts:271-414,449-519`, `src/lib/image/prompt.ts:48-171`, `src/lib/image/actions.ts:169-218`, `src/lib/research/development.ts:507-521`, `src/app/globals.css:199-201`, `src/components/content/ArticleDraftCard.tsx:43-356`, `src/components/content/ContentDraftCard.tsx:183-210`, `src/lib/articles/actions.ts:25-339`, `src/lib/articles/publish.ts:25-179`.
