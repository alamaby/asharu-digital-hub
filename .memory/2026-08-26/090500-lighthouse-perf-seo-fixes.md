# Lighthouse-driven perf & SEO fixes (/id audit 86/100/100/92)

- **Timestamp:** 2026-08-26 09:05:00
- **Topik:** Menindaklanjuti audit Lighthouse produksi asharu.id/id

## Task / Problem

Skor LH: Perf 86 (<90), SEO 92 (<95). Akar: (a) kanonis ber-trailing slash `/id/` ≠ URL served `/id` → audit canonical gagal; (b) TBT 510 ms — flight payload besar (seluruh katalog i18n ke client) + polyfill legacy (±11 KB) + vendor unused.

## Key Files Changed

- `src/lib/seo/paths.ts` — localizedPathname kini bebas trailing slash (kanonis/hreflang/sitemap konsisten dg URL served)
- `src/lib/i18n/client-messages.ts` (BARU) + test — allow-list namespace untuk NextIntlClientProvider
- `src/app/[locale]/layout.tsx` — provider memakai pickClientMessages()
- `package.json` — browserslist modern (Chrome/Edge ≥105, FF ≥104, Safari ≥15.4, Opera ≥91)
- `src/components/home/SocialLinksGrid.tsx` — aria-label kustom dihapus (accessible name = teks visible; menutup audit label-content-name-mismatch)
- `src/messages/{id,en}.json` — key mati socials.profileAria dihapus
- `src/lib/seo/{sitemap-robots,metadata}.test.ts` & `client-messages.test.ts` (BARU) — penyesuaian +4 test

## Technical / Business Decisions

- Scope pesan client via allow-list eksplisit (pattern resmi next-intl); namespace baru utk client island wajib didaftarkan.
- Target browser modern-only — IE/legacy tidak didukung (trade-off terdokumentasi README §9–10).
- Kanonis tanpa trailing slash sebagai single-source lewat localizedPathname.

## Assumptions / Risks

- Estimasi dampak perf parsial: payload dokumen −10 KB, polyfill −11 KB, eval lebih ringan; bila skor Perf masih <90 setelah re-audit, lever berikutnya = proyeksi single-locale props untuk island (gallery bilingual jadi satu bahasa) + evaluasi backdrop-blur header.
- Namespace lupa didaftarkan akan gagal saat build (SSR throw) — fail-fast by design.

## Blockers / Unresolved

- Re-run Lighthouse oleh user untuk konfirmasi skor baru.

## Verification Performed

- lint ✓ typecheck ✓ test **115/115** ✓ build 27 halaman ✓.
- Smoke lokal: kanonis `https://asharu.id/id` (tanpa slash) ✓ hreflang ikut ✓ dokumen 152.6 KB → **142.1 KB** uncompressed.

## Commit Proposal

```
perf(seo): scope client i18n messages, drop legacy polyfills, fix trailing-slash canonicals
```

## Related Plans / Specs

- Hasil LH /id 2026-08-26 (Perf 86 · A11y 100 · BP 100 · SEO 92)
