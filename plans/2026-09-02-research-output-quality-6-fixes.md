# Research Output Quality — 6 Fixes

Created: 2026-09-02 11:00:00

## Objective
Memperbaiki 6 isu pada hasil riset sesuai feedback screenshot:
1. Parameter sesi (tone, audience, location, dll) tidak tampil di halaman detail.
2. Main post terlalu padat kata dibanding reply (konten tidak terdistribusi, bukan soal styling).
3. Afiliasi tidak di reply tengah / kedua terakhir.
4. Tidak ada target reply count untuk Threads/Twitter.
5. Main post tanpa hook kuat.
6. Reply afiliasi langsung posting link tanpa basa-basi.

## Scope (11 files + 1 migration)
- `supabase/migrations/20260902000001_research_target_reply_count.sql` — kolom `target_reply_count`.
- `src/lib/llm/prompt.ts` — ThreadPromptInput + system rules + user message.
- `src/lib/research/thread.ts` — schema `.max(10)` + `repositionPlaceholder()`.
- `src/lib/research/development.ts` — pass hooks/facts/angle + targetReplyCount + reposition + fix post_index.
- `src/lib/research/orchestrator.ts` — `ResearchSessionRow.target_reply_count`.
- `src/lib/content/actions.ts` — schema + insert `target_reply_count`.
- `src/components/content/ContentRequestForm.tsx` — platform state + input conditional.
- `src/app/[locale]/admin/riset/[sessionId]/page.tsx` — expand select + parameter card.
- `src/messages/{id,en}.json` — i18n keys (form + detail labels).
- `src/lib/research/development.test.ts` / `thread.ts` tests — repositionPlaceholder + schema.
- `plans/2026-09-02-research-output-quality-6-fixes.md` (this file).

## Issue → Fix Mapping

### Issue 1 — Tampilkan parameter sesi
- `page.tsx:71`: perluas `select()` dengan `tone, audience_interests, secondary_location, audience_age, account_goal, allowed_categories, excluded_categories, freshness_hours, minimum_candidates, minimum_score, required_winners, maximum_iterations, target_reply_count`.
- Tambah kartu "Parameter Riset" (grid 2 kolom) setelah header sebelum stepper.
- i18n: `paramsHeading` + label keys.

