# Scrape Category Fix (Automotive + Others) + DB Sync

Created: 2026-09-02 23:30:00

## Objective
Memperbaiki salah kategori massal produk scrape (fallback `fashion` menelan semua yang tak dikenal — 190/212) dengan kategori baru `automotive` + fallback `others` + perluasan keywords. Sekaligus fix DB sync CI yang selama ini silent-skip ("Supabase env not set — skipping DB sync (file-only)") sehingga DB `affiliate_products` stuck di 201 produk lama (updated_at 2026-08-29).

## Root Cause
1. `mapCategory()` fallback default `fashion` + keyword coverage sempit → katalog baru (212) mengandung item otomotif (Polytron motor listrik, cover jok, tali helm, holder HP motor) & lainnya (casing HP, mesin kopi) tanpa keyword → 90% fashion.
2. GitHub Actions tidak punya secrets `SUPABASE_URL`/`SUPABASE_SECRET_KEY` → scrape CI hanya tulis file, DB tidak pernah ter-update. Research affiliate matching pool baca DB → produk baru tak pernah tersedia.
3. Simulasi fallback=others (keywords lama): fashion 138, OTHERS 52 — Others terlalu besar karena banyak produk legitimate kurang keyword (bra, abaya, bandana, panci, handuk, thumb grip, diecast).

## Fix Design (3 lapis)
1. **Kategori `automotive`** (dicek PERTAMA sebelum electronics — supaya RCCOR "holder Hp ... Handphone ... Spion" → automotive, bukan electronics): keywords motor, sepeda motor, motor listrik, motorcycle, helm, jok motor, cover jok, spion, knalpot, aki, otomotif, pengendara, nmax, pcx, scoopy, vario, mio, vespa.
2. **Fallback → `others`** (label id "Lainnya" / en "Others") — jujur & auditable.
3. **Perluasan keywords**: fashion + (bra, bra, abaya, bandana, babydoll, bergo, jubah, koko, denim, raincoat, jas hujan, blazer); home-living + (panci, wajan, handuk, mesin kopi, espresso, kopi); electronics + (casing, nintendo, switch, thumb grip); sports-hobby + (diecast, miniatur, mobilan); fashion hapus "tersedia".

## Files
- `scripts/lib/category-keywords.json` — automotive + perluasan
- `scripts/lib/category-mapper.mjs` — order automotive-first + fallback default 'others'
- `src/lib/affiliate/category.ts` — ProductCategory + ORDER + fallback default
- `src/data/schemas.ts` — productCategorySchema enum + 'automotive' | 'others'
- `src/messages/{id,en}.json` — categories.automotive + categories.others
- `src/lib/affiliate/category.test.ts`, `src/components/cards/ProductCard.test.tsx`, `src/data/data.integrity.test.ts` — update
- `src/data/affiliate-products.ts` — regenerasi via scrape lokal (kategori fix tanpa tunggu CI)
- `.github/workflows/scrape-affiliate.yml` — env secrets mapping di step scrape
- `scripts/scrape-affiliate.mjs` — `::warning::` annotation saat DB sync skip

## Workstream B — DB Sync
- [USER ACTION] GitHub Settings → Secrets → Actions: `SUPABASE_URL` (https://<ref>.supabase.co asharu-be-production) + `SUPABASE_SECRET_KEY` (service_role, dari Supabase Dashboard → Settings → API).

## Tasks
- [x] git pull (d743340)
- [x] Plan file ini
- [x] keywords + mapper + category.ts + schemas + i18n + tests
- [x] Scrape lokal regenerasi data file + verifikasi distribusi (offline re-map via script; CI upstream 503, re-run nanti)
- [x] Workflow env mapping + script warning
- [x] Gates, commit, push
- [ ] [USER ACTION] set secrets
- [ ] Trigger workflow_dispatch re-run + verify DB via MCP

## Progress Log
- 2026-09-02 23:30:00 — Plan final approved (A1 automotive + others fallback + keyword expansion + DB sync env).
- 2026-09-03 10:00:00 — Implementasi lengkap: keywords (automotive + perluasan 4 kategori + iterasi hijab/renang), mapper order automotive-first + fallback 'others', schemas enum + i18n (Otomotif/Automotive + Lainnya/Others). Data file re-map offline (CI upstream collshp 503; script stdin pakai mapper identik → distribusi final fashion 158, others 17, home-living 14, electronics 12, sports-hobby 6, automotive 5). Workflow env mapping SUPABASE_URL/SUPABASE_SECRET_KEY + ::warning:: annotation. Gates: lint ✓ typecheck ✓ test ✓ (34 file / 240 test, +12 kategori). Menunggu [USER ACTION] set GitHub secrets → trigger re-run → verify DB via MCP.

## Risks
- Keyword "motor" whole-word bisa salah sambar judul fashion — katalog saat ini tidak ada; hasil re-scrape direview distribusinya.
- 'others' tidak akan pernah category_match di research affiliate matching — topik riset pakai kategori konten (berita/tips) yang memang tidak pernah match kategori produk; tidak ada regresi.
- Scrape lokal butuh akses collshp.com + CDN gambar; kalau gagal, fallback: kategori file dibiarkan, CI re-run yang regenerasi.
- Duplikat linktree (Paddy ×3) — di-flag, out of scope.

## Progress Log
- 2026-09-02 23:30:00 — Plan final approved (A1 automotive + others fallback + keyword expansion + DB sync env).
