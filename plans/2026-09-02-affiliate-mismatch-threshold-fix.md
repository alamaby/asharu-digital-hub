# Affiliate Mismatch — Minimum Threshold & Pool Fix

Created: 2026-09-02 14:30:00

## Objective
Memperbaiki affiliate mismatch: topik "Harga BBM Pertamina Naik" (kategori: berita) cocok ke ASH-155 "Piyama Anak" (kategori: fashion) dengan score 3 — piyama tidak relevan dengan BBM. Lebih baik tanpa afiliasi daripada afiliasi yang menyesatkan.

## Root Cause Analysis

**Data faktual:**
- Topik: "Harga BBM Pertamina Naik" (kategori: `berita`)
- Produk terpilih: ASH-155 "Piyama Anak" (kategori: `fashion`)
- match_score: 3, keyword_overlap: 1, category_match: false, pool_size: 20

**`src/lib/research/affiliate.ts:72`** — `bestScore = -1` initial:
```ts
let bestScore = -1;
// ...
if (score > bestScore) { bestScore = score; best = product; }
```
Karena `bestScore` mulai dari -1, score 0 (tidak ada match sama sekali) tetap menang. Test di `affiliate.test.ts:81` ("picks first when all scores are 0") mendokumentasikan perilaku ini secara eksplisit — dan itu adalah bug, bukan fitur.

**Dua akar masalah:**
1. **Tidak ada minimum threshold** — score 0 atau 3 (lemah) tetap dipilih. Tidak ada penolakan "better no affiliate than wrong affiliate".
2. **Pool bias ke fashion** — 181 dari 201 produk aktif adalah `fashion`. 20 terbaru hampir semua fashion. Topik kategori `berita` tidak akan pernah category-match. Pool 20 terbaru tidak mewakili kebutuhan topik lintas-kategori.

## Fix Design

### Fix A — Minimum threshold (PRIMARY)
`src/lib/research/affiliate.ts` — tambah konstanta `MIN_ACCEPTABLE_SCORE`. Setelah loop, jika `bestScore < MIN_ACCEPTABLE_SCORE`, return null (no affiliate):

```ts
const MIN_ACCEPTABLE_SCORE = 6;
// ... loop ...
if (!best || bestScore < MIN_ACCEPTABLE_SCORE) return null;
```

**Kenapa 6?**
- category match penuh = 50 (high)
- partial category = 25
- keyword overlap = 3 per keyword
- Threshold 6 = butuh ≥2 keyword overlap, ATAU 1 partial category match.
- Score 3 (=1 keyword) → ditolak. Score 0 → ditolak.
- Saat null, `development.ts` sudah handle (promptProduct=NONE, injection=[], draft tanpa link). Reviewer bisa swap manual via picker.

### Fix B — Perluas pool (SECONDARY)
`affiliate.ts:40` — `POOL_SIZE = 20` → `50`. Meningkatkan peluang produk relevan masuk pool. Tidak membantu untuk kategori yang tidak ada (mis. automotive untuk topik BBM), tapi membantu topik fashion/elektronik yang produk relevannya di rank 21-50.

### Fix C — Update tests
`affiliate.test.ts:81` — test "picks first when all scores are 0" → ubah jadi "returns null when all scores are below threshold":
```ts
it('returns null when all scores are below threshold', async () => {
  // ... same setup ...
  const result = await selectAffiliateProduct(client, { topic: 'katak ungu neon' });
  expect(result).toBeNull();
});
```
Tambah test baru: "returns null when best score is 3 (single keyword overlap)".

## Tasks
- [x] `affiliate.ts`: tambah `MIN_ACCEPTABLE_SCORE = 6`, return null saat di bawah threshold
- [x] `affiliate.ts`: `POOL_SIZE` 20 → 50
- [x] `affiliate.test.ts`: update test "all scores 0" → expects null; tambah test score-3-rejected; fix scored_from_pool_size test
- [x] lint + typecheck + test
- [x] commit + push

## Risks / Counter-points
- **Threshold terlalu agresif**: topik dengan match lemah tapi masih relevan (mis. 1 keyword overlap) ditolak. Counter: keyword_overlap=1 dengan kata umum (mis. "anak") bukan indikator relevansi kuat. Lebih aman tolak. Reviewer bisa swap manual.
- **Pool 50 masih insufficient**: 181/201 fashion — topik non-fashion tetap sulit match. Tapi ini masalah katalog (perlu tambah produk lintas-kategori), bukan algoritma. Di-flag: pertimbangkan scrape produk automotive/grocery/health untuk topik berita-tips.
- **Draft tanpa affiliate**: draft tetap valid (tanpa link). Tidak ada revenue dari draft itu, tapi kredibilitas terjaga. Trade-off revenue vs kredibilitas — kredibilitas menang untuk brand long-term.
- **Counter**: mungkn user ingin selalu ada affiliate (revenue). Tapi piyama di thread BBM justru kontra-produktif (reader kabur, tidak klik, trust turun). Tanpa affiliate lebih baik.

## Progress Log
- 2026-09-02 14:30:00 — Plan dibuat setelah investigasi: 181/201 produk fashion, pool 20 terbaru hampir semua fashion, bestScore=-1 → score 0/3 menang. Topik berita tidak akan match. Threshold 6 + pool 50.
- 2026-09-02 14:25:00 — Implementasi: MIN_ACCEPTABLE_SCORE=6, POOL_SIZE 20→50, update 3 test (all-0→null, score-3→null, scored_from_pool_size topic agar ≥6). lint ✓ typecheck ✓ test ✓ (34 file / 228 test).
