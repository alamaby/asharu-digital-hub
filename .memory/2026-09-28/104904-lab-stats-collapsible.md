# LabStats per-run chart jadi collapsible (default collapsed)

Tanggal: 2026-09-28 10:49

## Tugas

Di layar `/lab`, statistik per-run (token, latensi, kecepatan) dibuat collapsible dengan default tertutup, atas request user.

## File kunci

- `src/components/lab/LabStats.tsx` — 3 blok chart per-run (`tokensPerRun`, `latencyPerRun`, `speedPerRun`) dibungkus `<details>` native tanpa atribut `open` (collapsed by default), `<summary>` = judul chart existing + `cursor-pointer`. Tabel `sr-only` token ikut masuk ke dalam `<details>`. KPI grid, RangeTabs, legend, `LabRankTables` tidak diubah.
- `src/components/lab/LabUi.test.tsx` — test baru: 3 judul chart ada di `closest('details')` dan `hasAttribute('open') === false`; KPI heading tetap tampil.

## Keputusan

- `<details>` native (pola yang sudah ada di `LabCompareGrid.tsx:165` + `LabHistory.tsx:307`), bukan `useState` + conditional render — DOM tetap ada saat closed (aksesibilitas screen reader aman, test existing tak patah).
- Tanpa key i18n baru: pakai judul chart existing sebagai teks summary.
- Tanpa "ingat pilihan user" antar reload (native details; bila perlu persist, butuh `useState` + `localStorage` — belum diminta).
- Scope: hanya 3 chart di LabStats; `MetricBox` di `LabCompareGrid` (hasil submit) tidak di-collapse (user tidak mengonfirmasi ikut collapse → tetap tampil).

## Verifikasi

- Gate: typecheck ✓, lint ✓ (0 error, 12 warning pre-existing), test ✓ 1174/1174.
- Commit `4419c1d` pushed.
- Catatan kecil: `getAllByRole('details')` tidak cocok di versi testing-library yang dipakai (0 hasil) → test memakai `getAllByText(label)[0].closest('details')` alih-alih.

## Usul commit

`feat(lab): make per-run token/latency/speed stats collapsible, default collapsed`
