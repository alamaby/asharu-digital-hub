# Kartu Contoh Hasil Pipeline Sintetis di Homepage

Tanggal: 2026-10-10 22:44 WIB
Status: Selesai

## Task / Masalah
Implementasi sesuai plan `plans/2026-10-10-contoh-hasil-pipeline-homepage.md`:
1. W1: Menambahkan 18 key i18n bilingual `home.sample.*` ke `src/messages/id.json` dan `src/messages/en.json`.
2. W2: Membuat server component `src/components/digital-hub/SampleFlowCard.tsx` yang merender 4 tahap (brief → draf → review → siap terbit) dari fixture sintetis (`fixtures.ts`) dengan guard `DEMO_IS_SYNTHETIC` dan badge "Data contoh sintetis".
3. W3: Menyisipkan `<SampleFlowCard />` di homepage (`src/app/[locale]/(public)/page.tsx`) di bawah seksi kartu pipeline riset (#mesin-riset).
4. W4: Verifikasi penuh gerbang kualitas (typecheck, lint, test, build, validate:messages) dan commit/push.

## Berkas Penting yang Diubah
- `src/messages/id.json` — Penambahan 18 key `sample` di namespace `home`.
- `src/messages/en.json` — Penambahan 18 key `sample` di namespace `home`.
- `src/components/digital-hub/SampleFlowCard.tsx` — Komponen kartu contoh alur sintetis server-side.
- `src/app/[locale]/(public)/page.tsx` — Import dan penempatan `<SampleFlowCard />` di homepage.
- `plans/2026-10-10-contoh-hasil-pipeline-homepage.md` — Checklist dan progress log implementasi.

## Keputusan Teknis & Bisnis
- Server component murni (nol client bundle overhead, nol `'use client'`).
- Teks data fixture sintetis ditampilkan verbatim (tidak diterjemahkan terpisah untuk mencegah drift dari fixture sumber kebenaran), dengan chrome UI bilingual dan caption EN menyatakan "(in Indonesian)".
- Guard `DEMO_IS_SYNTHETIC` dipasang fail-safe untuk menjamin data yang ditampilkan murni ilustrasi/sintetis.
- Semantik HTML rapi: `<ol>` 4 langkah dengan `<h3>` untuk sub-langkah di dalam seksi `#mesin-riset` ber-H2 dari `SectionHeading`.

## Asumsi & Risiko
- Asumsi: Fixture `fixtures.ts` tetap stabil sebagai sumber data simulasi alur UMKM.
- Risiko: Perubahan struktur `ReviewSeverity` atau fixture field di masa mendatang ditangkap langsung oleh TypeScript compile gate (`Record<ReviewSeverity, string>`).

## Blocker / Open Item
- Tidak ada blocker.

## Verifikasi yang Dilakukan
- `npm run validate:messages` → PASS (id/en parity valid).
- `npm run typecheck` → PASS (0 error).
- `npm run lint` → PASS (0 error, 0 warning).
- `npm test` → PASS (135 files, 1345 tests).
- `npm run build` → PASS (130 pages generated).

## Proposed Conventional Commit
`feat(web): add synthetic sample flow card to homepage pipeline section`

## Link Terkait
- Plan: `plans/2026-10-10-contoh-hasil-pipeline-homepage.md`
