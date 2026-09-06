# Fix tampilan detail riset 165c29c2 (4 temuan)

- Task: (1) key languageLabel mentah, (2) platform "Semua" padahal threads+twitter, (3) ada Dibuat tanpa Selesai, (4) draf tak bedakan platform.
- Akar (data benar, tampilan salah): header detail hanya baca `platform_slug` (null → fallback Semua) padahal pilihan di `platform_slugs`; `languageLabel` tak ada di namespace; `updated_at` tak di-select/ditampilkan; kartu draf tanpa badge platform.
- Key files: `riset/[sessionId]/page.tsx` (resolver platform_slugs + `completedLabel` bila completed + badge platform per draf + `fixedProduct` ganti `match -`), `riset/page.tsx` + `ResearchListClient.tsx` (select + display + filter `platform_slugs`), `messages/id+en.json` (`languageLabel/completedLabel/fixedProduct`).
- Decisions: tanpa migrasi; filter list pakai OR slug-tunggal/array; `match null` = produk tetap (bukan tanpa skor).
- Verification: `typecheck` ✓, `lint` ✓, `272/272` tests ✓ (termasuk parity i18n).
- Commit proposal: `fix(admin): research detail platform language completed draft badges`
