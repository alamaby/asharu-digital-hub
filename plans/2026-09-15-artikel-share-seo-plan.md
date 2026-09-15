# Artikel Share + SEO Plan

Created: 2026-09-15 07:00:00

## Objective
Tambah Share-to-social di bawah artikel (WA pertama, Threads, X, Facebook, Telegram, Salin tautan) dengan UTM per channel + lengkapi metadata `article:*` dan `og:image:alt`/`twitter:image`, tanpa merusak RSC/static `<head>`.

## Scope
- item 1: Share buttons bawah artikel publik (`artikel/[slug]`)
- item 2: Metadata article (og:type article, published/modified time, image alt, truncate rapi)
- item 3: i18n id/en + unit test
- Out: ubah skema DB, normalisasi dimensi cover, share-count API, ubah preview admin

## Milestones
1. Helper share + UTM
2. Komponen ShareButtons
3. Integrasi page + metadata
4. Gate + validasi

## Tasks
- [x] Helper `src/lib/seo/share.ts` (withUtm + buildShareLinks) + test
- [x] Komponen `src/components/articles/ShareButtons.tsx` + test urutan & UTM
- [x] Pasang di `artikel/[slug]/page.tsx` bawah ArticlePublicView + i18n id/en
- [x] Perbaiki metadata artikel (type article, times, image alt, truncate batas kata)
- [x] Gate: typecheck + lint + test (+build bila perlu)
- [ ] Validasi manual: FB Debugger, X Card, Threads, WA/Telegram, Rich Results, Lighthouse

## Risks
- Endpoint intent Threads (`threads.net` vs `threads.com`) bisa berubah/redirect — mitigasi: verifikasi manual, fallback salin tautan.
- UTM di URL share tidak merusak SEO karena canonical/OG tetap bersih — jangan tambah UTM ke canonical/og:url.
- Clipboard butuh secure context — wajib fallback.
- Hardcode width/height 1200x630 berisiko salah bila cover bukan rasio itu — tahap 1 hanya alt + twitter:image.

## Progress Log
- 2026-09-15 07:00:00 — Plan dibuat dari hasil audit SEO live + kode; disetujui user (WA pertama, +Threads, bawah artikel, pakai UTM).
- 2026-09-15 12:25:00 — Implementasi selesai: helper share+UTM, ShareButtons (WA→Threads→X→FB→Telegram→Salin, native opsional terakhir), metadata article (og:type article, published/modified time, og+twitter image alt), truncate batas kata, i18n id/en + namespace articles di allow-list client. Gate: typecheck ✓ lint ✓ test 603/603 ✓ build ✓. Temuan: stub navigator.clipboard global rapuh di jsdom 26 (komponen melihat Clipboard asli) → diekstrak ke lib/utils/clipboard.ts (di-mock di test komponen); document.execCommand tak ada di jsdom 26 → fallback di-guard + test lempar saat semua jalur gagal. Sisa: validasi manual (FB Debugger, X Card, Threads, WA/Telegram, Rich Results, Lighthouse).

## Notes
Keputusan user: urutan WA → Threads → X → Facebook → Telegram → Salin; posisi bawah artikel (di page.tsx, bukan di ArticlePublicView agar preview admin bersih); UTM `utm_source={channel}&utm_medium=share&utm_campaign=artikel`. Tetap RSC + satu client island kecil. C2M/TM Forum tidak relevan untuk fitur ini.
