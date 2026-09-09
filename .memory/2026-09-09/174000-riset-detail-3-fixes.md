# Detail sesi riset: card produk mekanis-2 + metrik + draf sortir/paginasi

Task: (1) Card produk tetap mekanisme 2 di `admin/riset/[sessionId]`; (2) metrik "Sumber & Kontrol" tumpang tindih (screenshot); (3) "Draf yang dihasilkan" sorting + pagination.

## Perubahan
- `src/components/admin/FixedProductCard.tsx` (baru, display-only): thumbnail + nama + kategori·merchant + link + chip ASH; query `session_products` diperluas (image/category/merchant/url); chip header diganti card.
- `src/components/admin/ResearchParams.tsx`: grid metrik `grid-cols-2 sm:grid-cols-3` + `min-w-0` + `break-words leading-tight` (akar overlap: `lg/xl` 6-kolom di card ⅓ lebar).
- Draf: sortir server-side via searchParams (`draftSort`: terbaru default/terlama/platform/status) + pagination 5/halaman (`draftPage`), pola sama seperti logs; helper `src/lib/research/draft-list.ts`; param silang log↔draf dipertahankan; `created_at` ditambah ke select.
- i18n `admin.research` id/en: `fixedProductsTitle` + 7 kunci draf.
- Test: `FixedProductCard.test.tsx` (2) + `draft-list.test.ts` (3).

## Keputusan / Asumsi
- Pagination server-side (bukan komponen client) — konsisten pola logs, URL shareable.
- Card produk tanpa aksi Ganti/Hapus (produk mekanis-2 fixed by design).

## Verifikasi
- `npm run typecheck` ✓, `npm run lint` ✓, `npm test` ✓ (333 tests, 44 files).

## Commit
`fix(riset): card produk mekanis-2, metrik anti-overlap, draf sortir+paginasi`
