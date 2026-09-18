# Admin Produk: Server Pagination + Feedback — Plan Detail (siap eksekusi)

Created: 2026-09-18 15:40:00

## Objective

Halaman `/admin/produk` (id+en) hari ini me-render ~250+ baris sekaligus (server fetch `limit 500`, tanpa paging) dan tombol aksi minim feedback (hanya disable+opacity, tanpa spinner/label). Ubah menjadi **pagination server** (`?page=&q=&filter=`, `PAGE_SIZE=20`) + feedback jelas (spinner tombol, counter hasil, skeleton load, empty/error state). Keputusan user: server (bukan load-more klien) karena katalog akan tumbuh banyak; cakupan termasuk search/filter.

Fakta terverifikasi 2026-09-18 (dua agen riset + baca baris):

- Fetch: `src/app/[locale]/(admin)/admin/produk/page.tsx:55-64` (`select('*')`, order rank+created, `limit 500`), filter `is_active!==false` + re-sort di JS (`:62-64`), `curatedCount` dari data (`:66`), oper ke `<FeaturedProductBoard items curatedCount/>` (`:78`).
- Board klien: `src/components/admin/FeaturedProductBoard.tsx:40-216` — state `q`/`filter`/`notice`/`busyId` (`:49-52`), filter in-memory (`:54-64`: search substring di `name_id+friendly_code+merchant`; pinned=`override===true`; auto=`override===null && is_featured`; excluded=`override===false`), aksi `handleAction` (`:66-85`) + tombol per baris (`:150-204`, disabled+opacity saat busy `:152,161,173,181,192,200`), notice `ActionNoticeView` (`:213`).
- Server action `setProductFeatured` (`src/lib/admin/affiliate-actions.ts:50-120`, swap max 6 `:70-82`, revalidate `:117-119`); board `router.refresh()` (`:78`).
- Pola siap pakai: `BoardSkeleton`/`ActionNoticeView` (`src/components/admin/llm/ActionFeedback.tsx:5-83`); pagination server `KontenList.tsx:131-144,342-364,393-421` + `ReviewListClient.tsx:104,198,253-259` + `llm/logs/page.tsx:16,57-73` (GET form filter, `PAGE_SIZE=20`, `.range()+count:exact`); i18n `admin.produk` (`id.json:808-834`, mirror `en.json:812-`).

## Scope

Masuk:

- `page.tsx`: baca `searchParams`, query Supabase berpaging + count, query count kurasi terpisah, oper halaman + meta ke board, bungkus Suspense+BoardSkeleton.
- Helper murni baru `src/lib/admin/produk-query.ts` + unit test.
- `FeaturedProductBoard.tsx`: buang state/filter in-memory; form filter GET; link Prev/Next preservasi query; spinner+label tombol busy; counter `aria-live`; empty state.
- i18n `admin.produk` id+en (parity penuh).
- Test komponen + gate penuh.

Keluar (jangan kerjakan):

- Perubahan server action `setProductFeatured`, swap logic, worker, scraper, publish, Studio.
- Perubahan skema DB, RLS, `routing.ts`, middleware, CSP.
- Toast library baru (repo tanpa toast — `ActionFeedback.tsx:5`).
- Mengekspor `Spinner` dari `ActionFeedback.tsx` (duplikasi SVG inline ala `KontenList.tsx:249` saja; jangan refactor shared demi plan ini).
- Sort control baru (sort tetap rank+created).

## Milestones

1. Helper + query server + page berpaging: unit test hijau.
2. Board baru (form GET + pagination + feedback tombol): test komponen hijau.
3. i18n + gate hijau + verifikasi manual 3 halaman + filter kombinasi.

Urutan wajib: S1 → S2 → S3 → S4 (satu file per langkah bila memungkinkan, gate kecil tiap langkah).

## Tasks

### S1 — Helper murni `src/lib/admin/produk-query.ts` (baru) + test

- [x] Buat file dengan (SEMUA murni, tanpa import supabase agar gampang di-test):
  ```ts
  export const PRODUK_PAGE_SIZE = 20;
  export type ProdukFilter = 'all' | 'pinned' | 'auto' | 'excluded';
  export function parseProdukFilter(v: unknown): ProdukFilter; // di luar 4 → 'all'
  export function clampPage(v: unknown, totalPages: number): number; // NaN/<1→1, >total→total, total 0→1
  export function pageRange(page: number, pageSize = PRODUK_PAGE_SIZE): { from: number; to: number };
  export function escapeIlike(s: string): string; // escape `\`, `%`, `,` (koma = OR di PostgREST!)
  export function buildSearchOr(needle: string): string | null; // null bila kosong → jangan panggil .or()
  // 'name_id.ilike.%x%,friendly_code.ilike.%x%,merchant.ilike.%x%'
  ```
