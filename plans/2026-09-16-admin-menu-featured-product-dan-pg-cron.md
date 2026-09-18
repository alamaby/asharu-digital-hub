# Admin: Kelola Featured Product + Monitor pg_cron

Created: 2026-09-16 10:30:00

## Objective

Dua menu admin baru di sidebar (grup Kelola):

1. **Kelola Produk Featured** — admin mengurasi produk unggulan beranda/katalog tanpa takut ditimpa scraper harian. Invarian: selalu tepat 6 produk featured yang tampil (peringkat kurasi top-6), auto-swap saat slot penuh.
2. **Monitor pg_cron** — lihat seluruh job pg_cron (jadwal, aktif, run terakhir) + **50 run terakhir per job** dengan status, durasi, `return_message`, status HTTP, dan cuplikan body respons.

## Scope

- In:
  - Migrasi DB aditif (2 file) di submodule `supabase/`:
    - `affiliate_products.featured_override` + `featured_override_at` + kolom generated `featured_rank`.
    - 2 fungsi RPC `SECURITY DEFINER` di `public` untuk baca `cron.*` + `net._http_response`, service_role-only.
  - `src/lib/affiliate/public.ts` — pakai `featured_rank` untuk urutan/filter featured.
  - `src/lib/admin/featured-plan.ts` (murni, testable) + `src/lib/admin/affiliate-actions.ts` (Server Action).
  - `src/lib/admin/cron-view.ts` (murni, formatter) dan/atau render langsung di page.
  - `src/app/[locale]/(admin)/admin/produk/page.tsx` + `src/components/admin/FeaturedProductBoard.tsx` (client).
  - `src/app/[locale]/(admin)/admin/cron/page.tsx` (server, SSR-only, tanpa JS client).
  - Nav/routing/i18n untuk `adminProduk` + `adminCron` (id + en, parity penuh).
  - Test: update `public.test.ts`, tambah `featured-plan.test.ts`, board test, `cron-view.test.ts`.
- Out (jangan dikerjakan):
  - Mengubah `scripts/scrape-affiliate.mjs`, workflow `scrape-affiliate.yml`, atau drift-check `featured !== 6` (sengaja tidak disentuh; lihat Notes).
  - Kontrol cron dari UI (pause/resume/unschedule/run-now) — halaman read-only.
  - RLS write policy baru untuk `anon`/`authenticated` di `affiliate_products`.
  - Pruning/retensi `cron.job_run_details` (catat sebagai follow-up, lihat Risks).

## Milestones

1. Migrasi DB (submodule dulu) + verifikasi RPC via MCP.
2. Lib publik affiliate + action + halaman `/admin/produk`.
3. Halaman `/admin/cron` (read-only).
4. Nav/routing/i18n + test + gate hijau + commit/push.

## Tasks

### T0 — PRASYARAT (baca dulu, jangan skip)

- [ ] Baca file pola ini sebelum menulis kode:
  - `src/lib/admin/llm-actions.ts:19-24` — pola `requireAdmin()` + hasil `{ ok } | { ok:false, error }`.
  - `src/lib/affiliate/revalidate.ts:19-36` — `revalidateAffiliateCatalog()` (wajib dipanggil setiap tulis featured).
  - `src/app/[locale]/(admin)/admin/automation/page.tsx:91-117` — pola page admin: `setRequestLocale` → `isAdmin()` → service client.
  - `src/app/[locale]/(admin)/admin/llm/logs/page.tsx:32-41,125` — pola `pretty()` + `<details>` untuk JSON panjang.
  - `src/components/admin/llm/KeyBoard.tsx:40-55` — pola client board: `busy` + `ActionNoticeView` + panggil Server Action langsung.
  - `src/components/admin/shell/admin-nav.ts:36-62` — tempat menambah entry nav.
  - `supabase/migrations/20260902000001_vault_secret_by_name.sql:15-30` — pola RPC `SECURITY DEFINER` + `REVOKE ... PUBLIC, anon, authenticated` + `GRANT ... TO service_role`.
