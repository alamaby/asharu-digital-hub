# Perbaikan Detail Sesi Riset (3 isu)

Created: 2026-09-09 17:40:00

## Objective
1. Card produk mekanisme 2 di `admin/riset/[sessionId]`; 2. metrik "Sumber & Kontrol" tumpang tindih; 3. "Draf yang dihasilkan" perlu sorting + pagination.

## Scope
- `admin/riset/[sessionId]/page.tsx`, `FixedProductCard`, `ResearchParams`, `draft-list.ts`, i18n `admin.research`

## Milestones
1. Card produk 2. Metrik 3. Draf list 4. Verifikasi + rilis

## Tasks
- [x] T1 `FixedProductCard` display-only (gambar + nama + kategori·merchant + link + chip ASH) + query diperluas + ganti chip header
- [x] T2 Metrik: grid `grid-cols-2 sm:grid-cols-3` + `min-w-0` + `break-words leading-tight` (lepas `lg/xl` 6-kolom penyebab overlap)
- [x] T3 Draf: sortir server-side (terbaru default/terlama/platform/status) + pagination 5/halaman via searchParams ala logs; helper `draft-list.ts` testable; param silang log↔draf dipertahankan
- [x] T4 i18n id/en (fixedProductsTitle + 7 kunci draf) + test (5 baru) — gate hijau 333 tests

## Risks
- Pagination draf server-side (bukan komponen client) — lebih konsisten.
- Deviasi dari rencana plan-mode: pagination server-side (bukan komponen client) — lebih konsisten.

## Progress Log
- 2026-09-09 17:40:00 — Selesai + gate hijau (typecheck, lint, 333 tests); siap commit.

## Notes
Tanpa migrasi (semua kode + i18n).
