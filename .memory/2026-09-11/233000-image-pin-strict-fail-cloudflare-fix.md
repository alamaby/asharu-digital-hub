# Image pin strict-fail + fix base_url Cloudflare

- Laporan user: pilih Cloudflare Flux di Studio → antrean tampil `auto · auto` → hasil jadi `pixazo / flux-1-schnell`.
- Verifikasi prod via MCP `supabase-asharu-be-production` (read-only SELECT + apply 1 UPDATE migrasi):
  - `user_image_generations` hanya 3 baris: 2 req `cloudflare/@cf/...flux-1-schnell` → aktual `pixazo/flux-1-schnell` (ready); 1 req pixazo → pixazo.
  - Key Cloudflare aktif 1, `usage_count=0` (tak pernah sukses); Pixazo 63x. `image_studio_config` defaults NULL (= waterfall).

## Key files changed

- `supabase/migrations/20260911000004_fix_cloudflare_image_base_url.sql` (submodule `3878f6b`, applied prod 16:25 UTC, verified SELECT) — `image_providers.base_url` cloudflare `/ai/v1` → `/ai`.
- `src/lib/studio/worker.ts` — `StudioTarget.pinned`; pin user (provider_id/model_id) strict-fail (throw bila nonaktif/mismatch, single-shot tanpa fallback lintas-provider); `llm_meta` += `pinned, requested_provider_id, requested_model_id`.
- `src/lib/image/config.ts` + `src/lib/image/worker.ts` — `ResolvedImageTarget.pinned`; override review manual strict-fail; sesi/global/waterfall tetap fallback (`pinned:false`); `llm_meta.pinned` audit.
- Display antrean: `src/lib/image/requested-label.ts` (baru) + `StudioHistory`/`StudioPageClient` (key `studio.history.metaQueued` id/en) + `ImageHistoryCarousel` + `DraftImageCard`/`PostImageControl` (`modelOptions`).
- Tests: `src/lib/studio/worker.test.ts` (baru, 4), `requested-label.test.ts` (baru, 7), `config.test.ts` (+3), `StudioUi.test.tsx` (+1), `ImageHistoryCarousel.test.tsx` (+1).

## Technical / business decisions

- Strict-fail untuk pin manual (keputusan user): pin gagal → `failed` + pesan asli, bukan Pixazo diam-diam. Trade-off: `failed` visible naik bila provider pilihan down — disengaja demi kejujuran.
- Akar masalah = `base_url` salah (regresi seed `20260907000003` vs fix LLM `20260829000006`), BUKAN key/account: live probe 1x (script sementara, sudah dihapus) `/ai/v1` → 400 "No route"; `/ai` → 200 + base64 338KB.
- Session/global model config: tak ada penulis UI (kolom warisan, prod NULL) → tetap fallback, bukan strict.

## Assumptions / risks

- 2 baris req-cloudflare lama tetap tercatat pixazo (data historis tidak diubah).
- `markImageModelFailure` hanya untuk 401/403/429 — 400 Cloudflare kemarin tidak menaikkan failure_count (konsisten: model tetap aktif).
- Pin strict + `base_url` benar → generate Cloudflare berikutnya harus `ready` dengan slug cloudflare.

## Blockers / unresolved

- Tidak ada. Follow-up opsional: backfill audit `llm_meta.pinned` untuk baris lama; guard seed `base_url` cloudflare di test integritas.

## Verification

- Live probe Cloudflare prod: `/ai/v1` → HTTP 400; `/ai` → HTTP 200 + image base64 (key dari Vault saat runtime, tanpa log secret; script dihapus).
- Gate: `typecheck` ✓, `lint` ✓ (0 err), `npm test` 479/479 ✓ (61 file), `next build` ✓ 61 halaman.
- Re-run `typecheck+lint` setelah stage akhir ✓ (aturan AGENTS.md anti-insiden 10 Sep).
- Diff pre-commit diinspeksi: tanpa secret.

## Conventional Commit

- `fix(image): pin provider strict-fail + label antre request` (parent `01bd7f6`, pushed; submodule `3878f6b` pushed dulu)

## Related

- `plans/2026-09-11-studio-generate-image.md`, `.memory/2026-09-11/123500-studio-generate-image.md`
- Laporan user 11 Sep 2026 (studio placeholder auto → pixazo flux padahal pilih cloudflare flux).
