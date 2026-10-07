# Review menyeluruh → hardening P0/P1/P2 (klaim antrean, rate limit, counter, guard invariant)

Date: 2026-10-07 12:15 WIB

## Task
User minta analisis menyeluruh + code review repo sesuai best practice. Review menghasilkan
temuan berprioritas; user menyetujui plan, lalu implementasi penuh dijalankan.

## Temuan utama (yang diperbaiki)

**P0-1 Klaim antrean poster Threads tidak terverifikasi.**
`src/app/api/social/post/route.ts` memakai `UPDATE ... WHERE status='queued'` lalu hanya memeriksa
`claimError`. PostgREST mengembalikan **0 baris tanpa error** → dua invocation paralel sama-sama
lanjut publish (cron `asharu-social-poster` tiap 5 menit vs `maxDuration = 300`, jadi tick bisa
tumpang tindih). Tambahan: tidak ada yang me-reset `status='posting'`, jadi invocation yang mati
setelah klaim meninggalkan baris macet permanen (tidak pernah dipungut lagi).

**P0-2 Rate limit bisa dilewati.**
`checkRateLimit` + `incrementRateLimit` = SELECT lalu UPDATE terpisah; N request paralel semuanya
membaca `count=4`. `rate_limits` juga tumbuh tanpa batas, dan `getClientIp` memakai entry pertama
`x-forwarded-for` (spoofable di luar Vercel).

**P0-3 Konflik durasi.** `vercel.json` memaksa `app/api/content/process/route.ts → maxDuration 60`
sementara route mendeklarasikan 300.

**P1** duplikasi `getServiceClient` (3 salinan), 4 payload `llm_call_logs` identik dalam
`runLLMCompletion`, counter `usage_count`/`failure_count` non-atomik (SELECT lalu UPDATE), tidak ada
deadline total waterfall LLM, `remotePatterns` `*.supabase.co` lebih longgar dari CSP,
`ExternalLink` melempar saat render, guard route bergantung konvensi.

**Temuan tambahan (diperbaiki, di luar plan awal):** `/api/auth/callback` **open redirect** —
`next` dari query string langsung dipakai `NextResponse.redirect(new URL(next, ...))`.

## Key files changed
- `supabase/migrations/20261007000001_atomic_rate_limit.sql` (baru) — RPC
  `consume_rate_limit(p_ip,p_scope,p_limit,p_window_minutes)` (INSERT ... ON CONFLICT DO UPDATE,
  RETURNING allowed+count) + `cleanup_expired_rate_limits`; EXECUTE hanya service_role.
- `supabase/migrations/20261007000002_social_queue_claim_guard.sql` (baru) — `claimed_at` + index
  parsial `idx_social_queue_stale_claims`.
- `supabase/migrations/20261007000003_atomic_counters.sql` (baru) — `increment_usage_counter` /
  `increment_failure_counter` generik dengan allowlist 4 tabel (`llm_provider_keys`, `llm_models`,
  `image_provider_keys`, `image_models`), `%I` + `EXECUTE ... USING`.
- `src/lib/social/queue.ts` (baru) — `claimDueQueueItem()` (verifikasi `.select('id')`, `raced` bila
  0 baris) + `reapStaleClaims()` (patokan `claimed_at`, legacy NULL pakai `scheduled_at`).
- `src/app/api/social/post/route.ts` — pakai helper; reaper di awal tick; `claimed_at` dibersihkan di
  semua transisi status (`posted`/`queued`/`failed`).
- `src/lib/content/rate-limit.ts` — `consumeRateLimit()` (atomik, fail-open + log),
  `cleanupExpiredRateLimits()`, `getClientIp()` prioritas
  `x-vercel-forwarded-for` → `x-real-ip` → `x-forwarded-for`. `checkRateLimit`/`incrementRateLimit`
  dihapus; 8 pemanggil (content/articles/image/lab/studio actions, 2 route endpoint-try) memakai satu
  panggilan di awal.
- `src/app/api/lab/cleanup/route.ts` — cron cleanup harian ikut memangkas `rate_limits`.
- `src/lib/supabase/service.ts` — `tryServiceClient()` + `getServiceClient()`; `createSupabaseService()`
  di `server.ts` mendelegasi (satu tempat baca `SUPABASE_SECRET_KEY`).
- `src/lib/supabase/counters.ts` (baru) — wrapper RPC counter; `vault.ts` + `image/config.ts` +
  `image/key-pool.ts` memakainya (hapus 6 blok SELECT+UPDATE dan 4 `eslint-disable no-explicit-any`).
- `src/lib/llm/completion.ts` — `logLlmCall()` (satu penulis `llm_call_logs`) + `deadlineMs`
  (default `DEFAULT_LLM_DEADLINE_MS = 240_000`, `break outer` sebelum attempt berikutnya,
  `deadlineExceeded` ikut dikirim ke `reportError`).
- `src/lib/auth/route-guards.ts` (baru) — PUBLIC / LOGIN_ONLY / ADMIN + `getRouteClass()`;
  `middleware.ts` jadi tipis dan komentar matcher menjelaskan celah `.*\..*`.
