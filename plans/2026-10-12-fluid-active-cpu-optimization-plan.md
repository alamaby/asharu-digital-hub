# Fluid Active CPU Optimization — Implementation Plan

Created: 2026-10-12 12:00:00

## Objective

Menurunkan Fluid Active CPU `asharu-digital-hub` dari `3h 16m / 4h` (96,7% kuota Hobby) ke < `2h / 4h` per bulan, dengan mempertahankan seluruh perilaku pipeline (automation 1 run/hari 10:00 WIB, cover gate `prompt_ready → pending → selected`, publish hanya saat `selected`, daily cap Threads, error-digest window, ISR homepage 3600).

## Scope

- In scope:
  - 7 route cron `pg_cron */5`: `/api/content/process`, `/api/content/process-legacy`, `/api/image/generate`, `/api/automation/run`, `/api/social/post`, `/api/studio/process`, `/api/notifications/error-digest`.
  - 4 migrasi `pg_cron` reschedule di submodule `supabase/`.
  - Worker lib: `src/lib/image/worker.ts`, `src/lib/studio/worker.ts`, `src/lib/automation/runner.ts`, `src/lib/social/queue.ts`, `src/lib/notifications/error-digest.ts`, `src/lib/research/orchestrator.ts`, `src/lib/llm/completion.ts`.
  - Observability: log `idle:true` konsisten + test kontrak.
- Out of scope (jangan diubah dalam plan ini):
  - Konsolidasi 7 cron → 1 orchestrator (ditunda ke P1, lihat Notes).
  - Perubahan RLS, Vault, CSP, i18n routing, middleware auth semantics, skema DB selain `cron.alter_job`.
  - Perubahan copy/UI, pricing, domain model.

## Milestones

1. M1 Observability (S01): semua tick idle terukur (`idle:true`, `processed:0`).
2. M2 Idle murah (S02-S06, S08): lazy import + reorder + N+1 fix + deadline LLM.
3. M3 Jadwal hemat (S07 + S09): `pg_cron` jarang + `maxDuration` turun, verifikasi 24 jam.

## Tasks

- [x] S01 Kontrak log idle + test invariant cron routes
- [x] S02 Fast-path + lazy import `/api/automation/run`
- [x] S03 Lazy import `/api/notifications/error-digest`
- [x] S04 Reorder idle-check `/api/social/post` + lazy import Threads API
- [x] S05 Fix N+1 `enqueueNextMissingImage` + lazy import `/api/image/generate`
- [x] S06 `MAX_PER_TICK 5→2` + isolasi error `/api/studio/process`
- [x] S07 Reschedule 4 `pg_cron` job (migrasi submodule)
- [x] S08 Deadline LLM 90s untuk path image (`image_prompt` + compose)
- [x] S09 Turunkan `maxDuration` poller ringan
- [ ] S10 Verifikasi homepage `/[locale]` ISR (measurement-only, P2)

## Risks

- Menjarangkan cron menambah latensi pipeline 5→10/15 menit (cover, publish, digest). Mitigasi: tombol admin `Run now` tetap tersedia; `content-research` + `legacy` tetap `*/5`.
- Lazy `await import()` menambah 50-100ms saat ada kerja. Net tetap hemat karena >80% tick idle.
- `MAX_PER_TICK` turun menambah jumlah tick untuk backlog besar. Mitigasi: backlog diukur via S01 sebelum S06; operator bisa trigger manual.
- `deadlineMs` 90s bisa menggagalkan LLM lambat yang sebenarnya valid. Mitigasi: waterfall tetap lanjut ke provider berikut; hanya memotong hang >90s (kasus naraya 138-300s).
- Migrasi `cron.alter_job` memakai nama job, bukan `job_id` numerik (hindari drift `job_id=3` seperti insiden `20260902055944`). Rollback SQL disertakan.

## Progress Log

- 2026-10-12 12:00:00 — Plan dibuat dari analisis screenshot usage (3h16m/4h) + trace `156 inv/12 jam` + 7 migrasi `*/5`. Belum ada implementasi.
- 2026-10-12 22:13:00 — S01 selesai: src/test/cron-idle-contract.test.ts dibuat (7/7 test hijau), typecheck 0 error, lint 0 warning.
- 2026-10-12 22:18:00 — S02 selesai: fast-path disabled + lazy import di src/app/api/automation/run/route.ts, test runner + route test hijau (29/29), typecheck & lint bersih.
- 2026-10-12 22:20:00 — S03 selesai: lazy import di src/app/api/notifications/error-digest/route.ts, test error-digest + route test hijau (7/7), typecheck & lint bersih.
- 2026-10-12 22:24:00 — S04 selesai: reorder claim sebelum Vault/Meta di src/app/api/social/post/route.ts + lazy import threads, test queue + route + route-order hijau (16/16), typecheck & lint bersih.
- 2026-10-12 22:28:00 — S05 selesai: fix N+1 (2 query max) di src/lib/image/worker.ts, lazy import di src/app/api/image/generate/route.ts, test worker hijau (11/11), typecheck & lint bersih.
- 2026-10-12 22:29:00 — S06 selesai: MAX_PER_TICK=2 + continue on error di src/app/api/studio/process/route.ts, test worker + route-tick hijau (10/10), typecheck & lint bersih.
- 2026-10-12 22:33:00 — S08 selesai: deadlineMs 90_000 pada 3 call site image/studio LLM (src/lib/image/worker.ts & src/lib/studio/worker.ts), test completion + worker + studio hijau (25/25), typecheck & lint bersih.
- 2026-10-12 22:36:00 — S07 selesai: migrasi pg_cron CPU savings di submodule supabase/ (20261012000001_cron_cpu_savings.sql + tests/cron_cpu_savings.test.sql), commit 49ee434 di-push ke supabase origin main.
- 2026-10-12 22:39:00 — S09 selesai: maxDuration diturunkan (automation=120, social=120, studio=180), test route-maxduration hijau (2/2), build Next.js 122+ pages hijau tanpa warning.
- 2026-10-12 22:40:00 — S10 didokumentasikan sebagai post-deploy checklist (USER ACTION 24 jam pasca-deploy Vercel + apply migrasi S07).

## Notes

- Standar arsitektur: perubahan DB live wajib via migrasi plan ini (bukan eksekusi langsung), sesuai AGENTS.md §3/§6 (read-only MCP, Database as Code, Non-Destructive Migrations). TOGAF tidak diberlakukan penuh untuk fix operasional ini (ceremony proporsional).
- Konsolidasi 1 orchestrator ditunda: butuh desain fan-out + retry + deadline global baru; risiko regresi tinggi untuk model kecil. Plan ini hanya membuat tick murah + jarang.
- Env Guard: JANGAN print/log `CRON_SECRET`, `sb_secret_*`, `sb_publishable_*`, Vault secret ke chat/tool output/markdown. Test memakai secret dummy `test-secret-...`.
- Submodule `supabase/`: commit + push migrasi di submodule DULU, baru parent pointer. Eksekutor kecil: buat file migrasi + verifikasi lokal saja; apply prod = USER ACTION via MCP/DBA (jangan auto-apply).

