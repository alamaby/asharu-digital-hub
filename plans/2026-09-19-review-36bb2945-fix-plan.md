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

- [ ] 1.1. Di `src/lib/llm/prompt.ts`, tambah konstanta di dekat `ARTICLE_EMOJI_RE` (~line 523):
  ```ts
  export const CJK_RE = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/;
  export function findCjkHit(s: string): string | null {
    const m = s.match(CJK_RE);
    return m ? m[0] : null;
  }
  ```
  Reuse pola yang sudah ada di `isValidCoverPrompt` (`prompt.ts:351`).
- [ ] 1.2. Di `parseArticleLang` (`prompt.ts:378-414`), setelah tiap `.trim()`, tolak bila `CJK_RE.test(value)`. Terapkan ke: `title`, `slug` (sudah ASCII, tetap cek), `excerpt`, tiap `sections[].h2`, `sections[].body`, tiap `faq[].q`, `faq[].a`, `meta_title`, `meta_desc`. Return `null` seperti validasi lain (jangan throw). Contoh:
  ```ts
  const title = (r.title as string).trim();
  if (CJK_RE.test(title)) return null;
  ```
- [ ] 1.3. Pertegas prompt `buildArticlePrompt` (`prompt.ts:305`) dan `buildArticleExpandPrompt` (~line 580). Ubah baris BAHASA menjadi:
  ```
  - BAHASA: tulis Bahasa Indonesia yang natural dan benar (atau EN natural untuk field en). HANYA huruf Latin, angka, tanda baca standar. DILARANG keras karakter CJK/Jepang/Korea/Cina (contoh: 散热, 关闭, 夹式, 团战). Jangan campur bahasa lain di dalam kalimat ID.
  ```
  Jangan ubah struktur JSON/shape.
- [ ] 1.4. Tests di `src/lib/llm/prompt-article.test.ts` (ikuti pola `validLang()` line 20-37): tambah 4 test:
  1. `parseArticleDraft` return `null`/reject bila body section memuat `散热`.
  2. Reject bila FAQ answer memuat `夹式`.
  3. `isValidCoverPrompt` sudah menolak CJK (test sudah ada? pastikan).
  4. `buildArticlePrompt` system mengandung `DILARANG keras karakter CJK`.
  Jalankan: `npm test -- src/lib/llm/prompt-article.test.ts`.
- [ ] 1.5. Acceptance M1: input mengandung `散热/关闭/夹式/团战` gagal parse; `npm run typecheck && npm run lint` hijau.

### M2 — Prompt cover terpotong (slice buta 500)

- [ ] 2.1. Buat helper baru di `src/lib/image/prompt.ts` (atas file, export untuk test):
  ```ts
  export function truncateImagePrompt(text: string, max = 500): string {
    const clean = text.trim().replace(/\s+/g, ' ');
    if (clean.length <= max) return clean;
    const cut = clean.slice(0, max);
    const lastSentence = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '), cut.lastIndexOf('? '));
    if (lastSentence > max * 0.5) return cut.slice(0, lastSentence + 1).trim();
    const lastSpace = cut.lastIndexOf(' ');
    if (lastSpace > max * 0.5) return cut.slice(0, lastSpace).trim();
    return cut.trim();
  }
  ```
  Tidak boleh memotong tengah kata (kasus `...phone. N` harus hilang).
- [ ] 2.2. Ganti SEMUA `.trim().slice(0, 500)` untuk image_prompt dengan `truncateImagePrompt(...)`:
  - `src/lib/image/prompt.ts:112` (`parsed.image_prompt`)
  - `src/lib/image/actions.ts:169` (`customPrompt`), `:209` (`enhPrompt`), `:217` (`effectivePrompt`)
  - `src/lib/research/development.ts:507,512-521` (cover insert dari `cover_image_prompt`)
  Negative prompt `slice(0,300)` JANGAN diubah.
- [ ] 2.3. Pertegas batas kata: di `src/lib/image/prompt.ts:48` dan `src/lib/llm/prompt.ts:304`, tambah kalimat `Target ≤480 karakter agar tidak terpotong di batas 500`. Jangan ubah gate `isValidCoverPrompt 10-500` (`prompt.ts:346-353`) dan `validateImagePromptContradiction` (`image/prompt.ts:155-160`).
- [ ] 2.4. Tests: buat/extend `src/lib/image/prompt.test.ts`: prompt 520 char berakhir kalimat penuh (tidak ada 1 huruf menggantung), prompt pendek lolos utuh, negative tidak tersentuh. Jalankan file test tersebut.
- [ ] 2.5. Acceptance M2: prompt panjang contoh review tidak lagi berakhir ` N`; tidak ada `slice(0, 500)` tersisa untuk image_prompt (cek via grep `\.slice\(0, 500\)` di 3 file di atas — yang tersisa hanya untuk `contradiction_check/justification/last_error` yang memang disengaja).

### M3 — Warna seleksi application-wide (opaque solid)

- [ ] 3.1. Edit SATU tempat saja `src/app/globals.css:199-201` di dalam `@layer base` menjadi:
  ```css
  ::selection {
    background-color: #075985;
    color: #ffffff;
  }
  ::-moz-selection {
    background-color: #075985;
    color: #ffffff;
  }
  .dark ::selection {
    background-color: #7cd4fd;
    color: #0c111d;
  }
  .dark ::-moz-selection {
    background-color: #7cd4fd;
    color: #0c111d;
  }
  ```
  Jangan tambah `selection:` variant Tailwind per-file; jangan ubah `:focus-visible` (`:194-197`); jangan buat `tailwind.config.*` (proyek CSS-first, config sengaja dihapus).
