# 15 Image Style Preset: Manga + Pencil (drawing & sketch)

Tanggal: 2026-09-10 16:50 (local). Plan: `plans/2026-09-10-image-styles-manga-pencil.md`. Keputusan user: prompt_suffix pakai **versi penuh**, dan **semua 15 preset** (3 induk + 12 varian) sekaligus.

## Yang diminta & dikerjakan
Tambah 3 style generate visual: **Manga**, **Pencil Drawing**, **Pencil Sketch** (+ 12 varian).

### Migrasi (submodule `supabase/`, commit `9085397`, applied prod)
`20260910000004_image_styles_manga_pencil.sql`:
- `ADD COLUMN IF NOT EXISTS description text NOT NULL DEFAULT ''` + `negative_prompt text NULL` ke `image_style_presets`.
- Seed 15 baris `INSERT ... ON CONFLICT(slug) DO UPDATE` (idempoten). Verifikasi prod: 15 row aktif.
- Slug: manga, manga-shonen, manga-shojo, manga-slice-of-life, manga-comedy-reaction; pencil-drawing, pencil-drawing-realistic, pencil-drawing-technical, pencil-drawing-soft-lifestyle, pencil-drawing-product-portrait; pencil-sketch, pencil-sketch-rough-concept, pencil-sketch-clean, pencil-sketch-storyboard, pencil-sketch-annotated-designer.
- `prompt_suffix` = style prompt **penuh** dari spec. Varian **mewarisi negative_prompt induknya** (spec tidak memberi negative per-varian — asumsi eksplisit).

### Kode (parent `2ffc3d4`)
- `types.ts`: `ImageStylePreset` + `description?` + `negative_prompt?` (optional, aman utk env pra-migrasi).
- `config.ts`: tak berubah (findStyle/listActive sudah `select '*'` → otomatis dapat kolom baru).
- `prompt.ts`: helper murni `mergeImageNegativePrompts(user, style)` → user + style dipisah koma, `undefined` bila keduanya kosong.
- `worker.ts`: `finalNegative = mergeImageNegativePrompts(row.negative_prompt, target.style.negative_prompt)` diteruskan ke `adapter.generateImage`. Negative tersimpan ke DB tetap hanya user/LLM (`userNegative`), style negative hanya digabung saat generate (tidak dicampur ke kolom DB).
- **Adapter negative support** (audit): pixazo (`negative_prompt` field) + pollinations/bynara (`Avoid:` append) sudah ada. Ditambah **cloudflare** (`negative_prompt` field) + **gemini** (`Avoid:` di text prompt) yang sebelumnya mengabaikan negative.

### UI
- Tak ada perubahan kode: picker Style di `DraftImageCard`/`PostImageControl` baca dinamis `image_style_presets where is_active=true` → 15 preset baru otomatis muncul (nama saja, tanpa deskripsi).

## Verifikasi
- `typecheck` ✓, `lint` ✓, `npm test` 382/382 (50 files; +6 test: 4 merge helper, 1 cloudflare negative, 1 gemini Avoid) ✓, `next build` EXIT=0 ✓.
- Push sempat ditolak (remote `e6acfe2` = refresh data afiliasi, tak terkait) → `git pull --no-rebase` (merge `6089406`, tanpa konflik) → gate tetap hijau → push OK.

## Risks / Catatan jujur
- Full prompt suffix (±60 kata) + scene prompt (≤500 char) di-append; provider image umumnya toleran, tapi ini **belum divalidasi visual** di provider mana pun (15 preset langsung live). Bila hasil menyimpang, nonaktifkan per-slug dari DB/`/admin` tanpa deploy.
- Varian mewarisi negative induk (asumsi, bukan dari spec).
- Gemini memakai `Avoid:` di text prompt (bukan field negative terpisah) — efektivitasnya beda dari pixazo/cloudflare.

## Commit
- Submodule: `9085397` `feat(db): 15 preset style manga/pencil + negative_prompt`
- Parent: `2ffc3d4` `feat(image): 15 style preset manga/pencil + negative merge + adapter support` (merge `6089406` dgn `e6acfe2`)
