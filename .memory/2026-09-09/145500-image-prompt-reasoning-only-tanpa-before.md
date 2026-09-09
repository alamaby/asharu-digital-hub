# Image prompt: hapus strategi before + reasoning-only cover

Task: (1) Hapus `visual_strategy: before` dari reasoning image prompt; (2) setelah development, cover post utama langsung jalankan reasoning otomatis TANPA generate image — user cek prompt dulu; (3) reasoning/enhance wajib tambahkan detail source yang missed dari draf user.

## Perubahan
- `src/lib/image/prompt.ts` — `VisualStrategy = 'after' | 'bridge'`; hapus `PAIN_KEYWORDS`/`AFTER_WORDS_*`/`PAIN_REFLECTION_EN`/`detectPainKeywords`; gate jadi sanity ringan (panjang prompt/negative + strategi valid; legacy `before`/`custom` tetap lolos); auto prompt + enhance: aturan DETAIL COMPLETENESS / MISSED-DETAIL COMPLETION (tambah detail source yang hilang, jangan buang detail draf).
- `src/lib/image/worker.ts` — `processOneImage`: baris pending tanpa prompt → reasoning LLM saja → `prompt_ready` (tanpa render); baris ber-prompt (custom) → generate seperti biasa.
- `src/lib/image/actions.ts` — docs enqueue (kosong = reasoning, terisi = generate).
- `src/lib/image/types.ts` + review `[draftId]/page.tsx` — status `prompt_ready`.
- `DraftImageCard`/`PostImageControl` — badge violet, prefill prompt saat mount, notice "draf prompt siap", label tombol berbasis ada/tidaknya visual.
- `providers.test.ts` — gate baru (tanpa before, legacy before→after, custom lolos).
- Migrasi submodule `20260909000001_image_prompt_ready_status.sql` (CHECK + `prompt_ready`).

## Keputusan / Asumsi
- `hook_keywords` dipertahankan sebagai kata kunci visual umum (bukan pain).
- Alur prompt-first berlaku umum untuk baris kosong (cover auto + manual reply kosong) — konsisten.
- Gate `_sourceText` dipertahankan (kompatibilitas caller) dengan eslint-disable.

## Verifikasi
- `npm run typecheck` ✓, `npm run lint` ✓, `npm test` ✓ (324 tests, 41 files).
- Deploy: aplikasikan migrasi `f5bca60` di DB DULU (widen CHECK), baru deploy kode — worker menulis `prompt_ready`.

## Commit
- submodule `supabase@f5bca60` — `feat(image): status prompt_ready untuk reasoning-only cover tanpa auto-generate`
- parent: `feat(image): reasoning-only cover tanpa auto-generate, hapus strategi before`
