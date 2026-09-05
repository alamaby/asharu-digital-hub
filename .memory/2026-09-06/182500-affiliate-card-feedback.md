# Affiliate card: feedback working/success/error

- Task: setelah pilih produk pengganti tak ada feedback jelas (proses/selesai/berhasil/gagal).
- Root cause: `AffiliateProductCard` hanya ubah tombol jadi `...`, tanpa pesan sukses, error mentah teknis.
- Key files: `src/components/content/AffiliateProductCard.tsx` (state `notice` working/success per aksi + nama produk, `error` ramah + `<details>` teknis; `role=status/alert`; picker `onSelect` kini bawa nama produk), `src/components/content/AffiliateProductPicker.tsx` (teruskan `name_id`), `src/messages/id.json` + `en.json` (11 keys `status*`).
- Decisions: banner inline + nama produk; error ramah (`rate_limit`/`not found`/default) + detail teknis collapsible; nama dari data picker (bisa basi — diterima, hasil akhir dari server).
- Verification: `typecheck` ✓, `lint` ✓, `263/263` tests ✓.
- Commit proposal: `feat(review): clear working success error feedback for affiliate actions`
