# 15 Image Style Presets: Manga + Pencil

Created: 2026-09-10 14:35:00

## Objective
Tambahkan 15 preset generate visual (3 induk + 12 varian) dengan prompt penuh dan negative prompt/style-aware merging.

## Scope
- Migrasi non-destruktif kolom `description` + `negative_prompt` dan seed 15 preset.
- Type `ImageStylePreset`, resolver, worker prompt assembly.
- Helper merge negative prompt + unit tests.
- Gate, apply production migration, commit submodule lalu parent, memory.

## Milestones
1. Migration + production verification.
2. Code + tests.
3. Gate + commit/push.

## Tasks
- [x] Tulis dan apply migrasi 15 preset.
- [x] Tambahkan field style ke type/config.
- [x] Merge negative prompt di worker.
- [x] Tambahkan helper tests.
- [x] Jalankan gate dan verifikasi DB.
- [ ] Commit/push + memory.

## Risks
- Full prompt suffix + scene prompt dapat mendekati batas provider; user memilih versi penuh.
- Negative prompt varian mewarisi induk karena spec tidak memberi negative per-varian.
- Provider adapter: pixazo/pollinations/bynara sudah dukung negative; cloudflare (negative_prompt) + gemini (Avoid:) kini juga diteruskan.

## Progress Log
- 2026-09-10 14:35:00 — Build mode aktif; inspeksi schema dan gaya migrasi selesai.
- 2026-09-10 16:45:00 — Migrasi 15 preset ditulis + applied prod (verified via SELECT 15 rows). Type `ImageStylePreset` +description/negative_prompt. Worker merge user+style negative (`mergeImageNegativePrompts`). Cloudflare/Gemini kini meneruskan negative. 6 test baru. Gate hijau: typecheck, lint, 382 tests, `next build` EXIT=0.

## Notes
- `finalPrompt = imagePrompt + ', ' + style.prompt_suffix`.
- Negative final = user negative + style negative, keduanya dipertahankan.