- [ ] Ingat: halaman admin di repo ini membaca via `createSupabaseService()` (service key) dan guard-nya di level page (`isAdmin()`) + middleware (`ADMIN_INTERNAL_PATHS` sudah mencakup prefix `/admin`, jadi **tidak perlu** ubah `src/middleware.ts`).

### T1 — Migrasi 1: kolom override featured (`supabase/` submodule)

- [ ] Buat file `supabase/migrations/20260916000001_affiliate_featured_override.sql` dengan isi persis berikut:
  ```sql
  -- Lapisan kurasi featured admin (2026-09-16).
  --
  -- Latar: scraper harian (`scripts/scrape-affiliate.mjs:157,214`) menulis
  -- `is_featured = index < 6` dan CI (`.github/workflows/scrape-affiliate.yml:82`)
  -- menggagalkan bila featured != 6. Keduanya SENGAJA tidak disentuh.
  -- Layer override ini membuat kurasi admin tahan scrape:
  --   featured_override = true  -> paksa featured (rank 0)
  --   featured_override = NULL  -> ikut scraper (rank 1 bila is_featured)
  --   featured_override = false -> paksa non-featured (rank 2)
  -- Tampilan featured publik = 6 teratas dari ORDER BY featured_rank, created_at DESC.
  --
  -- Non-destruktif: hanya ADD COLUMN + index; NULL = perilaku lama.

  ALTER TABLE public.affiliate_products
    ADD COLUMN featured_override boolean NULL,
    ADD COLUMN featured_override_at timestamptz NULL;

  ALTER TABLE public.affiliate_products
    ADD COLUMN featured_rank smallint GENERATED ALWAYS AS (
      CASE
        WHEN featured_override IS TRUE  THEN 0
        WHEN featured_override IS FALSE THEN 2
        WHEN is_featured                THEN 1
        ELSE 2
      END
    ) STORED;

  COMMENT ON COLUMN public.affiliate_products.featured_override IS
    'Kurasi admin: true=paksa featured, false=paksa non-featured, null=ikut scraper (is_featured).';
  COMMENT ON COLUMN public.affiliate_products.featured_override_at IS
    'Kapan override dipasang admin (dipakai auto-swap: override-true tertua dilepas dulu).';
  COMMENT ON COLUMN public.affiliate_products.featured_rank IS
    'Rank kurasi (generated): 0=admin, 1=default scraper, 2=non-featured. Display = ORDER BY featured_rank, created_at DESC LIMIT 6.';

  CREATE INDEX IF NOT EXISTS idx_affiliate_products_featured_rank
    ON public.affiliate_products (featured_rank, created_at DESC)
    WHERE is_active = true;
  ```
- [ ] Fakta keamanan (jangan "perbaiki" dengan menambah policy!): tabel punya RLS + hanya policy SELECT (`affiliate_read`); tidak ada policy INSERT/UPDATE/DELETE sehingga `anon`/`authenticated` tetap tidak bisa menulis kolom baru. Tulis admin hanya via service key di Server Action (T6).

### T2 — Migrasi 2: RPC baca cron (submodule `supabase/`)

