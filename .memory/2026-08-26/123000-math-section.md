# Section Belajar Matematika — hub → math.asharu.id

- **Timestamp:** 2026-08-26 12:30
- **Topik:** Tambah section homepage + footer link ke PWA Asharu Math

## Task / Problem
Promosikan aplikasi anak kelas 2 SD (penjumlahan/pengurangan bersusun) yang sudah live di math.asharu.id sebagai bagian dari digital hub.

## Key Files Changed
- `src/data/math-app.ts` — config typed (tagline, title, bullets, url, cta)
- `src/lib/analytics/events.ts` + test — event ke-7 `click_math_app`
- `src/messages/{id,en}.json` — namespace `home.math` + `footer.mathLink`
- `src/app/[locale]/page.tsx` — section #belajar-math (badge Baru/New, kalkulator, bullets, CTA tracked)
- `src/components/layout/Footer.tsx` — link eksternal ke math.asharu.id
- `README.md` — arsitektur, struktur folder, quality gates, trade-offs

## Technical / Business Decisions
- Subdomain tetap di repo terpisah (asharu-math/Vite); hub hanya link keluar dengan `noopener noreferrer`.
- Badge & warna accent konsisten palet hub; teks bilinggual siap.

## Assumptions / Risks
- math.asharu.id sudah live (HTTP 200) — CTA tidak akan 404.

## Blockers / Unresolved
- Commit menunggu instruksi.

## Verification Performed
- lint ✓ typecheck ✓ test 115/115 ✓ build 27 halaman ✓
- Paritas i18n id/en ✓

## Commit Proposal
```
feat(home): add Learn Math section linking to math.asharu.id
```

## Related Plans / Specs
- `plans/2026-08-26-math-section.md`