- `src/test/api-route-guards.test.ts` (baru) — invariant: semua `src/app/api/**/route.{ts,tsx}` wajib
  punya marker guard; 1 pengecualian eksplisit ber-alasan (`auth/callback`) + cek pengecualian basi.
- `src/test/route-classification.test.ts` (baru) — setiap halaman `[locale]/(admin)` harus terdaftar
  eksplisit (publik/login-only/admin).
- `src/app/api/auth/callback/route.ts` + `src/lib/utils/safe-url.ts` (`safeInternalPath`) — tutup open
  redirect, redirect di-pin ke origin sendiri.
- `next.config.ts` — `images.remotePatterns` di-pin ke hostname proyek sendiri (bukan
  `*.supabase.co`).
- `src/components/ui/ExternalLink.tsx` — href tidak aman → render `<span>` + `console.error`
  (tidak lagi throw saat render).
- Lint: 16 warning lama dibersihkan, `lint` sekarang `eslint . --max-warnings=0`.
- Coverage: `@vitest/coverage-v8` + `coverage` di `vitest.config.ts` (include `src/lib`, threshold
  ratchet 48/48/70/75) + script `npm run test:coverage`; CI Quality menjalankan `test:scrape` dan
  `test:coverage`.
- `.github/dependabot.yml` (baru) — npm (grup prod/dev), github-actions, gitsubmodule.

## Decisions
- **Rate limit konsumsi di awal request** (termasuk yang nanti gagal validasi). Batas mengikat pada
  laju request, bukan laju sukses — konsekuensi menutup celah check-then-increment. Fail-open bila
  RPC gagal (DB hiccup/migrasi belum di-apply) dengan log, sama seperti perilaku lama.
- **Reaper memakai `claimed_at`**, bukan `scheduled_at`: baris bisa dijadwalkan berhari-hari lalu baru
  diklaim; memakai `scheduled_at` akan merebut klaim yang masih berjalan → publish ganda.
- **Bookkeeping counter image best-effort** (tidak melempar): sebelumnya `markImageKeyUsage` melempar
  di dalam `withFallback` setelah generasi sukses, sehingga pool menganggap key gagal dan mencoba key
  lain → berpotensi gambar ganda. `vault.ts` (LLM) tetap melempar seperti sebelumnya.
- **Threshold coverage diukur dari test `src/lib` saja**, bukan seluruh suite: menjalankan coverage
  atas seluruh suite membuat test UI yang sensitif waktu flaky (2 kegagalan
  `StudioUi.test.tsx` saat instrumentasi; lulus konsisten tanpa coverage).
- **`<img>` di ApplyCoverBanner dipertahankan** dengan `eslint-disable` beralasan (konvensi sama
  dengan `ArticleCard`): URL dari DB bisa di luar allowlist `next/image` → lebih baik `<img>` daripada
  render halaman review gagal.
- **`/konten/baru` = LOGIN_ONLY** sesuai perilaku middleware saat ini. CATATAN: komentar di
  `(admin)/layout.tsx` masih menyebut halaman itu "tetap publik", dan `createResearchSession` masih
  mendukung anon (`created_by null`) + honeypot + rate limit. Perlu keputusan user apakah form riset
  memang harus login-only (dokumentasi vs perilaku tidak sinkron).

## Risks / belum bisa diverifikasi di sesi ini
- **Migrasi belum di-apply ke prod** (RPC rate limit, `claimed_at`, counter). Tanpa
  `20261007000001`, rate limit fail-open (perilaku lama) — jadi aman untuk deploy, tapi perbaikan
  atomiknya belum aktif. `claimed_at` bosong hanya membuat reaper melewati baris legacy sampai
  migrasi `...002` jalan (jalur `scheduled_at` menangani).
- **Precedence `maxDuration`** `vercel.json` vs route segment tidak bisa dibuktikan dari checkout ini
  (`.vercel/output` kosong). Entri `vercel.json` dihapus mengikuti dokumentasi Vercel
  (Next.js ≥13.5 → konfigurasi di definisi function); verifikasi butuh log function pasca-deploy.
- Klaim antrean sudah diuji dengan klien fake (0 baris terpengaruh → `raced`) dan test route, tapi
  **race nyata dua invocation paralel belum diuji di produksi**.

## Verification
- typecheck ✓, lint ✓ (0 warning, `--max-warnings=0`), `npm test` 131 file / 1326 test ✓,
  `npm run test:scrape` 16 ✓, `npm run test:coverage` (threshold lolos; 50.51% stmts / 73.46% branch /
  78.51% func) ✓, `npm run build` ✓.

## Commit
- Wave 1: `1ae3183` — fix(social,ratelimit) — submodule `42c0ec7`
- Wave 2: `71c973d` — fix(security,reliability) — submodule `a61da29` (counter RPC)
- Wave 3: commit terakhir setelah entri ini (lint 0 warning + coverage + CI/dependabot + memori)

## Related
- Plan: disetujui user 2026-10-07 (tiga wave P0/P1/P2).
- `.memory/README.md` (Open Items: [USER ACTION] apply 3 migrasi + deploy Vercel).