- [ ] Buat file `supabase/migrations/20260916000002_admin_cron_read_rpc.sql` dengan isi persis berikut. PERHATIAN QUOTING: badan fungsi memakai `$$`, jadi di dalamnya tanda kutip ditulis_NORMAL_ (satu `'`), contoh pola regex ditulis `'https?://[^/'']+...'` — SALAH; yang benar `'https?://[^/']+...'` (satu kutip). Jangan gandakan kutip di dalam `$$`.

  ```sql
  -- Observabilitas pg_cron untuk admin (2026-09-16).
  --
  -- Mengapa RPC: schema `cron`/`net` TIDAK diekspos PostgREST dan role
  -- authenticated/service_role tidak punya USAGE di schema `cron`
  -- (terverifikasi 2026-09-16). Maka satu-satunya jalur baca dari aplikasi
  -- adalah fungsi SECURITY DEFINER milik postgres (punya USAGE cron+net).
  --
  -- Mengapa TIDAK pakai is_admin() di dalam fungsi: halaman memanggil RPC
  -- dengan service key (auth.uid() = null -> is_admin() selalu false).
  -- Pengaman = GRANT EXECUTE hanya ke service_role + guard isAdmin() di page.
  --
  -- CATATAN DATA:
  -- - `cron.job_run_details.return_message` untuk job pg_net SELALU "1 row"
  --   (hasil SELECT net.http_post), jadi tidak informatif. Detail HTTP diambil
  --   dari `net._http_response` yang di-join best-effort via
  --   headers->>'x-matched-path' = path job + jendela waktu [-5s, +30s].
  -- - `net._http_response` hanya menahan ~6 jam (pg_net.ttl). Run lebih tua
  --   tetap tampil, kolom http_* = NULL. UI WAJIB menampilkannya sebagai
  --   "detail HTTP kedaluwarsa", bukan error.
  -- - JANGAN kembalikan `cron.job.command` mentah — hanya path turunannya.

  CREATE OR REPLACE FUNCTION public.admin_cron_jobs()
  RETURNS TABLE (
    jobid bigint,
    jobname text,
    schedule text,
    active boolean,
    command_path text,
    last_start timestamptz,
    last_end timestamptz,
    last_status text,
    last_return_message text,
    run_count bigint
  )
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = pg_catalog
  AS $func$
    SELECT
      j.jobid,
      j.jobname,
      j.schedule,
      j.active,
      substring(j.command from 'https?://[^/'']+(/[^'']*)') AS command_path,
      (SELECT d.start_time FROM cron.job_run_details d
         WHERE d.jobid = j.jobid ORDER BY d.start_time DESC LIMIT 1) AS last_start,
      (SELECT d.end_time FROM cron.job_run_details d
         WHERE d.jobid = j.jobid ORDER BY d.start_time DESC LIMIT 1) AS last_end,
      (SELECT d.status FROM cron.job_run_details d
         WHERE d.jobid = j.jobid ORDER BY d.start_time DESC LIMIT 1) AS last_status,
      (SELECT d.return_message FROM cron.job_run_details d
         WHERE d.jobid = j.jobid ORDER BY d.start_time DESC LIMIT 1) AS last_return_message,
      (SELECT count(*) FROM cron.job_run_details d WHERE d.jobid = j.jobid) AS run_count
    FROM cron.job j
    ORDER BY j.jobname;
  $func$;

  REVOKE ALL ON FUNCTION public.admin_cron_jobs() FROM PUBLIC, anon, authenticated;
  GRANT EXECUTE ON FUNCTION public.admin_cron_jobs() TO service_role;
  COMMENT ON FUNCTION public.admin_cron_jobs() IS 'Daftar pg_cron + ringkasan run terakhir. service_role only.';

  CREATE OR REPLACE FUNCTION public.admin_cron_runs(p_jobid bigint, p_limit int DEFAULT 50)
  RETURNS TABLE (
    runid bigint,
    status text,
    return_message text,
    start_time timestamptz,
    end_time timestamptz,
    duration_ms numeric,
    http_status int,
    http_timed_out boolean,
    http_error text,
    http_body text,
    http_created timestamptz
  )
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = pg_catalog
  AS $func$
    WITH job_path AS (
      SELECT substring(cj.command from 'https?://[^/'']+(/[^'']*)') AS path
      FROM cron.job cj
      WHERE cj.jobid = p_jobid
    )
    SELECT
      d.runid,
      d.status,
      d.return_message,
      d.start_time,
      d.end_time,
      CASE WHEN d.end_time IS NULL THEN NULL
           ELSE round(extract(epoch from (d.end_time - d.start_time)) * 1000)
      END AS duration_ms,
      r.status_code AS http_status,
      r.timed_out AS http_timed_out,
      r.error_msg AS http_error,
      left(r.content, 2000) AS http_body,
      r.created AS http_created
    FROM cron.job_run_details d
    CROSS JOIN job_path
    LEFT JOIN LATERAL (
      SELECT resp.status_code, resp.timed_out, resp.error_msg, resp.content, resp.created
      FROM net._http_response resp
      WHERE resp.created BETWEEN d.start_time - interval '5 seconds'
                             AND d.start_time + interval '30 seconds'
        AND resp.headers ->> 'x-matched-path' = job_path.path
      ORDER BY resp.created ASC
      LIMIT 1
    ) r ON true
    WHERE d.jobid = p_jobid
    ORDER BY d.start_time DESC
    LIMIT greatest(1, least(coalesce(p_limit, 50), 200));
  $func$;

  REVOKE ALL ON FUNCTION public.admin_cron_runs(bigint, int) FROM PUBLIC, anon, authenticated;
  GRANT EXECUTE ON FUNCTION public.admin_cron_runs(bigint, int) TO service_role;
  COMMENT ON FUNCTION public.admin_cron_runs(bigint, int) IS 'N run terakhir per cron job + respons HTTP best-effort (TTL pg_net ~6 jam). service_role only.';
  ```
