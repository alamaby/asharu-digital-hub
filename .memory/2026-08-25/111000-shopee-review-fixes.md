# Shopee review fixes — identitas riil & a11y link

- **Timestamp:** 2026-08-25 11:10:00
- **Topik:** Menutup 5 temuan (F1–F5) review integrasi Shopee

## Task / Problem

Nama toko masih placeholder, deskripsi mengklaim "koleksi lengkap", aria-label menimpa suffix tab-baru di screen reader, komentar data kontradiktif, test rapuh.

## Key Files Changed

- `src/data/shop-links.ts` — name id=en = **"Asharu x Nopi.NY"** (owner-confirmed 2026-08-25); deskripsi dilunakkan; komentar konsolidasi (verified marker + catatan refresh affiliateUrl)
- `src/components/home/ShopCard.tsx` — hapus `aria-label`; sr-only nama toko DI DALAM link → accessible name = "Kunjungi Toko {nama} (membuka di tab baru)"
- `src/data/data.integrity.test.ts` — +guard identitas nama
- `src/components/home/ShopCard.test.tsx` — refactor: query via accessible-name lengkap; heading assertion; chip selector tetap

## Technical / Business Decisions

- Accessible name dibentuk dari konten DOM (bukan atribut) agar suffix newTab ikut terbaca SR dan tidak ada duplikasi teks.
- Proper noun kolaborasi tidak dilokalkan (id = en).

## Assumptions / Risks

- Handle vanity masih kosong — isi bila username tersedia.

## Blockers / Unresolved

- Commit menunggu instruksi user.

## Verification Performed

- lint ✓ · typecheck ✓ · test **103/103** ✓ · build 33 halaman ✓.
- Insiden dipulihkan & terverifikasi: plan sempat salah-tulis ke `shop-links.ts` (write salah target); file direkonstruksi penuh, `git diff` hanya menampilkan perubahan intended, integritas 11/11 hijau.

## Commit Proposal

```
fix(shops): use verified Shopee store identity and fix link accessible names
```

## Related Plans / Specs

- `plans/2026-08-25-shopee-review-fixes.md`
