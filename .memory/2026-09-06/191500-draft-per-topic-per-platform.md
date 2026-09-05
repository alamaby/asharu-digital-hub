# 1 draf per topik per platform + checkbox + validasi panjang + copy mudah

- Task: ubah "Semua Platform = 1 draf agnostik" menjadi 1 draf per topik per platform; form dropdown → checkbox; tiap konten teroptimasi batas char + mudah copy-paste.
- Keputusan user: Semua=6 aktif; 1 afiliasi per topik lintas platform; draf lama arsip 'all'; over-limit simpan+tandai; default semua dicentang.
- Key files:
  - `supabase/migrations/20260906000004_draft_platform_session_platforms.sql` (applied prod): `content_drafts.platform_slug` FK + index, `sessions.platform_slugs text[]`, baris arsip `platforms('all', nonaktif)`, backfill (24 all, threads+facebook spesifik).
  - `src/lib/research/development.ts`: `resolveTargetPlatforms` (multi>tunggal>ekspansi aktif), loop pasangan + idempotensi per (topik,platform), afiliasi 1× per topik, chunking 6/tick (return sisa → orchestrator tahan `developing`), audit panjang + 1x retry-shorten + flag `llm_meta.over_limit/length_audit`, insert `platform_slug`.
  - `src/lib/research/thread.ts`: `auditThreadLength` + `DEVELOP_PAIRS_PER_TICK` (murni, testable).
  - `src/lib/research/orchestrator.ts`: developing lanjut tick bila sisa > 0.
  - `src/components/content/ContentRequestForm.tsx` + `actions.ts` + `baru/page.tsx`: checkbox multi (Pilih/Hapus semua, hint estimasi N draf/topik, min 1); 1 pilihan = jalur legacy; N = `platform_slugs`.
  - Review: filter langsung `platform_slug`; `ContentDraftCard`: badge platform + counter `n/max` per post + banner over-limit + "Salin semua untuk {platform}"; admin detail: platform per topik.
  - i18n: 4 form + 5 review keys (id+en).
- Risks: latensi sesi full ±6× (chunking + matriks); hitungan `length` vs aturan platform (headroom 90% + URL reserve); dual sumber platform sesi via resolver tunggal.
- Verification: `typecheck` ✓, `lint` ✓, `267/267` tests ✓ (+4 baru: auditThreadLength + checkbox).
- Commit proposal: `feat(research): one draft per topic per platform plus length audit plus copy UX`
- Related: sesi `815c8df8` (arsip), `plans/2026-09-06-riset-815c8df8-fix-retry-tavily-log-perf.md`.
