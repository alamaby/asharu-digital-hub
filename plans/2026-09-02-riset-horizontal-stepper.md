# Riset Horizontal Stepper — Visual Node Progress

Created: 2026-09-02 12:45:00

## Objective
Tambah visual node progress menyamping kiri→kanan di `/admin/riset/[sessionId]` agar user tahu posisi saat ini, sisa step, dan waktu eksekusi tiap step. Pilihan user: Opsi B (timestamp dari logs agregasi), label bahasa user, `awaiting_selection` tetap amber, ETA perlu.

## Scope
- FE: `src/components/admin/ResearchStepper.tsx` (baru)
- FE: `src/app/[locale]/admin/riset/[sessionId]/page.tsx`
- i18n: `src/messages/id.json`, `src/messages/en.json`
- BE reuse: `content_research_sessions.current_stage_started_at`, `content_research_logs`

## Milestones
1. i18n stepper
2. Komponen ResearchStepper (horizontal, responsive, a11y, amber awaiting, ETA, Opsi B)
3. Integrasi page.tsx
4. Build verify

## Tasks
- [x] 1. i18n stepper bahasa user (pending→Menunggu, discovering→Mencari, verifying→Memverifikasi, scoring→Menilai, awaiting_selection→Menunggu Pilihan, developing→Mengembangkan, completed→Selesai, failed→Gagal) + `stepper.ariaLabel`, `stepper.stepsRemaining`, `stepper.eta`, `stepper.executedAt`
- [x] 2. ResearchStepper.tsx — `STEPS` linear, `failed` orthogonal, flex `overflow-x-auto`, konektor, warna primary/amber/danger, icons lucide, tanggal dari logs MIN(created_at) per stage, ETA = `current_stage_started_at + 5m guard + 10m cron`
- [x] 3. page.tsx — extend select `current_stage_started_at, updated_at`, pass `status, currentStageStartedAt, createdAt, logs` ke stepper, placement setelah header
- [x] 4. `npm run build` + manual check `124a1931...` (completed) dan `awaiting_selection` session

## Risks
- Logs belum ada untuk stage awal → fallback ke `created_at` / `current_stage_started_at`
- `failed` timestamp ambigu → pakai last log stage `error` atau current
- Mobile 7 node sempit → `overflow-x-auto snap` bukan shrink

## Progress Log
- 2026-09-02 12:45 — plan created (Opsi B, bahasa user, amber tetap, ETA perlu)
- 2026-09-02 12:46 — build mode: implement
- 2026-09-02 13:05 — i18n id/en `stepper` 12 keys bahasa user + ETA
- 2026-09-02 13:08 — `ResearchStepper.tsx` created: STEP_ORDER 7, Opsi B logs MIN(created_at), amber awaiting, failed red, ETA logic, icons lucide
- 2026-09-02 13:10 — `page.tsx` extend select `current_stage_started_at, updated_at`, limit logs 100, render stepper after header
- 2026-09-02 13:15 — `npm run build` ✓ 44 pages, no type error

## Notes
- Design tokens: `tailwind.config.ts` palette, `globals.css` focus, `lucide-react` icons.
- Tidak pakai shadcn — hand-rolled Tailwind.
- Opsi B: agregasi MIN(created_at) per stage dari `content_research_logs` (limit 100), bukan per-stage history table.
