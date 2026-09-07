# Riset b8194a1f: skor 0 = by-design mekanisme dua (display fix)

- Task: user lapor topik sesi `b8194a1f-25eb-4680-8a55-cb923a69c449` skor 0 semua.
- Root cause (verifikasi MCP asharu prod): session `mechanism=dua`, `status=awaiting_selection`; 2 topik `final_score=0` + breakdown semua 0 + `verification_status=pending`; log HANYA 7 baris `discovering` (63 raw→33 deduped→15 ke LLM, pass-1 1 topik + retry +1 = 2). `orchestrator.ts:170,186-188` = mekanisme dua = discovery produk-aware lalu langsung `awaiting_selection` (verifying+scoring dilewati by-design). `discovery.ts:403-407,445` = `normalizeTopic` default `EMPTY_SCORE_BREAKDOWN` semua 0. Raw LLM discovery hanya return topic/category/why_now/angle, tanpa skor. BEDA dengan 815c8df8 (mekanisme satu: scoring jalan tapi output terpotong → parse sunyi).
- Temuan sekunder: `required_winners=3` tapi hanya 2 topik lolos meski sudah retry (tidak difix di sini).
- Key files: `src/app/[locale]/admin/riset/[sessionId]/page.tsx` (skippedStages + isDua + scoreNone di daftar), `.../topics/[topicId]/page.tsx` (lookup mechanism parent + scoreNone + scoreSkippedDua ganti breakdown), `src/components/admin/ResearchSessionActions.tsx` (prop isDua + shortlistIntroDua + scoreNone), `src/components/admin/ResearchStepper.tsx` (prop skippedStages + node redup + label Dilewati), `src/messages/id+en.json` (4 keys: stepper.skipped, shortlistIntroDua, scoreNone, scoreSkippedDua; paritas id/en).
- Decisions: tanpa migrasi (data 0 tetap, hanya display); mekanisme satu tidak berubah; verify di detail topik dua = `-`; breakdown nol disembunyikan (anti shortlist-buta mengira nilai 0).
- Risks: admin sesi dua lama tetap lihat 0 di DB mentah (hanya UI yang jujur); counter-argumen migrasi NULL-vs-0 ditolak (hindari churn schema untuk display issue).
- Blockers: tidak ada; data sesi tidak di-backfill (skor memang tidak pernah dihitung — bukan data hilang).
- Verification: `typecheck` ✓, `lint` ✓, `300/300` tests ✓ (termasuk messages parity).
- Commit proposal: `fix(research): honest no-score display for mechanism two`
- Related: sesi `b8194a1f-25eb-4680-8a55-cb923a69c449`, memory `2026-09-06/173000-riset-815c8df8-skor-nol-llm-nol.md`, memory `2026-09-06/230500-research-mechanism-two.md`.
