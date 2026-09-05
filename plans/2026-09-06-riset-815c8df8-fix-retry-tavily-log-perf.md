# Fix Riset 815c8df8 — Empty LLM, Self-Retry User, Log Search & Perf

Created: 2026-09-06 00:00:00

## Objective

Perbaiki gagal discovery-empty pada sesi 815c8df8, beri user cara ulang riset gagal, tampilkan log lengkap Tavily di menu LLM logs, lengkapi data performa per provider/model/search untuk dashboard.

## Scope

- In: discovery.ts, completion.ts, openai-compatible.ts, search audit, migrasi search_logs + llm perf, admin/llm/logs tab, halaman status user, admin detail perf, routing.
- Out: ganti provider search, pricing akurat, chart dashboard baru.

## Milestones

1. Tahan gagal empty-response + auto-fallback terlihat di UI
2. User self-retry + admin retry tetap
3. Search log generik + LLM log lengkap + kolom perf

## Tasks

- [x] T1 Parser LLM tahan kosong (content array/tool_calls/reasoning_content, usage alias, finish_reason, rawPreview)
- [x] T2 Auto-fallback + UX (empty → error log + markModelFailure + waterfall; banner fallback di UI)
- [x] T3 Preventif (chunked kosong guard, maxTokens 4000, raw_len log, extractLargestJson)
- [x] T4 Ulang oleh user (retryOwnSession + rate-limit 5/jam + halaman /konten/riset/[sessionId] + RLS owner + success link)
- [x] T5 Log search generik (search_call_logs: provider_slug/operation/queries/latency/result/error/payload/summary)
- [x] T6 Menu LLM log lengkap (tab LLM/Search + kolom total/finish/fallback + detail sesi)
- [x] T7 Perf lengkap (total_tokens/finish_reason/is_fallback + index session/stage)
- [x] T9 Skor 0 sunyi + LLM (0): scoring maxTokens/parser/validasi-ID/throw-jujur, verification sama, RLS admin read llm_call_logs, gemini total
- [ ] T8 Verifikasi sesi 815c8df8 via tombol Ulangi (butuh user klik; sesi anon created_by null → hanya admin bisa retry)

## Risks

- Naraya shape berubah lagi → mitigasi rawPreview 2k + finish_reason.
- Log search membesar → mitigasi summary top-3 + retensi rencana 90 hari.
- Self-retry spam → mitigasi 5x/jam/sesi.
- Fallback sembunyikan model rusak → mitigasi failure_count + banner + warn log.

## Progress Log

- 2026-09-06 — Diagnosis + implementasi selesai; typecheck/lint/263 tests hijau; migrasi search_logs_llm_perf + research_owner_retry applied production.
- 2026-09-06 — Follow-up: skor 0 = scoring LLM output terpotong (tanpa maxTokens + regex greedy → parse [] sunyi); LLM (0) = RLS no_read blokir user-JWT di detail admin. Fix: maxTokens scoring 4000/verifying 2000, parser brace-matched + validasi ID + throw jujur, policy llm_call_logs_admin_read, gemini total. Gate hijau (typecheck/lint/52 tests). Data sesi ini tidak di-backfill (breakdown #3 terpotong).
- 2026-09-06 — Menunggu verifikasi E2E: klik Ulangi pada sesi gagal (admin untuk sesi anon).

## Notes

- Diagnosis: Tavily OK (62 raw/42 deduped), naraya qwen3.8-27b HTTP 200 tapi text='' + usage null (2x) → parse fail. Tidak ada tabel search log sebelumnya; llm_call_logs kosong di response/tokens.
- Trade-off disetujui user: retry pemilik+admin; tabel search baru generik (provider_slug); auto-fallback ya + tampil di UI.
- File kunci: src/lib/llm/providers/openai-compatible.ts, src/lib/llm/completion.ts, src/lib/research/discovery.ts, src/lib/content/actions.ts (retryOwnSession), src/app/[locale]/konten/riset/[sessionId]/page.tsx, src/app/[locale]/admin/llm/logs/page.tsx, supabase/migrations/20260906000001_search_logs_llm_perf.sql, 20260906000002_research_owner_retry.sql.
