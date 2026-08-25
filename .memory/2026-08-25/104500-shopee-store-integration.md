# Integrasi toko Shopee riil

- **Timestamp:** 2026-08-25 10:45:00
- **Topik:** Poin 3 penggantian placeholder — Shopee pertama (poin Tokopedia/TikTok Shop/web-store menyusul)

## Task / Problem

Ganti entri placeholder Shopee dengan toko riil user (shop ID 9268731) sekaligus memenuhi dua keinginan yang tampak bertentangan: URL stabil + atribusi komisi afiliasi.

## Key Files Changed

- `src/data/schemas.ts` — `shopLinkSchema` + opsional `affiliateUrl`, `handle`
- `src/data/shop-links.ts` — Shopee: `url` kanonis `https://shopee.co.id/shop/9268731`; `affiliateUrl: https://id.shp.ee/u1L2EQuP` (komentar refresh/kedaluwarsa); deskripsi dipoles
- `src/components/home/ShopCard.tsx` — href `affiliateUrl ?? url`; rel `sponsored nofollow` hanya saat afiliasi; map aksen `PLATFORM_ACCENT` (shopee = `#EE4D2D` putih); baris handle opsional; aria-label unik `"Kunjungi Toko {nama}"`
- `src/data/data.integrity.test.ts` — +3 assertion (kanonis, affiliate format, URL unik)
- `src/components/home/ShopCard.test.tsx` (BARU, 4 test) — sponsored on/off, fallback href, chip brand, target _blank
- `README.md` — §Mengganti Konten → poin Toko diperluas (semantik affiliateUrl, self-referral warning, refresh shp.ee)

## Technical / Business Decisions

- Riset risal: tanpa embed/widget resmi; simbol/logo penuh berisiko trademark → dipilih aksen warna #EE4D2D + teks nama (identifikasi via teks, color-blind-safe).
- Pola "canonical primary + affiliate fallback" menjaga hub tetap hidup bila short-link afiliasi mati.

## Assumptions / Risks

- Handle vanity belum diisi (field siap; menunggu username dari user).
- Komisi tidak berlaku utk pembelian sendiri (dilarang program) — terdokumentasi README.

## Blockers / Unresolved

- Commit menunggu instruksi user.

## Verification Performed

- lint ✓ · typecheck ✓ · test **102/102** ✓ (+7) · build 33 halaman ✓.

## Commit Proposal

```
feat(shops): integrate real Shopee store with canonical URL and affiliate fallback
```

## Related Plans / Specs

- `plans/2026-08-25-shopee-store-integration.md`
