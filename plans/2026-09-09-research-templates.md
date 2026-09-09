# Template Riset (6 pilihan)

Created: 2026-09-09 16:10:00

## Objective
User memilih 1 dari 6 template riset (opsional, default Bebas) saat membuat riset baru; template mengarahkan discovery + development + Generate Idea.

## Scope
- Katalog `research_templates` (DB) + `sessions.template_slug` (NULL = Bebas)
- Form `/konten/baru` picker + `createResearchSession` + `generateIdea`
- Prompt discovery/development + badge detail sesi

## Milestones
1. Migrasi katalog (submodule)
2. Backend pipeline
3. Form + i18n + badge
4. Verifikasi + rilis

## Tasks
- [x] T1 Migrasi `20260909000002_research_templates.sql` (tabel + seed 6 + kolom + RLS) — submodule `967191d`, pushed
- [x] T2 `src/lib/research/templates.ts` (slug enum + `getResearchTemplateHint`)
- [x] T3 `actions.ts`: schema `template`, validasi aktif, insert `template_slug`, `generateIdea` sadar template
- [x] T4 `prompts.ts` + `llm/prompt.ts`: hint discovery + struktur thread; wiring `orchestrator.ts` + `development.ts`
- [x] T5 Form picker + `baru/page.tsx` props + i18n id/en + badge detail sesi
- [x] T6 Test (`templates.test.ts`, picker) — gate hijau 328 tests
- [x] T7 Terapkan migrasi ke production via MCP (butuh akses tulis DB)

## Risks
- Katalog di DB: isi hint tidak ter-review di PR kode (mitigasi: seed ditinjau).
- `product-comparison`/`top-product-list` berasumsi multi-produk vs afiliasi 1 produk/thread — v1 narasi saja.
- Nama `before-after` tak terkait strategi `before` image yang dihapus.

## Progress Log
- 2026-09-09 16:10:00 — Implementasi selesai + gate hijau (typecheck, lint, 328 tests); submodule pushed; parent siap commit. Migrasi production (T7) menunggu eksekusi.
- 2026-09-09 — T7 selesai: migrasi `research_templates` teraplikasi ke production via MCP; verifikasi 6 seed aktif + kolom `sessions.template_slug` ada.

## Notes
Keputusan user (plan mode): Discovery + development, tabel DB baru, opsional + Bebas, GenerateIdea sadar template.