- [ ] Terapkan ke DBDEV/PROD via `apply_migration` (tool MCP proyek `supabase-asharu-be-development` dulu untuk uji, lalu `supabase-asharu-be-production`), ATAU via `supabase db push` bila CLI tersedia. Urutan: migrasi `...01...` dulu, lalu `...02...`.
- [ ] Verifikasi pasca-apply (via `execute_sql`): 
  ```sql
  SELECT jobname, command_path, last_status, run_count FROM public.admin_cron_jobs();
  SELECT count(*) FROM public.admin_cron_runs(9, 50);
  ```
  dengan catatan: pemanggil MCP bukan service_role, jadi kalau `permission denied` justru BENAR (fungsi terkunci service_role). Verifikasi isi boleh lewat `SELECT ... FROM cron.job_run_details` langsung yang memang dibolehkan MCP read-only.
- [ ] Jalankan advisor keamanan+performa untuk kedua proyek; pastikan tidak ada temuan baru (khususnya RLS/`search_path` mutable pada fungsi baru — sudah di-pin `SET search_path = pg_catalog`).

### T3 — Commit submodule DULU (wajib sebelum commit parent)

- [ ] Di `supabase/`: `git status --short`, `git diff`, `git log --oneline -5`; stage hanya 2 file migrasi; commit Conventional Commits satu baris (mis. `feat(db): admin baca pg_cron + override featured (service_role only)`); **push submodule**.
- [ ] Jangan pernah commit `.env*` atau secret (`sb_secret_*`, `CRON_SECRET`).

### T4 — Lib publik affiliate: pakai `featured_rank`

- [ ] `src/lib/affiliate/public.ts`:
  - `PRODUCT_SELECT` tambah `featured_override, featured_rank` (urutan kolom bebas, tapi test mem-parsing query builder per kolom — lihat T8).
  - `AffiliateRow`: tambah `featured_override: boolean | null; featured_tier?: never` — HAPUS, pakai nama persis kolom DB: `featured_rank: number`.
  - Mapper `toAffiliateProduct`: `featured: row.featured_override ?? row.is_featured`.
  - `getActiveProducts()`: ganti `.order('is_featured', { ascending: false })` menjadi `.order('featured_rank', { ascending: true })` (tie-break `created_at` desc tetap). Alasan: rank 0/1 (unggulan) dulu, lalu sisanya by tanggal; override-false tenggelam — persis semantik kurasi.
  - `getFeaturedProductsDB(max = 6)`: HAPUS `.eq('is_featured', true)`; ganti menjadi `.or('featured_override.is.null,featured_override.eq.true')` + `.order('featured_rank', { ascending: true })` + `.order('created_at', { ascending: false })` + `.limit(max)`.
  - Update komentar RCA 2026-09-16: rincikan bahwa ordering kini kurasi-aware dan backward-compatible (tanpa override, hasil IDENTIK dengan sebelumnya: rank 1 = is_featured, limit 6).
- [ ] Pastikan `AffiliateRow` tetap dipakai konsisten di `public.test.ts`.

### T5 — Logika murni auto-swap (`src/lib/admin/featured-plan.ts` + test)