- [ ] 3.2. Verifikasi manual: `npm run dev`, blok teks di halaman terang + dark mode (toggle tema admin) — seleksi harus solid terlihat, bukan wash tipis. Tidak perlu test otomatis (visual check cukup, catat di Progress Log).
- [ ] 3.3. Acceptance M3: grep `::selection` hanya di `globals.css`; rasio kontras: light `#075985` vs `#fff` teks ≥4.5:1; dark `#7cd4fd` vs `#0c111d` ≥4.5:1.

### M4 — Sunting artikel draf + published + reject/archive

- [ ] 4.1. Server action `updateArticleDraft` di `src/lib/articles/actions.ts` (tiru pola `expandArticleDraft:167-339` untuk guard + fetch):
  ```ts
  'use server';
  export async function updateArticleDraft(draftId: string, patch: { locale: 'id'|'en'; title; slug; excerpt; sections: {h2;body}[]; faq: {q;a}[]; meta_title; meta_desc }): Promise<{success:boolean; error?:string}> {
    if (!(await isAdmin())) return { success:false, error:'forbidden' };
    // 1. fetch content_drafts.article_draft + research_topic_id
    // 2. gabung patch ke locale terkait, validasi via parseArticleLang-like (reuse CJK_RE + clampArticleExcerpt + slug regex + sections 3-8 + faq ≤6)
    // 3. hitung ulang word_count via countArticleWords, set llm_meta { word_count, thin_content, edited_at, edited_manually:true }
    // 4. update content_drafts SET article_draft, revalidatePath('/konten/review') + ('/konten/review/[draftId]','page')
  }
  ```
  Validasi WAJIB: tolak CJK (M1), `excerpt clampArticleExcerpt`, `slug /^[a-z0-9]+(-[a-z0-9]+)*$/`, sections 3-8, thin-content hanya flag (jangan blokir save — blokir tetap di publish).
- [ ] 4.2. Server action `rejectArticleDraft(draftId)` + `resetArticleApproval(draftId)`: `update content_drafts SET status='rejected'` / `'needs_review'`, guard `isAdmin()`, revalidate sama. Artikel publish implisit set `approved` via `publishArticleDraftCore` (`publish.ts:176`) — jangan ubah itu.
- [ ] 4.3. Server action `updatePublishedArticle(articleId, patch {title,excerpt,body_md,faq,slug,category,tags})`: guard admin, `update articles SET ... updated_at=now`, revalidate `localizedPathname('/artikel')` + `('/artikel/[slug]')` (tiru `applyDraftCoverToArticle:141-147`). Jangan sentuh `cover_image_url` di sini (sudah ada banner khusus).
- [ ] 4.4. UI draf: di `src/components/content/ArticleDraftCard.tsx`, tambah mode `Edit` (tiru pola thread `Edit/Save` di `ContentDraftCard.tsx:280-310`): tombol `Sunting` → form textarea/input per field (title, slug, excerpt, sections h2+body dinamis +/-, faq q+a, meta) → `Simpan` panggil `updateArticleDraft` → `router.refresh()`. Tambah tombol `Tolak` (panggil `rejectArticleDraft`) sejajar tombol Publish (`:336-343`). Tampilkan badge status draf (props `status` sudah ada).
- [ ] 4.5. UI published: di `src/app/[locale]/(admin)/konten/review/[draftId]/page.tsx` (fetch `articles` sudah ada `:147-154`), di bawah `ApplyCoverBanner` tambah daftar artikel terbit per locale dengan tombol `Sunting artikel` (form inline panggil `updatePublishedArticle`) + tombol `Arsipkan` (panggil `archiveArticle` yang sudah ada `:47-59`, selama ini tanpa caller). Reuse style kartu yang ada.
- [ ] 4.6. Perbaiki data `36bb2945` lewat UI baru (BUKAN SQL): ganti `散热→pelepasan panas`, `关闭→tutup/menutup`, `夹式→model jepit (clip)`, `团战→teamfight/perang tim`, title `Lemat→Lemot`. Lalu publish ulang 1 locale `id` untuk verifikasi.
- [ ] 4.7. Tests: tambah `src/lib/articles/actions.test.ts` (atau extend bila ada): `updateArticleDraft` menolak CJK, menolak slug invalid, meng-clamp excerpt >500; `rejectArticleDraft` butuh admin. Mock supabase seperti pola `runner.test.ts:311-333`.
- [ ] 4.8. Acceptance M4: draf `needs_review` bisa disunting judul/isi/FAQ tanpa LLM; publish tetap blokir thin-content `<600`; artikel published bisa disunting + arsip tanpa menyentuh draf; tidak ada UPDATE SQL manual ke prod.

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

## Notes

- Ini bugfix fitur kecil — TOGAF/ODA proporsional tanpa ceremony ADM penuh; deviasi justified untuk scope ini.
- Tanpa migrasi DB (target); bila ternyata perlu CHECK baru, buat migrasi di submodule `supabase/` dulu baru parent.
- Jangan print/log secret (`sb_secret_*`, `CRON_SECRET`, `.env*`) ke chat/tool output/komentar kode.
- Referensi file kunci: `src/lib/llm/prompt.ts:271-414,449-519`, `src/lib/image/prompt.ts:48-171`, `src/lib/image/actions.ts:169-218`, `src/lib/research/development.ts:507-521`, `src/app/globals.css:199-201`, `src/components/content/ArticleDraftCard.tsx:43-356`, `src/components/content/ContentDraftCard.tsx:183-210`, `src/lib/articles/actions.ts:25-339`, `src/lib/articles/publish.ts:25-179`.