- [x] JANGAN lupa koma di-escape: `.or()` PostgREST memakai koma sebagai pemisah kondisi — search `a,b` tanpa escape = 4 kondisi, bug senyap. Test khusus: `'100%, a_b,c\\d'` → semua karakter spesial ter-escape.
- [x] Test `src/lib/admin/produk-query.test.ts`: parse valid/invalid/undefined; clamp (0, -3, NaN, 'abc', >total, total 0); range page 1 (`0-19`), page 3 (`40-59`); escape semua spesial; `buildSearchOr('')` → null.
- [x] Acceptance: file test baru hijau via `npx vitest run src/lib/admin/produk-query.test.ts`.

### S2 — Query server di `page.tsx`

- [x] Ubah `PageProps`: tambah `searchParams: Promise<{ page?: string; q?: string; filter?: string }>` (Next 15 async — JANGAN baca sinkron).
- [x] Parse: `const pageRaw = ...; const q = (sp.q ?? '').trim().slice(0, 80); const filter = parseProdukFilter(sp.filter);`
- [x] Query data (pertahankan order existing `:57-60`, GANTI `limit(500)`):
  ```ts
  let query = supabase.from('affiliate_products')
    .select('*', { count: 'exact' })
    .neq('is_active', false) // gantikan filter JS :62-64
    .order('featured_rank', { ascending: true })
    .order('created_at', { ascending: false });
  if (filter === 'pinned') query = query.eq('featured_override', true);
  if (filter === 'auto') query = query.is('featured_override', null).eq('is_featured', true);
  if (filter === 'excluded') query = query.eq('featured_override', false);
  const orCond = buildSearchOr(q);
  if (orCond) query = query.or(orCond);
  // hitung total dulu? count exact butuh 1 query — pola llm/logs: query .range(from,to) mengembalikan count sekaligus.
  const totalPages = Math.max(1, Math.ceil((count ?? 0) / PRODUK_PAGE_SIZE));
  const page = clampPage(sp.page, totalPages);
  const { from, to } = pageRange(page);
  const { data, count } = await query.range(from, to);
  ```
  PERHATIAN urutan: `count` baru diketahui SETELAH query — jadi clamp page butuh 2 langkah: (1) query count saja dulu BILA params berubah? Pola `llm/logs` melakukan query range dengan `count:'exact'` lalu hitung totalPages dari count hasil — tapi page untuk range harus valid sebelumnya. Solusi untuk model kurang mampu (pilih SATU, disarankan opsi A):
  - Opsi A (disarankan): query count murah dulu (.select('id', {count:'exact', head:true}) + filter sama) → clamp → query range. 2 query + 1 query kurasi = 3 query/halaman, murah untuk admin internal.
  - Opsi B: clamp longgar dulu (`page≥1`), query range+count, bila `page>totalPages && totalPages>0` → `redirect` ke `?page=totalPages` (tiru pola redirect admin yang ada).
- [x] `curatedCount` (`:66`): query terpisah `.select('id',{count:'exact',head:true}).eq('featured_override',true)` — JANGAN hitung dari halaman (salah).
- [x] Sort JS `:62-64` DIHAPUS (order sudah di SQL; `neq is_active` gantikan filter). Tipe `AffiliateRow` (`:17-31`) tetap.
- [x] Oper ke board props baru: `items, curatedCount, page, totalPages, totalCount, q, filter` (lihat S3 untuk bentuk pasti — tentukan interface dulu sebelum edit board).
- [x] Bungkus board: `<Suspense fallback={<BoardSkeleton label={t('loading')} />}>` — import dari `@/components/admin/llm/ActionFeedback` (tiru `admin/llm/page.tsx:11,93`). `t('loading')` key baru S4.
- [x] JANGAN ubah: guard `isAdmin` (`:50`), metadata (`:33-43`), shell/h1/intro (`:69-77`).

### S3 — Board baru (`FeaturedProductBoard.tsx`)