- [ ] Buat `src/lib/admin/featured-plan.ts` (TANPA import supabase/next; murni agar mudah diuji):
  ```ts
  export type OverrideMode = 'pin' | 'auto' | 'exclude';
  export interface OverrideRow { id: string; friendly_code: string; featured_override: boolean | null; featured_override_at: string | null }
  export interface FeaturedPlan {
    setTarget: { id: string; override: boolean | null; at: string | null };
    release: { id: string; friendly_code: string } | null; // diisi saat pin ke-7
    error?: never;
  }
  export const MAX_CURATED = 6;
  export function planFeaturedOverride(pinned: OverrideRow[], targetId: string, mode: OverrideMode): FeaturedPlan
  ```
  Aturan:
  - `mode === 'auto'` → `{ setTarget: { id, override: null, at: null }, release: null }`.
  - `mode === 'exclude'` → `{ setTarget: { id, override: false, at: null }, release: null }`.
  - `mode === 'pin'` → jika target sudah pinned → `{ setTarget: { id, override: true, at: <pertahankan at lama bila ada> }, release: null }` (no-op aman).
  - Jika pinned lain sudah 6 → `release` = pinned tertua (`featured_override_at` ASC, NULLS FIRST, tie-break `id`), `setTarget` = target pin dengan `at = now` (terima ISO string via param agar deterministik di test).
  - Jika pinned lain < 6 → `release: null`.
- [ ] Buat `src/lib/admin/featured-plan.test.ts` (vitest) mencakup: auto/exclude, pin saat slot kosong, pin saat penuh (release tertua), pin ulang id yang sama (no-op), NULLS FIRST untuk `at` null.

### T6 — Server Action affiliate (`src/lib/admin/affiliate-actions.ts`)

- [ ] `'use server'`; tiru `requireAdmin()` dari `src/lib/admin/llm-actions.ts:19-24` (throw bila bukan admin / supabase null).
- [ ] `export type AffiliateActionResult = { ok: true; released?: string } | { ok: false; error: string }`.
- [ ] `export async function setProductFeatured(productId: string, mode: 'pin' | 'auto' | 'exclude'): Promise<AffiliateActionResult>`:
  1. Validasi: `productId` non-kosong, `mode` salah satu dari 3 nilai → `{ ok:false }` (bukan throw) untuk kegagalan validasi/DB.
  2. Ambil baris target (`id, friendly_code, name_id, featured_override, featured_override_at`) + daftar pinned lain (`featured_override IS TRUE`, `neq id`, order `featured_override_at ASC NULLS FIRST, id ASC`, limit 7).
  3. Panggil `planFeaturedOverride(...)`; bila `release` ada → update baris release ke `{ featured_override: null, featured_override_at: null }` DULU, lalu update target.
  4. `revalidateAffiliateCatalog()` (WAJIB — penulis DB bukan Server Action publik; tanpa ini beranda/`/produk` basi s.d. 1 jam) + `revalidatePath('/admin/produk')`.
  5. Kembalikan `{ ok:true, released?: friendly_code }`; kegagalan DB → `{ ok:false, error: message }`.
  - Catatan: `revalidatePath` HARUS dipanggil di dalam Server Action (bukan di helper murni).

### T7 — Halaman `/admin/produk` + board client

- [ ] `src/components/admin/FeaturedProductBoard.tsx` (`'use client'`):
  - Props: `items: ProductAdminRow[]` (`id, friendly_code, name_id, merchant, category, image, url, is_active, is_featured, featured_override, featured_override_at, created_at`), `curatedCount: number`.
  - State: `q` (pencarian), `filter` (`all | pinned | auto | excluded`), `notice` (`ActionNotice | null`), `busyId`.
  - Toolbar: input search (filter nama/kode/merchant, case-insensitive, in-memory — 240 baris aman), select filter, badge `Dikurasi {curatedCount}/6`.
  - Baris: thumbnail (img + fallback `onError` seperti `FixedProductCard.tsx:26-38`), nama, `ASH-xxx`, kategori·merchant, lencana status (`Featured`/`Auto`/`Dikeluarkan` via `AdminBadge`), tombol aksi sesuai status: pin → [Auto][Keluarkan]; auto → [Featured][Keluarkan]; excluded → [Featured][Auto]; semua panggil `setProductFeatured` + `router.refresh()` + notice (`ActionNoticeView` dari `../llm/ActionFeedback` — boleh diimpor lintas folder seperti `visual/*` melakukannya).
  - `admin` namespace sudah di `CLIENT_MESSAGE_NAMESPACES`; pakai `useTranslations('admin.produk')` untuk label (jangan hardcode campuran).
