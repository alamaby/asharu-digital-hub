# Fix RSC Digest 1391377559 — AffiliateImage Client Island

Waktu: 2026-09-15 13:17 (local)

## Insiden
Halaman artikel live crash: `Application error ... Digest: 1391377559`.
Log: `Error: Event handlers cannot be passed to Client Component props`
(`onError: function` pada `<img>`). Penyebab: `onError` dioper di dalam
Server Component `ArticlePublicView` — Next.js tak bisa serialisasi
function prop saat render RSC/ISR.

## Fix
- Baru: `src/components/articles/AffiliateImage.tsx` (`'use client'`,
  ekspor `AFFILIATE_FALLBACK_IMAGE`, guard `dataset.fallback` sekali) +
  `AffiliateImage.test.tsx` (2 test).
- Ubah: `ArticlePublicView.tsx` — panel + inline pakai `<AffiliateImage>`
  (hanya prop serializable); handler + import `SyntheticEvent` dihapus.
  `ArticlePublicView` tetap server; preview review tak tersentuh.

## Pelajaran
- Build hijau ≠ runtime aman untuk halaman ISR tanpa data saat build
  (prerender `[slug]` kosong → crash baru muncul saat ISR berisi data).
- Unit test jsdom pun tak menangkap pelanggaran serialisasi RSC.
- Verifikasi yang menangkap: `next start` lokal + curl halaman artikel
  → HTTP 200, `size-12`=2, `size-16`=2, `ApplicationError`=0.

## Verifikasi
- typecheck ✓, lint ✓, test 610/610 (72 file) ✓, build ✓ tanpa digest.
- Sisa [USER ACTION]: tunggu deploy Vercel → buka artikel live.

## Commit
`fix(artikel): AffiliateImage client island untuk onError fallback`