- [x] HAPUS state `q`/`filter` (`:49-50`) + blok `filtered` (`:54-64`) + `.map(filtered)` → `.map(items)`. HAPUS `useState` untuk keduanya (tetap `useState` untuk `notice`/`busyId`).
- [x] Filter bar (`:89-108`) → form GET biasa (tanpa JS submit):
  ```tsx
  <form method="get" className="...">
    <input name="q" defaultValue={q} placeholder={t('searchPlaceholder')} aria-label={...} />
    <select name="filter" defaultValue={filter} aria-label={...}>...</select>
    <button type="submit">{t('applyFilter')}</button>
    {q || filter !== 'all' ? <a href={basePath}>t('resetFilter')</a> : null}
  </form>
  ```
  `page` OTOMATIS reset ke 1 karena form tidak mengirim `page` (JANGAN sertakan hidden page — itu bug: filter berubah tapi tetap di halaman 5). `basePath` = path halaman ini tanpa query (lihat cara `ReviewListClient` membangun query; untuk reset cukup link ke pathname polos).
- [x] Counter hasil DI ATAS list (ganti `curatedCount` line? TIDAK — `curatedCount` (`:90`) tetap; TAMBAH baris baru): `<p role="status" aria-live="polite">{t('rangeInfo', { from, to, count: totalCount })}</p>` — `from/to` dari props (hitung di server, oper sebagai props agar tak duplikasi rumus; atau oper `page,totalCount` dan hitung via `pageRange` import helper S1 — pilih yang kedua, satu sumber rumus).
- [x] Pagination `<nav aria-label={t('paginationLabel')}>` SETELAH list (tiru `KontenList.tsx:342-364`): Prev hanya bila `page>1`, Next hanya bila `page<totalPages` (sembunyikan di ujung, JANGAN disable — pola `:347,355`). Link = `<a href>` GET (tanpa JS) untuk simplest approach.
- [x] Tombol aksi baris (`:150-204`): saat `busyId===row.id` → `disabled + aria-busy="true"` + spinner SVG inline (salin dari `KontenList.tsx:249` atau `ActionFeedback.tsx:13-20`, JANGAN impor yang private) + label ganti ke `t('saving')`. Tombol lain baris itu tetap disabled (existing). Notice `ActionNoticeView` (`:213`) tetap; tambah `detail` kode swap (sudah ada `noticeSwapped{code}` `:74-77` — teruskan sebagai `detail`, bukan gabung string).
- [x] Empty: `filtered.length===0` → `items.length===0` + `t('empty')` (`:110-111` tetap, kondisi ganti).
- [x] Props interface baru (TENTUKAN DULU, lalu sesuaikan S2):
  ```ts
  { items: ProductRow[]; curatedCount: number; page: number; totalPages: number; totalCount: number; q: string; filter: ProdukFilter }
  ```
  Import tipe `ProdukFilter` dari helper S1 (JANGAN definisi ulang `FilterMode` lokal — digabung).
- [x] `handleAction` (`:66-85`) + `router.refresh()` (`:78`) TAK BERUBAH (refresh me-load ulang halaman N saat ini — benar setelah pin/swap; catat di notice bila item pindah halaman? TIDAK perlu — cukup notice existing).

### S4 — i18n + test + gate

- [x] Tambah di `admin.produk` id.json (`:808-834`) + mirror en.json (parity penuh — `messages.test.ts`):
  `loading ("Memuat produk..."), saving ("Menyimpan..."), applyFilter ("Terapkan"), resetFilter ("Reset"), pageOf ("Hal {page}/{total}"), pagePrev ("Sebelumnya"), pageNext ("Berikutnya"), rangeInfo ("{from}–{to} dari {count}"), paginationLabel ("Navigasi halaman produk")`.
  en: `"Loading products...", "Saving...", "Apply", "Reset", "Page {page}/{total}", "Previous", "Next", "{from}–{to} of {count}", "Product pages navigation"`.
- [x] Test komponen (pola `ArticleCard.test.tsx`; mock `@/i18n/navigation` sudah di `vitest.setup.tsx`): render page 2/5 (link Prev→page1, Next→page3, query q+filter preserved); page 1 (tanpa Prev); page terakhir (tanpa Next); empty (t('empty')); tombol busy (disabled + spinner + `aria-busy`); notice sukses (`noticeSwapped`) dan error.
- [x] Gate berurutan: `npm run typecheck` → `npm run lint` → `npm test` (penuh; flaky Studio pre-existing → rerun file spesifik) → `npm run build` (wajib: ubah RSC params + Suspense).
- [x] Aturan insiden `prefer-const`: edit apa pun setelah hijau → re-run `typecheck + lint` sebelum commit.

### S5 — Verifikasi manual (admin login, dev/staging)

