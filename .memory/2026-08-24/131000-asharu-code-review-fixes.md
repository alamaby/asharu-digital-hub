# Code review fixes — Asharu Digital Hub

- **Timestamp:** 2026-08-24 13:10:00
- **Topik:** Remediasi 9 temuan review (tracking lengkap, mobile nav, breadcrumb, consent gating, polish)

## Task / Problem

Review pasca-implementasi menemukan 4 temuan P1 dan 5 temuan P2/P3; semua ditutup dalam satu iterasi.

## Key Files Changed

- `src/lib/analytics/events.ts` — +`trackPageView`; `GtagFunction` dilonggarkan di level wire, API publik tetap typed.
- `src/components/analytics/PageViewTracker.tsx` (BARU) — page_view per navigasi client, Suspense-wrapped, skip path sama.
- `src/components/analytics/ViewPropertyTracker.tsx` (BARU) — fire-once per mount di detail properti.
- `src/app/[locale]/layout.tsx` — tracker dipasang; ConsentBanner digate `enabled={Boolean(env.gaMeasurementId)}`.
- `src/components/analytics/ConsentBanner.tsx` — prop `enabled`.
- `src/app/[locale]/properties/[slug]/page.tsx` — ViewPropertyTracker + kontak WA terlacak (`link_position: property-detail`) + breadcrumb pakai `propertyPage.listTitle`.
- `src/messages/{id,en}.json` — key `propertyPage.listTitle`.
- `src/components/layout/MobileNav.tsx` — hapus `relative` wrapper (panel melekat ke header sticky; bug lebar 44px).
- `src/components/home/ContactCTA.tsx` — aria-label eksplisit, attr mati dihapus.
- `src/components/layout/NavMenu.tsx` — dead condition dihapus.
- `src/app/apple-icon.tsx` (BARU), `manifest.ts` +lang, README event table.

## Technical / Business Decisions

- GtagFunction wire-type dilonggarkan agar page_view bisa dikirim; ketatnya tipe dipertahankan di helper publik.
- Gating banner via prop (bukan kondisi layout saja) supaya unit-testable.
- apple-icon via ImageResponse — tanpa aset biner di repo.

## Assumptions / Risks

- jsdom tidak menguji geometri MobileNav → QA manual 320px masih direkomendasikan sebelum launch.

## Blockers / Unresolved

- Tidak ada. Data placeholder & env produksi tetap open item dari entry sebelumnya.

## Verification Performed

- lint ✓ · typecheck ✓ · test **93/93** ✓ (+9 baru: trackPageView ×2, PageViewTracker ×4, ViewPropertyTracker ×2, banner-gating ×1) · build ✓ 33 halaman statis (apple-icon route baru).
- Smoke prod: `<link rel="apple-touch-icon">` & favicon ada; manifest `"lang":"id"`; kode `page_view` ada di chunk layout; payload detail memuat ViewPropertyTracker.

## Commit Proposal

```
fix: close code-review findings (page_view/view_property tracking, consent gating, mobile nav anchor)
```

## Related Plans / Specs

- `plans/2026-08-24-asharu-code-review-fixes.md`
- `plans/2026-08-24-asharu-digital-hub-build.md`
