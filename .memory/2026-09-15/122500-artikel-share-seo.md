# Artikel Share + Metadata Article SEO

Waktu: 2026-09-15 12:25 (local)

## Tugas
Audit SEO halaman artikel + tambah Share-to-social (WA pertama, Threads, X,
Facebook, Telegram, Salin tautan, native opsional terakhir) di bawah artikel
dengan UTM per channel + lengkapi metadata `article:*`.

## File kunci
- Baru: `src/lib/seo/share.ts` (+`share.test.ts`), `src/components/articles/ShareButtons.tsx` (+test), `src/lib/utils/clipboard.ts` (+test)
- Ubah: `src/app/[locale]/(public)/artikel/[slug]/page.tsx` (metadata article + `<ShareButtons>` bawah `ArticlePublicView`), `src/lib/seo/metadata.ts` (opsi `article` + `truncateAtWord`), `src/lib/i18n/client-messages.ts` (+`articles`), `src/messages/id.json`+`en.json` (5 key share), `src/lib/seo/metadata.test.ts`
- Plan: `plans/2026-09-15-artikel-share-seo-plan.md`

## Keputusan
- URL share = canonical + `utm_source={channel}&utm_medium=share&utm_campaign=artikel`; canonical/og:url tetap bersih tanpa UTM.
- Share dipasang di `page.tsx` (bukan `ArticlePublicView`) agar pratinjau review admin bersih.
- Tahap 1 tanpa `og:image:width/height` (cover tak terjamin 1200x630); hanya `alt` + `twitter:image`.
- JSON-LD `Article` tidak diubah (BlogPosting/mainEntityOfPage ditunda fase 2).
- `copyToClipboard` diekstrak ke modul (bukan stub global) + melempar bila semua jalur gagal; tombol salin hanya tampilkan status sukses bila benar tersalin.

## Asumsi / risiko
- Intent Threads `threads.net/intent/post?text=` perlu verifikasi manual (migrasi ke threads.com).
- Timeout 1 test ContentRequestForm di run penuh = flake tak terkait (lolos run ulang; 603/603 hijau).
- `plans/2026-09-14-deployment-storage-besar.md` (M) + `plans/2026-09-14-lihat-riset-langsung-detail-admin.md` (??) milik sesi paralel — tidak di-stage/di-commit.

## Verifikasi
- `npm run typecheck` ✓, `npm run lint` ✓, `npm test` 603/603 (71 file) ✓, `npm run build` ✓
- Sisa manual [USER ACTION]: FB Sharing Debugger, X Card Validator, post Threads, kirim WA/Telegram, Rich Results Test, Lighthouse SEO ≥95.

## Commit
`feat(artikel): share-to-social + metadata article SEO`

## Terkait
- Plan: `plans/2026-09-15-artikel-share-seo-plan.md`
