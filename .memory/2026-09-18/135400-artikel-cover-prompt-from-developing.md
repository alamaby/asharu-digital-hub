# Artikel cover prompt dari developing (T1-T3 + gate)

Tang 2026-09-18 siang. LLM developing artikel sekarang ikut generate `cover_image_prompt` top-level (EN, ≤500 char Latin). Bila valid, baris cover `content_draft_images` langsung pre-isi dengan `status='prompt_ready'` — menunggu review seperti biasa — tanpa memanggil reasoning LLM tahap `image_prompt`. Fallback: field hilang/invalid → insert `image_prompt:''` → worker reasoning lane lama jalan. Tanpa migrasi DB.

## Perubahan kode

* `src/lib/llm/prompt.ts`:
  * `ParsedArticleDraft` tambahkan `cover_image_prompt?: string` (`:261-264`).
  * `buildArticlePrompt` system rule: aturan COVER setelah META (`:301`) — EN ≤60 kata, photorealistic, tanpa teks/logo/wajah; omit bila ragu.
  * `parseArticleDraft` (`:489-501`) sekarang mengekstrak `cover_image_prompt` opsional; tolerate non-string/null → `undefined`, tidak gagalkan draf (insiden 16 Sep).
  * `buildArticleExpandPrompt` (`:558`): "JANGAN ubah cover_image_prompt bila ada" di side pembekuan title/slug/H2/faq/meta.
  * Tambah helper export `isValidCoverPrompt(v)` — 10–500 char Latin (selaras gate worker `validateImagePromptContradiction`).
* `src/lib/research/development.ts`:
  * Import `isValidCoverPrompt` dari `@/lib/llm/prompt`.
  * `enqueueCoverImage(supabase, sessionId, draftId, coverPrompt?)` (`:490`):
    * valid → `{image_prompt, status:'prompt_ready', reasoning:{visual_strategy:'developing', justification:'...'}, llm_meta:{stage:'developing', from_developing:true}}`.
    * invalid/kosong → fallback `{image_prompt:'', provider_slug:'', model_id:''}` (jalan lama, reasoning LLM worker).
    * Guard idempoten `count>0` tetap ada.
  * Panggilan jalur artikel `:1116`: `await enqueueCoverImage(..., finalArticle.cover_image_prompt)` (setelah expand + thin-repair agar prompt tak tertimpa). Jalur thread `:809-811` tetap tanpa argumen baru.
* `src/lib/llm/prompt-article.test.ts`: +9 test (builder rule ada, parse valid/invalid/missing/trim, non-string toleran).

## Risk & mitigation

* Jebakan `status='pending'` + prompt terisi = worker render liar tanpa review → **bukan** `pending`, tapi `prompt_ready` (jika salah jadi pending, worker akan reject karena gate 10–500 char Latin sudah terpenuhi sebelumnya, tapi tetap harus dicek ulang).
* Token developing naik ~80 token per output; maxTokens 4000 tidak diubah — bila artikel sudah di batas atas, LLM bisa terpotong → retry existing `thin_content` penanganan. Monitor log `thin_content`.
* Kualitas < stage khusus `image_prompt` — mitigasi: fallback otomatis + enhance/regenerate manual tetap tersedia.

## Gate

`npm run typecheck` ✓, `npm run lint` ✓, `npm test` 860/860 ✓ (+9 baru), `npm run build` ✓. Commit `6d0d64c` + plan update `4cae453`.

## Next (belum dieksekusi)

Manual e2e dev/staging: submit sesi riset artikel → cek `content_drafts.article_draft.cover_image_prompt` terisi → cover baris `status='prompt_ready'` + prompt tampil di review `/admin/konten` → klik Generate → render normal → publish → cover tampil di `/id/artikel/[slug]`. Tambah kasus fail: hapus field manual atau set terlalu pendek → baris `''` → reasoning lane lama jalan.