---

## Requirement Traceability

| ID | Requirement / Finding | Sumber | Ditangani oleh |
|----|----------------------|--------|----------------|
| REQ-CPU-01 | Fluid Active CPU < 2h/4h per bulan | image-1.png `3h16m/4h` | S01 (ukur), S02-S09 (turunkan) |
| REQ-BEH-01 | Automation 1 run/hari, gate 10:00 Asia/Jakarta, `already_done` idempoten | `src/lib/automation/runner.ts:425-599` | S02, S07 (pertahankan) |
| REQ-BEH-02 | Cover gate `prompt_ready→pending→selected`, publish hanya `selected` | `src/lib/automation/runner.ts:898-985` | S02, S05, S06 (pertahankan) |
| REQ-BEH-03 | Social daily cap + no double-publish (`raced` bila 0 baris) | `src/app/api/social/post/route.ts:126-166`, `src/lib/social/queue.ts:151-160` | S04 (pertahankan) |
| REQ-BEH-04 | Error digest 1 email rangkuman per window, claim-first | `src/lib/notifications/error-digest.ts:210-242` | S03, S07 (pertahankan) |
| REQ-BEH-05 | ISR homepage 3600, halaman publik tetap SSG | `src/app/[locale]/(public)/page.tsx:33` | S10 (ukur saja) |
| F-01 | 7 job `*/5` → ~2.016 inv/hari, tiap tick boot berat | 7 migrasi `cron.schedule */5`, screenshot `156 inv/12 jam` | S01, S07 |
| F-02 | `image/generate` 30s/156 inv terbesar (2 lane + 2 LLM call + N+1 + base64) | `src/lib/image/worker.ts:336-364,204-294,465-495,519-564`, `52-77` | S05, S08 |
| F-03 | `studio/process` spike 10m (loop 5x LLM 800 token + waterfall) | `src/app/api/studio/process/route.ts:7,16-28`, `src/lib/studio/worker.ts:288-324` | S06, S08 |
| F-04 | `automation/run` poll 24 jam untuk gate harian + `maxDuration 300` | `src/app/api/automation/run/route.ts:6`, `runner.ts:425-599` | S02, S07, S09 |
| F-05 | `error-digest` tick 5 mnt untuk window 30 mnt (6x cek) | `src/lib/notifications/error-digest.ts:143-160`, cron `*/5` | S03, S07 |
| F-06 | `social/post` cek Vault/quota/token sebelum antrean kosong | `src/app/api/social/post/route.ts:91-153` vs `160-166` | S04 |
| F-07 | Top-level import berat → Cold Start 12,9%, Mem 233 MB | semua route cron import worker/LLM di baris 1-6 | S02-S06 (lazy import) |
| F-08 | `maxDuration 300` over-provisioned untuk poller | 5 route `maxDuration=300` | S09 |
| F-09 | Provider LLM hang 138-300s (naraya) → retry + attempts habis | `.memory/2026-09-25`, `completion.ts:159,228-234`, `DEFAULT_LLM_DEADLINE_MS=240_000` | S08 |
| F-10 | `/[locale]` 45 inv/12s + middleware auth per-request | image-2/3, `src/middleware.ts:13-77` | S10 (measurement-only) |

## Baseline Evidence (jangan diubah, untuk verifikasi)

- image-1: `Fluid Active CPU 3h16m/4h`, `asharu-digital-hub 3h9m 96,7%`.
- image-2/3 (Last 12 hours): `Invocations 1,2K`, `Active CPU P75 149ms`, `Memory Avg 233 MB/2,05 GB`, `CPU Throttle P75 1,9%`, `Cold Start 12,9%`.
- Per-route 12 jam: `image/generate 156/30s`, `[locale] 45/12s`, `automation/run 156/11s`, `error-digest 156/9s`, `studio/process 156/8s`, `social/post 156/7s`, `process-legacy 156/7s`, `content/process 156/6s`.

---

## S01 — Kontrak log idle + test invariant cron routes

- Tujuan: membuat semua tick idle terukur dan teruji sebelum optimasi, tanpa mengubah perilaku.
- Finding/requirement: F-01, REQ-CPU-01 (baseline untuk M3).
- Dependency: tidak ada (kerjakan pertama).
- File harus dibaca:
  - `src/app/api/automation/run/route.ts`
  - `src/app/api/notifications/error-digest/route.ts`
  - `src/app/api/social/post/route.ts`
  - `src/app/api/image/generate/route.ts`
  - `src/app/api/studio/process/route.ts`
  - `src/app/api/content/process/route.ts`
  - `src/app/api/content/process-legacy/route.ts`
  - `src/test/api-route-guards.test.ts` (pola invariant existing)
- File harus diubah:
  - Tambah 1 file baru: `src/test/cron-idle-contract.test.ts`
  - TIDAK ubah route apa pun di S01 (hanya test dokumentasi kontrak saat ini).
- Simbol terkait: `isCronAuthorized`, `runAutomationTick`, `runErrorDigestTick`, `claimDueQueueItem`, `processImageTick`, `processOneStudioImage`, `advancePendingSessions`.
- Kondisi saat ini:
  - `automation/run` return `{skipped:'disabled'|'not_due'|'already_done'}` atau `{ok:true,status}`.
  - `error-digest` return `{ok:true,...}` via `runErrorDigestTick` (`{sent,categories,eventCount}`).
  - `social/post` return `{idle:true,requeued}` atau `{idle:true,raced:true}` atau `{posted:true}`.
  - `image/generate` return `{ok:true,imageId,processed}` (`processed:0` saat idle).
  - `studio/process` return `{ok:true,processed:[],count:0}` saat idle.
  - `content/process` return `{advanced:number}` (`0` saat idle).
  - `process-legacy` return `{processed:0,message:'No pending requests'}` saat idle.
