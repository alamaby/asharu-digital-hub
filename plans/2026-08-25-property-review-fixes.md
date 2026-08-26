# Property Review Fixes + ads.txt

Created: 2026-08-25 12:30:00

## Objective
Menutup 7 temuan review migrasi properti (F1–F7) dan menambahkan `ads.txt` di web root sesuai permintaan owner (Google AdSense, pub-4082765898994990).

## Scope
- F1: hapus `exampleNotice` dari kartu properti
- F2: fasilitas render `[locale]`
- F3: PropertyGallery alt/locale-aware
- F4: kartu WA memakai kontak pertama properti (fallback env)
- F5: lightbox mengembalikan fokus ke pemanggil
- F6: test galeri + helper published
- F7: hapus export mati `getPropertyBySlug`
- Baru: `public/ads.txt`

## Tasks
- [x] public/ads.txt (konten persis dari owner)
- [x] PropertyCard: tanpa exampleNotice; WA = contacts[0] pre-filled → fallback env
- [x] [slug]: facility[locale]
- [x] PropertyGallery: useLocale + alt[locale]; fokus kembali ke pemanggil
- [x] properties.ts: hapus getPropertyBySlug
- [x] Test: PropertyGallery (buka/Esc/panah/fokus) + getPublishedProperties; key mati exampleNotice dihapus dari messages
- [x] Gates hijau + smoke /ads.txt + memory

## Risks
- Perubahan kecil & terlokalisasi; tidak menyentuh skema/data

## Progress Log
- 2026-08-25 12:30 — Disetujui ("tambahkan ads.txt … setelah itu lanjut").
- 2026-08-25 12:45 — Selesai. F1–F7 tertutup + ads.txt (HTTP 200 text/plain, konten persis). Kartu properti kini memakai WA kontak pertama pre-filled (fallback env), tanpa label contoh; fasilitas & galeri locale-aware; lightbox mengembalikan fokus; export mati & key messages mati dihapus. Test baru: galeri ×3 + published-list ×1 → **111/111** ✓; build ✓ lint ✓ typecheck ✓.

## Notes
- ads.txt hanya file statis publik; tidak ada integrasi kode iklan pada iterasi ini.
