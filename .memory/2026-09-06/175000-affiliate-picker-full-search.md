# Affiliate picker: search ke semua produk

- Task: di review draf, daftar awal tetap 20 produk terbaru, tapi search keyword harus mencari ke SEMUA produk dan tampilkan yang cocok.
- Root cause: `AffiliateProductPicker.tsx` fetch sekali `limit(20)` lalu filter client-side — produk lama tak pernah muncul.
- Key files: `src/components/content/AffiliateProductPicker.tsx` (initial 20 terbaru di-cache; query non-kosong → DB `or ilike` nama_id/nama_en/kategori/kode/merchant, `limit 30`, debounce 300ms, escape `%_\\`, guard race via request id; label scope di bawah search), `src/messages/id.json` + `en.json` (keys `pickerLatest/pickerAllResults/pickerSearching`).
- Decisions: substring sederhana + limit 30 (sesuai pilihan user); tanpa `pg_trgm`/index baru (212 rows, ilike cukup); RLS `affiliate_read` sudah izinkan baca browser → tanpa migrasi; hilir (`swap`/`regen`) by-id tanpa batas pool → tak perlu ubah.
- Risks: +1 query per pencarian (debounced) — ringan; urutan hasil = recency bukan relevansi (relevansi tetap dihitung server saat swap/regen).
- Verification: `typecheck` ✓, `lint` ✓, `263/263` tests ✓ (termasuk messages parity).
- Commit proposal: `feat(review): picker search across full affiliate catalog`