- Perubahan konkret: TIDAK ada perubahan logika. Buat test kontrak yang mengassert shape idle saat ini memakai fake Supabase client (tiru pola `src/lib/social/queue.test.ts`, `src/lib/image/worker.test.ts`):
  1. Buat `src/test/cron-idle-contract.test.ts`.
  2. Urutan di file: import vitest → definisikan helper `fakeEmptyClient` per tabel → 7 `describe` (satu per route lib) → assert idle shape.
  3. Isi tiap describe:
     - automation: mock `loadAutomationConfig→{isEnabled:false}` lalu assert `runAutomationTick` return `{ok:true,skipped:'disabled'}`.
     - error-digest: mock `error_notification_configs→[]` lalu assert `{sent:false,categories:[],eventCount:0}`.
     - social queue: mock `social_post_queue→[]` lalu assert `claimDueQueueItem→{outcome:'idle'}`.
     - image: mock `content_draft_images→[]` + `content_drafts→[]` lalu assert `processImageTick→{imageId:null,processed:0}`.
     - studio: mock `user_image_generations→[]` lalu assert `processOneStudioImage→{imageId:null}`.
     - research: mock `content_research_sessions→[]` lalu assert `advancePendingSessions→0`.
     - legacy: didokumentasikan sebagai `{processed:0}` (tanpa invoke LLM; cukup assert konstanta pesan).
- Behavior dipertahankan: 100% (S01 read-only terhadap route).
- Error handling/edge: test tidak boleh memanggil network/LLM/Vault asli; semua `runLLMCompletion`, `fetch`, Vault RPC di-`vi.mock`. Secret di test = string dummy.
- Test ditambah/diupdate: tambah `src/test/cron-idle-contract.test.ts` (7 case). Jangan ubah test lain.
- Input/expected:
  - Input: DB fake kosong + config disabled.
  - Expected: tiap lib return idle shape di atas (exact match via `toEqual`/`toMatchObject`).
- Command verifikasi:
  - `npm run typecheck`
  - `npm run lint`
  - `npm test -- src/test/cron-idle-contract.test.ts`
- Hasil diharapkan: typecheck 0 error, lint 0 warning (`--max-warnings=0`), 7 test hijau.
- Completion criteria: file test ada + hijau + tidak ada route diubah (`git status` hanya 1 file baru).
- Jangan ubah: semua `src/app/api/**`, `src/lib/**` (selain tambah test), `supabase/`, `vercel.json`, `.env*`.

## S02 — Fast-path + lazy import `/api/automation/run`

- Tujuan: tick `not_due`/`already_done`/`disabled` tidak memuat `runner.ts` berat.
- Finding/requirement: F-01, F-04, F-07, REQ-BEH-01, REQ-BEH-02.
- Dependency: S01 selesai (kontrak idle diketahui).
- File harus dibaca:
  - `src/app/api/automation/run/route.ts` (31 baris)
  - `src/lib/automation/runner.ts` baris 425-599 (`runAutomationTick`)
  - `src/lib/automation/config.ts` baris 137-148 (`loadAutomationConfig`)
  - `src/lib/supabase/server.ts`
  - `src/lib/content/cron-auth.ts`
- File harus diubah: `src/app/api/automation/run/route.ts` SAJA.
- Simbol: `handle`, `isCronAuthorized`, `createSupabaseService`, `runAutomationTick`, `loadAutomationConfig`.
- Kondisi saat ini (exact):
  ```ts
  import { runAutomationTick } from '@/lib/automation/runner'; // baris 4, top-level
  export const maxDuration = 300; // baris 6
  async function handle(request: NextRequest) {
    if (!isCronAuthorized(request)) return 401;
    const supabase = createSupabaseService();
    if (!supabase) return 500;
    const result = await runAutomationTick(supabase);
    return NextResponse.json(result);
  }
  ```
- Perubahan konkret (urutan dalam file, jangan ubah urutan lain):
  1. Hapus baris 4 (`import { runAutomationTick }...`). Ganti dengan `import { loadAutomationConfig } from '@/lib/automation/config';` (ringan, tanpa LLM).
  2. Setelah `if (!supabase) return 500`, sisipkan cheap guard:
     ```ts
     const cfg = await loadAutomationConfig(supabase);
     if (!cfg || !cfg.isEnabled) {
       return NextResponse.json({ ok: true, skipped: 'disabled' });
     }
     ```
     Ini menduplikasi 2 baris pertama `runAutomationTick` (`runner.ts:430-432`) secara sengaja agar heavy import terhindar. Jangan refactor `runner.ts` di S02.
  3. Setelah guard, lazy import:
     ```ts
     const { runAutomationTick } = await import('@/lib/automation/runner');
     const result = await runAutomationTick(supabase);
     return NextResponse.json(result);
     ```
  4. JANGAN ubah `maxDuration` di S02 (dilakukan S09). JANGAN ubah GET/POST export.
- Behavior dipertahankan: response JSON identik untuk semua cabang (disabled/not_due/already_done/advance). `runAutomationTick` tetap satu-satunya state machine; guard hanya short-circuit `disabled` yang sebelumnya juga `disabled`.
- Error/edge:
  - `loadAutomationConfig` return `null` (tabel hilang) → `{ok:true,skipped:'disabled',error:'config automation belum ada'}`? Pertahankan pesan existing dari runner: jika `!cfg`, return `{ok:true,skipped:'disabled',error:'config automation belum ada'}` (salin exact dari `runner.ts:431`), bukan `{ok:true,skipped:'disabled'}` polos. Cek string exact sebelum tulis.
  - `createSupabaseService()` null → 500 `service not configured` (jangan ubah).
  - Auth gagal → 401 (jangan ubah).
- Test:
  - Update `src/lib/automation/runner.test.ts`: tambah 1 case `disabled fast-path returns same shape` — mock `automation_configs→null`, panggil `runAutomationTick`, assert `{ok:true,skipped:'disabled'}`.
  - Tambah `src/app/api/automation/run/route.test.ts` (file baru, pola route test existing bila ada; bila tidak ada pola, buat dengan `vi.mock` untuk `loadAutomationConfig` + dynamic import): input `isEnabled:false` → expected `{ok:true,skipped:'disabled'}` dan assert `runner` tidak diimport (mock `@/lib/automation/runner` dengan `vi.fn` dan assert `not.toHaveBeenCalled`).
- Verifikasi: `npm run typecheck`, `npm run lint`, `npm test -- src/lib/automation/runner.test.ts`, `npm test -- src/app/api/automation/run/route.test.ts`.
- Expected: semua hijau; coverage `src/lib` tetap di atas threshold (48/48/70/75).
- Completion: tick disabled tidak mengimport `runner.ts`; semua cabang response byte-identik (kecuali key order).
- Jangan ubah: `src/lib/automation/runner.ts`, `supabase/`, `vercel.json`, `maxDuration`, middleware, test lain.

## S03 — Lazy import `/api/notifications/error-digest`