- [ ] `src/app/[locale]/(admin)/admin/produk/page.tsx`:
  - Pola `admin/automation/page.tsx:91-97`: `setRequestLocale` → `isAdmin()` → redirect `/masuk` bila bukan admin.
  - `generateMetadata`: `buildMetadata({ path: '/admin/produk', title: t('title'), ..., robots: { index:false, follow:false } })` — path WAJIB terdaftar di `routing.ts` (T10) atau build error.
  - Ambil via `createSupabaseService()`: semua baris `affiliate_products` (`select('*')` aman — RLS bypass service key) order `featured_rank ASC, created_at DESC`, limit 500; hitung `curatedCount` = override-true.
  - Render `AdminPageHeader` + `AdminCard` + `<FeaturedProductBoard/>`.

### T8 — Halaman `/admin/cron` (read-only, SSR saja)

- [ ] `src/lib/admin/cron-view.ts` (murni): `formatDurationMs(ms: number|null): string`, `cronStatusTone(status: string): 'success'|'error'|'warning'|'neutral'`, `truncateBody(body: string|null, max=400): string`. + `cron-view.test.ts`.
- [ ] `src/app/[locale]/(admin)/admin/cron/page.tsx`:
  - Guard + metadata seperti T7 (`path: '/admin/cron'`).
  - `const [{ data: jobs }, ...runs] = await Promise.all([...])` via `supabase.rpc('admin_cron_jobs')` dan `supabase.rpc('admin_cron_runs', { p_jobid: job.jobid, p_limit: 50 })` per job (8 job × 50 baris ≈ 400 baris — ringan).
  - Kegagalan RPC: tampilkan `role="alert"` (jangan throw ke boundary).
  - Render: `AdminPageHeader` + satu `AdminCard` per job berisi: nama, badge aktif, `schedule` (mono), path endpoint, run terakhir (waktu lokal via `getDisplayTimezone()` + `formatDateTimeSeconds`, durasi, status, HTTP), tabel **50 run terakhir**: waktu mulai · durasi · status cron · HTTP · `return_message` · `<details>` body respons (`pretty()`). Banner info: "Detail HTTP hanya tersedia ±6 jam terakhir (TTL pg_net); run lama tampil tanpa kolom HTTP."
- [ ] Tidak ada client component, tidak ada Server Action (tidak ada `CronBoard.tsx` — sengaja SSR murni agar kecil).

### T9 — Nav, routing, i18n

- [ ] `src/config/navigation.ts`: tambah `'adminProduk' | 'adminCron'` ke union `key`; tambah `'/admin/produk' | '/admin/cron'` ke union `pathname`; tambah 2 item ke `adminNavItems`.
- [ ] `src/i18n/routing.ts` pathnames:
  ```ts
  '/admin/produk': { id: '/admin/produk', en: '/admin/products' },
  '/admin/cron': { id: '/admin/cron', en: '/admin/cron' },
  ```
- [ ] `src/components/admin/shell/admin-nav.ts`: grup `manage`, setelah `adminAutomation`:
  ```ts
  { key: 'adminProduk', pathname: '/admin/produk', icon: ShoppingBag, adminOnly: true },
  { key: 'adminCron', pathname: '/admin/cron', icon: Timer, adminOnly: true },
  ```
  tambah import `ShoppingBag, Timer` dari `lucide-react` (keduanya ada di lucide).
