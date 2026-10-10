# Diagram Pipeline Riset: Mermaid di README dan Konektor Panah Homepage

Tanggal: 2026-10-10 22:08 WIB
Status: Selesai

## Task / Masalah
Implementasi sesuai plan `plans/2026-10-10-diagram-pipeline-riset.md`:
1. D1: Menampilkan flowchart alur kerja pipeline riset 6-langkah di `README.md` menggunakan Mermaid native GitHub.
2. D2: Menambahkan panah konektor alur visual dekoratif (`aria-hidden`) antar kartu pipeline pada seksi `#mesin-riset` di homepage (`src/app/[locale]/(public)/page.tsx`), dengan arah vertikal (`ArrowDown`) di mobile dan horizontal (`ArrowRight`) di layar desktop (`lg:`).

## Berkas Penting yang Diubah
- `README.md` — Sisipan diagram flowchart `flowchart LR` Mermaid (A→B→C→D→E→F) dengan rincian teknis singkat (Tavily, temp 0,2, 8 kriteria skor, draf bilingual, review manusia, terbit).
- `src/app/[locale]/(public)/page.tsx` — Penambahan konektor `ArrowDown` dan `ArrowRight` dengan `aria-hidden="true"` pada elemen `<li>` langkah 01–05.
- `plans/2026-10-10-diagram-pipeline-riset.md` — Pembaruan progress log dan checklist selesai.

## Keputusan Teknis & Bisnis
- Menggunakan Mermaid native di README tanpa dependensi paket npm apa pun di Next.js runtime.
- Di homepage, konektor murni CSS + Lucide Icon existing (`ArrowDown`, `ArrowRight`) berstatus `aria-hidden="true"` sehingga tidak merusak semantik aksesibilitas `<ol>` (urutan tetap disampaikan via nomor 01–06 dan tag list).
- Nol penambahan string i18n baru.

## Asumsi & Risiko
- Asumsi: GitHub me-render blok Mermaid secara native di tampilan web repository.
- Kosmetik wrap: Pada breakpoint menengah (`sm:`) baris yang melipat ke baris berikutnya tetap menggunakan panah bawah/kanan default; diterima sebagai batas dekoratif sesuai kesepakatan plan.

## Blocker / Open Item
- Tidak ada blocker.

## Verifikasi yang Dilakukan
- `npm run validate:messages` → PASS (`message catalogs valid`).
- `npm run typecheck` → PASS (0 error).
- `npm run lint` → PASS (0 error, 0 warning dengan `--max-warnings=0`).
- `npm test` → PASS (135 files, 1345 tests passed).
- `npm run build` → PASS (130 pages generated).
- Scan secret diff → 0 leak.

## Proposed Conventional Commit
`feat(web): add research pipeline diagram and flow connectors`

## Link Terkait
- Plan: `plans/2026-10-10-diagram-pipeline-riset.md`
