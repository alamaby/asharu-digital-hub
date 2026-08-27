# Affiliate Product Scraper — Shopee Linktree collshp.com/asharu

Created: 2026-08-27 09:00:00

## Objective
Tarik produk afiliasi "Asharu" dari halaman Shopee Linktree `collshp.com/asharu` ("Racun outfit asharu") secara berkala, download & optimasi gambar produk ke lokal, dan perbarui `src/data/affiliate-products.ts` dengan data tervalidasi Zod — menggantikan placeholder.

## Temuan Kunci (pengganti rencana Playwright awal)
Halaman bukan butuh browser automation. Ini Shopee Affiliate **Linktree H5** (Vue SPA) yang memanggil **GraphQL API publik tanpa auth**:

- Endpoint: `POST https://collshp.com/api/v3/gql/graphql?q=<operation>`
- Operation: `getBaseInfoAndLinks` dengan `variables: { urlSuffix: "asharu", pageSize, pageNum, groupId, linkNameKeyword }`
- Response: `landingPageBaseInfo` (name, description, region, affiliateId, groupList[]) + `landingPageLinkList` (`totalCount`, `linkList[]`)
- Setiap `linkList` item: `linkId`, `link` (Shopee short URL `s.shopee.co.id/...`), `linkName`, `image` (`cf.shopee.sg/file/...`), `linkType` (`ITEM`), `groupIds[]`
- `totalCount` saat ini **201** produk; `pageSize=5&pageNum=1` mengembalikan 5 terbaru
- Tidak perlu Playwright/fingerprint — `fetch` Node native sudah cukup (lebih stabil & ringan)

## Scope
- Standalone scraper `scripts/scrape-affiliate.mjs` (ESM, sejalan `optimize-property-images.mjs`)
- Fetch GraphQL lengkap (paginate semua ~201 produk, dedupe)
- Category mapper heuristic (keyword `linkName` + `groupName`) → enum schema
- Image pipeline: download `cf.shopee.sg` → resize max 800px → WebP → `public/images/products/affiliate/`
- Data writer: transform ke `AffiliateProduct[]`, parse/write `src/data/affiliate-products.ts`
- Penjadwalan: GitHub Actions cron (manual/daily)

## Milestones
1. Scraper core (GraphQL fetch + pagination) — ✅ endpoint terverifikasi
2. Category mapper + unit test
3. Image downloader (Sharp)
4. Data writer (transform + merge)
5. Wire npm scripts + GitHub Actions
6. Run & validasi gates

## Tasks
- [x] Verifikasi endpoint GraphQL (`collshp.com/api/v3/gql/graphql`) — response JSON valid, totalCount 201
- [x] Buat `scripts/scrape-affiliate.mjs`: fetch GraphQL, paginate semua produk (default semua, opt-out `--first-page`)
- [x] Buat `scripts/lib/category-mapper.mjs` + `src/lib/affiliate/category.ts` (single source via `category-keywords.json`, whole-word match)
- [x] Buat `scripts/lib/image-downloader.mjs`: https module (system trust store) → Sharp resize→WebP→lokal, dedupe sha256
- [x] Buat `scripts/lib/http.mjs`: shared `postJson`/`getBuffer`, opsi `--insecure` utk jaringan MITM korporat
- [x] Buat `scripts/lib/data-writer.mjs`: transform → `AffiliateProduct[]` → tulis TS valid
- [x] Wire npm scripts `scrape:affiliate`, `scrape:affiliate:dry-run`
- [x] GitHub Actions `.github/workflows/scrape-affiliate.yml` (cron daily 03:00 UTC + workflow_dispatch, commit otomatis)
- [x] Jalankan scrape 12 produk terbaru (keputusan user), images WebP ter-download & data file ter-regenerate
- [x] Gates: lint ✓ typecheck ✓ test 129/129 ✓ build ✓ (dengan dataset 12 produk, 6 featured + 6 non-featured)

## Risks
- **Kunci kategori**: `linkName` campur ID/EN (judul produk Shopee); heuristic bisa salah klasifikasi — mitigasi: pakai `groupName` yang lebih deskriptif bila `groupIds` tersedia
- **Deskripsi lokal**: Shopee tidak sediakan deskripsi terstruktur; `description.id` = `linkName` (judul), `description.en` perlu fallback (judul asli). Schema butuh `{id,en}` — en tanpa terjemahan otomatis.
- **Gambar hotlink/cf.shopee.sg**: butuh headers user-agent/referer; bisa berubah token
- **Shopee short URL kedaluwarsa**: mitigasi — url dipakai apa adanya (berlaku saat ditarik), komentar refresh di data
- **201 produk > limit featured 6**: `featured` dipilih deterministik (mis. featured hanya 6 terbaru, sisanya `false`)
- **Anti-bot/token CDN**: `collshp.com` via SGW/CDN, bisa butuh token/lokasi; terpantau dari header `X-RateLimit-*`
- **Dedupe**: `linkName` bisa duplikat (mouse wireless muncul 2x dgn linkId beda) — dedupe by `linkId` (unik) bukan nama

## Progress Log
- 2026-08-27 09:00 — Diskonfirmasi pendekatan Playwright. Endpoint GraphQL publik ditemukan & terverifikasi.
- 2026-08-27 21:05 — Scraper fetch-native selesai: image pipeline Sharp, category mapper TS+JS (single source JSON), data-writer TS valid, GitHub Actions cron. Belum di-commit.
- 2026-08-27 21:15 — User pilih **12 produk terbaru**. Scrape jalan, 12 WebP ter-download, data file ter-regenerate (6 featured + 6 non-featured). Playwright/unused deps dihapus agar repo ringan. Gates hijau semua.

## Notes
- Nama toko: "Racun outfit asharu" (region id, affiliateId 11300281151). Category default paling masuk akal: `fashion` (outfit shop), tapi judul produk mencakup electronics/home-living/sports-hobby → mapper wajib ada.
- Merchant field di schema dipakai ProductCard (`Store` icon + text). Set merchant ke "Shopee — Racun outfit asharu" atau nama toko Shopee.
- Gambar target path: `public/images/products/affiliate/<linkId>.<ext>` agar unik & tidak bentrok placeholder `product-placeholder-*.svg`.
- `linkType: "ITEM"` = produk; value non-ITEM (jika ada) difilter.