- Tujuan: tick tanpa kategori due tidak memuat `error-digest.ts` + `automation/config` berat.
- Finding: F-01, F-05, F-07, REQ-BEH-04.
- Dependency: S01.
- Baca: `src/app/api/notifications/error-digest/route.ts`, `src/lib/notifications/error-digest.ts:85-160`, `src/lib/supabase/server.ts`.
- Ubah: `src/app/api/notifications/error-digest/route.ts` SAJA.
- Simbol: `handle`, `runErrorDigestTick`, `createSupabaseService`.
- Kondisi: top-level `import { runErrorDigestTick } from '@/lib/notifications/error-digest';` + `maxDuration=60`.
- Perubahan (urutan):
  1. Hapus top-level import `runErrorDigestTick`.
  2. Setelah auth + service null-check, lazy: `const { runErrorDigestTick } = await import('@/lib/notifications/error-digest');` lalu `try/catch` existing dipertahankan.
  3. JANGAN tambah guard DB di route (due-check butuh `error_notification_configs`; biarkan di lib agar claim-first `last_digest_at` di `error-digest.ts:210-217` tidak terlewat). S03 murni lazy import.
  4. JANGAN ubah `maxDuration=60`.
- Behavior: JSON `{ok:true,...}` identik; `last_digest_at` claim-first dipertahankan.
- Edge: import gagal (jarang) → catch existing return 500 `{error:message}`; jangan tambah retry.
- Test: update `src/lib/notifications/error-digest.test.ts` — tambah case `empty config returns not-sent` (input `error_notification_configs=[]`, expected `{sent:false,categories:[],eventCount:0}`). Jangan ubah case existing.
- Verifikasi: `npm run typecheck`, `npm run lint`, `npm test -- src/lib/notifications/error-digest.test.ts`.
- Completion: tidak ada top-level import `error-digest` di route; test hijau.
- Jangan ubah: `src/lib/notifications/error-digest.ts`, `supabase/`, maxDuration, email sender.

## S04 — Reorder idle-check `/api/social/post` + lazy Threads API

- Tujuan: tick idle (`idle:true`) tidak decrypt Vault, refresh token, atau hit Meta API.
- Finding: F-01, F-06, F-07, REQ-BEH-03.
- Dependency: S01.
- Baca:
  - `src/app/api/social/post/route.ts` full (309 baris)
  - `src/lib/social/queue.ts:61-161` (`reapStaleClaims`, `claimDueQueueItem`)
  - `src/lib/social/config.ts` (`resolveAccount`)
  - `src/lib/social/threads.ts` (`fetchPublishingLimit`, `publishThreadChain`, `refreshLongLivedToken`)
- Ubah: `src/app/api/social/post/route.ts` SAJA.
- Simbol: `claimDueQueueItem`, `reapStaleClaims`, `resolveAccount`, `fetchPublishingLimit`, `refreshLongLivedToken`, `publishThreadChain`, `isRetryable`, `affiliatePostIndex`.
- Kondisi (urutan sekarang, bermasalah):
  1. load `social_post_configs` → cek `is_enabled`
  2. load `social_accounts` → resolve → cek expiry
  3. `vault_decrypt_secret_by_name` RPC
  4. refresh token bila <H-7
  5. daily cap count
  6. `fetchPublishingLimit` (network Meta)
  7. `reapStaleClaims` + `claimDueQueueItem` (baru di sini idle diketahui)
- Perubahan (urutan baru, exact):
  1. Pertahankan langkah 1-2 (config + account) di atas (butuh `account` untuk klaim? Tidak, tapi pertahankan agar `disabled`/`no account` behavior sama).
  2. Setelah langkah 2, SISIPKAN (sebelum Vault/quota):
     ```ts
     const reap = await reapStaleClaims(supabase);
     if (reap.errors.length > 0) console.error(...); // pertahankan string log exact
     const claim = await claimDueQueueItem(supabase);
     if (claim.outcome === 'idle') return NextResponse.json({ idle: true, requeued: reap.requeued });
     if (claim.outcome === 'raced') return NextResponse.json({ idle: true, raced: true });
     if (claim.outcome === 'exhausted') return NextResponse.json({ error: 'max attempts', queueId: claim.item.id }, { status: 500 });
     ```
     Pindahkan blok exact dari baris 148-168 ke posisi baru (jangan tulis ulang logika; cut-paste + sesuaikan variabel `item`).
  3. Setelah klaim `claimed`, BARU lakukan Vault decrypt → refresh → daily cap → quota (pindahkan blok baris 91-146 ke bawah klaim, tanpa ubah isi).
  4. Lazy import Threads network helpers: hapus top-level `import {fetchPublishingLimit,publishThreadChain,refreshLongLivedToken} from '@/lib/social/threads'`; ganti dengan `const {fetchPublishingLimit,...} = await import('@/lib/social/threads')` tepat sebelum pemakaian pertama (setelah klaim). Pertahankan `extractThreadTexts/resolveAccount` top-level (ringan, sync).
  5. JANGAN ubah `maxDuration=300` di S04, JANGAN ubah `isRetryable` regex, JANGAN ubah resume logic `social_post_logs` (baris 232-249) dan `onPost` insert.
- Behavior: `disabled`, `no account`, `token_expired`, `daily cap`, `quota exhausted`, `idle/raced/exhausted`, `posted/resumed`, retryable→`queued` vs permanen→`failed` semua dipertahankan. Satu-satunya perbedaan: tick idle tidak lagi menyentuh Vault/Meta (sesuai tujuan).
- Edge:
  - `reapStaleClaims` error → log saja, lanjut klaim (pertahankan).
  - Vault null setelah klaim menang → return 500 `threads token not in Vault` + baris tetap `posting` dengan `claimed_at` (reaper akan kembalikan 15 mnt; jangan tambah `claimed_at=null` di sini agar tidak menutupi race).
  - Quota `>=250` → 429 (pertahankan), baris tetap `posting` (retry next tick).
  - `publishThreadChain` throw retryable + `attempts<MAX` → `queued`, else `failed` (pertahankan exact).
- Test:
  - Update `src/lib/social/queue.test.ts`: tambah case `idle does not require token` — fake queue kosong → `claimDueQueueItem` idle (tanpa mock Vault). Expected `{outcome:'idle'}`.
  - Tambah `src/app/api/social/post/route-order.test.ts`: mock `reapStaleClaims→{requeued:0,failed:0,errors:[]}`, `claimDueQueueItem→{outcome:'idle'}`, mock Vault RPC + `fetch` dengan `vi.fn`; assert Vault/fetch `not.toHaveBeenCalled` saat idle; assert response `{idle:true}`.
- Verifikasi: `npm run typecheck`, `npm run lint`, `npm test -- src/lib/social/queue.test.ts`, `npm test -- src/app/api/social/post/route-order.test.ts`.
- Completion: idle tick 0 network eksternal; non-idle path byte-identik.
- Jangan ubah: `src/lib/social/queue.ts`, `src/lib/social/threads.ts`, `src/lib/social/config.ts`, skema queue, `STALE_CLAIM_MINUTES=15`, `MAX_QUEUE_ATTEMPTS=5`.

## S05 — Fix N+1 `enqueueNextMissingImage` + lazy import `/api/image/generate`