- [ ] `src/messages/id.json` + `src/messages/en.json` (PARITY PENUH — `messages.test.ts:27` gagal bila beda satu kunci pun):
  - `nav.adminProduk`: "Produk" / "Products"; `nav.adminCron`: "Cron" / "Cron".
  - `admin.produk.*` (tulis di kedua file, en = terjemahan): `title, intro, curatedCount, searchPlaceholder, filterAll, filterPinned, filterAuto, filterExcluded, colProduct, colState, colUpdated, colActions, statePinned, stateAuto, stateExcluded, actionPin, actionAuto, actionExclude, noticePinned, noticeAuto, noticeExcluded, noticeSwapped, errorGeneric, empty, updatedLabel`.
  - `admin.cron.*`: `title, intro, colJob, colSchedule, colActive, colLastRun, active, inactive, runCount, last50, colStart, colDuration, colCronStatus, colHttp, colReturn, colResponse, noHttpDetail, ttlNote, loadError, emptyRuns`.
- [ ] Middleware: TIDAK ADA perubahan (`/admin` prefix sudah mencakup `/admin/produk`, `/admin/cron`).

### T10 — Test & gate

- [ ] Update `src/lib/affiliate/public.test.ts`:
  - mock builder TAMBAH metode `or()` dan `lt()`? — TIDAK: supaya mock tetap sederhana, implementasi `getFeaturedProductsDB` HARUS hanya memakai metode builder yang sudah ada (`select/eq/order/limit/then`).
  
  > ⚠️ KONFLIK DESAIN — baca dengan saksama: mock di `public.test.ts:4-18` tidak punya `.or()`/`.neq()`. Maka filter "kecualikan override=false" TIDAK BOLEH di query PostgREST. Solusinya: `getFeaturedProductsDB` mengambil `limit(max + 6)` terurut `featured_rank, created_at DESC` TANPA filter, lalu di JS: saring `featured_override !== false`, ambil `max` pertama. Dokumentasikan di komentar kode ("PostgREST tidak bisa `featured_override IS NOT FALSE` tanpa `.or()`; mock repo sengaja minimal — saring di JS, murah untuk 12 baris"). Untuk `getActiveProducts` tidak ada filter baru (semua baris tetap dipakai, hanya urutan berubah) → mock existing cukup (tambah ekspektasi `orderCalls` untuk `featured_rank`).
- [ ] Tambah `src/lib/admin/featured-plan.test.ts`, `src/lib/admin/cron-view.test.ts`, `src/components/admin/FeaturedProductBoard.test.tsx` (render + tombol sesuai status + search filter; mock `@/lib/admin/affiliate-actions` via `vi.mock`).
- [ ] Pastikan `AdminSidebar.test.tsx` & `admin-nav.test.ts` tetap hijau (entry baru tidak merusak assertion existing).
- [ ] Gate: `npm run typecheck` && `npm run lint` && `npm test`. Lalu `npm run build` (rute baru + kolom generated — build menangkap yang lolos typecheck). Setiap edit setelah gate hijau → re-run `typecheck` + `lint` (aturan repo pasca-insiden `prefer-const` 2026-09-10).

### T11 — Commit + push (aturan repo AGENTS.md)

- [ ] `git status --short`, `git diff`, `git log --oneline -10`; stage hanya file dimaksud; scan diff untuk secret.
- [ ] Submodule `supabase/` SUDAH di-commit+push di T3 — verifikasi pointer parent menunjuk commit migrasi baru.
- [ ] Commit parent Conventional Commits satu baris tanpa trailer (mis. `feat(admin): kelola produk featured + monitor pg_cron`), langsung push. Jika push ditolak: fetch → `git pull --no-rebase` → re-run gate → push.
- [ ] Tulis entri `.memory/2026-09-16/HHmmss-*.md` + update `.memory/README.md` (state, decisions, blokir bila ada).

## Risks

