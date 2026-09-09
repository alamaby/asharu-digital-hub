# Style review: rename UGC + 28 preset baru

Task: (1) `UGC POV` → `UGC` agar POV diatur dari teks prompt; (2) tambah 28 style (editorial … scale-comparison) di layar konten review.

## Perubahan
- Migrasi submodule `20260909000003_image_styles_batch2.sql`: UPDATE `ugc-pov` (display `UGC`, suffix tanpa frasa first-person POV; slug tetap — FK history aman) + INSERT 28 preset re-runnable. Submodule `ceb8c13`, pushed.
- Tanpa perubahan kode (picker + worker DB-driven).
- Aturan teks: umum `no text, no watermark`; 7 style text-based `minimal short text labels allowed` (keputusan user).

## Verifikasi
- MCP production: 34 preset aktif; `ugc-pov` → `UGC`; sampel `editorial-magazine`, `scale-comparison` ada.
- `npm run typecheck` ✓, `npm run lint` ✓.

## Commit
- submodule `supabase@ceb8c13` — `feat(image): rename UGC + 28 preset style review konten`
- parent: `feat(image): 28 preset style review + rename UGC`