- Tujuan: potong 21 query/tick idle menjadi 2 query; tick tanpa pending tidak muat LLM/provider.
- Finding: F-02, F-07, REQ-BEH-02.
- Dependency: S01.
- Baca:
  - `src/app/api/image/generate/route.ts`
  - `src/lib/image/worker.ts:52-77` (`enqueueNextMissingImage`), `86-113` (`claimPendingImage`), `336-364` (`processImageTick`), `137-152` (`reapStuckImages`)
  - `src/lib/image/types.ts:78-95` (`IMAGE_MAX_ATTEMPTS`, `IMAGE_STUCK_MINUTES`, `isExhaustedPending`)
- Ubah:
  - `src/lib/image/worker.ts` (fungsi `enqueueNextMissingImage` saja)
  - `src/app/api/image/generate/route.ts` (lazy import saja)
- Simbol: `enqueueNextMissingImage`, `claimPendingImage`, `processImageTick`, `reapStuckImages`.
- Kondisi:
  ```ts
  // worker.ts:52-77: select drafts limit 20 → loop per-draft count head → insert 1
  // route.ts:1-3: top-level import isCronAuthorized, processImageTick; maxDuration=300
  ```
- Perubahan worker (urutan dalam fungsi, jangan sentuh fungsi lain):
  1. Ganti loop N+1 dengan 2 query:
     ```ts
     const { data: drafts } = await supabase.from('content_drafts').select('id').in('status',['needs_review','approved']).order('created_at',{ascending:true}).limit(20);
     const ids = (drafts ?? []).map(d => d.id); // pertahankan order ascending
     if (ids.length === 0) return null;
     const { data: existing } = await supabase.from('content_draft_images').select('draft_id').eq('post_index',0).in('draft_id', ids);
     const hasCover = new Set((existing ?? []).map(r => r.draft_id));
     const missing = ids.find(id => !hasCover.has(id));
     if (!missing) return null;
     const { data: created, error } = await supabase.from('content_draft_images').insert({ draft_id: missing, post_index: 0, image_prompt:'', provider_slug:'', model_id:'' }).select('id').single();
     if (error || !created) return null;
     return created.id;
     ```
  2. Pertahankan: hanya `post_index=0`, hanya status `needs_review/approved`, order tertua dulu, insert shape exact sama.
  3. Route: hapus top-level `import {processImageTick}`; setelah auth, lazy `const {processImageTick}=await import('@/lib/image/worker')`. Pertahankan `reapStuckImages` di dalam `processImageTick` (jangan pindah ke route). JANGAN ubah `maxDuration=300` di S05.
- Behavior: antrean cover, 2-lane (`generate` prioritas + `reasoning`), `attempts<MAX`, reaper `IMAGE_STUCK_MINUTES=10` dipertahankan.
- Edge:
  - `existing` null → treat sebagai kosong (semua missing).
  - Insert race (2 tick bersamaan) → unique violation → return `null` (jangan throw; tick berikutnya akan claim).
  - `drafts` kosong → `null` (jangan query kedua).
- Test:
  - Update `src/lib/image/worker.test.ts`: tambah 3 case:
    a. `enqueue skips drafts with cover` — input drafts `[A,B]`, images `[{draft_id:A,post_index:0}]` → expected `insert draft_id=B` + return new id.
    b. `enqueue returns null when all covered` — input semua punya cover → expected `null` + `insert not called`.
    c. `enqueue uses 2 queries max` — fake client hitung `select` count → expected `<=2`.
  - Fake harus dukung `.in()` (tiru pola `runner.test.ts` S1 mock `.in()`).
- Verifikasi: `npm run typecheck`, `npm run lint`, `npm test -- src/lib/image/worker.test.ts`.
- Completion: query count idle `<=3` (reap 1 + claim 1-2 + enqueue 2) vs sebelumnya s/d 24; hasil enqueue identik.
- Jangan ubah: `claimPendingImage`, `processClaimedImage`, prompt/LLM logic, `IMAGE_MAX_ATTEMPTS=3`, `IMAGE_STUCK_MINUTES=10`, `bytesToBase64`, storage upload.

## S06 — `MAX_PER_TICK 5→2` + isolasi error `/api/studio/process`

- Tujuan: ratakan spike CPU (penyebab bar 10m Sep 14) tanpa starvation.
- Finding: F-03, REQ-BEH-02.
- Dependency: S01.
- Baca: `src/app/api/studio/process/route.ts`, `src/lib/studio/worker.ts:189-210` (`claimPendingStudioImage`), `235-531` (`processOneStudioImage`), `src/lib/studio/worker.test.ts`.
- Ubah: `src/app/api/studio/process/route.ts` SAJA (1 konstanta + 2 baris loop).
- Simbol: `MAX_PER_TICK`, `processOneStudioImage`, `claimPendingStudioImage`.
- Kondisi (exact baris 7,16-28):
  ```ts
  const MAX_PER_TICK = 5;
  for (let i=0;i<MAX_PER_TICK;i++) {
    try { const result = await processOneStudioImage(); if (!result.imageId) { if (result.error) lastError=result.error; break; } processed.push(result.imageId); }
    catch(e){ lastError=...; break; }
  }
  ```
- Perubahan (urutan):
  1. Baris 7: `5` → `2`.
  2. Dalam loop: `break` saat `!result.imageId && !result.error` (queue kosong) dipertahankan; ubah `break` saat `!result.imageId && result.error` menjadi `continue` (coba slot kedua, mis. item rusak tidak memblokir item sehat). Exact:
     ```ts
     if (!result.imageId) { if (result.error) { lastError = result.error; continue; } break; }
     ```
  3. `catch(e){...; break;}` → `catch(e){...; continue;}` (satu item throw tidak membatalkan slot kedua). Pertahankan `lastError` assignment exact.
  4. Lazy import: hapus top-level `import {processOneStudioImage}`; ganti `const {processOneStudioImage}=await import('@/lib/studio/worker')` sebelum loop. JANGAN ubah `maxDuration=300` di S06.
- Behavior: sukses → `{ok:true,processed:[ids],count:n}`; kosong → `{count:0}`; gagal jujur → `lastError` terisi. Order klaim `created_at ASC` dipertahankan di lib.
- Edge: 2 item gagal beruntun → `processed=[]`, `lastError` = error terakhir (jangan throw). `claim` tetap `attempts+1` per item (di lib, jangan duplikasi di route).
- Test: update `src/lib/studio/worker.test.ts` + tambah `src/app/api/studio/process/route-tick.test.ts`:
  - Input: mock `processOneStudioImage` sequence `[{imageId:null,error:'boom'},{imageId:'B'}]` → expected `{count:1,processed:['B'],lastError:'boom'}` (membuktikan `continue`, bukan `break`).
  - Input: `[{imageId:null},{imageId:'B'}]` (kasus pertama kosong tanpa error) → expected `{count:0}` dan `processOneStudioImage` dipanggil tepat 1x (membuktikan `break` saat queue kosong).
