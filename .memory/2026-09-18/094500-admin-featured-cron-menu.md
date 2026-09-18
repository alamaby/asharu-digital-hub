# Admin: fitur kelola featured product + monitor pg_cron

Created: 2026-09-18 09:45 (local time)

## Ringkasan

Dua menu admin baru ditambahkan:
1. `/admin/produk` — halaman kurasi produk featured dengan override layer (3-state: pinned/auto/excluded).
2. `/admin/cron` — halaman monitor pg_cron: daftar job, status, 50 run terakhir per job, plus detail HTTP best-effort.

## Keputusan desain

- **Override vs overwrite**: scraper harian (`scripts/scrape-affiliate.mjs`) tetap menulis `is_featured = index < 6` setiap hari tanpa disentuh. Layer kurasi dipakai kolom `featured_override` (NULL = ikut scraper, TRUE = paksa featured, FALSE = paksa non-featured) + generated column `featured_rank`. Public display = top-6 by rank → always 6 produk tampil di beranda (filler netral bila admin mengecualikan).
- **Auto-swap**: saat admin mem-pin ke-7, pin tertua (paling lama `featured_override_at`, tie-break id ASC) dilepas ke auto (NULL). Non-destruktif.
- **RPC cron**: schema `cron`/`net` tidak diekspos PostgREST; dibuat fungsi `SECURITY DEFINER` `public.admin_cron_jobs()` + `public.admin_cron_runs()` yang dikunci ke `service_role`. HTTP response detail dimatch via `headers->>'x-matched-path'` + jendela waktu [-5s, +30s]; hanya tersedia ~6 jam (TTL pg_net).
- **Keamanan**: migrasi 1 tidak mengubah RLS existing (hanya ADD COLUMN + generated column). Migrasi 2 `REVOKE ALL FROM PUBLIC, anon, authenticated` + `GRANT EXECUTE TO service_role`.

## Files diubah / ditambah

- `supabase/migrations/20260916000001_affiliate_featured_override.sql` — ADD COLUMN override + generated rank + index partial.
- `supabase/migrations/20260916000002_admin_cron_read_rpc.sql` — 2 fungsi SECURITY DEFINER.
- `src/lib/affiliate/public.ts` — mapper & query pakai `featured_rank`; `getFeaturedProductsDB` filter JS (mock builder minimal).
- `src/lib/admin/featured-plan.ts` + `.test.ts` — logika murni auto-swap.
- `src/lib/admin/affiliate-actions.ts` — Server Action `setProductFeatured(id, mode)` + revalidate.
- `src/lib/admin/cron-view.ts` + `.test.ts` — formatter murni.
- `src/app/[locale]/(admin)/admin/produk/page.tsx` — halaman server.
- `src/components/admin/FeaturedProductBoard.tsx` — client board + toggle actions.
- `src/app/[locale]/(admin)/admin/cron/page.tsx` — halaman SSR read-only.
- `src/config/navigation.ts`, `src/i18n/routing.ts`, `src/components/admin/shell/admin-nav.ts` — entry nav baru.
- `src/messages/id.json`, `en.json` — kunci `nav.adminProduk/Cron` + `admin.produk.*` + `admin.cron.*` (pariet penuh).

## Gate

- typecheck ✓ lint ✓ test 839/839 ✓ build ✓
- 4 failure pre-existing di `src/components/studio/StudioUi.test.tsx` (i18n string mismatch — tidak tersentuh).

## Push

- Submodule `supabase/`: `24ae5d1` feat(db): admin cron RPC + featured override
- Parent: `45d5ae5` feat(admin): kelola featured product + monitor pg_cron

## Open items / Risks tercatat di plan

- R5 (filler tier-2): bila admin mengeluarkan produk featured, slot terisi produk netral terbaru — semantik "tepat 6" yang diinginkan user, tapi perlu penjelasan di UI (badge status per baris).
- R2/R3 (join HTTP): correlasi job→response via matched-path + time window; robust untuk kondisi saat ini (path unik per job), tapi fragil jika ada retry/overlap.
- R4 (auto-swap melepas ke null): produk yang dilepas kembali ke status scraper-default — bisa muncul lagi besok bila scraper mengangkatnya. Non-destruktif tapi bisa mengejutkan.
- R3b (cron.job_run_details tanpa index): query 16k baris masih cepat, tapi catat sebagai follow-up jika volume membesar.

## User action yang diperlukan

- Deploy Vercel → akses `/id/admin/produk` dan `/id/admin/cron` untuk verifikasi live.
- Verifikasi: toggle featured pada beberapa produk, cek beranda (`/id`) & katalog (`/id/produk`) ter-update segera (revalidate on-demand); cron page menampilkan 8 job dengan run terakhir + HTTP response.
- Opsional: tambah monitoring retention `cron.job_run_details` bila volume >500rb baris.
