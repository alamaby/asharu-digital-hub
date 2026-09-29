# Batch overflow highlight per blok (opsi C)

Date: 2026-09-29 17:15 WIB

## Task
User tanya apakah karakter >500 bisa ditandai warna berbeda. `<textarea>` tak bisa rich-text → opsi C: daftar rincian blok ditolak di bawah preview, full text per blok dengan overflow ditandai merah.

## Key files changed
- `src/components/studio/BatchForm.tsx` — `<ol>` rincian: `text.slice(0, maxPromptLen)` normal + `text.slice(maxPromptLen)` span merah (konvensi `BatchHistory`: `bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300`); ambang `maxPromptLen` ikut config (`?? 500`), bukan hardcode.
- `src/messages/id.json`, `src/messages/en.json` — key baru `overflowHeading` (paritas dijaga).

## Decisions
- Hanya blok ditolak yang dirinci (fokus diagnosis; hindari list 50 item).
- Ringkasan `rejectedBlocks` inline dipertahankan + rincian di bawahnya.
- Blok pendek yang ditolak (<10 char) tetap tampil tanpa span merah (slice kosong).

## Risks
- Snippet full-text 50 blok ekstrem bisa panjang — diterima V1 (kasus nyata: 2–3 blok).

## Verification
- typecheck ✓, lint 0 error (16 warning lama), 1198/119 tests ✓, messages ✓, build ✓.

## Commit
n/a — belum commit/push (keputusan memori #7; menunggu instruksi eksplisit).

## Related
- `.memory/2026-09-29/170000-batch-preview-ux.md` (opsi A)
- `plans/2026-09-29-studio-batch-generate-plan.md`