- Verifikasi: `npm run typecheck`, `npm run lint`, `npm test -- src/lib/studio/worker.test.ts`, `npm test -- src/app/api/studio/process/route-tick.test.ts`.
- Completion: tick maks 2 gambar; spike CPU turun; tidak ada starvation (item gagal tidak blokir).
- Jangan ubah: `src/lib/studio/worker.ts`, `resolveStudioTarget` waterfall/pinned, `uploadUserImageWithRetry`, cleanup route, retensi.

## S07 — Reschedule 4 `pg_cron` job (migrasi submodule `supabase/`)

- Tujuan: potong ~60% invocation idle dengan latensi yang masih aman.
- Finding: F-01, F-04, F-05, REQ-BEH-01/03/04.
- Dependency: S01-S06 selesai (tick sudah murah; jadwal baru aman). Jangan kerjakan sebelum S02-S06.
- Baca:
  - `supabase/migrations/20260915000004_automation_cron.sql`
  - `supabase/migrations/20260922000002_error_digest_cron.sql`
  - `supabase/migrations/20260907000002_social_poster_cron.sql`
  - `supabase/migrations/20260911000002_image_studio.sql:151-184`
  - `supabase/migrations/20260901000002_research_pipeline.sql:178-210`
  - `supabase/migrations/20260902055944_research_cron_5min.sql`
- Ubah (di submodule `supabase/`, BUKAN parent):
  - Tambah 1 file baru: `supabase/migrations/20261012000001_cron_cpu_savings.sql`
  - TIDAK edit migrasi lama (Non-Destructive Migrations).
- Simbol: `cron.schedule`, `cron.alter_job`, `cron.job`, jobname `asharu-automation-run`, `asharu-error-digest`, `asharu-social-poster`, `asharu-studio-worker`.
- Kondisi: 7 job `*/5` aktif; `asharu-content-research` awalnya `*/10` lalu diubah `*/5` via `alter_job(job_id=>3)` (rapuh, jangan tiru).
- Perubahan (isi file migrasi baru, urutan exact):
  ```sql
  -- 20261012000001_cron_cpu_savings: jarangkan poller idle, research tetap */5.
  SELECT cron.alter_job(job_id => (SELECT jobid FROM cron.job WHERE jobname='asharu-automation-run'), schedule => '*/15 * * * *');
  SELECT cron.alter_job(job_id => (SELECT jobid FROM cron.job WHERE jobname='asharu-error-digest'), schedule => '*/15 * * * *');
  SELECT cron.alter_job(job_id => (SELECT jobid FROM cron.job WHERE jobname='asharu-social-poster'), schedule => '*/15 * * * *');
  SELECT cron.alter_job(job_id => (SELECT jobid FROM cron.job WHERE jobname='asharu-studio-worker'), schedule => '*/10 * * * *');
  -- SENGAJA TIDAK DIUBAH: asharu-content-research, asharu-content-legacy, asharu-image-worker (tetap */5 sampai M3 terverifikasi).
  ```
  1. Gunakan subselect `jobid WHERE jobname=` (bukan literal `3`) agar tahan drift.
  2. Sertakan comment rollback di file:
     ```sql
     -- ROLLBACK (manual, bila latensi >15 mnt tidak diterima):
     -- SELECT cron.alter_job(... '*/5 * * * *') untuk keempat job di atas.
     ```
  3. Setelah buat file di submodule: commit + push submodule DULU, baru update parent pointer (sesuai AGENTS.md). Apply prod = USER ACTION (MCP/DBA), bukan eksekutor kecil.
- Behavior: automation tetap gate 10:00 WIB + 1/hari; digest window tetap 30 mnt (tick 15 mnt = 2x cek/window, cukup); social cap 25/hari tetap; studio backlog tetap diproses 2/tick tiap 10 mnt (≈12 gambar/jam, cukup untuk kuota 20/hari/user).
- Edge:
  - Job tidak ditemukan (`jobid` null) → `alter_job` gagal; migrasi harus `WHERE EXISTS` guard atau `DO $$` cek count seperti pola `20260922000002` (jangan biarkan migrasi gagal setengah jalan).
  - `timeout_milliseconds` cron (`net.http_post`) JANGAN diubah di S07.
  - Jangan `unschedule`/`schedule` ulang (akan ganti `jobid` + duplikat); hanya `alter_job`.
- Test/verifikasi (tanpa DB prod):
  - Tambah `supabase/tests/cron_cpu_savings.test.sql` (file baru, read-only): `SELECT jobname,schedule FROM cron.job WHERE jobname IN (...) ORDER BY jobname;` Expected setelah apply: `automation-run=*/15`, `error-digest=*/15`, `social-poster=*/15`, `studio-worker=*/10`, `content-research=*/5`, `content-legacy=*/5`.
  - Verifikasi repo: `npm run typecheck`, `npm run lint` (parent tidak terpengaruh), `git -C supabase status --short`, `git -C supabase diff --stat`.
  - Verifikasi prod (USER ACTION, bukan eksekutor): query `cron.job` + amati Observability 24 jam (invokasi turun ~40-60%, Active CPU P75 stabil/turun).
- Completion: file migrasi ada + guard `IF EXISTS` + rollback comment + submodule commit terpisah dari parent.
- Jangan ubah: migrasi lama, `timeout_milliseconds`, URL `https://asharu.id/api/*`, Vault `asharu_cron_secret`, `vercel.json`, RLS.

## S08 — Deadline LLM 90s untuk path image

- Tujuan: bunuh hang gaya naraya 138-300s lebih cepat, hemat CPU + `attempts`.
- Finding: F-09, F-02, F-03.
- Dependency: tidak ada (independen), tapi verifikasi bersama S05/S06.
- Baca:
  - `src/lib/llm/completion.ts:40-83` (`LLMCompletionInput.deadlineMs`, `DEFAULT_LLM_DEADLINE_MS=240_000`), `155-234` (waterfall + deadline check)
  - `src/lib/image/worker.ts:228-244` (attempt image_prompt), `473-485` (compose review)
  - `src/lib/studio/worker.ts:288-310` (compose studio, `maxTokens:800`)
  - `src/lib/llm/fetch-timeout.test.ts`, `src/lib/llm/completion.test.ts`
- Ubah:
  - `src/lib/image/worker.ts` (2 call site)
  - `src/lib/studio/worker.ts` (1 call site)
