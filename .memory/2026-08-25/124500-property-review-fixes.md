# Property review fixes + ads.txt

- **Timestamp:** 2026-08-25 12:45:00
- **Topik:** Remediasi 7 temuan review migrasi properti + penambahan ads.txt

## Task / Problem

F1 kartu riil salah berlabel "Contoh listing"; F2/F3 kebocoran locale (fasilitas & alt galeri selalu ID); F4 kartu abaikan kontak per-properti; F5 fokus tidak kembali dari lightbox; F6 test galeri dijanjikan tapi absen; F7 export mati; + owner minta ads.txt AdSense.

## Key Files Changed

- `public/ads.txt` (BARU) — `google.com, pub-4082765898994990, DIRECT, f08c47fec0942fa0`
- `src/components/cards/PropertyCard.tsx` — exampleNotice dihapus; WA = kontak pertama pre-filled text, fallback env
- `src/app/[locale]/properties/[slug]/page.tsx` — fasilitas `[locale]`
- `src/components/cards/PropertyGallery.tsx` — useLocale utk semua alt/aria; invokerRef → restore focus saat tutup
- `src/data/properties.ts` — getPropertyBySlug dihapus
- `src/messages/{id,en}.json` — key exampleNotice mati dihapus
- Test: `PropertyGallery.test.tsx` BARU (3) + integrity published-list (1)

## Technical / Business Decisions

- Accessible name tombol thumbnail = alt terlokalkan (identik dg img).
- Kartu WA pre-filled memakai template sama dgn halaman detail.

## Assumptions / Risks

- "Contoh listing" tersisa hanya sbg string katalog di RSC payload (tidak dirender) — key lalu dihapus agar bersih.

## Blockers / Unresolved

- Commit menunggu instruksi user.

## Verification Performed

- lint ✓ typecheck ✓ test **111/111** ✓ build 27 halaman ✓.
- Smoke: `/ads.txt` HTTP 200 text/plain konten persis; katalog tanpa label contoh; kartu membawa WA 6281324498379.

## Commit Proposal

```
fix(properties): close migration review findings and add ads.txt
```

## Related Plans / Specs

- `plans/2026-08-25-property-review-fixes.md`
