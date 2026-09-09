# Template riset: 6 pilihan saat membuat riset baru

Task: User memilih template riset opsional (Problem-Solution, Before-After, Product Comparison, Top Product List, Product Education, Promotion & Urgency; default Bebas) — mengarahkan discovery + development + Generate Idea.

## Perubahan
- Migrasi submodule `20260909000002_research_templates.sql`: tabel `research_templates` (slug/display/description/discovery_hint/development_hint/is_active/sort_order, seed 6) + `sessions.template_slug` FK nullable + RLS (read publik, write admin). Submodule `967191d`, pushed.
- `src/lib/research/templates.ts` — slug enum + `getResearchTemplateHint`.
- `actions.ts` — schema `template`, validasi aktif, insert `template_slug`; `generateIdea` tambah baris template pilihan user.
- `prompts.ts`/`llm/prompt.ts` — `templateDiscoveryHint` / `templateStructure`; wiring `orchestrator.ts` (2 call site) + `development.ts`.
- Form: picker radio Bebas + 6 (DB-driven, fallback Bebas-only); `baru/page.tsx` fetch; i18n id/en 4 kunci; badge "Template:" di detail sesi.
- Test: `templates.test.ts` (3) + picker form (1).

## Keputusan / Asumsi
- NULL = Bebas; sesi lama valid tanpa backfill.
- Nama template DB (ID) ditampilkan apa adanya di kedua locale.
- Limitasi: comparison/top-list multi-produk vs afiliasi 1/thread — v1 narasi saja.

## Verifikasi
- `npm run typecheck` ✓, `npm run lint` ✓, `npm test` ✓ (328 tests, 42 files).
- Belum: aplikasikan migrasi ke production via MCP + QA manual per template.

## Commit
- submodule `supabase@967191d` — `feat(research): katalog template riset + sessions.template_slug`
- parent: `feat(research): pilihan 6 template riset saat membuat riset baru`
