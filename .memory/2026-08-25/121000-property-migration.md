# Migrasi properti: 3 landing page owner → hub

- **Timestamp:** 2026-08-25 12:10:00
- **Topik:** Poin 3 lanjutan — properti riil menggantikan placeholder

## Task / Problem

Migrasi konten 3 LP sibling (kamarasan/buahbatu/sukaraja) ke hub dengan styling hub; harga publik; kontak per-properti; video tur; listing published-only.

## Key Files Changed

- `src/data/schemas.ts` — propertySchema +14 field (hidden, price{amount,label,note}, gallery, video, facilities, highlights, nearbyPlaces(travelTime localized), extraSpecs, faq, contacts, mapsUrl, addressFull, disclaimers, availability enum)
- `src/data/properties.ts` — rewrite: 3 entri riil featured + 6 lama hidden; helper getPublishedProperties/getPublishedPropertyBySlug
- `scripts/optimize-property-images.mjs` (BARU) — sharp webp optimizer + manifest dimensi
- `public/images/properties/<slug>/*` (43 file), `public/videos/properties/<slug>/tur-unit.mp4`
- `src/components/cards/PropertyGallery.tsx` (BARU, client lightbox Esc/arrow/focus)
- `src/app/[locale]/properties/[slug]/page.tsx` — redesign landing-grade + JSON-LD Offer/FAQPage/Breadcrumb + og images galeri
- `src/components/cards/PropertyCard.tsx` — price label/note + badge occupied
- catalog/home/sitemap → published-only
- messages id/en: 14 key baru namespace property (waPrefill, occupied, headings, lightbox…)
- README §Properti diperbarui

## Technical / Business Decisions

- Harga & alamat lengkap kini boleh tampil: sumber = LP publik milik owner (kebijakan no-fake tetap; hidden entries tanpa price dijaga test).
- Sukaraja ternyata occupied → field `availability` + badge UI + JSON-LD SoldOut.
- Foto kamarasan 46MB→4.8MB webp ≤1400px; urutan galeri eksterior-dulu via mapping manual.
- EN copy migrated = terjemahan asisten → wajib review owner sebelum launch.

## Assumptions / Risks

- Watermark foto kamarasan diasumsikan milik user.
- Video 4.6MB memakai bandwidth CDN Vercel free.

## Blockers / Unresolved

- Commit menunggu instruksi user.

## Verification Performed

- lint ✓ typecheck ✓ test **106/106** ✓ build **27 halaman** ✓.
- Smoke prod: harga Rp650 tampil; Offer 650000000 IDR; sukaraja occupied badge+SoldOut+FAQPage+WA 6282131611961; catalog 0 leak placeholder; home featured OK.

## Commit Proposal

```
feat(properties): migrate three owner landing pages into the hub
```

## Related Plans / Specs

- `plans/2026-08-25-property-migration.md`
