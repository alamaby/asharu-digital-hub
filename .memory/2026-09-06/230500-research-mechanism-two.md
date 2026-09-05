# Mekanisme riset kedua (product-first)

- Task: mekanisme 2 — user pilih 1-2 produk dulu; riset + konten disiapkan agar sisipan natural. Radio wajib default satu.
- Keputusan: 2 produk → 2 draf per topik-platform (batas 1 produk/draf); ramping discovery→shortlist→developing (skip verifying+scoring, shortlist dipertahankan); produk sama lintas platform; draf lama arsip 'all'.
- Key files:
  - `supabase/migrations/20260906000006_research_mechanism_two.sql` (applied prod): `sessions.mechanism`, `session_products` (RLS admin+owner), `drafts.product_id`.
  - `state-machine.ts`: `discovering→awaiting_selection` (+test).
  - `prompts.ts`/`discovery.ts`: blok PRODUK TETAP + aturan sisipan natural + query turunan produk.
  - `orchestrator.ts`: `fetchFixedProducts`, cabang dua di discovering + runStage.
  - `development.ts`: `pairKey` 3-kunci, loop produk, tanpa seleksi acak (fixed_pick, skor null), produk nonaktif → gagal jujur, insert `product_id`.
  - `ContentRequestForm.tsx` + `actions.ts`: radio + picker multi maks-2 + validasi 1-2 + simpan `session_products`.
  - `AffiliateProductPicker.tsx`: mode multi + konfirmasi.
  - Admin detail: badge Mekanisme 2 + chip produk; preview affiliate dilewati untuk dua.
  - i18n: 9 form + 2 picker keys (id+en).
- Risks: tuning natural butuh iterasi (follow-up); biaya ~2x draf (diimbangi tanpa skoring + chunking); cabang mechanism di 3 titik.
- Verification: `typecheck` ✓, `lint` ✓, `271/271` tests ✓ (+1).
- Commit proposal: `feat(research): product-first mechanism two`
