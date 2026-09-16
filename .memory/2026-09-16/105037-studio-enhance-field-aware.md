# Studio Enhance Prompt — Field-Aware + Negative Wajib

- Tanggal: 2026-09-16 10:50 (local)
- Plan: `plans/2026-09-16-studio-enhance-field-aware.md`
- Commit: `e48564e` — `feat(studio): jadikan enhance prompt sadar-field dan wajibkan negative prompt`

## Masalah
Tombol "Sempurnakan" di Studio hanya mengirim `prompt` + `negative` + `styleSlug` (sebagai hint
suffix) ke LLM. Preset style, Template subjek, dan Camera angle yang dipilih user tidak pernah
sampai ke LLM; LLM juga boleh membalas `negative_prompt` kosong. Tidak ada mekanisme untuk
memilihkan opsi bagi field yang masih Auto.

## Perubahan Kunci
- `src/lib/image/prompt.ts`
  - `StudioEnhanceInput` diperluas: konteks terpilih (`styleName`, `subjectName/subjectEn`,
    `cameraName/cameraEn`) + `styleOptions`/`subjectOptions`/`cameraOptions`.
  - System prompt `FIELD SELECTION`: LLM hanya boleh memilih slug dari `OPTION LIST`, boleh
    menyarankan ganti field terpilih, `subject_slug` boleh `null` bila draf tanpa manusia,
    `negative_prompt` WAJIB, dan DILARANG menulis wording style/angle ke `image_prompt`
    (worker `studio/worker.ts` yang menempelkan).
  - `parseImagePrompt` membaca `style_slug`/`subject_slug`/`camera_slug` (opsional → worker
    konten tidak terpengaruh).
  - `validateImagePromptContradiction(output, source, { requireNegative })` — default `false`
    agar perilaku worker konten tidak berubah.
- `src/lib/studio/actions.ts`
  - `EnhanceStudioInput` + `subjectSlug`/`cameraSlug`.
  - Fetch `image_style_presets` + `image_subject_templates` + `image_camera_angles` aktif dalam
    satu `Promise.all`; kirim opsi + konteks terpilih ke builder.
  - Anti-halusinasi: slug LLM di luar himpunan aktif → `null` (field tetap Auto), bukan gagal.
  - Gate `{ requireNegative: true }` + retry sekali; masih gagal → error jujur.
  - `maxTokens` 500 → **1000**.
- `src/lib/studio/types.ts`: `StudioEnhanceResult.negative_prompt` wajib + 3 slug nullable.
- `src/components/studio/StudioForm.tsx`: kirim 3 slug; `proposed`/`prevPrompt` menyimpan slug;
  diff 3 picker di panel side-by-side; Terima menerapkan slug + negative; Undo mengembalikan semua.
- `src/messages/{id,en}.json`: key `studio.enhance.autoPicked`.

## Keputusan
1. UI baru berubah saat **Terima** (diff terlihat dulu) — konsisten dengan prompt/negative.
2. LLM **boleh** menyarankan ganti field yang sudah dipilih (dipilih user secara eksplisit).
3. Negative kosong → gate + retry, gagal jujur (tanpa fallback statis).
4. `subject_slug` boleh `null` agar tidak memaksa manusia pada draf non-manusia.

## Bug Laten yang Ikut Diperbaiki
Tombol **Urungkan** sebelumnya hanya dirender di dalam panel usulan, yang tertutup saat Terima —
jadi tidak pernah bisa diklik setelah menerima. Kini Urungkan berada di luar panel (muncul selama
`prevPrompt` ada).

## Verifikasi
- `npm run typecheck` — bersih
- `npm run lint` — bersih (sekaligus hapus directive eslint usang di `prompt.ts`)
- `npm test` — 681/681 lulus (80 file)
- Test baru: opsi slug di builder, konteks terpilih, gate `requireNegative`, picker terisi +
  negative setelah Terima, payload slug terkirim, Undo mengembalikan 3 picker.

## Risiko / Catatan
- Prompt builder kini membawa ~2.2 KB daftar opsi (49 style + 25 camera + 5 subject; slug + nama
  saja) → biaya/latensi naik tipis. `maxTokens` 1000 memberi ruang output JSON yang lebih panjang.
- Style yang sudah dipilih bisa berubah karena keputusan #2 — dimitigasi diff side-by-side.
- `negative_prompt` LLM di-`merge` worker dengan `negative_prompt` style preset (perilaku lama).