- [ ] Buka `/id/admin/produk`: 20 baris + `1–20 dari N` + Next; klik Next → URL `?page=2`, 20 berikutnya; halaman terakhir → tanpa Next.
- [ ] Search `shopee` + Enter → hasil tersaring lintas katalog + counter cocok + page reset 1; kombinasi search+filter pinned benar.
- [ ] Pin 1 produk → tombol jadi spinner `Menyimpan...` → notice sukses (+ kode swap bila cap 6) → list refresh.
- [ ] `?page=999` → clamp ke terakhir (opsi A) / redirect (opsi B); `?filter=ngawur` → `all`; `?page=abc` → 1.
- [ ] EN mirror `/en/admin/products` (cek path aktual di routing — JANGAN asumsi, lihat `routing.ts`).

## Risks

- Search tak lagi instan (submit) — harga pagination server; mitigasi: nilai dipertahankan + fokus kembali (tambah `autoFocus`? TIDAK — ganggu screen reader; cukup nilai dipertahankan).
- 3 query/halaman (count + range + kurasi) — murah untuk admin internal; JANGAN dioptimasi prematur.
- Pin/swap mengubah rank → baris bisa pindah halaman setelah `router.refresh()` (benar, tapi admin bisa bingung "baris hilang") — mitigasi: notice menyebut kode; cukup.
- `.or()` + koma di search tanpa escape = bug senyap (kondisi terbelah) — S1 mengunci via `escapeIlike` + test.
- `is('featured_override', null)` + `eq('is_featured', true)` untuk `auto` — cerminan persis filter JS `:61`; bila data punya `is_featured null`, baris tak muncul di `auto` (sama seperti hari ini — perilaku dipertahankan, bukan diubah).
- Edit setelah gate hijau MEMBATALKAN gate — re-run sebelum commit.

## Progress Log

- 2026-09-18 15:40:00 — Plan detail dibuat (riset: 2 agen + baca `page.tsx:1-81` penuh, `Board.tsx:40-109`). Keputusan user: pagination SERVER + cakupan termasuk search/filter (revisi dari load-more klien). Belum ada implementasi.
- 2026-09-18 17:09:00 — S1 selesai: helper `src/lib/admin/produk-query.ts` + 18 unit test hijau.
- 2026-09-18 17:53:00 — S2 selesai: `page.tsx` pakai pola 3-query (count → clamp → range + curated count), Suspense + BoardSkeleton, opsi A dipilih.
- 2026-09-18 18:53:00 — S3 selesai: `FeaturedProductBoard.tsx` baru — form GET, pagination link `<a href>` preserve query, spinner+label `saving` di tombol busy, `aria-busy`, counter range 1-indexed.
- 2026-09-18 18:58:00 — S4 selesai: i18n id+en parity (9 key baru), 12 component test hijau, gate penuh `typecheck + lint + test (899) + build` semua hijau.
- 2026-09-18 19:00:00 — S5 menunggu verifikasi manual user.

## Notes

- Keputusan: (1) server paging karena katalog tumbuh (user eksplisit); (2) search/filter ikut ke server via URL params (wajib — filter klien atas 1 halaman = salah); (3) form GET tanpa JS untuk filter (paling sederhana + tahan gagal hidrasi); (4) `PAGE_SIZE=20` (konsisten `llm/logs`, muat di viewport admin tanpa scroll berlebih).
- Alternatif ditolak: load-more klien (usulan awal, dibatalkan user — payload 500 baris tak skala); nomor halaman penuh 1…N (cukup Prev/Next + `pageOf` untuk admin).
- Follow-up opsional (bukan plan ini): nomor halaman; sort control; ekspor `Spinner` shared; server-pagination untuk list admin lain yang masih render-semua (audit satu per satu).
- Perintah gate: `npm run typecheck` → `npm run lint` → `npm test` → `npm run build`.
- Aturan commit: Conventional Commits satu baris tanpa `Co-authored-by`; `git status --short + git diff + git log --oneline -10` dulu; stage hanya file dimaksud; JANGAN commit `.env*`/key; tanpa migrasi → commit parent saja; push ditolak → `git fetch`, cek `git log main..origin/main`, `git pull --no-rebase`, gate hijau, push; laporkan hash + pesan + file kunci.
- Handoff small model: kerjakan S1→S5 berurutan; JANGAN sentuh server action swap, worker, scraper, `routing.ts`, middleware, CSP, RLS, skema DB; bila ragu soal status image/filter, baca ulang `Board.tsx:54-64` (sumber kebenaran filter) dan `KontenList.tsx:131-144,342-364` (pola navigasi).
