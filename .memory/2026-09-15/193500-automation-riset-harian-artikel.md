# Automation Riset Harian → Artikel (15 Sep 2026)

## Masalah / Tugas

User ingin workflow otomatis yang jalan tiap **10:00 GMT+7**: memilih acak 1 dari 50
produk afiliasi terbaru, menjalankan riset produk-terpilih, menghasilkan 1 topik → 1 draf
per platform (artikel/twitter/threads), memastikan cover ter-render, lalu auto-publish
artikel + kirim email notifikasi via Resend. Semua knob harus configurable by table.

## File yang Berubah

**Submodule `supabase/` (commit `873e8f0`, pushed):**
- `migrations/20260915000003_automation_config.sql` — tabel `automation_configs` (singleton
  id=1, seed `is_enabled=false`) + `automation_runs` (`run_date UNIQUE`), RLS admin-only.
- `migrations/20260915000004_automation_cron.sql` — pg_cron `asharu-automation-run` (*/5).

**Parent (commit `24e3bdb`, pushed):**
- `src/lib/automation/{config,scheduler,runner,email,actions}.ts` (+ 4 file test).
- `src/lib/articles/publish.ts` — `publishArticleDraftCore` (diekstrak dari actions).
- `src/lib/articles/actions.ts` — jadi wrapper admin-gated tipis (−151 baris).
- `src/lib/llm/prompt.ts` — `clampArticleExcerpt` + `ARTICLE_EXCERPT_MAX/MIN` (fix bug excerpt).
- `src/app/api/automation/run/route.ts` — endpoint cron Bearer.
- `src/app/[locale]/(admin)/admin/automation/page.tsx` — UI config + riwayat + Run now/Retry.
- `src/components/admin/shell/admin-nav.ts`, `src/config/navigation.ts`, `src/i18n/routing.ts`,
  `src/messages/{id,en}.json` — nav + pathname + label `adminAutomation`.
- `src/lib/env.ts`, `.env.example`, `src/lib/env.test.ts` — `RESEND_API_KEY`.
- `scripts/seed-resend-key.mjs` — seed Vault `resend_api_key`.
- `plans/2026-09-15-automation-riset-harian-artikel.md` — plan + progress.

## Keputusan Teknis/Bisnis

1. **Runner mengamati, bukan menggerakkan.** `advancePendingSessions`/`advanceStage` tetap
   milik cron riset. Automation hanya membaca status sesi, dan bertindak di titik yang tidak
   dimiliki cron: shortlist + `awaiting_selection → developing`, cover gate, publish, email.
   Menghindari duplikasi topik/discovery dan balapan `atomicTransition`.
2. **Config-by-table** (pola `social_post_configs`): 25+ kolom di `automation_configs`
   singleton, termasuk `schedule_window_minutes` (mencegah run tengah malam bila kill-switch
   baru dinyalakan setelah jam target) dan `max_retry_attempts`.
3. **Cover gate nyata.** Worker image auto-cover hanya menghasilkan prompt (`prompt_ready`).
   Automation mem-flip `prompt_ready → pending` agar lane `generate` merender gambar sungguhan;
   publish hanya jalan saat baris `post_index=0` berstatus `selected`. `cover_max_wait_minutes`
   + `cover_max_attempts` memberi batas jujur → `failed` + email, bukan menggantung.
4. **Auto-publish pakai core tanpa gate admin.** `approveArticleAndPublish` dipisah jadi
   `publishArticleDraftCore(supabase, draftId, locales)`; versi action tetap menjaga `isAdmin()`.
5. **Twitter/threads hanya sampai draf** (sesuai keputusan user); tidak menyentuh
   `social_post_queue` (threads masih `is_enabled=false`).
6. **Fix excerpt di parser, bukan pelebaran CHECK.** `clampArticleExcerpt` memotong di batas
   kata tanpa memecah code point emoji; draf tersimpan jadi selalu DB-valid (50–500) sehingga
   publish tidak lagi bisa gagal 23514. Parser tetap lenient (tidak menolak output LLM panjang).
7. **Email best-effort**, tidak pernah memblok publish: kegagalan Resend dicatat ke
   `content_research_logs` sebagai `warn`, run tetap lanjut ke `completed`.
8. **Resend via `fetch` langsung** (tanpa dependency baru), key dari Vault `resend_api_key`
   (fallback `env.RESEND_API_KEY`), timeout `AbortController` 15 detik.

## Asumsi / Risiko

- **Auto-publish tanpa review** berisiko konten afiliasi keliru tayang → mitigasi: switch
  `auto_publish_article`, `require_cover`, dry-run, dan email `draft_ready` (default `both`).
