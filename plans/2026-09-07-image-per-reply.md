# Perluasan: Visualisasi Per-Reply (kecuali Afiliasi)

Created: 2026-09-07 09:40:00

## Objective

Setelah 1 cover auto dari post utama terbukti tampil (draft 243d6cad, Pixazo flux-1-schnell), user bisa memutuskan tiap reply non-afiliasi ikut punya visualisasi. Opt-in manual per-post di review; reply afiliasi tetap pakai gambar produk. Berlaku untuk Threads dan Twitter (nanti: worker Twitter media saat tersedia).

## Scope

- `content_draft_images.post_index` (0 = main, 1..n = replies) + unique partial `(draft_id, post_index) WHERE selected`.
- `image_gen_defaults.image_mode` (`cover-only` | `per-reply-opt-in`) + override sesi/draft.
- Worker + `generateDraftImage(postIndex)` + `selectDraftImage(postIndex)`: LLM prompt dari teks post itu (bukan main).
- UI: thumbnail + tombol per reply di `ContentDraftCard` (skip index afiliasi); `DraftImageCard` tetap cover.
- Social: `queue.image_urls jsonb` per index → `publishThreadChain(images[])`; fallback cover/opener bila kosong.

## Milestones

1. Skema + plan file ini.
2. Worker + actions + types `post_index`.
3. UI per-reply + social `image_urls`.
4. Gate + push.

## Tasks

- [x] Plan file ini dibuat
- [x] Migrasi `20260907000006_image_per_reply.sql` (post_index + image_mode + image_urls + selected_image_id per index → ganti ke selected per post_index) — applied production
- [x] `types.ts` + `worker.ts` + `actions.ts` dukung post_index
- [x] `ContentDraftCard` thumbnails per reply + `DraftImageCard` tetap cover
- [x] Social route/actions kirim `image_urls[]`
- [ ] Tests per-reply (enqueue/select/worker prompt dari post target)
- [x] Gate hijau (typecheck + lint + 300 tests) + commit submodule dulu + push
  - Submodule `0162d3d feat(image): per-reply post index plus image mode` (pushed).
  - Parent `3cc11ed feat(image): opt-in per-reply visuals except affiliate` (pushed).

## Risks

- Biaya/latensi ~7x per draft bila semua reply di-generate → opt-in manual + `image_mode` kill-switch global.
- Cron 1/tick lambat untuk 7 gambar → antrean per post diproses bertahap, tak block cover.
- Post diedit setelah image dibuat → prompt basi; mitigasi: tampilkan staleness (updated_at vs image.created_at) tahap lanjut.
- Twitter belum ada worker media → kolom `image_urls` generik per platform_slug, dipakai saat worker Twitter siap.

## Progress Log

- 2026-09-07 09:40:00 — Plan perluasan dibuat (opt-in per-reply, skip afiliasi).
- 2026-09-07 — Implementasi + push. Catatan: `image_mode` default `cover-only`, jadi tombol per-reply baru aktif setelah global/sesi/draf diset `per-reply-opt-in`.

## Notes

- Skema eksisting 1-selected-per-draft (`uq_draft_images_selected ON (draft_id)`) harus diganti `(draft_id, post_index)`; `drafts.selected_image_id` tetap cover (post 0) agar social lama kompatibel.
- Standar: bukan billing/telekomunikasi → tanpa C2M/TM Forum; konsisten config-by-table repo.
