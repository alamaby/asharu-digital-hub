# Chat Lab — Test Provider & Model Chat (`/lab`)

Created: 2026-09-17 12:00:00

## Objective
User login bisa menguji provider/model chat LLM: 1 prompt → 1–3 target paralel, respons side-by-side + metrik (token, latency, speed, throughput) + history per-user 30 hari + log detail + chart statistik. Studio tetap khusus image.

## Scope
- Rute login-only `/lab` (sidebar Manage, `adminOnly:false`); middleware otomatis (non-publik → `/masuk`).
- Tabel baru `chat_lab_config` (singleton) + `chat_lab_batches` + `chat_lab_runs`; RLS owner; cleanup cron harian.
- Backend `src/lib/lab/`: types/validation/stats murni + actions (options/run/list/get/delete/stats) + `strictPinned` di `completion.ts`.
- Frontend `src/components/lab/`: Form + CompareGrid + History + Stats (ApexCharts, `ssr:false`) + i18n id/en + `lab` di allow-list client.
- Non-streaming fase 1 (`tok/s = completion/latency`); `ttft_ms` disiapkan NULL untuk fase 2 SSE.

## Milestones
1. Migrasi submodule + apply prod
2. Lib + actions + tests
3. UI + routing/nav/i18n + page + cleanup API
4. Gate + commit submodule→parent + push + memori

## Tasks
- [x] Migrasi `supabase/migrations/20260918000001_chat_lab.sql` + apply + verifikasi
- [x] `src/lib/lab/{types,validation,stats}.ts` + tests
- [x] `completion.ts`: flag `strictPinned` opsional (default false)
- [x] `src/lib/lab/actions.ts` (+config, kuota, rate-limit) + tests
- [x] `src/components/lab/*` (Form/Compare/History/Stats) + `LabUi.test.tsx`
- [x] `routing.ts` + `navigation.ts` + `admin-nav.ts` + `messages/id,en.json` + `client-messages.ts`
- [x] `src/app/[locale]/(admin)/lab/page.tsx` + `src/app/api/lab/cleanup/route.ts`
- [x] Gate `typecheck/lint/test/build` + commit + push + memori

## Risks
- Biaya fan-out ×3 → cap 3 target + maxTokens 1000 + rate-limit 30/jam + daily 50; counter: tetap 3× single — diterima (user pilih komparasi).
- Token NULL (Cloudflare) → tampil `-`, agregat abaikan NULL.
- Bundle Apex → `dynamic ssr:false` hanya di LabStats.
- `strictPinned` ubah perilaku global → flag opsional + test regresi.

## Progress Log
- 2026-09-17 12:00:00 — Plan disetujui (Chat Lab /lab, non-stream, per-user 30h, komparasi 2–3). Mulai eksekusi.

## Notes
- Histori dipisah `chat_lab_*` (bukan reuse `llm_call_logs`: tanpa `user_id`, RLS `no_read`) — sama alasan dengan Studio pisah dari `content_draft_images`.
- Setiap run Lab tetap tercatat di `llm_call_logs` (`stage='chat_lab'`) untuk observabilitas admin global.
- TTFT/inter-token `-` di fase 1; kolom `ttft_ms` + label "streaming menyusul" disiapkan.
