# Riset 9a24c768 gagal developing — gate produk-tetap salah klasifikasi transient

Tanggal: 2026-09-13 14:30 (local). Plan: `plans/2026-09-13-riset-9a24c768-developing-fixed-product-gate.md`.

## Task
Riset `9a24c768-07ba-498d-a290-6280bbceb0da` (`mechanism='dua'`) `failed` dengan
`error_message='developing: produk tetap tidak aktif/hilang'` setelah 6/8 draf
sukses. Minta: RCA + fix preventif + resume sisa pasangan.

## RCA (validasi MCP supabase-asharu-be-production)
- Gate `development.ts` lama menyatukan 3 kasus (join kosong, semua nonaktif,
  tanpa konfigurasi) menjadi satu `failed` tanpa log; produk `is_active=true`
  baik saat insiden maupun kini → pembacaan kosong = transient.
- Akar transient terkonfirmasi post-resume: Supabase Gateway Timeout (504)
  intermiten di tick cron (net._http_response: `advancePendingSessions: Gateway
  Timeout` 07:00–07:20 UTC berulang); `fetchFixedProducts` lama menelan error
  via destructuring `data=null` → gate lama salah klasifikasi.
- Kegagalan final tidak menulis log + tidak update `updated_at` (forensik
  menyesatkan).

## Key files
- `src/lib/research/development.ts` — `classifyFixedProducts` (murni, 3 kasus),
  `FIXED_PRODUCT_DEFER_LIMIT=5`/24j (cap via hitung log warn), gate transient =
  defer + return pending (bukan failed), pending eksak dari ID terdaftar
  (`estimatePendingPairsExact`; 0 pending = tidak defer), semua UPDATE failed
  kini set `updated_at`.
- `src/lib/content/actions.ts` — `advanceToDevelopment`: validasi produk tetap
  aktif utk mekanisme dua sebelum advance + snapshot ke log audit.
- `scripts/scrape-affiliate.mjs` — guard soft-delete: abort bila removal > 20%
  aktif (override `--allow-mass-deactivation`).
- `src/lib/research/development.test.ts` — +9 test (klasifikasi 5 kasus,
  pending eksak, defer limit).

## Decisions (user)
1. Cap retry transient: YA (5/24j → failed permanen).
2. Resume sesi (bukan full retry) — topik & 6 draf dipertahankan.
3. Guard scrape 20% OK.

## Verification
- Gate: typecheck ✓ lint ✓ 536/536 test ✓.
- Commit `3fafebe` pushed (origin/main). Deploy Vercel otomatis.
- Resume via MCP (UPDATE status, setara `resumeSession`); cron tick 07:25 UTC
  `{"advanced":1}` → 2 draf sisa dibuat → sesi `completed`, 8/8 draf
  `needs_review`. Selama tick 504 (07:00–07:20) sesi TETAP `developing`
  (bukan false-failed) → bukti fix bekerja.

## Risks / open
- Sesi bisa macet `developing` ≤ 25 menit saat 504 beruntun — by design (cron
  retry); cap 5/24j mencegah zombie.
- 1 draf OVER-LIMIT (290/280 char) ber-flag `llm_meta.over_limit` + log warn —
  edit sebelum posting (perilaku by-design).
- Follow-up opsional: retry `advancePendingSessions` 1x utk Gateway Timeout
  (pola `fetchOrderedImageKeys` insiden f10d58e2).

## Commit proposal
`fix(research): gate produk-tetap developing bedakan transient vs nonaktif + cap deferral 5/24j` (`3fafebe`)

## Related
- Plan `plans/2026-09-13-riset-9a24c768-developing-fixed-product-gate.md`.
- Insiden serupa: `.memory/2026-09-12/204500-studio-queue-refresh-flux-negative.md`
  (Gateway Timeout transient, fail-loud + retry manual).
