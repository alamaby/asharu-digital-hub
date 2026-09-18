# Artikel Cover Prompt dari Developing — Plan Detail (siap eksekusi)

Created: 2026-09-18 13:30:00

## Objective

LLM developing artikel ikut mengembalikan `cover_image_prompt` (EN, detail, sesuai konteks artikel) dalam JSON yang sama dengan konten — sehingga baris cover `content_draft_images` langsung terisi prompt berkualitas + `status='prompt_ready'`, menunggu review seperti biasa. Menghemat 1 panggilan LLM stage `image_prompt` per cover dan menghilangkan kehilangan konteks (body 600+ kata, produk afiliasi, tone tak lagi dibuang worker).

Latar terverifikasi 2026-09-18 (read-only, dua agen riset + cek baris kunci):

- Developing artikel: `src/lib/research/development.ts:829-1126` (`generateArticleAndInsertDraft`, stage `developing`, `temperature 0.7 / maxTokens 4000`, retry `0.3/4000`, expand-repair `0.7→0.3/6000`). Konteks LLM: tone, audience, purpose, language sesi (`development.ts:840-843`); topic/hooks/key_facts/unique_angle (`:846-849,865-877`); produk `{friendlyCode, name, url, category}` (`:851-863`).
- Prompt builder: `src/lib/llm/prompt.ts:275-332` (`buildArticlePrompt`). Output shape `ParsedArticleDraft {id, en}` (`:261-264`), tiap bahasa `ArticleLangDraft {title, slug, excerpt, sections[{h2,body}], faq, meta_title, meta_desc}` (`:250-258`). Parse: `parseArticleLang` (`:361-397`), `parseArticleDraft` (`:472-479`) via `repairArticleJson`. Expand: `buildArticleExpandPrompt` (`:541-578`, title/slug/H2/faq/meta dibekukan).
- Cover hari ini decoupled: `enqueueCoverImage()` (`development.ts:489-513`) insert `{draft_id, post_index:0, image_prompt:'', provider_slug:'', model_id:''}`. Dipanggil jalur artikel (`:1116`) dan thread (`:809-811`). Lazy fallback `enqueueNextMissingImage()` (`worker.ts:42-67`) hanya insert bila belum ada baris `post_index=0`.
- Worker (`src/lib/image/worker.ts`): `claimPendingImage` (`:77-103`) **hanya klaim `status='pending'`**. `processClaimedImage` (`:349-391`): prompt non-empty + reasoning bukan `custom` → **langsung render**; prompt kosong → reasoning LLM → `status='prompt_ready'`, tanpa render, menunggu review. Review Generate (`actions.ts:159-271`) insert baris `pending` baru lalu render.
- Stage image: `image_prompt` (auto reasoning), `enhance_image_prompt` (poles manual) — `worker.ts:189`, `actions.ts:379,515`. Gate `validateImagePromptContradiction` (`prompt.ts:146-171`): prompt 10–500 char, negative ≤300.
- Aturan prompt gambar acuan: `src/lib/image/prompt.ts:42-58` (EN, ≤60 kata, no text/logo/faces).

## Scope

Masuk:

- Field `cover_image_prompt` top-level di `ParsedArticleDraft` (satu prompt EN, bukan per-locale).
- Aturan COVER di system prompt developing + parse toleran + expand membekukan.
- Validasi ringan + persist ke baris cover (`prompt_ready` bila valid, `''` bila tidak).
- Test untuk tiap perubahan.

Keluar (jangan kerjakan di plan ini):

- Jalur thread (`development.ts:809-811` tak berubah; cover thread tetap `''`).
- Perubahan worker, actions review, Studio, stage `image_prompt`/`enhance_image_prompt`.
- Migrasi DB apa pun (tidak diperlukan — semua kolom sudah ada).
- Admin UI / badge provenance (follow-up opsional, lihat Notes).
- Perubahan `routing.ts`, middleware, CSP, RLS.

## Milestones

1. Prompt + tipe: field ada di shape, aturan COVER di system prompt.
2. Parse + expand: toleran hilang/invalid, expand mempertahankan.
3. Persist: enqueue menulis `prompt_ready` berprompt atau fallback `''`.
4. Gate hijau + verifikasi 1 sesi riset artikel end-to-end.

Urutan wajib: T1 → T2 → T3 → T4 (test tiap tahap, jangan lompat).

## Tasks

### T1 — Tipe + system prompt (`src/lib/llm/prompt.ts`)

- [ ] `prompt.ts:261-264`: tambah field opsional di `ParsedArticleDraft`:
  ```ts
  export interface ParsedArticleDraft {
    id: ArticleLangDraft | null;
    en: ArticleLangDraft | null;
    /** Prompt cover EN (satu untuk semua locale). Opsional — hilang/invalid = fallback worker. */
    cover_image_prompt?: string;
  }
  ```
