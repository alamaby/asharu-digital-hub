# Timeline visualisasi (antre/proses/selesai)

- Task: panel Visualisasi pendukung tak menunjukkan kapan masuk antrean, diproses, selesai.
- Key files:
  - `src/components/content/ImageHistoryCarousel.tsx` — timeline per slide: `Masuk antrean: {created_at detikan}` + baris status (`Menunggu diproses worker…` / `Draf prompt siap:` / `Selesai dibuat:` / `Terakhir dicoba:` + `updated_at`) + `· percobaan {n}` bila attempts > 0. Zona waktu user via props `locale/timeZone` (format `formatDateTimeSeconds`).
  - Threading: review page (`locale`, `tz`) → `ContentDraftCard` → `DraftImageCard` + `PostImageControl` → carousel. Berlaku cover + per-reply + artikel.
  - `src/components/content/ImageHistoryCarousel.test.tsx` — +1 test timeline.
- Decisions: label Indonesia hardcoded mengikuti preseden carousel (belum i18n); detik ditampilkan agar antre vs selesai yang beda menit terlihat.
- Verification: typecheck ✓, lint ✓, carousel 13/13 ✓, full suite 577/578 (1 flaky timeout `ContentRequestForm` non-admin — lolos 8/8 saat run ulang file, tak terkait), build ✓ (63 pages).
