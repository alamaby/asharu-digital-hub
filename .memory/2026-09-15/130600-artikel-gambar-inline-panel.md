# Artikel Gambar Produk Inline + Panel Fallback

Waktu: 2026-09-15 13:06 (local)

## Tugas
Eksekusi plan `2026-09-15-artikel-gambar-produk-afiliasi.md` (T0–T5):
thumbnail produk inline di paragraf afiliasi + fallback placeholder panel.

## Temuan diagnosis (penyebab laporan user)
- Commit `dfa8127` hanya berisi file plan (docs), nol perubahan kode —
  Progress Log plan sendiri tertulis "implementasi belum dimulai".
- Scrape CI hijau memang mengisi data: 240/240 produk aktif kini Storage
  (dulu 0/240); panel live sembuh otomatis via data. Inline tak mungkin
  muncul karena `ArticleMarkdownBody` by-design teks-only.
- Live HTML terverifikasi: panel `<img size-16 affiliate-images>` ada,
  `size-12`/`product-placeholder` = 0.

## File kunci
- Ubah: `src/components/articles/ArticlePublicView.tsx` (FALLBACK_IMAGE +
  `handleAffiliateImgError` guard dataset + panel selalu render img +
  `ArticleMarkdownBody({md, affiliate?})` + thumbnail `size-12` di
  paragraf ber-URL afiliasi, h2 dikecualikan)
- Ubah: `src/components/articles/ArticlePublicView.test.tsx` (+5 test:
  panel placeholder, onError sekali tanpa loop, inline tepat 1 img,
  h2 tak bergambar, negatif tanpa URL)
- Plan: `plans/2026-09-15-artikel-gambar-produk-afiliasi.md` (checklist
  T0–T5 + progress log)

## Keputusan
- Ikuti plan persis (plain `<img>`, placeholder `-1.svg`, tanpa ubah CSP).
- `affiliate` opsional di `ArticleMarkdownBody` agar caller/test lama lolos.
- Placeholder SVG lokal masih ada (DB-only cutover tak menghapusnya).
- Preview review ikut sembuh otomatis via reuse (tanpa edit
  `ArticleDraftCard`).

## Verifikasi
- typecheck ✓, lint ✓, test 608/608 (71 file; +5 baru, 0 ubah existing) ✓,
  build ✓ (SSG artikel aman).
- Sisa [USER ACTION] T6: buka artikel live pasca-deploy → panel + inline
  thumbnail; warning CSP Shopee expected sampai Storage penuh (kini sudah
  penuh); ISR 3600 regenerasi otomatis.

## Commit
`fix(artikel): gambar produk inline paragraf + fallback panel`
