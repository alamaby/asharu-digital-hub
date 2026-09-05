# Scrape gagal sync: lpad memotong friendly_code ≥1000

- Task: produk baru scrape tak muncul di picker; workflow hijau tapi file-only. Error: `duplicate ... affiliate_products_friendly_code_key`.
- Diagnosis terkontrol (MCP prod): trigger/fungsi/sequence/index semua SESUAI migrasi; paradoks sequence 1050 vs tabrakan dijelaskan oleh probe: `lpad('1054',3,'0')` → `'105'` — lpad MEMOTONG kelebihan panjang. Rantai: speculative BEFORE INSERT trigger tiap upsert massal membakar ~221 nilai/run (1050 dalam ~4 run sejak 3 Sep) → kode ≥1000 terpotong 3 char → tabrakan ASH-100..212 → semua insert baru gagal → file-only. Setiap run gagal membakar lagi (ratchet, tak pernah sembuh sendiri).
- Fix:
  - `supabase/migrations/20260906000005_friendly_code_width_safe.sql` (applied prod, probe rollback verifikasi `ASH-213`): generator width-safe (3-digit <1000, polos di atasnya) + resync sequence ke max+1 (=213).
  - Backfill 9 produk hilang → ASH-214..222; DB kini 221/221 = file.
  - `scripts/scrape-affiliate.mjs`: sync gagal/tanpa env → `exit 1` (sebelumnya ditelan).
  - `.github/workflows/scrape-affiliate.yml`: step "Verify DB sync" (cakupan external_id file vs DB) sebelum gates/commit.
- Follow-up: kurangi burn sequence (upsert hanya baris berubah) — opsional.
- Follow-up DIKERJAKAN: `scrape-affiliate.mjs` fetch existing sekali lalu upsert hanya baru/berubah (bandingkan 7 kolom); burn susut dari ~221/run menjadi hitungan jari; fetch gagal → throw → fail-loud.
- Verification: probe rollback `ASH-213` ✓; count 221/221 ✓; `node --check` ✓; `lint` ✓; `typecheck` ✓.
- Commit proposal: `fix(scrape): width-safe friendly codes plus fail-loud sync plus drift guard`
