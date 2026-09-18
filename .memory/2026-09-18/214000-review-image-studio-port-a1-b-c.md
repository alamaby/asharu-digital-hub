# Review Konten: Port Pola Studio — Fase A1+A2+B+C (field-aware enhance + auto-enhance + slug persist)

Created: 2026-09-18 21:40 (local time)

## Task

Lanjutkan `plans/2026-09-18-review-image-studio-port-plan.md`: implementasi milestone A–C (A1 field-aware enhance, A2 negative gate, B auto-enhance toggle, C slug persist + undo).

## Files Changed

- `src/lib/image/prompt.ts` — `EnhancePromptInput` tambah 7 field opsional; `buildEnhancePromptMessages` kirim selected fields + OPTION LISTS; system prompt tambah FIELD SELECTION + Negative REQUIRED + larangan embed style/angle ke image_prompt.
- `src/lib/image/actions.ts` — `EnhancePromptResult` tambah `style_slug/subject_slug/camera_slug`; `enhanceImagePrompt` terima `subjectSlug?/cameraSlug?`, validasi ke tabel aktif, fetch display_name+EN, lempar ke builder, kembalikan 3 slug (whitelist → null bila invalid); `generatePostImage` terapkan auto-enhance internal (fallback prompt asli bila gagal); `ImageEnqueueOverride` tambah `autoEnhance?: boolean`.
- `src/components/content/DraftImageCard.tsx` — state `proposed`+`prevPrompt` tambah 3 slug; `acceptProposed` set slider style/subject/camera; tombol Urungkan pindah keluar blok proposed; toggle auto-enhance ON default (cover).
- `src/components/content/PostImageControl.tsx` — pola sama; toggle auto-enhance OFF default (reply).
- `src/messages/id.json` + `en.json` — key `content.review.autoEnhanceLabel`.

## Decisions

- Auto-enhance pakai bucket `enhance_image_prompt` yang sama (30/jam), bukan bucket baru. Toggle default ON cover, OFF reply (hemat kuota).
- Undo persisten: snapshot 3 slug ikut disimpan di `prevPrompt`, dikembalikan saat klik Urungkan. Tombol dipindah ke baris action agar tetap tersedia setelah Terima.
- `enhanceImagePrompt` throw pada slug tak dikenal (sama dengan `suggestImagePrompt`). Slug hasil LLM divalidasi ke himpunan aktif via `activeSlugs` → null kalau tidak match (anti halusinasi).
- Positive gate: `validateImagePromptContradiction` panggil dengan `{ requireNegative: true }` untuk review enhance (Studio juga pakai ini).

## Verification

- Gate: `npm run typecheck` ✓, `npm run lint` ✓ (hanya warning pre-existing `ApplyCoverBanner.tsx`), `npm test` 899 passed ✓ (1 flaky unrelated test hijau di run ini), `npm run build` ✓.
- Commit `48c3656`, push ke `main`.

## Open Items

- Test unit `actions-enhance.test.ts` belum ditulis (A1 sub-task terakhir).
- Milestone D (Compose LLM-merge + fallback), E (snapshot final_prompt), F (picker model LLM), G (collapse/expand section) belum dimulai.

## Commit

`48c3656 feat(review): port field-aware enhance + auto-enhance toggle + slug persist`
