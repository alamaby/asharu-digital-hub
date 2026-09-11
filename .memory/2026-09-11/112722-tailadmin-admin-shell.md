# TailAdmin Admin Shell — Layout Non-Publik Seragam

Tanggal: 2026-09-11 ~10:15–12:45 (6 fase, 5 commit parent + 1 commit submodule)

## Tugas

Ganti layout UI admin/non-publik (sebelumnya hanya `AdminTopBar` horizontal + kartu ad-hoc)
dengan shell ala TailAdmin: sidebar classic-collapsible + header + breadcrumb + dark mode +
chart + dasbor agregasi. Keputusan user: sidebar classic collapsible; boleh migrasi Supabase
baru; `/masuk` ikut shell gelap; cakupan semua non-publik; upgrade Tailwind 4; full+chart+dark.

## File kunci diubah

- `src/app/globals.css` — Tailwind v4 CSS-first: `@theme` token Asharu 1:1 + token TailAdmin
  (brand/gray/success/error/warning/blue-light/orange, shadow-theme, z-index, text-theme/title),
  `@utility menu-*`, override ApexCharts, kompat border, `.dark` token + unlayered `.text-primary`.
- `tailwind.config.ts` DIHAPUS; `postcss.config.mjs` → `@tailwindcss/postcss`.
- `src/app/[locale]/layout.tsx` dirampingkan (bare); chrome publik → `(public)/layout.tsx`;
  41 file rute pindah via `git mv` ke `(public)/` (11) dan `(admin)/` (admin 22 + konten 5 + masuk).
- Shell baru `src/components/admin/shell/`: `AdminThemeContext` (+`AdminThemeScript` anti-flash),
  `AdminSidebarContext`, `admin-nav.ts`, `AdminSidebar`, `AdminHeader` (breadcrumb+tema+bahasa),
  `AdminShell`, `AdminSidebarSlot` (server, baca `is_admin`), `AdminCard/Badge/PageHeader`.
- `src/components/admin/charts/`: `chart-options.ts` + `AdminTrendChart` + `AdminFunnelChart`
  (apexcharts dynamic `ssr:false`, dark-aware, sr-only values).
- `src/components/admin/DashboardCards.tsx` + `(admin)/admin/page.tsx` — 4 stat + tren 14h +
  funnel donut + ringkasan LLM 7h dari view baru; `(admin)/masuk/page.tsx` kartu auth.
- `AdminTopBar.tsx` DIHAPUS; `src/middleware.ts` guard → `/admin/*` + `/konten/(review|riset)`;
  404 dibagi via `NotFoundContent`; `routing.ts` + `navigation.ts` tambah `/admin/sosial`;
  `messages/id|en.json` tambah kunci nav/a11y/dashboard (paritas dijaga test).
- `supabase/migrations/20260911000001_admin_dashboard_views.sql` — 4 view security_invoker +
  GRANT authenticated (pola `v_llm_provider_models`).

## Keputusan & asumsi

- Palet admin = TailAdmin (brand #465fff); token publik Asharu tidak diubah (1:1).
- Next tetap 15.1 (komponen TailAdmin di-backport; upgrade Next 16 ditunda).
- Rute `(admin)` dinamis (slot sidebar baca auth); publik tetap SSG penuh (tanpa baca cookie di root).
- `/konten/baru` + `/masuk` tetap publik (tanpa guard), sidebar tampil minimal (Buat/Masuk).
- `bg-primary` dipertahankan di dark (kontras tombol); teks primary dinaikkan via override.
- Tidak ada file TailAdmin yang disalin verbatim (tulis ulang) — tanpa file atribusi MIT.

## Risiko / follow-up

- Deep-restyle halaman dalam (konten/riset/review/llm/visual/sosial/baru) belum — isi masih lama,
  sudah seragam via shell + dark otomatis.
- QA dasbor terautentikasi via browser belum (butuh login magic-link) — fondasi token sama
  dengan `/masuk` yang terverifikasi; verifikasi pasca-deploy disarankan.
- Upgrade Next 15→16 + evaluasi `next-intl` ditunda.

## Verifikasi

- `npm run typecheck` + `npm run lint` + `npm test` (406 passed, 55 file) + `npm run build`
  (57 rute utuh) hijau.
- QA browser dev: sidebar desktop expand/collapse, drawer mobile + backdrop, toggle dark dua arah,
  `/id` publik utuh, tanpa page error. Audit CSS build: varian responsif `lg\:` + `width >=` ada.
- View DB terverifikasi SELECT: funnel completed 18 / awaiting_selection 5; tren + LLM + gambar ada data.

## Commit

- Parent: `5e8c12c` (TW4), `51789b2` (shell+route group), `90eebc2` (pointer supabase),
  `f375dbf` (dark+dasbor+masuk), + commit Fase 5 ini.
- Submodule: `78c6a62` feat(db): view agregasi dasbor admin.

## Plan terkait

- `plans/2026-09-11-tailadmin-admin-shell.md` (sumber status Kronologis lengkap).