- [ ] `prompt.ts:293` (baris shape JSON di system): tambah `,"cover_image_prompt":"..."` di top-level shape (sejajar `"id"`/`"en"`, BUKAN di dalam `<article>`), agar LLM menaruhnya sekali, bukan per bahasa.
- [ ] `prompt.ts:289-306` (setelah aturan META `:301`): tambah 1 baris aturan, contoh:
  ```
  - COVER: top-level "cover_image_prompt" = EN image prompt ≤60 kata untuk cover artikel (photorealistic, konkret memvisualkan judul+isi, tanpa teks/logo/wajah/tanda air). Diturunkan dari title+excerpt+key facts; JANGAN kosongkan dengan spasi; bila ragu, omit field ini.
  ```
- [ ] Jangan ubah aturan lain (panjang, emoji, affiliate, slug, meta). Jangan naikkan `maxTokens` developing (4000 cukup untuk +~80 token output).
- [ ] Acceptance: `buildArticlePrompt(...)` mengembalikan system yang memuat kata `cover_image_prompt` tepat 2x (shape + aturan).

### T2 — Parse toleran + expand membekukan (`src/lib/llm/prompt.ts`)

- [ ] `parseArticleLang` (`:361-397`) / `parseArticleDraft` (`:472-479`) / `repairArticleJson`: field `cover_image_prompt` hilang, null, atau bukan string non-empty → hasilkan `undefined` (JANGAN throw, JANGAN gagalkan seluruh draf — pelajaran insiden duplicate-key 16 Sep).
- [ ] `buildArticleExpandPrompt` (`:541-578`): tambah instruksi "pertahankan `cover_image_prompt` apa adanya (jangan ubah, jangan hapus)" sejajar pembekuan title/slug/H2/faq/meta. Expand hanya menyentuh body.
- [ ] Test di `src/lib/llm/prompt-article.test.ts` (ikuti pola existing):
  1. JSON dengan `cover_image_prompt` valid → ter-parse ke field.
  2. JSON tanpa field → `undefined`, draf tetap valid.
  3. JSON field bukan string (mis. angka) → `undefined`, draf tetap valid.
- [ ] Acceptance: 3 test baru hijau; test lama tidak tersentuh hasilnya.

### T3 — Validasi ringan + persist (`src/lib/research/development.ts`)

- [ ] Helper murni baru (di `development.ts` dekat `enqueueCoverImage`, atau di `prompt.ts` bila ingin di-test tanpa mock — pilih SATU, disarankan `prompt.ts` agar pure + gampang di-test):
  ```ts
  export function isValidCoverPrompt(v: unknown): v is string {
    if (typeof v !== 'string') return false;
    const s = v.trim();
    if (s.length < 10 || s.length > 500) return false;
    if (/[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/.test(s)) return false; // selaras aturan Latin artikel
    return true;
  }
  ```
  Batas 10–500 = batas gate worker (`prompt.ts:146-171`) agar prompt lolos gate render nanti.
- [ ] Ubah signature `enqueueCoverImage` (`:489`):
  ```ts
  async function enqueueCoverImage(
    supabase: SupabaseClient, sessionId: string, draftId: string, coverPrompt?: string
  ): Promise<void>
  ```
  Logika insert (hanya bila belum ada baris `post_index=0`, guard `count` tetap):
  - `coverPrompt` valid → insert `{draft_id, post_index:0, image_prompt: coverPrompt.trim(), status:'prompt_ready', reasoning:{visual_strategy:'developing', justification:'cover prompt dari LLM developing (konteks artikel penuh)'}, llm_meta:{stage:'developing', from_developing:true}, provider_slug:'', model_id:''}`.
  - tidak valid/kosong → insert persis seperti sekarang (`image_prompt:''`, tanpa `status`/`reasoning` → default `pending` → reasoning lane lama).
- [ ] Jalur artikel (`:1116`): baca `finalArticle.cover_image_prompt` (perhatikan: `finalArticle` = hasil setelah replace `{{PRODUCT_URL}}` + thin-repair — ambil SETELAH expand agar tidak hilang), teruskan ke `enqueueCoverImage`. Jalur thread (`:809-811`): panggil tanpa argumen baru (tak berubah).
- [ ] KRITIS — jangan set `status:'pending'` bersama prompt terisi: worker akan **langsung render tanpa review** (`worker.ts:349-391`). `prompt_ready` = menunggu review. Ini jebakan utama task ini.
- [ ] Test (ikuti pola `src/lib/research/development.test.ts`, mock Supabase client):
  1. `cover_image_prompt` valid → insert dipanggil dengan `image_prompt` terisi + `status:'prompt_ready'`.
  2. field hilang → insert `image_prompt:''` (perilaku lama).
  3. field terlalu pendek/panjang/CJK → fallback `''`.
  4. guard idempoten: bila baris `post_index=0` sudah ada (`count>0`) → tidak insert.
- [ ] Acceptance: 4 test baru hijau.