### Issue 2 — Main terlalu padat vs reply (distribusi konten)
- `prompt.ts` system rule: "Main post: MAX 2-3 kalimat (hook + konteks singkat). Jangan taruh seluruh detail di main. Distribusikan detail/fakta/tips ke reply-reply secara bertahap."
- Tidak ada perubahan CSS `ContentDraftCard` (highlight otomatis pindah ke reply afiliasi setelah issue #3).

### Issue 3 — Afiliasi di reply tengah / ke-2-terakhir
- `thread.ts`: fungsi baru `repositionPlaceholder(thread, strategy='middle')`.
  - Hitung `targetIdx`: middle → `floor(replies.length/2)`; second_to_last → `max(0, replies.length-2)`.
  - Jika `replies.length === 0` → fallback tetap di main.
  - Pindahkan token `{{PRODUCT_URL}}` ke `replies[targetIdx].id`. Hapus dari lokasi lama.
  - Backstop basa-basi: jika reply target bare link (teks sekitar token < 20 char), apit template.
- `development.ts`: panggil `repositionPlaceholder` setelah `parseThread` sebelum `replacePlaceholders`.
- Fix bug `post_index` selalu 0: hitung index aktual dari hasil reposition, simpan metadata.

### Issue 4 — Target reply count (DB field + form)
- Migration: `ALTER TABLE content_research_sessions ADD COLUMN target_reply_count integer;`
- `actions.ts` researchSchema: `targetReplyCount: z.coerce.number().int().min(1).max(10).optional()`.
- `createResearchSession`: simpan `target_reply_count`.
- `ContentRequestForm.tsx`: input conditional (hanya platform threads/twitter).
- `orchestrator.ts` `ResearchSessionRow.target_reply_count`.
- `prompt.ts` `ThreadPromptInput.targetReplyCount`; system rule dinamis "EXACTLY {N} replies".
- `development.ts`: resolve default (threads/twitter=6, lainnya=null) dari `sess.target_reply_count`.
- `thread.ts` schema: `.max(5)` → `.max(10)`.

### Issue 5 — Hook kuat di main post
- `prompt.ts`:
  - `ThreadPromptInput` tambah `hooks?: string[] | null`, `keyFacts?: string[] | null`, `uniqueAngle?: string | null`.
  - System rule: "Main post MUST open with a strong hook (angka mengejutkan, pertanyaan provokatif, klaim kontra-intuitif) yang memaksa reader berhenti scroll. 1-2 kalimat pertama = hook."
  - User message: tambah `Hooks (use one as opening)`, `Key facts`, `Unique angle`.
- `development.ts`: pass `topic.hooks`, `topic.key_facts`, `topic.unique_angle` ke `buildThreadPrompt`.

### Issue 6 — Basa-basi di reply afiliasi
- `prompt.ts` system rule:
  - "Saat menempatkan `{{PRODUCT_URL}}` di reply, wajib apit 1-2 kalimat basa-basi yang menjelaskan kenapa produk relevan (natural soft-sell). DILARANG bare link tanpa konteks."
  - "Tempatkan `{{PRODUCT_URL}}` di reply tengah (atau kedua terakhir), BUKAN di main post."

## Risks / Counter-points
- **Issue 3 backstop bisa janggal**: memindahkan token meninggalkan teks basa-basi di posisi lama & reply baru bare. Mitigasi: prompt primer + template backstop. Acceptable.
- **Bilingual placeholder**: link hanya muncul di 1 bahasa (id ATAU en) — pre-existing, out of scope. Di-flag untuk plan terpisah.
- **Schema max(10)**: LLM over-produce bisa lolos. Mitigasi: prompt tegas "EXACTLY {N}".
- **Migration produksi**: nullable, non-breaking. Risiko rendah.
- **Form conditional show**: butuh state platform baru. Kecil, tidak breaking.
- **LLM compliance**: hook + basa-basi + exact N + posisi bergantung prompt. Code backstop hanya jamin posisi & count. Mitigasi: prompt tegas + review manual (`needs_review`).

## Tasks
- [x] Apply migration via MCP `apply_migration`
- [x] Buat plan file ini
- [x] `prompt.ts`: ThreadPromptInput + system rules + user message
- [x] `thread.ts`: schema max(10) + `repositionPlaceholder` + tests
- [x] `development.ts`: pass hooks/facts/angle + targetReplyCount + reposition + fix post_index
- [x] `orchestrator.ts`: ResearchSessionRow.target_reply_count
- [x] `actions.ts`: researchSchema + createResearchSession
- [x] `ContentRequestForm.tsx`: platform state + targetReplyCount input
- [x] `page.tsx`: expand select + parameter card
- [x] messages id/en: i18n keys
- [x] tests: repositionPlaceholder + schema max(10)
- [x] lint + typecheck + test
- [x] commit + push

## Progress Log
- 2026-09-02 11:00:00 — Plan dibuat setelah investigasi 6 isu via explorer agents + verifikasi langsung. Issue #2 dikoreksi: bukan soal CSS, tapi distribusi konten (main padat vs reply ringkas).
- 2026-09-02 11:30:00 — Implementasi lengkap: migration applied (kolom `target_reply_count`), prompt.ts rewrite (hook + ringkas-main + distribusi-detail + basa-basi + posisi afiliasi + exact-N-reply + hooks/facts/angle di user message), thread.ts (schema max(10) + `repositionPlaceholder` dengan backstop basa-basi, preserve surface), development.ts (wiring + fix post_index), orchestrator.ts (ResearchSessionRow), actions.ts (schema+insert), ContentRequestForm.tsx (platform controlled + input conditional), page.tsx (expand select + kartu parameter 14 field), i18n id/en. Tests: +8 test repositionPlaceholder + schema max(10). lint ✓ typecheck ✓ test ✓ (34 file / 221 test).
