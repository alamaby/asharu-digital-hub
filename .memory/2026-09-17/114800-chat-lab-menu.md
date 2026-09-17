# Chat Lab — Menu Uji Provider & Model Chat (`/lab`)

- Plan: `plans/2026-09-17-chat-lab-plan.md`
- Commit: `7541c8d` — `feat(lab): menu chat lab uji provider model dengan komparasi dan statistik`
  (parent); submodule `a6dfa2b` — `feat(db): tabel chat lab uji provider model chat`. Keduanya pushed.

## Masalah / Tugas
Studio (`/studio`) hanya untuk generate image. User minta menu baru login-only untuk test
provider/model **chat**: komparasi 1 prompt → 1–3 target paralel + history + log detail +
chart statistik (token, latency, speed, throughput).

## Perubahan kunci
- `supabase/migrations/20260918000001_chat_lab.sql` — `chat_lab_config` (singleton:
  retention 30h, daily 50, max 3 target, default temp 0.7/max 1000) + `chat_lab_batches`
  + `chat_lab_runs` (snapshot slug + prompt/completion/total/thought + latency +
  `tokens_per_sec` + `ttft_ms` NULL fase 2 + fallback/truncated/error + request/response) +
  RLS owner (+admin/service) + cron `asharu-lab-cleanup` harian → `/api/lab/cleanup`.
  Applied prod via MCP (3 tabel terverifikasi, RLS on).
- `src/lib/lab/{types,validation,stats}.ts` — tipe, zod (prompt 10–4000, temp 0–2,
  max 1–8000, tolak target duplikat + pin silang), `tokensPerSec`/`batchThroughput`/
  `summarizeLabRuns`/`formatCompact` murni + `buildLabExpiry` di validation
  (bukan actions: build menolak export sync di file `'use server'`).
- `src/lib/llm/completion.ts` — flag opsional `strictPinned` (default false, jalur lama
  tak berubah): pin gagal = throw tanpa fallback global agar komparasi adil.
- `src/lib/lab/actions.ts` — `listLabOptions`/`runChatLabBatch` (fan-out
  `Promise.allSettled` strict, tetap log `llm_call_logs stage='chat_lab'`)/
  `listLabBatches` (filter status/provider/model)/`getLabBatch`/`deleteLabBatch`/
  `getLabQuota`/`getLabStats`/`cleanupExpiredLabBatches`; rate-limit `chat_lab` 30/jam.
- `src/components/lab/*` — `LabForm` (system/prompt/temp/max + 1–3 slot target +
  tambah/hapus + reuse), `LabCompareGrid` (side-by-side + badge fallback/terpotong +
  salin + detail request), `LabHistory` (filter + reuse + hapus 2-tahap + detail log),
  `LabStats` (KPI + bar token/latency/speed + donut + tabel sr-only; CSS-only,
  tanpa Apex — deviasi sadar dari plan demi bundle nol), `LabPageClient`.
- Routing/nav/i18n: `routing.ts` `/lab` (id+en), `navigation.ts` key `chatLab`,
  `admin-nav.ts` entry `adminOnly:false` (ikon MessagesSquare), `meta.lab` +
  `nav.chatLab` + namespace `lab.*` id/en paritas, `lab` di `CLIENT_MESSAGE_NAMESPACES`.
- `src/app/[locale]/(admin)/lab/page.tsx` (guard login → `/masuk`, `robots noindex`) +
  `src/app/api/lab/cleanup/route.ts` (Bearer cron).

## Keputusan / Asumsi / Risiko
- Non-streaming fase 1: `tok/s = completion/latency`; TTFT `-` ("streaming menyusul").
- Histori dipisah `chat_lab_*` (bukan reuse `llm_call_logs`: tanpa `user_id`, RLS no-read).
- Cloudflare tanpa usage → metrik `-`, agregat abaikan NULL.
- Biaya fan-out ×3 dibatasi: max 3 target + maxTokens default 1000 + 30/jam + 50/hari.
- Chart CSS-only (bukan ApexCharts): trade-off bundle nol vs interaksi hover — diterima.

## Blocker / Belum
- Verifikasi live: login → `/id/lab` submit 1–2 target → cek hasil + history + stats;
  anon → redirect `/masuk`; cek cron `asharu-lab-cleanup` di Dashboard → Cron Jobs.
- Fase 2: streaming SSE (TTFT/inter-token), export CSV, biaya per model.

## Verifikasi
- `npm run typecheck` ✓, `npm run lint` ✓, `npm test` 742/742 (88 files; 32 baru lab) ✓,
  `npm run build` ✓ (`/id/lab`, `/en/lab`, `/api/lab/cleanup`).
- Insiden build: export sync di file `'use server'` → pindah `buildLabExpiry` ke
  validation.ts (pelajaran: helper murni jangan di actions).

## Commit
- `feat(lab): menu chat lab uji provider model dengan komparasi dan statistik`
  (`7541c8d` parent + `a6dfa2b` submodule, pushed).