### T4 — Verifikasi worker tanpa ubah + gate akhir

- [ ] Baca ulang `worker.ts:77-103,349-391` dan pastikan TIDAK ada perubahan perilaku untuk baris baru: `prompt_ready` tak diklaim; `pending` kosong → reasoning lama. Bila ragu, tulis 1 test baca-dokumen? Tidak perlu — cukup checklist baca.
- [ ] Jalankan berurutan: `npm run typecheck` → `npm run lint` → `npm test` (skala penuh; waspadai flaky timeout Studio yang pre-existing — rerun file spesifik bila gagal) → `npm run build`.
- [ ] Aturan insiden `prefer-const` 2026-09-10: SETIAP edit setelah gate hijau (sekecil apa pun) MEMBATALKAN gate — wajib re-run `typecheck + lint` sebelum commit.
- [ ] Manual end-to-end (dev/staging, JANGAN prod dulu): 1 sesi riset artikel sampai developing → cek `content_drafts.article_draft.cover_image_prompt` terisi → baris cover `status='prompt_ready'` + prompt tampil di review → klik Generate → render normal → publish → cover tampil di `/artikel/[slug]`. + 1 kasus prompt invalid (atau hapus field manual) → baris `''` → reasoning lane lama jalan.

## Risks

- Kualitas prompter-copywriter di bawah stage khusus `image_prompt` (yang melihat `style_suffix` di depan). Mitigasi: fallback otomatis ke jalur lama, enhance/regenerate manual tetap ada, monitor N cover pertama sebelum menganggap jalur lama mati. Style/camera suffix tetap ditempel worker setelah LLM (keterbatasan existing, diterima).
- Perubahan bentuk JSON berisiko gagal parse massal (preseden 16 Sep). Mitigasi: field opsional + parse toleran + 3 test T2.
- `status` salah (`pending` + prompt terisi) = render liar tanpa review + bakar kuota image. Mitigasi: T3 menulis `prompt_ready` eksplisit; test T3 menegaskan; checklist baca worker T4.
- Token developing +~80 output; maxTokens 4000 tidak diubah — risiko kepotong bila artikel sudah di batas atas. Mitigasi: field diabaikan saat expand? Tidak — T2 membekukan; bila output terpotong, `repairArticleJson` + retry existing menangani; monitor log `thin_content`.
- Single EN prompt untuk sesi `id`-only: tetap valid karena image model EN-only; bukan bug.

## Progress Log

- 2026-09-18 13:30:00 — Plan detail dibuat (riset read-only: 2 agen + verifikasi baris `development.ts:489-513,809-1116`, `prompt.ts:250-332,361-578`, `worker.ts:42-111,295-394`). Belum ada implementasi.
- Belum mulai — T1 tipe + system prompt.

## Notes

- Satu-satunya asumsi yang sudah dikonfirmasi user: scope **artikel dulu**; thread follow-up terpisah (bentuk output developing thread ≠ JSON artikel).
- Keputusan desain: (1) top-level single EN prompt, bukan per-locale — hemat token + sesuai image model; (2) `prompt_ready`, bukan `pending` — satu-satunya status aman untuk pre-isi; (3) `visual_strategy:'developing'` di kolom `reasoning` JSON existing sebagai provenance — tanpa migrasi; cek gate `validateImagePromptContradiction` menerima strategy value ini bila kelak prompt developing dilewatkan gate (hari ini gate hanya untuk `custom`; worker langsung render non-custom — validasi panjang T3 adalah pengaman pengganti).
- Follow-up opsional (bukan plan ini): badge "dari developing" di review UI; chip/daftar audit `llm_meta.from_developing`; perluas ke thread; naikkan `maxTokens` developing bila terbukti kepotong.
- Perintah verifikasi per tahap: `npm run typecheck` → `npm run lint` → `npm test` → `npm run build`.
- Aturan commit repo (untuk eksekutor): Conventional Commits satu baris tanpa trailer `Co-authored-by`; sebelum commit `git status --short + git diff + git log --oneline -10`, stage hanya file dimaksud, JANGAN commit `.env*` atau key `sb_secret_*/sb_publishable_*/CRON_SECRET`; tidak ada submodule yang berubah di plan ini (tanpa migrasi) jadi commit parent saja; bila push ditolak → `git fetch`, cek `git log main..origin/main`, `git pull --no-rebase`, gate hijau, push lagi; setelah push laporkan hash + pesan + file kunci.
- Handoff untuk model kurang mampu: kerjakan T1→T4 berurutan, SATU file per langkah lalu gate kecil (`typecheck` cepat menangkap salah ketik); bila ragu soal worker, baca ulang `worker.ts:349-391` sebelum menyentuh apa pun di `src/lib/image/` (jawaban yang benar: JANGAN sentuh); JANGAN menambah dependensi; JANGAN mengubah `routing.ts`, middleware, CSP, RLS, atau skema DB.