- Simbol: `runLLMCompletion`, `resolveStageModel`, `buildImagePromptMessages`, `buildComposeReviewMessages`, `buildComposeStudioMessages`.
- Kondisi: ketiga call site tidak pass `deadlineMs` → memakai default 240s; `fetchWithTimeout` per-attempt 90s sudah ada (25 Sep) tapi waterfall total masih bisa 240s+.
- Perubahan (exact, jangan ubah prompt/temperature/maxTokens):
  1. `worker.ts:231-242` (`runImagePromptLLM` attempt): tambah `deadlineMs: 90_000` ke objek `runLLMCompletion(supabase,{...})`.
  2. `worker.ts:475-485` (compose review): tambah `deadlineMs: 90_000`.
  3. `studio/worker.ts:302-309` (`runLLMCompletion` compose studio): tambah `deadlineMs: 90_000`.
  4. Pertahankan `temperature` (0,7/0,3/0,2), `maxTokens` (500/500/800), `stage:'image_prompt'` / `'compose_studio_prompt'`.
- Behavior: sukses cepat tidak berubah; hang >90s → throw deadline → waterfall lanjut provider berikut atau `failImage` jujur + `last_error` (jangan silent). `attempts` tetap +1 per klaim.
- Edge:
  - Deadline hit di tengah waterfall → `lastError` = pesan deadline exact dari `completion.ts:230-232`; jangan wrap ulang (agar `llm_call_logs` + `last_error` searchable).
  - `strictPinned` tidak dipakai di path image (jangan tambah).
  - Jangan ubah `DEFAULT_LLM_DEADLINE_MS` global (hanya override per-call image).
- Test:
  - Update `src/lib/llm/completion.test.ts`: tambah case `deadlineMs override respected` — input `deadlineMs:1000` + mock provider sleep 1500ms → expected throw pesan mengandung `LLM deadline 1000ms`.
  - Update `src/lib/image/worker.test.ts`: assert `runLLMCompletion` mock dipanggil dengan `expect.objectContaining({deadlineMs:90_000})` untuk path reasoning.
- Verifikasi: `npm run typecheck`, `npm run lint`, `npm test -- src/lib/llm/completion.test.ts`, `npm test -- src/lib/image/worker.test.ts`, `npm test -- src/lib/studio/worker.test.ts`.
- Completion: 3 call site pass 90s; tidak ada hang >100s di log setelah deploy.
- Jangan ubah: provider registry order, `KeyPool`, `markModelFailure` (hanya 401/403/429), `fetchWithTimeout` 90s, stage defaults pin, `development.ts`/`discovery.ts` deadline.

## S09 — Turunkan `maxDuration` poller ringan

- Tujuan: turunkan Fluid Provisioned Memory billing window untuk tick idle.
- Finding: F-08, REQ-CPU-01.
- Dependency: S02-S06 selesai (tick sudah cepat; lowering aman). Jangan kerjakan sebelum S02-S06.
- Baca:
  - `src/app/api/automation/run/route.ts:6`
  - `src/app/api/social/post/route.ts:22`
  - `src/app/api/studio/process/route.ts:5`
  - `src/app/api/image/generate/route.ts:5`
  - `src/app/api/content/process/route.ts:6`
  - `src/app/api/content/process-legacy/route.ts:10`
  - `src/test/api-route-guards.test.ts` (cek apakah ada assert maxDuration)
- Ubah (exact 1 baris per file):
  - `automation/run`: `300` → `120`
  - `social/post`: `300` → `120`
  - `studio/process`: `300` → `180` (2 gambar butuh waktu; jangan 120)
  - JANGAN ubah: `image/generate=300`, `content/process=300` (LLM long-form), `process-legacy=60`, `error-digest=60`.
- Simbol: `maxDuration` (Next.js route config).
- Kondisi: Vercel Hobby limit + Fluid menagih memori terprovision selama eksekusi; 300s untuk poller yang biasanya <10s = over-provision.
- Perubahan urutan: ubah 3 file di atas saja, satu per satu, tanpa menyentuh logic lain.
- Behavior: tick normal (<60s) tidak berubah; tick berat yang melebihi batas baru akan dibunuh Vercel → diandalkan retry next tick (state machine idempoten: `advanceRun`, `claimDueQueueItem`+reaper, `claimPendingStudioImage`+`attempts`). Dokumentasikan di code comment 1 baris per file: `// CPU hemat: poller idle <10s; kerja berat di-retry tick berikut (idempoten).`
- Edge:
  - Automation `publishing` (publish artikel bilingual) bisa >120s → akan timeout lalu retry; aman karena `publishArticleDraftCore` idempoten? Verifikasi: `article_draft_id` tetap, `published_at` hanya setelah sukses (`runner.ts:790-794`). Jika ragu, catat sebagai Open Question OQ-02 (jangan naikkan diam-diam).
  - Studio 2 gambar + upload bisa >180s saat provider lambat → S08 deadline 90s sudah membatasi; sisa 90s untuk upload (cukup).
- Test:
  - Tambah `src/test/route-maxduration.test.ts`: assert exact `maxDuration` per route (import route module + `expect(maxDuration).toBe(...)`). Input: 6 route di atas. Expected: `{automation:120, social:120, studio:180, image:300, content:300, legacy:60, digest:60}`.
- Verifikasi: `npm run typecheck`, `npm run lint`, `npm test -- src/test/route-maxduration.test.ts`, `npm run build` (pastikan tidak ada warning `maxDuration` melebihi paket Hobby).
- Completion: 3 nilai berubah + test hijau + tidak ada function dibunuh di log 24 jam (USER ACTION cek Vercel logs).
- Jangan ubah: logic route, `vercel.json` (tetap `crons:[]`), `next.config.ts`, middleware.

## S10 — Verifikasi homepage `/[locale]` ISR (measurement-only, P2)

- Tujuan: pastikan `/[locale]` bukan penyumbang utama (45 inv/12s) dan tidak diregresi oleh S02-S09.
- Finding: F-10, REQ-BEH-05.
- Dependency: tidak ada (boleh terakhir, boleh dilewati bila waktu mepet).
- Baca:
  - `src/app/[locale]/(public)/page.tsx:33,56-58`
  - `src/lib/affiliate/public.ts` (`getFeaturedProductsDB`)
  - `src/lib/articles/public.ts` (`getPublishedArticles`)
  - `src/middleware.ts:22-25` (public early-return)
- Ubah: TIDAK ADA file kode di S10. Hanya observasi + dokumentasi.
- Simbol: `revalidate=3600`, `getFeaturedProductsDB(6)`, `getPublishedArticles(locale,3)`, `isPublicRoute`.
- Kondisi: `revalidate=3600` sudah ada; middleware public bypass auth (`isPublicRoute` return `intlResponse`).
- Perubahan: JANGAN tambah `unstable_cache`/code change. Lakukan checklist manual (USER ACTION):
  1. Buka Vercel Observability → Functions → filter Route `/[locale]` → catat `Invocations`, `Active CPU`, `P75 Duration`, `Cache Status` 24 jam pasca S07.
  2. `curl -I https://asharu.id/id` 2x → catat `x-vercel-cache: HIT/MISS`, `age`.
  3. Jika HIT rate >80% dan CPU stabil → tutup S10 sebagai `done (no change needed)`.
  4. Jika MISS tinggi → buka follow-up plan baru (bukan scope ini) dengan hipotesis: `getFeaturedProductsDB`/`getPublishedArticles` memakai `no-store` atau `cookies()` di layout.
