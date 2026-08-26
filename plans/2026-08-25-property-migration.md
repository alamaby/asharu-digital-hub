# Migrasi 3 Landing Page Properti ke Asharu Hub

Created: 2026-08-25 11:25:00

## Objective
Migrasi konten tiga landing page properti milik owner (repo sibling) ke digital hub: halaman detail landing-grade dengan styling hub, harga publik, kontak WA per-properti, dan listing yang hanya menampilkan properti terverifikasi.

## Scope
- Sumber: landing-page-rumah-kamarasan (MD copy tervalidasi), buah-batu-park-landing-page (property-data.ts terstruktur), landing-page-rumah-toko-sukaraja (index.html statis)
- Slug kanonical: dijual-rumah-kamarasan-bandung-timur · dijual-apartemen-studio-buah-batu-park-bandung · disewakan-rumah-toko-sukaraja-jatiwangi-majalengka
- Routing: /id/properti/<slug> & /en/properties/<slug>; /properties/* auto→EN via middleware
- Keputusan: harga publik + Offer JSON-LD; kontak WA per-properti pre-filled; video tur ikut (no autoplay); placeholder lama hidden

## Milestones
1. Skema diperluas + helper publish
2. Migrasi aset media (optimasi sharp)
3. Data 3 entri riil + hide placeholder
4. Detail page redesign + galeri lightbox
5. List/home/sitemap memakai published-only
6. Test
7. Docs + gates

## Tasks
- [x] Schema: hidden, price(+amount), gallery, video, facilities, highlights, nearbyPlaces, extraSpecs, faq, contacts, mapsUrl, addressFull, disclaimers, availability
- [x] Helper getPublishedProperties() + getPublishedPropertyBySlug()
- [x] Script optimasi media + salin aset 3 properti (+manifest dimensi)
- [x] properties.ts: 6 placeholder hidden; 3 entri riil lengkap (id/en)
- [x] Komponen PropertyGallery (client lightbox keyboard)
- [x] Redesign [slug]/page.tsx (hero/galeri/spesifikasi/highlights/fasilitas/nearby/video/faq/disclaimer + JSON-LD RealEstateListing+Offer+FAQPage+Breadcrumb)
- [x] PropertyCard menampilkan price.label bila ada + badge occupied
- [x] Catalog/home/sitemap published-only
- [x] Tests (integrity published=3, helper via sitemap guard, jsonld offers/SoldOut)
- [x] README + gates hijau + memory

## Risks
- Foto kamarasan ber-watermark — diasumsikan watermark milik owner (dipakai di LP lama); konfirmasi bila bukan
- Terjemahan EN buatan asisten — ditandai review-before-launch
- Video 4,6 MB memakai bandwidth CDN Vercel free
- Insiden write salah target sudah pernah terjadi — verifikasi tiap write besar via diff/test

## Progress Log
- 2026-08-25 11:30 — Disetujui user ("lanjut"); mulai eksekusi.
- 2026-08-25 12:10 — Eksekusi selesai end-to-end. Skema +14 field; media dimigrasi (kamarasan 24 webp 46MB→4.8MB via sharp; sukaraja 6 webp; buahbatu 13 foto+poster+video 4.6MB); 3 listing riil published (kamarasan Rp650jt · buahbatu Rp165jt · sukaraja Rp1,3jt/bln **occupied**→SoldOut+badge), 6 placeholder hidden. Detail page landing-grade: hero harga, CTA WA per-kontak pre-filled, galeri lightbox keyboard, specs/highlights/fasilitas/nearby/video/FAQ details, JSON-LD Offer+FAQPage. Temuan saat migrasi: sukaraja terisi penghuni → field `availability` baru. Gates: lint ✓ typecheck ✓ test **106/106** ✓ build **27 halaman** ✓. Smoke prod: harga/galeri/Offer/occupied/FAQPage/leak-guard semua ✓. Belum di-commit.

## Notes
- Semua data bersumber owner (LP lama dipublikasikan sendiri) → harga & alamat lengkap boleh tampil; prinsip no-fake-data tetap.
- Repo sibling tidak diubah.
