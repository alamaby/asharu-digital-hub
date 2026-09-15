# Inline Afiliasi Full-Width (Feedback Screenshot)

Waktu: 2026-09-15 13:45 (local)

## Feedback
User (screenshot live): thumbnail inline 48px terlalu kecil. Dijawab:
48px disengaja per plan (tidak mendominasi panel 64px) — lalu user pilih
opsi figure full-width via klarifikasi (opsi lain: 80px / tetap 48px).

## Perubahan
- `ArticlePublicView.tsx`: inline `size-12` kiri-teks → `<figure>`
  full-width di atas teks (`max-h-96 w-full object-contain` agar foto
  produk persegi tampil utuh, tak dominan setinggi cover) + `<figcaption>`
  nama produk bila ada. Fragment ber-key (satu block → 2 elemen).
- Test inline diperkuat: tepat 1 figure + img placeholder + figcaption
  'Kipas'; 3 `<p>`; tak ada `img` dalam `<p>`.

## Verifikasi
- typecheck ✓, lint ✓, test 610/610 ✓, build ✓ tanpa digest.
- Runtime `next start` + curl artikel: HTTP 200, `<figure`=1,
  `size-12`=0, `ApplicationError`=0.

## Commit
`fix(artikel): inline afiliasi jadi figure full-width`