- Behavior: tidak ada perubahan.
- Edge: bot traffic bisa menggelembungkan invokasi; jangan block bot di S10.
- Test: tidak ada test baru. Verifikasi: screenshot Observability + header `curl` dilampirkan di Progress Log plan.
- Completion: checklist terisi + keputusan `no change` atau `follow-up plan`.
- Jangan ubah: `page.tsx`, `public.ts` lib, `middleware.ts`, SEO/metadata, JSON-LD.

---

## Verification Matrix (eksekutor kecil wajib jalankan per langkah)

| Langkah | Command | Expected |
|---------|---------|----------|
| Semua | `npm run typecheck` | 0 error |
| Semua | `npm run lint` | 0 warning (`--max-warnings=0`) |
| S01 | `npm test -- src/test/cron-idle-contract.test.ts` | 7/7 hijau |
| S02 | `npm test -- src/lib/automation/runner.test.ts`, `npm test -- src/app/api/automation/run/route.test.ts` | hijau, kontrak disabled sama |
| S03 | `npm test -- src/lib/notifications/error-digest.test.ts` | hijau |
| S04 | `npm test -- src/lib/social/queue.test.ts`, `npm test -- src/app/api/social/post/route-order.test.ts` | hijau, Vault/fetch tidak dipanggil saat idle |
| S05 | `npm test -- src/lib/image/worker.test.ts` | hijau, query <=2 |
| S06 | `npm test -- src/lib/studio/worker.test.ts`, `npm test -- src/app/api/studio/process/route-tick.test.ts` | hijau |
| S07 | `git -C supabase status --short`, `git -C supabase diff --stat`, `npm run typecheck`, `npm run lint` | 1 file migrasi + 1 file test SQL, parent tidak error |
| S08 | `npm test -- src/lib/llm/completion.test.ts`, `npm test -- src/lib/image/worker.test.ts`, `npm test -- src/lib/studio/worker.test.ts` | hijau |
| S09 | `npm test -- src/test/route-maxduration.test.ts`, `npm run build` | hijau, 122+ pages, no maxDuration warning |
| S10 | Observability + `curl -I` | HIT>80% atau follow-up |

Full gate sebelum push (bila user meminta commit): `npm run typecheck`, `npm run lint`, `npm test` (full suite ~1300+ test, bukan hanya file di atas), `npm run build`.

## Files Must NOT Change (global)

- `.env`, `.env.local`, `.env*.local`, `SUPABASE_*`, `CRON_SECRET`, Vault secret, `scripts/seed-*.mjs` (kecuali dokumentasi).
- `src/lib/auth/*`, `src/middleware.ts` semantics, `src/i18n/*`, CSP di `next.config.ts:27-64`, `images.remotePatterns`.
- RLS policies, `is_admin()` SQL, `profiles` skema.
- Provider order `llm_providers.priority`, `image_providers.priority` (kecuali pin stage yang sudah applied).
- `vercel.json` (`crons:[]` dipertahankan; cron tetap di `pg_cron`).
- Migrasi lama di `supabase/migrations/` (hanya tambah file baru).
- `public/`, `src/data/*` placeholder, SEO copy.

## Open Questions / Blockers (jangan pilih diam-diam)

- OQ-01 Jadwal final S07: rekomendasi `automation/error/social=*/15`, `studio=*/10`, research/legacy/image tetap `*/5`. Opsi A (rekomendasi): seperti di atas (hemat ~50%, latensi +10 mnt). Opsi B konservatif: semua `*/10` (hemat ~30%, latensi +5 mnt). Opsi C agresif: `automation=*/30`, `digest=*/30` (hemat ~65%, risiko digest telat + publish telat). Risiko: user complaint pipeline lambat. Rekomendasi: Opsi A + ukur 7 hari, rollback 1 SQL bila perlu. Butuh persetujuan user sebelum apply prod.
- OQ-02 `automation maxDuration 120` vs publish lama: bila `publishArticleDraftCore` bilingual + cover sering >120s, timeout akan naik. Opsi: pertahankan 300 untuk automation (batalkan S09-automation) atau pecah publish ke endpoint terpisah. Rekomendasi: jalankan S09-automation terakhir + pantau log `function killed` 48 jam; bila >0, revert ke 300.
- OQ-03 `content-research` tetap `*/5`: bila setelah S07 CPU masih >2,5h, pertimbangkan `*/10` + guard DB-side (pg_cron function cek `content_research_sessions` aktif dulu). Butuh migrasi PL/pgSQL baru + test; di luar scope eksekutor kecil (buat follow-up plan).
- Blocker B-01: Apply migrasi prod + deploy Vercel = USER ACTION (butuh akses Supabase Dashboard/MCP + Vercel). Eksekutor kecil berhenti setelah file + test lokal hijau + submodule commit (bila diminta). Jangan klaim hemat CPU sebelum Observability 24 jam pasca-deploy.

## Handoff Checklist (untuk model kecil)

1. Kerjakan urut: S01 → S02,S03,S04,S05,S06,S08 (paralelisable, beda file) → S07 → S09 → S10.
2. Satu langkah = satu unit kerja: baca file listed → ubah file listed saja → tambah/update test listed → jalankan command listed → catat hasil di Progress Log plan ini.
3. Jangan refactor di luar `Perubahan konkret`. Jangan rename simbol. Jangan ubah pesan error string (kecuali ditentukan).
4. Setiap langkah selesai: update `## Tasks` (`- [x]`) + tambah 1 baris `## Progress Log` (`YYYY-MM-DD HH:mm:ss — S0X ...`).
5. Jangan commit/stage/push kecuali user eksplisit meminta; bila diminta: `git status --short`, `git diff`, `git log --oneline -10`, scan secret, stage hanya file plan + file langkah, commit Conventional Commits 1 baris tanpa trailer, submodule `supabase/` dulu baru parent.
6. Berhenti dan laporkan bila: test merah, `typecheck`/`lint` merah, `build` warning `maxDuration`, atau menemukan `CRON_SECRET`/secret di diff.
7. Output akhir ke user: ringkasan per-langkah (file diubah + test + hasil verifikasi) + file plan path + sisa OQ/B yang butuh keputusan user + Observability yang harus dicek 24 jam pasca-deploy.