- **R1 — Quoting regex di migrasi.** Pola `substring(... from 'https?://[^/'']+...')` di SQL biasa butuh kutip ganda (`''`), tetapi di dalam badan fungsi `$$...$$` ditulis NORMAL (`'https?://[^/']+...'` seperti di T2). Sudah diverifikasi jalan di prod (8 path terekstrak, termasuk `asharu-lab-cleanup` yang baru muncul). Counter: jangan pakai `split_part` berlapis — regex satu pola ini cukup.
- **R2 — Join HTTP longgar.** Match path + jendela [-5s, +30s] bisa salah pasang bila ada retry/overlap; semua job */5 menit sehingga jendela tidak tumpang tindih antar tick job yang sama. Counter: `LEFT JOIN LATERAL ... LIMIT 1` menjamin tepat 1 respons per run; UI menandai kolom HTTP bisa kosong.
- **R3 — `cron.job_run_details` tanpa index per-job (16128 baris, tumbuh ±1.700/hari).** Tiap query = sequential scan kecil; masih murah untuk halaman admin. Counter: bila >500rb baris, ajukan migrasi pruning/retensi terpisah (butuh hak di schema `cron` — verifikasi dulu, jangan asumsi).
- **R4 — Auto-swap mengejutkan.** Menyalakan featured ke-7 otomatis melepas pin tertua (ke `auto`, bukan `false` — non-destruktif). Counter: notice `noticeSwapped` menyebut kode produk yang dilepas.
- **R5 — Tier-2 filler.** Bila admin mengeluarkan produk featured, slot top-6 diisi produk netral terbaru — persis perilaku "tepat 6" yang diminta. Counter: badge status per baris selalu menunjukkan `Featured/Auto/Dikeluarkan` agar tidak ambigu.
- **R6 — Kolom generated = rewrite tabel 240 baris.** Singkat dan aman; tetap lakukan di jam sepi dan pastikan backup/supabase PITR aktif.
- **R7 — Mock builder minimal.** Lihat kotak ⚠️ di T10: jangan tambah operator query baru tanpa memperbarui mock `public.test.ts`.

## Progress Log

- 2026-09-16 10:30:00 — Plan detail ditulis (read-only, dari mode Plan). Keputusan user: (1) kolom override terpisah, (2) tepat 6 + auto-swap, (3) cron + HTTP response read-only. Verifikasi teknis selesai: regex path 8/8 job, `postgres` punya USAGE cron+net, `service_role` TIDAK punya USAGE cron (maka RPC service_role-only, bukan view/RPC `is_admin()`), TTL `pg_net` 6 jam (432 baris), `net._http_response` di-join via `x-matched-path`. Belum diimplementasi; menunggu eksekusi model lanjutan.

## Notes

- **Kenapa bukan view `v_admin_cron_*`?** View `security_invoker=true` gagal (authenticated tidak punya USAGE schema `cron`). View definer+grant ke `authenticated` membocorkan cron ke semua user login. Maka: fungsi `SECURITY DEFINER` + `GRANT` hanya `service_role`, guard `isAdmin()` di page. Pola ini = `vault_*` (lihat `20260902000001_vault_secret_by_name.sql`).
- **Kenapa bukan `is_admin()` di dalam RPC?** Page memanggil via service key → `auth.uid()` null → selalu false. Jangan ditambahkan.
- **Kenapa generated `featured_rank`, bukan logika di JS?** PostgREST hanya bisa `ORDER BY` kolom; rank membuat ordering kurasi bisa dieksekusi di DB + terindeks. Backward-compatible: tanpa override, urutan & isi identik dengan query lama (rank 1 = `is_featured`).
- **Kenapa tidak ubah scraper/CI?** Override bersifat aditif; scraper tetap menulis tepat 6 `is_featured` sehingga `drift check` tetap hijau; admin override tidak pernah ditimpa. Ini inti keputusan "kolom override terpisah".
- **Ikon nav**: `ShoppingBag` (Produk), `Timer` (Cron) — keduanya tersedia di `lucide-react@0.468`.
- **Tidak perlu file `loading.tsx`/`error.tsx` baru**: `admin/error.tsx` + `admin/loading.tsx` sudah mencakup child routes (pola `admin/konten` hanya menambah `loading.tsx`; `admin/riset` yang menambah error boundary khusus).
- **Jumlah job tidak di-hardcode**: page merender apa pun isi `cron.job` (terbukti: job ke-8 `asharu-lab-cleanup` muncul di tengah riset tanpa perubahan kode).
- Standar repo yang relevan: Conventional Commits satu baris tanpa trailer; auto commit+push setelah gate hijau (cek status/diff/log, stage hanya file dimaksud); submodule `supabase/` commit+push DULU baru parent.
