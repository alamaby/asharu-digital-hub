# Riset Completed Tanpa Hasil — Fix Plan

Created: 2026-09-02 12:00:00

## Objective
Agar `status=completed` selalu memiliki draf yang tampil di `/admin/riset/[id]`, pesan empty-state tidak menyesatkan, dan kegagalan insert tidak silent.

Kasus terlapor: `124a1931-5d2b-4a7f-a264-aeabb7332f5f` — facebook, status `completed`, 5 topik `shortlisted` (score 7.0-7.6) tapi `Belum ada sesi riset.` dan 0 draf.

## Scope
- DB: `content_drafts.request_id` FK ke `content_requests(id)`
- BE: `src/lib/research/development.ts`, `src/lib/research/orchestrator.ts`
- FE: `src/app/[locale]/admin/riset/[sessionId]/page.tsx`, i18n `src/messages/id.json` & `en.json`

## Diagnosis (verified 2026-09-02 via Supabase asharu-be-production)

- `content_drafts_request_id_fkey = FOREIGN KEY (request_id) REFERENCES content_requests(id) ON DELETE CASCADE` masih aktif.
- `development.ts:172-190` insert `request_id = sessionId` (UUID dari `content_research_sessions`, bukan `content_requests`) → `23503 foreign_key_violation` silent (tanpa cek `error`).
- `development.ts:192` tetap insert log `draft generated with affiliate ASH-155` meski insert gagal.
- `orchestrator.ts:128-131` tetap `atomicTransition developing→completed` meski insert gagal.
- `page.tsx:95-98` query `WHERE request_id = sessionId` return 0 → `page.tsx:167-171` fallback `t('empty') = "Belum ada sesi riset."` (seharusnya `noDrafts`).
- `content_drafts` total 1 row (`ba4e75bb-...`) tidak terkait sesi terlapor; `content_research_logs` untuk `124a...` tidak ada error `developing` selain info.

## Milestones
1. Hotfix DB + BE error handling
2. Fix UI empty-state + logs visibility
3. Verifikasi & data repair

## Tasks
- [x] 1. DB migrasi `20260902000002_fix_drafts_fk_for_research.sql` — `DROP CONSTRAINT content_drafts_request_id_fkey` + buat nullable + tambah constraint optional (allow research-only drafts)
- [x] 2. `development.ts` — cek `error` dari `insert`, `throw` jika FK/violasi, jangan log success palsu
- [x] 3. `orchestrator.ts` — cek return `atomicTransition`, dan jika `runDevelopment` pernah set `failed` (no shortlisted), jangan paksa `completed`; propogate `failed`
- [x] 4. `page.tsx` — ganti `t('empty')` → `t('noDrafts')`, query draf via `request_id = sessionId OR research_topic_id IN (topics)`, tampilkan `content_research_logs` section
- [x] 5. `id.json`/`en.json` — tambah `noDrafts`, `logsHeading`, `draftsEmptyHint`
- [x] 6. Verifikasi: `npm run build` + cek sesi `124a...` setelah retry

## Risks
- Drop FK non-destruktif dibungkus `IF EXISTS` agar migrasi idempotent.
- Membuat `request_id` nullable tidak merusak data lama (`content_requests` tetap punya drafts via FK cascade, tapi research drafts kini optional).
- Jangan ubah `content_requests` — hanya `content_drafts`.
- `request_id` yang sudah nullable perlu RLS tetap `is_admin()` — tidak berubah.

## Progress Log
- 2026-09-02 12:00 — plan created, diagnosis verified via Supabase
- 2026-09-02 12:10 — DB checked: 3 sessions, 15 topics, 1 draft unrelated, 67 logs; FK confirmed active
- 2026-09-02 12:20 — DB migration applied: `content_drafts_request_id_fkey` dropped, `request_id` nullable, `drafts_has_link` added
- 2026-09-02 12:25 — `development.ts` fixed: cek `draftError` + throw + log error
- 2026-09-02 12:26 — `orchestrator.ts` fixed: re-read status after `runDevelopment`, cek `atomicTransition` return
- 2026-09-02 12:30 — `page.tsx` fixed: dual query by `research_topic_id` + `request_id`, `t('noDrafts')`/`draftsEmptyForCompleted`, tambah section Log (30 latest)
- 2026-09-02 12:31 — `id.json`/`en.json` tambah `noDrafts`, `noDraftsHint`, `logsHeading`, `logsEmpty`, `draftsEmptyForCompleted`
- 2026-09-02 12:35 — `npm run build` ✓ 44 pages, no type error
- 2026-09-02 12:36 — `supabase/migrations/20260902000002_fix_drafts_fk_for_research.sql` created for DB-as-Code

## Notes
- Alternatif yang ditolak: tambah kolom `research_session_id` baru — lebih bersih long-term tapi butuh ubah 4 file + double FK; pragmatic fix sekarang = drop FK dan izinkan `request_id` = sessionId (sesuai `.memory/2026-09-02/102000-content-pipeline-4stage.md`).
- Sesuai AGENT Guidance: DB as Code, Non-Destructive Migrations, RLS Strict, i18n.
