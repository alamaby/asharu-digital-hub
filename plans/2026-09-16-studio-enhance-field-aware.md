# Studio Enhance Prompt — Field-Aware (Style, Subjek, Camera) + Negative Wajib

Created: 2026-09-16 10:37:34

## Objective
Membuat tombol "Sempurnakan prompt" di Studio sadar-field: (1) mengirim Preset style,
Template subjek, dan Camera angle yang dipilih user sebagai input LLM, (2) memilihkan opsi
yang sesuai dan langsung terpilih di UI untuk field yang masih Auto, (3) selalu mengisi
negative prompt.

## Scope
- `src/lib/image/prompt.ts` — builder + parser + gate
- `src/lib/studio/actions.ts` — resolusi opsi DB, sanitasi slug, gate, maxTokens
- `src/lib/studio/types.ts` — hasil enhance diperluas
- `src/components/studio/StudioForm.tsx` — payload, diff side-by-side, Terima/Undo
- `src/messages/id.json`, `src/messages/en.json` — key baru
- `src/lib/studio/actions.test.ts`, `src/components/studio/StudioUi.test.tsx`, `src/lib/image/providers.test.ts`

## Milestones
1. Kontrak & parser (types + prompt.ts).
2. Server (actions.ts: fetch opsi, sanitasi slug, gate negative).
3. UI (payload, diff, auto-pilih saat Terima, Undo).
4. i18n + test + gate hijau + commit/push.

## Tasks
- [x] A. `prompt.ts`: `StudioEnhanceInput` + konteks terpilih + daftar opsi; system prompt pilih slug dari OPTION LISTS; `negative_prompt` wajib; `parseImagePrompt` parse 3 slug; `validateImagePromptContradiction(..., { requireNegative })`.
- [x] B. `actions.ts`: `EnhanceStudioInput` + `subjectSlug`/`cameraSlug`; fetch 3 tabel aktif; resolve terpilih; sanitasi slug halusinasi → null; gate `requireNegative` + retry; `maxTokens` 1000; return slug.
- [x] C. `types.ts`: `StudioEnhanceResult` + `negative_prompt: string` wajib + 3 slug nullable.
- [x] D. `StudioForm.tsx`: kirim 3 slug; `proposed`/`prevPrompt` simpan slug; diff side-by-side; Terima menerapkan semua; Undo mengembalikan semua.
- [x] E. i18n: `autoPicked` (+ key lain lewat label form yang sudah ada).
- [x] F. Test: builder baru, filter halusinasi, gate negative, select terisi setelah Terima, parser lama tetap lolos.
- [x] G. Gate: `npm run typecheck` + `npm run lint` + `npm test` — 681/681 hijau.

## Risks
- Subjek auto bisa memunculkan manusia yang tak diminta → `subject_slug: null` bila draf tak menyiratkan manusia + diff sebelum Terima.
- Style terpilih bisa berubah (keputusan user) → diff side-by-side sebagai pengaman.
- Prompt membengkak ~2.2 KB (49 style + 25 camera + 5 subject) → biaya/latensi naik tipis.
- Suffix style sampai 467 char tetap ditempelkan worker (perilaku lama, bukan regresi).
- Anti-duplikat camera sudah ditangani `appendCameraAngle` (cek substring).

## Progress Log
- 2026-09-16 10:37:34 — Plan dibuat. Keputusan user: (1) subjek boleh `null` bila draf tidak menyiratkan manusia, (2) `maxTokens` enhance dinaikkan ke 1000, (3) LLM boleh menyarankan ganti field yang sudah dipilih, (4) UI menampilkan pilihan saat "Terima", (5) negative kosong → gate + retry, gagal jujur.
- 2026-09-16 10:50:00 — Implementasi selesai (A–F). Gate hijau: typecheck OK, lint OK, 681/681 test lulus.
  - `prompt.ts`: builder field-aware (`OPTION LIST`, konteks terpilih, negative wajib, larangan menulis style/angle ke prompt), `parseImagePrompt` baca 3 slug, gate `requireNegative`.
  - `actions.ts`: fetch 3 tabel aktif paralel, sanitasi slug halusinasi → null, retry gate negative, `maxTokens` 1000.
  - `StudioForm.tsx`: diff 3 picker di panel side-by-side, Terima menerapkan slug, **Undo dipindah ke luar panel usulan** agar tetap bisa diklik setelah Terima (bug laten: tombol Undo sebelumnya hanya ada di dalam panel yang ikut tertutup saat Terima).
  - Catatan: key i18n `negativeGate`/`pickStyle`/`pickSubject`/`pickCamera` tidak jadi ditambah (tidak ada pemakaiannya); hanya `autoPicked` yang terpakai untuk label "Auto" pada diff.
- 2026-09-16 10:52:00 — Commit + push (aturan repo: auto commit+push setelah gate hijau).

## Notes
- Tanpa migrasi DB — `image_style_presets`, `image_subject_templates`, `image_camera_angles` sudah punya kolom yang dibutuhkan.
- Proposal commit: `feat(studio): make enhance prompt field-aware and always fill negative prompt`.
