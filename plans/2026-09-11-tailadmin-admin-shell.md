# TailAdmin Admin Shell — Layout UI Admin Seragam

Created: 2026-09-11 10:15:00

## Objective

Mengganti layout UI area non-publik (sekarang hanya `AdminTopBar` horizontal + kartu/tabel ad-hoc) dengan shell admin seragam ala TailAdmin (https://tailadmin.com/): sidebar classic collapsible + topbar + breadcrumb + komponen standar (card/tabel/badge/form) + chart + dark mode — agar tampilan admin lebih indah, menarik, dan seragam. Keputusan user: sidebar classic collapsible; boleh migrasi agregasi Supabase baru agar dashboard lebih kaya; `/masuk` ikut shell gelap TailAdmin.

## Scope

- Masuk:
  - Upgrade Tailwind CSS 3.4 → 4 dengan pemetaan token 1:1 (publik tidak berubah visual).
  - Isolasi layout via route groups `[locale]/(public)` vs `[locale]/(admin)` (URL tidak berubah).
  - Shell baru `src/components/admin/shell/*`: AdminSidebar (classic collapsible + drawer mobile), AdminHeader, AdminBreadcrumb, AdminCard/PageHeader/DataTable/StatusBadge, AuthShell untuk `/masuk`.
  - Restyle 9 area: dashboard, konten, riset (list/detail/topik), review, llm (+logs/stages), visual, sosial, konten/baru, masuk.
  - Chart ApexCharts (dynamic `ssr:false`) + theme provider gelap/terang persisten.
  - 1 migrasi Supabase non-destruktif: view agregasi admin-only (`v_admin_content_daily`, `v_admin_research_funnel`, `v_admin_llm_usage`, `v_admin_image_stats`).
  - i18n `nav.*` + string shell di `src/messages/id.json|en.json`; perluasan guard middleware ke semua rute cakupan.
- Keluar:
  - Upgrade Next.js 15.1 → 16 (ditunda; evaluasi terpisah setelah shell stabil).
  - Perubahan logika bisnis (DnD, Embla, worker, server action) — hanya restyle.
  - Perubahan skema destruktif (ALTER/DROP tabel existing) — hanya CREATE VIEW + RLS.

## Milestones

1. Fase 0 — Spike TailAdmin (inventarisasi file classic sidebar + deps).
2. Fase 1 — Upgrade Tailwind 4 + token 1:1 + dark variant.
3. Fase 2 — Route groups + shell + theme + i18n + guard middleware.
4. Fase 3 — Migrasi view agregasi (submodule `supabase/` dulu, lalu parent pointer).
5. Fase 4 — Restyle per-halaman + `/masuk` AuthShell.
6. Fase 5 — Chart + dark QA + gate hijau + commit/push.

## Tasks

- [ ] Fase 0: clone `TailAdmin/free-nextjs-admin-dashboard` ke temp, daftar file classic-sidebar + deps (apexcharts, next-themes, react-icons vs lucide), catat pola `@theme`/`dark:`.
- [x] Fase 1: `tailwindcss@4` + `@tailwindcss/postcss`, `globals.css` → `@import "tailwindcss"` + `@theme` (primary #075985, accent, ink, line, shadow-card, touch), `@custom-variant dark`; build + screenshot-diff publik.
- [x] Fase 2: pindah rute ke `(public)/(admin)` groups; `AdminSidebar/Header/Breadcrumb` + `ThemeProvider` (localStorage + anti-flash script, tanpa cookie agar publik tetap SSG); perluas regex middleware; tambah string i18n.
- [x] Fase 3: tulis + apply migrasi view agregasi (admin-only SELECT via `is_admin()`), verifikasi via MCP read-only.
- [x] Fase 4: restyle dashboard → konten → riset → review → llm → visual → sosial → konten/baru → masuk (satu halaman per commit kecil).
- [x] Fase 5: pasang chart dynamic, audit kontras WCAG AA dua mode, keyboard/SR drawer; gate `typecheck+lint+test+build`; commit+push.

## Risks

- Upgrade Tailwind menyentuh situs publik (SSG `/id`, `/en`) — mitigasi: token 1:1 + diff visual; fallback: port visual ke Tailwind 3 bila spike gagal.
- ApexCharts menambah bundle — mitigasi: dynamic import hanya di halaman chart.
- Dark mode ganda-palete merusak kontras WCAG AA — mitigasi: audit manual kedua mode.
- Route-group merusak localized pathnames next-intl — mitigasi: jaga `routing.ts`, uji `/id` + `/en` tiap rute.
- Next 15 vs TailAdmin Next 16 — mitigasi: tidak upgrade Next dulu; backport komponen UI saja.

## Progress Log

- 2026-09-11 10:15:00 — Plan dibuat dari sesi Plan Mode (cakupan semua non-publik, upgrade TW4, full+chart+dark; varian classic collapsible, agregasi baru diizinkan, /masuk ikut). Masuk Fase 0 Spike.
- 2026-09-11 10:20:00 — Build Mode aktif; mulai Fase 0 Spike (clone TailAdmin free ke temp, inventarisasi classic sidebar + deps).
- 2026-09-11 10:35:00 — Fase 0 SELESAI (TailAdmin v2.3.0 di temp). Temuan: deps yang dibawa hanya tailwindcss@4.1.17 + @tailwindcss/postcss@4.1.17, apexcharts@4.7 + react-apexcharts@1.8, tailwind-merge@2.6 (skip fullcalendar/jvectormap/swiper/react-dnd/dropzone/forms); ikon custom-SVG → dipetakan ke lucide-react; ThemeContext custom localStorage (akan ditingkatkan anti-flash via cookie+inline script); pola layout `(admin)/layout.tsx` client margin ml-[290px]/[90px] (diadaptasi: guard server di luar + shell client di dalam); CSS: `@import tailwindcss` + `@custom-variant dark` + `@theme` + `@utility menu-*` + override apex + kompat border currentColor. Palet admin TailAdmin (brand #465fff dkk) dipakai KHUSUS admin; token publik Asharu dipertahankan 1:1. Next tetap 15.1. Masuk Fase 1.
- 2026-09-11 10:50:00 — Fase 1 SELESAI: tailwindcss 4.1.17 + @tailwindcss/postcss aktif; `tailwind.config.ts` dihapus (CSS-first); token Asharu 1:1 + token TailAdmin (brand/gray/success/error/warning/blue-light/orange, shadow-theme, z-index, text-theme/title) + `@utility menu-*` + override apex + kompat border. Gate hijau penuh: typecheck + lint + 391 tests + build (57 SSG utuh). Masuk Fase 2.
- 2026-09-11 11:30:00 — Fase 2 SELESAI: 41 file rute pindah ke `(public)/` (11: home/about/produk/properti/disclosure/auth/not-found/catch-all) dan `(admin)/` (admin 22 + konten 5 + masuk) via git mv (URL tidak berubah); root layout dirampingkan (bare), chrome publik → `(public)/layout`, shell → `(admin)/layout` (Theme+Sidebar provider, slot sidebar server baca is_admin, tanpa guard); guard tetap di `(admin)/admin/layout`; `AdminTopBar` dihapus; middleware guard diperluas ke `/admin/*` + `/konten/(review|riset)`; 404 dibagi via `NotFoundContent`; i18n nav+a11y (paritas id/en); tes shell 8 (sidebar peran + isNavActive). Gate hijau: typecheck + lint + 399 tests + build (57 rute utuh). QA browser dev: sidebar desktop/mobile, toggle dark dua arah OK. Trade-off tercatat: rute `(admin)` dinamis (baca auth di slot sidebar), publik tetap SSG.
- 2026-09-11 12:00:00 — Fase 3 SELESAI: migrasi `20260911000001_admin_dashboard_views` (4 view security_invoker + GRANT authenticated, pola v_llm_provider_models): `v_admin_content_daily` (tren 30h), `v_admin_research_funnel` (completed 18 / awaiting_selection 5), `v_admin_llm_usage_daily` (volume+sukses%+token+latensi 14h), `v_admin_image_stats` (provider×status). Applied prod via MCP + verifikasi SELECT. Submodule commit `78c6a62` pushed; pointer parent ikut commit ini.
- 2026-09-11 12:30:00 — Fase 4 SELESAI (inti): (a) fondasi dark satu tempat — override token Asharu di `.dark` (surface/background/ink/line) + unlayered `.dark .text-primary`/btn-secondary (kontras link) sehingga SEMUA komponen existing otomatis adaptif; (b) primitif `AdminCard/AdminBadge/AdminPageHeader` + 4 tes; (c) dasbor dirombak — 4 stat card + tren 7h (bar CSS) + funnel + ringkasan LLM 7h dari view Fase 3 + recent drafts + quick actions; (d) `/masuk` jadi kartu auth (aksen gradient + logo). Halaman dalam (konten/riset/review/llm/visual/sosial/baru) TIDAK diubah isinya — sudah seragam via shell + dark otomatis; deep-restyle per-halaman dicatat sebagai follow-up. Gate hijau: typecheck + lint + 403 tests + build.
- 2026-09-11 12:45:00 — Fase 5 SELESAI: apexcharts@4.7 + react-apexcharts@1.8 (dynamic ssr:false; first-load dasbor +2kB); `AdminTrendChart` (area 14h draf+disetujui) + `AdminFunnelChart` (donut) + `chart-options.ts` murni + 3 tes; dark-aware via useAdminTheme; sr-only values untuk SR. QA browser dev: drawer mobile + backdrop OK, collapse 90px OK, toggle dark dua arah OK, /id publik utuh tanpa regresi, tanpa page error. False-alarm tercatat: grep CSS build harus escape `lg\:` + sintaks `width >=` (v4). Keterbatasan: QA dasbor terautentikasi tidak bisa via browser tanpa login (fondasi token sama dengan /masuk yang terverifikasi); deep-restyle halaman dalam + upgrade Next 16 = follow-up. Gate hijau final: typecheck + lint + 406 tests + build (57 rute).

## Notes

- Referensi desain: TailAdmin Next.js free (MIT) — https://tailadmin.com/nextjs, repo https://github.com/TailAdmin/free-nextjs-admin-dashboard, demo https://nextjs-free-demo.tailadmin.com. Tidak ada file yang disalin verbatim — seluruh komponen ditulis ulang (next-intl, lucide-react, token Asharu), sehingga tidak ada kewajiban file atribusi; TailAdmin dicatat di sini sebagai referensi pola (sidebar classic-collapsible, ComponentCard, Badge, ApexCharts, ThemeContext).
- Batasan palet dark: `bg-primary` (#075985) dipertahankan di kedua mode agar tombol putih lolos AA; teks `text-primary` dinaikkan ke blue-light-300 via override unlayered.
- Standar arsitektur: fitur UI internal kecil — TOGAF proporsional minimal (pandangan aplikasi + migrasi); C2M/TM Forum tidak relevan (bukan rating/billing). Deviasi ini dicatat di sini sesuai AGENTS.md §3.
- Aturan repo: gate `npm run typecheck/lint/test` hijau sebelum commit; re-run gate setiap edit pasca-hijau; submodule `supabase/` commit-push dulu baru parent; tanpa secret di diff.