- Gate thin-content (≥600 kata) tetap berlaku; draf tipis → run `failed` + email (tidak tayang).
- Cover bergantung worker image global (1 generate + 1 reasoning/5 mnt) → bisa timeout bila
  antrean padat; karena itu batasnya configurable.
- `UNIQUE(run_date)` → 1 kegagalan tidak auto-retry di hari yang sama bila `attempts` habis;
  disediakan tombol Retry manual + `max_retry_attempts`.
- Resend butuh domain/from terverifikasi; belum diverifikasi → email `skipped` (bukan error fatal).
- **Digest email belum disetujui Resend**: `email_from` default `notifikasi@asharu.id`.

## Verifikasi

- `npm run typecheck` ✓, `npm run lint` ✓, `npm test` **655 tests / 77 file hijau** ✓,
  `npm run build` ✓ (rute `/api/automation/run` + `/[locale]/admin/automation` ter-render).
- Migrasi applied ke produksi via MCP; verifikasi query: config 1 baris (`is_enabled=false`,
  platforms `{artikel,twitter,threads}`, hour=10), `automation_runs` 0 baris, 1 cron job `*/5`,
  2 policy RLS. Security advisors: hanya temuan pra-eksisting, tidak ada dari tabel baru.
- Test baru: `scheduler.test.ts` (13), `config.test.ts` (6), `email.test.ts` (5),
  `runner.test.ts` (8), excerpt clamp (5 di `prompt-article.test.ts`).

## Blocker / Belum Selesai

- **[USER ACTION] Seed Resend key ke Vault:** `node --env-file=.env.local scripts/seed-resend-key.mjs`
  + verifikasi domain di Resend. Tanpa key, email di-skip (fitur lain tetap jalan).
- **[USER ACTION] Dry-run produksi:** di `/id/admin/automation` aktifkan kill-switch + `Run now`
  dengan `auto_publish_article=false` untuk uji 1 hari, lalu nyalakan auto-publish.
- Deploy Vercel diperlukan agar endpoint + cron baru berfungsi live.

## Commit

- `873e8f0` (submodule) — `feat(db): tabel automation_configs + automation_runs + cron harian`
- `24e3bdb` (parent) — `feat(automation): riset harian otomatis ke artikel + notifikasi Resend`
- `d220acb` (parent) — `fix(automation): cegah orphan sesi + reset batas tunggu cover saat retry`
- `3ea8827` (parent) — `fix(automation): jamin email best-effort agar workflow tidak pernah terhenti`

## Jaminan Email Best-Effort (commit `3ea8827`)

Requirement user: workflow harus tetap jalan meski pengiriman email gagal. Audit menemukan
4 jalur di luar try/catch `sendViaResend` yang masih bisa melempar dan menghentikan tick:
`resolveResendKey` (RPC Vault), `resolveRecipients` (query `profiles`), `productLabel`
(query produk), `loadArticleLinks` (query artikel).

Fix berlapis:
- Satu fungsi `deliver()` membungkus semua pengiriman → selalu mengembalikan `SendResult`.
- `resolveResendKey`/`resolveRecipients`/`productLabel` dibuat anti-throw (fallback
  `null`/`[]`/`'(produk)'`) — gangguan jaringan Supabase = email di-skip, bukan crash.
- Blok notifikasi `draft_ready`, `published`, dan `notifyFailure` dibungkus try/catch;
  kegagalan dicatat `warn` ke `content_research_logs` dan tidak mengubah status run.
- Render payload (HTML) juga ter-guard.

Efek: setelah publish, run **selalu** maju ke `completed`; `notify_on='none'` dan Vault tanpa
`resend_api_key` tetap berjalan normal. +5 test (email 10 → 15; total suite 662).


## Hardening Pasca-Review (commit `d220acb`)

Review sendiri menemukan 3 bug nyata setelah push pertama:
1. Insert `automation_runs` gagal → sesi riset orphan (dipungut cron riset, jalan discovery
   tanpa pengelola). Fix: buang sesi bila kalah balapan `UNIQUE(run_date)`, atau tandai
   `failed` bila error lain.
2. **Bug retry cover:** `ensureCover` me-default `cover_started_at` ke `now` tanpa
   mem-persist-nya → batas tunggu ter-reset tiap tick dan **tidak pernah timeout**.
   Fix: persist saat null.
3. Retry (auto & manual) tidak me-reset `cover_started_at` → retry langsung timeout lagi.
   Fix: reset di kedua jalur + tolak retry bila sesi riset sendiri `failed`.

Plus guard `article_draft_id` kosong di `ensureCover`. +2 test regresi (runner 10 test).


## Rencana / Spec Terkait

- `plans/2026-09-15-automation-riset-harian-artikel.md` — plan utama + Progress Log.
