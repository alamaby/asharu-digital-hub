# Automation Multi-Slot Starvation Fix — Implementation Plan

Created: 2026-09-22 16:30:00

## Objective

Perbaiki `runAutomationTick` agar slot `sore` tidak kelaparan (starvation) ketika slot `default` sudah `completed` di hari yang sama, sehingga sesi `3f73b691-f865-4948-93db-28565985bf42` (`awaiting_selection`) auto-recover menjadi `developing` → `completed` → publish lewat deploy fix, tanpa klik manual dan tanpa tulis manual ke DB.

Bukti dasar (sudah diverifikasi read-only 2026-09-22):
- `content_research_sessions 3f73b691`: `status=awaiting_selection`, `mechanism=dua`, 12 topik `pending`.
- `automation_runs`: `default 2026-09-22=completed (updated 04:05)`, `sore 2026-09-22=session_created (created=updated 09:01:21)` — tidak pernah di-update lagi.
- `sore` 2026-09-20 dan 2026-09-21 juga `session_created` tak tersentuh, sesinya `awaiting_selection`.
- `cron.job asharu-automation-run`: `*/5 active=true`; `cron.job_run_details` `succeeded` tiap 5 mnt — request terkirim, tapi runner return dini.
- `default` hari yang sama ada log `shortlist 1 topik → developing`; `sore` tidak ada.

## Scope

- In: `src/lib/automation/runner.ts` (`runAutomationTick` loop + query order), `src/lib/automation/runner.test.ts` (mock + regresi multi-slot).
- Out (dilarang ubah): `src/lib/research/orchestrator.ts`, `src/lib/research/state-machine.ts`, `advancePendingSessions` guard, `atomicTransition`, `advanceRun` cabang `awaiting_selection` (kecuali bila perlu panggil tanpa ubah logika), migrasi SQL / cron SQL, RLS, `vercel.json`, workflow GitHub.

## Milestones

1. Mock test mendukung jalur shortlist (S1).
2. Test regresi merah yang membuktikan bug (S2).
3. Fix inti membuat test hijau tanpa merusak singleton (S3).
4. Gate hijau + verifikasi prod read-only (S4–S5).

## Findings & Requirement Traceability

- F1 — Early-return `already_done` di dalam loop: `runner.ts:537-540` (`completed`) dan `runner.ts:563-564` (`failed` terminal) memanggil `return` sebelum loop selesai dan sebelum `for created:569-572` tercapai. Akibat: bila `Object.values(existingRuns)` menghasilkan `default:completed` duluan, `sore:session_created` tidak pernah diproses. Ditangani S3, diverifikasi S2/S4.
- F2 — Run baru tidak di-advance pada tick kreasi: pada tick `09:01`, `existingRuns={default:completed}`, `created=[sore]`; early-return F1 membuat `for created` unreachable. Akibat: `sore.updated_at` tidak berubah. Ditangani S3, diverifikasi S2/S4.
- F3 — Urutan non-deterministik: query `runner.ts:487-491` `.select('*').eq('run_date', runDate)` tanpa `ORDER BY`; `Object.values(existingRuns:495-499)` mengikuti urutan insert (default dulu). Starvation deterministik di prod tapi lolos di test yang hanya 1 run. Ditangani S3, diverifikasi S2/S4.
- F4 — Tidak ada test multi-slot campur terminal+open: `runner.test.ts:175-184` hanya 1 run `completed` → `already_done`. Tidak ada test `[completed, session_created]`. Ditangani S2.
- F5 — Mock `makeClient` tidak mendukung `.in()` pada rantai update: `runner.test.ts:59-96` (`insert`/`update`/`eq` ada, `.in` tidak ada). Jalur `advanceRun:631-635` `.update().eq('session_id').in('id', ids)` akan throw di test. Ditangani S1.
- F6 — Auto-recovery hanya untuk `run_date=today`: `runner.ts:433,488-491` (`localDateString` + `eq run_date`) sengaja tidak memungut `2026-09-20/21`. Jadi deploy fix hanya memulihkan `2026-09-22 sore`; 20/21 tetap `awaiting_selection` (benar agar konten basi tidak auto-publish). Ditangani S5/S6.

Requirements:
- R1: tick harus memproses SEMUA open runs hari ini, apa pun urutan terminal runs.
- R2: `already_done` hanya bila setelah scan penuh: tidak ada open, tidak ada created, semua terminal.
- R3: urutan proses deterministik.
- R4: `sore` hari ini auto-recover (shortlist → developing) tanpa tulis manual.
- R5: run tanggal lama tidak ikut auto-publish.

## Tasks

- [x] S1 — Perluas mock `.in()`
- [x] S2 — Tambah 3 test regresi merah
- [x] S3 — Fix loop + ORDER BY
- [x] S4 — Gate typecheck/lint/test/build
- [ ] S5 — Verifikasi prod read-only + auto-recovery hari ini
- [ ] S6 — Penanganan run basi 20/21 Sep (terminal, tanpa auto-publish)

---

### S1 — Perluas mock `makeClient` agar mendukung `.in()` pada update

- Tujuan langkah: memungkinkan test mengeksekusi jalur `advanceRun` `awaiting_selection` (shortlist) tanpa throw, sebagai fondasi S2.
- Finding/requirement: F5. Dependency: tidak ada (langkah pertama, risiko nol).
- File yang harus dibaca:
  - `src/lib/automation/runner.test.ts:1-101` (definisi `makeClient`, `baseConfig`).
  - `src/lib/automation/runner.ts:631-635` (pola `.update().eq().in()` yang harus didukung).
- File yang harus diubah: `src/lib/automation/runner.test.ts` saja (blok `update` di `makeClient`).
- Simbol terkait: `makeClient`, `Row`, `builder.update`.
- Kondisi implementasi saat ini: `update(patch)` mengembalikan `{ eq(col,val) => { rows=filter; return { eq, select, then } } }`. Tidak ada kunci `in`, sehingga `builder.update(...).eq('session_id', x).in('id', ids)` menghasilkan `TypeError: ...in is not a function`.
- Perubahan konkret: di dalam `update()`, pada objek yang dikembalikan oleh `eq` pertama, tambahkan metode `in(col2: string, vals: unknown[])` yang:
  1. memfilter `rows = rows.filter((r) => (vals as unknown[]).includes(r[col2]))`,
  2. memanggil `apply()` yang sama seperti cabang `eq`/`then`,
  3. mengembalikan `{ select: () => ({ maybeSingle: async () => { return { data: rows[0] ?? null, error: null }; } }), then: (resolve) => { return resolve({ data: null, error: null }); } }`.
  4. Jangan ubah perilaku `eq→eq`, `eq→select`, `eq→then` yang sudah ada.
- Urutan perubahan di dalam file: (1) baca `runner.test.ts:71-96`; (2) sisipkan properti `in` sejajar dengan `eq`/`select`/`then` di objek return `eq` pertama; (3) tidak menyentuh `baseConfig`, `import`, atau test lain.
- Behavior yang harus dipertahankan: semua test lama tetap hijau; `order`/`limit` tetap no-op; `insert`/`maybeSingle`/`single` tidak berubah.
- Error handling & edge case: bila `vals` kosong array → `rows` menjadi kosong (cocok dengan PostgREST: 0 baris ter-update, tidak throw); bila `col2` tidak ada di baris → baris terfilter keluar (jangan throw); `apply()` hanya memetakan `tables[table]` untuk `rows` yang cocok `id` (pola lama).
- Test yang harus ditambahkan/diubah: tidak ada test baru di S1; S1 adalah infra agar S2 bisa jalan.
- Input & expected: N/A (verifikasi lewat S2).
- Command verifikasi: belum perlu full gate; cukup `npm test -- src/lib/automation/runner.test.ts` tetap hijau sebelum S2 (opsional, boleh dilewati bila langsung lanjut S2).
- Hasil verifikasi diharapkan: test lama 0 gagal (jika dijalankan).
- Completion criteria: file menyimpan metode `in` baru; tidak ada perubahan selain blok mock tersebut; S2 dapat memanggil jalur shortlist tanpa `TypeError`.
- File/area yang tidak boleh diubah: `src/lib/automation/runner.ts`, `src/lib/research/*`, `src/lib/automation/schedules.ts`, `src/lib/automation/config.ts`, migrasi, cron.

### S2 — Tambah 3 test regresi multi-slot (harus MERAH sebelum S3)

- Tujuan langkah: buktikan F1/F2/F3 secara deterministik sebelum fix; kunci agar bug tidak regresi.
- Finding/requirement: F1, F2, F3, F4 → R1, R2, R3. Dependency: S1 selesai (butuh `.in()`).
- File yang harus dibaca:
  - `src/lib/automation/runner.test.ts:103-134` (`baseConfig`), `:139-249` (describe guards + pola `makeClient` + `now`).
  - `src/lib/automation/runner.ts:424-587` (kontrak `runAutomationTick` return `AutomationTickResult`).
  - `src/lib/automation/schedules.ts:175-191` (`loadEnabledSlots` butuh tabel `automation_schedules`).
  - `src/lib/automation/scheduler.ts:76-79` (`localDateString` untuk memilih `run_date` test).
- File yang harus diubah: `src/lib/automation/runner.test.ts` saja (tambah `describe('runAutomationTick (multi-slot starvation)', ...)` setelah describe guards, sebelum describe produk pool).
- Simbol terkait: `runAutomationTick`, `AutomationTickResult`, `loadEnabledSlots`, `isSlotDue`, `mergeSlotParams`, `localDateString`.
- Kondisi implementasi saat ini: hanya ada test singleton `already_done` (`runner.test.ts:175-184`); tidak ada setup `automation_schedules` dua slot; tidak ada test shortlist.
- Perubahan konkret — tambah tepat 3 test, tanpa ubah test lama:
  1. `T2a completed(default) + session_created(sore, awaiting_selection) → sore di-advance, bukan already_done` (urutan default dulu — reproduksi prod).
  2. `T2b urutan dibalik [sore, default] → hasil sama (order-independent)`.
  3. `T2c tick kreasi: existing={default:completed} + slot sore due & belum ada run → sore dibuat DAN langsung di-advance (updated, bukan session_created mentah)`.
- Setup data deterministik untuk T2a/T2b (contoh konkret, jangan diganti dengan nilai acak):
  - `automation_configs: [baseConfig({ schedule_window_minutes: 180 })]`.
  - `automation_schedules`: 2 baris enabled: `{ slot_key:'default', hour:10, minute:0, weekdays:127, is_enabled:true, priority:0, window_minutes:null, platform_slugs:null, max_topics:null, product_pool_size:null, product_category:null, auto_publish_article:null, require_cover:null, notify_on:null, notify_emails:null, maximum_iterations:null, minimum_score:null, minimum_candidates:null, freshness_hours:null, cover_max_wait_minutes:null, cover_max_attempts:null, max_retry_attempts:null, language:null, tone:null, audience:null, purpose:null, cta_style:null, target_reply_count:null, template_slug:null, idea_generation_enabled:null, idea_product_search:null, email_from:null, email_reply_to:null, product_repeat_blackout_days:null }` dan baris kedua sama dengan `{ slot_key:'sore', hour:16, minute:0, priority:1 }`.
  - `automation_runs`: T2a urutan `[ { id:'run-default', run_date:'2026-09-16', slot_key:'default', status:'completed', attempts:0, session_id:'s-default' }, { id:'run-sore', run_date:'2026-09-16', slot_key:'sore', status:'session_created', attempts:0, session_id:'s-sore', product_id:'p1', cover_attempts:0, cover_started_at:null } ]`; T2b urutan dibalik.
  - `content_research_sessions`: `[{ id:'s-default', status:'completed' }, { id:'s-sore', status:'awaiting_selection' }]`.
  - `content_research_topics`: `[{ id:'t-sore-1', session_id:'s-sore', rank:1 }, { id:'t-sore-2', session_id:'s-sore', rank:2 }]` (2 baris agar shortlist jelas; `cfg.maxTopics=1` dari `baseConfig`, mock `limit` no-op sehingga boleh shortlist >1 — assert longgar `>=1`).
  - `now: new Date('2026-09-16T09:30:00Z')` (=16:30 WIB: sore due, default tidak due tapi sudah ada run sehingga creation loop skip; advance loop tetap jalan).
  - Untuk T2c: `automation_runs` awal hanya `[run-default completed]`; `affiliate_products: [{ id:'p1', is_active:true, created_at:'2026-09-15T00:00:00Z' }]`; `content_research_sessions` awal `[]`; `now` sama `09:30Z`; tanpa `slotKey` (proses semua slot).
- Urutan perubahan di dalam file: (1) pastikan S1 sudah ada; (2) sisipkan `describe` baru setelah baris penutup describe guards (`:249`), sebelum `describe('runAutomationTick (produk pool)'`; (3) tidak menyentuh helper lama.
- Behavior yang harus dipertahankan: test lama tidak diubah; `baseConfig` tidak diubah; `now` memakai tanggal `2026-09-16` agar `run_date` cocok dengan baris `automation_runs`.
- Error handling & edge case: mock `order`/`limit` no-op → assert topik `status==='shortlisted'` dengan `>=1` bukan tepat 1; mock `affiliate_products` untuk T2c harus `is_active:true` agar `createRun` tidak return `pool produk` error; `ideaGenerationEnabled` default false di `baseConfig` mock sehingga `enrichSessionIdea` no-op (tidak butuh LLM).
- Test & expected result:
  - T2a/T2b sebelum fix: `res.skipped==='already_done'` (BUG — test merah karena ekspektasi di bawah); setelah fix S3 harus: `res.skipped===undefined`, `res.ok===true`, `tables.automation_runs` baris `run-sore.status==='developing'`, `tables.content_research_sessions` `s-sore.status==='developing'`, minimal 1 topik `status==='shortlisted'`, dan `tables.content_research_logs` mengandung `shortlist`.
  - T2c sebelum fix: `created` ada tapi `run sore.status==='session_created'` dan sesi `pending/discovering` tidak maju (BUG); setelah fix: run sore baru ada dan `status!=='session_created'` (yakni `developing`), `skipped!== 'already_done'`.
  - Tulis assertion persis: `expect(res.ok).toBe(true); expect(res.skipped).toBeUndefined(); expect(soreRun.status).toBe('developing'); expect(soreSession.status).toBe('developing');`.
- Command verifikasi: `npm test -- src/lib/automation/runner.test.ts`.
- Hasil verifikasi diharapkan SEBELUM S3: T2a gagal dengan `skipped already_done` (membuktikan F1), T2c gagal dengan run tetap `session_created` (membuktikan F2). SEBELUM lanjut S3, pelaksana WAJIB mencatat output merah ini di Progress Log (copy 5 baris pertama failure).
- Completion criteria: 3 test tersimpan, 0 test lama diubah, run S2 menghasilkan merah yang sesuai pola di atas (bukan error `TypeError .in` — bila masih `TypeError`, berarti S1 belum benar, kembali ke S1).
- File/area yang tidak boleh diubah: `src/lib/automation/runner.ts`, selain `runner.test.ts` tidak ada file lain.

### S3 — Fix inti `runAutomationTick`: hapus early-return + ORDER BY deterministik

- Tujuan langkah: hilangkan starvation (F1/F2/F3) dengan perubahan minimal, pertahankan semua perilaku singleton.
- Finding/requirement: F1, F2, F3 → R1, R2, R3. Dependency: S2 selesai (test merah tersedia sebagai oracle).
- File yang harus dibaca:
  - `src/lib/automation/runner.ts:14-23` (`AutomationRunStatus`), `:45-54` (`AutomationTickResult`), `:424-587` (seluruh `runAutomationTick`), `:593-652` (`advanceRun` cabang `awaiting_selection`, hanya baca, jangan ubah).
  - `src/lib/automation/runner.test.ts` (3 test S2 agar tahu kontrak yang harus dihijaukan).
- File yang harus diubah: `src/lib/automation/runner.ts` saja, dua lokasi berurutan.
- Simbol terkait: `runAutomationTick`, `AutomationRunRow`, `openStatuses`, `existingRuns`, `created`, `results`, `hadOpenRun`.
- Kondisi implementasi saat ini:
  - Lokasi A `runner.ts:487-491`: `.from('automation_runs').select('*').eq('run_date', runDate)` tanpa order.
  - Lokasi B `runner.ts:530-567`: `for (...existingRuns)` berisi `return already_done` di cabang `completed:538-540` dan `failed-terminal:563-565`, sehingga `for created:569-572` unreachable pada kondisi tersebut.
- Perubahan konkret (lakukan berurutan, tidak boleh dibalik tanpa alasan):
  1. Lokasi A: tambah `.order('slot_key', { ascending: true })` setelah `.eq('run_date', runDate)`. Bentuk akhir: `.from('automation_runs').select('*').eq('run_date', runDate).order('slot_key', { ascending: true })`. Jangan tambah order lain; jangan ubah `select('*')`.
  2. Lokasi B: ganti kedua early-return menjadi `continue` semantik (lewati, jangan return):
     - Hapus blok `else if (run.status === 'completed') { if (!hadOpenRun && results.length===0) return ... }` → ganti menjadi `else if (run.status === 'completed') { continue; }` dengan komentar `// Terminal: lewati, keputusan already_done di akhir (multi-slot).`.
     - Pada cabang `failed`, hapus blok terminal `if (!hadOpenRun && results.length===0) return ...:563-565` → ganti `continue` dengan komentar sama. Pertahankan seluruh blok retry `if (run.attempts < cfg.maxRetryAttempts) {...}` apa adanya (jangan ubah reset `developing/session_created`, `attempts+1`, `cover_started_at=null`, `hadOpenRun=true`, `advanceRun`, `results.push`, `continue`).
     - Setelah loop `existingRuns` dan setelah loop `created`, tambah keputusan akhir tunggal SEBELUM blok `force` yang sudah ada: `if (!hadOpenRun && results.length===0 && created.length===0) { // semua run hari ini terminal → pertahankan kontrak singleton: kembalikan run terminal pertama (deterministik slot_key terkecil) sebagai already_done }` — implementasi: ambil `terminalRuns = Object.values(existingRuns).filter(r => r.status==='completed' || r.status==='failed')`, urutkan by `slot_key`, bila ada maka `return { ok:true, skipped:'already_done', runDate, status: terminalRuns[0].status }`. Bila tidak ada terminal sama sekali, jatuh ke logika `force`/`not_due` yang sudah ada di bawahnya (jangan duplikasi).
  3. Jangan ubah: `openStatuses` set, `hadOpenRun` flag, `results.push` shape, `for created` body, blok `if (created.length>0) update last_run_at`, blok `if (!hadOpenRun && results.length===0 && opts.force)` dan `not_due` di bawahnya.
- Urutan perubahan di dalam file: A dulu (1 baris), lalu B (cabang completed → continue, cabang failed-terminal → continue, tambah blok akhir). Simpan sekali setelah keduanya selesai; jangan commit parsial.
- Behavior yang harus dipertahankan:
  - Singleton `1 run completed` → tetap `{ ok:true, skipped:'already_done', status:'completed' }` (test `runner.test.ts:175-184` harus hijau).
  - Singleton `failed attempts habis / sesi failed` → tetap `already_done` (test `:186-220` hijau).
  - `force` tanpa run tetap `{ ok:false, error:'semua slot gagal...' }`; `not_due` tetap bila tidak ada run dan tidak due.
  - `advanceRun` tidak diubah: shortlist masih `limit(cfg.maxTopics)`, `update topics shortlisted`, `sessions → developing` dengan backdate `-10 mnt`, `runs → developing`, log `shortlist N topik → developing`.
- Error handling & edge case:
  - `slot_key null` → koersi `'default'` seperti lama (jangan ubah `?? 'default'`).
  - `existingRuns` kosong + `created` kosong + tidak due → jatuh ke `not_due` (jangan return `already_done` dengan `status undefined`).
  - `failed` dengan `sessionStatus==='failed'` dan attempts tersisa → tetap terminal untuk slot itu (continue), tapi slot open lain tetap diproses.
  - Dua slot terminal (`completed` + `failed`) tanpa open → kembalikan terminal dengan `slot_key` terkecil (deterministik), bukan tergantung urutan DB.
- Test yang harus ditambahkan/diubah: tidak tambah test di S3; S3 harus menghijaukan 3 test S2 + semua test lama.
- Input & expected: sama seperti S2; tambahan: test singleton lama harus tetap `already_done`.
- Command verifikasi: `npm test -- src/lib/automation/runner.test.ts` (dulu), lalu `npm run typecheck`, `npm run lint` (lihat S4).
- Hasil verifikasi diharapkan: 3 test S2 hijau, 0 regresi.
- Completion criteria: `git diff -- src/lib/automation/runner.ts` hanya menunjukkan (a) 1 baris `.order`, (b) 2 cabang `continue`, (c) 1 blok akhir `already_done`; tidak ada perubahan lain di file tersebut.
- File/area yang tidak boleh diubah: `advanceRun`, `createRun`, `enrichSessionIdea`, `ensureCover`, `orchestrator.ts`, `state-machine.ts`, `schedules.ts`, `config.ts`, API routes, migrasi, `vercel.json`.

### S4 — Gate verifikasi repo (wajib hijau sebelum klaim selesai)

- Tujuan langkah: pastikan fix tidak merusak type, lint, test lain, dan build Next.
- Finding/requirement: semua F + kontrak singleton. Dependency: S3 selesai.
- File yang harus dibaca: `package.json:6-15` (scripts), `eslint.config.mjs` (hanya baca bila lint merah).
- File yang harus diubah: tidak ada (read-only + run command).
- Simbol terkait: N/A.
- Kondisi implementasi saat ini: repo memakai `vitest run`, `tsc --noEmit`, `eslint .`, `next build`.
- Perubahan konkret: tidak ada perubahan kode; hanya jalankan perintah berurutan:
  1. `npm run typecheck`
  2. `npm run lint`
  3. `npm test -- src/lib/automation/runner.test.ts` (lalu `npm test` penuh bila waktu memungkinkan)
  4. `npm run build` (wajib bila menyentuh pola yang hanya ditangkap build; S3 menyentuh runner yang dipakai route, jadi wajib).
- Urutan: sesuai di atas; bila langkah hijau lalu edit kecil apa pun (termasuk fix lint `let→const`), U langi dari `typecheck` (insiden 2026-09-10: fix lint tanpa re-check mematahkan build).
- Behavior yang harus dipertahankan: N/A.
- Error handling & edge case: bila `npm test` penuh ada gagal di luar automation (flaky/LLM), catat nama file + pesan di Progress Log, jangan ubah file di luar scope untuk membuatnya hijau; bila `build` gagal karena OOM/ENV, catat dan minta bantuan, jangan bypass dengan `--no-lint`.
- Test: N/A (ini langkah verifikasi).
- Command verifikasi & hasil diharapkan:
  - `npm run typecheck` → exit 0, tanpa error TS.
  - `npm run lint` → exit 0, 0 error (warning boleh dicatat).
  - `npm test -- src/lib/automation/runner.test.ts` → semua pass termasuk 3 baru + singleton lama.
  - `npm run build` → `Compiled successfully` / `Generating static pages` tanpa `Failed to compile`.
- Completion criteria: keempat command exit 0 pada kode yang sama persis dengan yang akan di-commit; output disalin ke Progress Log.
- File/area yang tidak boleh diubah: semua file (langkah ini dilarang edit).

### S5 — Verifikasi prod read-only + auto-recovery run hari-H (tanpa tulis DB)

- Tujuan langkah: buktikan R4 di prod tanpa intervensi tulis; kunci bahwa `Menunggu Pilihan` hilang sendiri setelah deploy.
- Finding/requirement: F1/F2 → R4. Dependency: S4 hijau + deploy ke prod selesai (deploy di luar scope plan ini; S5 hanya observasi).
- File yang harus dibaca: tidak ada file repo; baca via MCP `supabase-asharu-be-production` (read-only).
- File yang harus diubah: tidak ada.
- Simbol terkait: `automation_runs.status`, `content_research_sessions.status`, `content_research_logs.message`, `cron.job_run_details`.
- Kondisi implementasi saat ini (pre-fix): `sore hari-H session_created + sesi awaiting_selection + updated_at==created_at`.
- Perubahan konkret: tidak ada perubahan kode/DB oleh pelaksana; hanya query observasi berurutan setelah deploy + 2 tick `*/5` (±10 mnt):
  1. `SELECT id, slot_key, status, attempts, created_at, updated_at FROM automation_runs WHERE run_date = <TODAY_JKT> ORDER BY slot_key;` — harapkan `sore.status='developing'` (atau lebih jauh `awaiting_cover/publishing/completed`) dan `updated_at > created_at`.
  2. `SELECT created_at, stage, level, message FROM content_research_logs WHERE session_id='<SORE_SESSION_ID>' ORDER BY created_at DESC LIMIT 10;` — harapkan baris `automation/info shortlist N topik → developing`.
  3. `SELECT status FROM content_research_sessions WHERE id='<SORE_SESSION_ID>';` — harapkan bukan lagi `awaiting_selection`.
  4. Bila masih `session_created/awaiting_selection` setelah 15 mnt + cron `succeeded`, catat sebagai gagal recovery (jangan coba fix manual di S5, kembali ke S3).
- Behavior yang harus dipertahankan: tidak ada `INSERT/UPDATE/DELETE` via `execute_sql`/`apply_migration`; hanya `SELECT` + `query_logs` read-only (aturan MCP read-only repo ini).
- Error handling & edge case: bila sesi berubah `failed` dengan `discovery 0 topik` atau `thin content` → itu jalur valid `advanceRun` (bukan starvation); catat `error_message` dan lanjutkan ke penanganan konten, bukan rollback fix.
- Test/metode verifikasi: query di atas adalah verifikasi; tidak ada unit test baru.
- Command verifikasi: query MCP di atas (ganti `<TODAY_JKT>` dengan `localDateString` Asia/Jakarta hari deploy, `<SORE_SESSION_ID>` dengan id run sore hari-H).
- Hasil diharapkan: kriteria pada poin 1–3 terpenuhi dalam 15 mnt pasca-deploy.
- Completion criteria: bukti query ditempel di Progress Log; bila tidak pulih, S5 dinyatakan gagal dan S3 dibuka ulang.
- File/area yang tidak boleh diubah: seluruh repo + seluruh tabel prod (dilarang `apply_migration`, dilarang `execute_sql` non-SELECT).

### S6 — Penanganan run basi 2026-09-20/21 (terminal, tanpa auto-publish)

- Tujuan langkah: tegaskan R5 agar model kecil tidak mencoba menghidupkan konten basi.
- Finding/requirement: F6 → R5. Dependency: S5 (jangan kerjakan sebelum hari-H pulih).
- File yang harus dibaca: hasil query `automation_runs run_date IN ('2026-09-20','2026-09-21') slot_key='sore'` + sesinya (sudah diketahui `awaiting_selection`).
- File yang harus diubah: tidak ada file repo. Tindakan prod (bila dipilih) hanya via UI admin (`Lanjut ke Development` / `Tandai failed`) oleh manusia, bukan oleh model via SQL.
- Simbol terkait: N/A.
- Kondisi saat ini: 2 sesi sore lama `awaiting_selection` dengan topik basi.
- Perubahan konkret: TIDAK ADA perubahan kode; pilih satu dan catat di Progress Log: (Opsi A, rekomendasi) biarkan sebagai arsip + tandai `failed` manual via UI bila mengganggu dashboard; (Opsi B) shortlist manual via UI bila topik masih relevan — risiko konten basi, tidak disarankan.
- Behavior yang harus dipertahankan: runner tetap mengabaikan `run_date < today` (jangan tambah backfill otomatis).
- Error handling: jangan buat migrasi backfill; jangan ubah `runDate` logic.
- Verifikasi: `SELECT` ulang memastikan 20/21 tidak berubah menjadi `developing` sendiri setelah deploy (bukti R5).
- Completion criteria: keputusan A/B tercatat + alasan; tidak ada kode berubah untuk S6.
- File/area yang tidak boleh diubah: semua kode + semua tabel prod.

## Risks

- Urutan `Object.values` masih bergantung pada `reduce` bila `ORDER BY` gagal di mock — mitigasi: test dua urutan (T2a/T2b) + `ORDER BY slot_key` di prod.
- Mock `limit` no-op membuat shortlist > `maxTopics` di test — mitigasi: assert `>=1` bukan tepat 1; logika `limit` prod tidak diubah.
- `already_done` akhir harus kembalikan `status` deterministik — mitigasi: pilih terminal `slot_key` terkecil, pertahankan kontrak `{ ok, skipped, runDate, status }`.
- Tanpa migrasi DB — risiko deploy hanya kode; rollback = revert 1 commit runner + 1 commit test.

## Progress Log

- 2026-09-22 16:30:00 — Plan dibuat dari temuan read-only (sore 20/21/22 stuck, default completed, cron succeeded, early-return di `runner.ts:537-565`). Belum ada kode diubah. Menunggu eksekusi S1→S6 oleh model implementor.
- 2026-09-22 21:38:00 — S1 selesai: mock `makeClient` ditambahkan `.in()` paralel dengan `eq` pada rantai `update().eq()`, mendukung chaining `eq→eq→in` hingga kedalaman 3.
- 2026-09-22 21:36:00 — S2 selesai: 3 test regresi merah terverifikasi (T2a/T2c gagal `skipped='already_done'`, membuktikan F1). T2b sudah hijau sebelum fix karena urutan insert `Object.values` kebetulan favorable.
- 2026-09-22 21:42:00 — S3 selesai: (a) `.order('slot_key', { ascending: true })` ditambahkan di query `automation_runs` (`runner.ts:491`), (b) dua early-return `completed` dan `failed-terminal` diganti `continue`, (c) blok akhir `already_done` tunggal ditambahkan setelah loop `existingRuns`+`created`.
- 2026-09-22 21:45:00 — S4 gate: typecheck ✓, lint ✓ (0 errors, hanya warning pre-existing), build ✓ (`Compiled successfully`, 86 pages). Test runner.test.ts: 21 passed, 1 failed (pre-existing: `blackoutDays=0` — diverifikasi dengan `git stash`, gagal sebelum perubahan). 3 test baru T2a/T2b/T2c hijau. No regression.
- 2026-09-22 21:46:00 — S5/S6 dilambangkan (dilakukan manual oleh user). Plan handoff: tunggu review + deploy Vercel + observasi S5.

## Notes

- Standar arsitektur: bukan sistem rating/billing telecom, jadi **TM Forum ODA / Oracle C2M tidak berlaku**; pakai prinsip repo (`AGENTS.md` §1: SOLID, DB-as-code, RLS ketat, RSC) secara proporsional untuk bugfix kecil ini. Tidak ada penyimpangan yang perlu dijustifikasi.
- Env guard: jangan cetak `sb_secret_*`, `sb_publishable_*`, `CRON_SECRET`, isi `.env*` di log/chat/diff. Bila perlu cek secret, baca dari `process.env` saat runtime, jangan `cat`/`echo`.
- Satu file = satu plan. Jangan overwrite file ini untuk plan lain; bila ada plan baru, buat file `plans/YYYY-MM-DD-<nama>.md` baru. Jangan commit file lain bersama plan ini kecuali S1–S3 sudah hijau dan mengikuti aturan commit repo (Conventional Commits 1 baris, tanpa trailer, gate hijau, scan secret, submodule `supabase/` didahulukan bila ada migrasi — plan ini tidak ada migrasi).
- Open question yang sudah diputuskan oleh user: auto-recovery via deploy fix (bukan klik manual). Sisa open question hanya S6 opsi A/B untuk run basi — default rekomendasi A (biarkan/failed manual via UI).

---

## Handoff Checklist (untuk model implementor kecil)

- [ ] Baca persis file/lines pada setiap S sebelum edit; jangan menebak API Supabase di luar pola yang dikutip.
- [ ] Kerjakan berurutan S1 → S2 (merah dulu, catat) → S3 → S4; jangan loncat ke S3 sebelum S2 merah yang benar (bukan `TypeError`).
- [ ] `git diff` harus hanya: `src/lib/automation/runner.test.ts` (S1+S2) lalu `src/lib/automation/runner.ts` (S3). Bila diff menyentuh file lain, hentikan dan laporkan.
- [ ] Verifikasi S4 empat command exit 0 pada tree yang sama; tempel output ke Progress Log + centang Tasks.
- [ ] Jangan lakukan: tulis DB prod, buat migrasi, ubah cron/RLS/env, `git add`/`commit`/`push` kode (plan ini hanya sampai handoff; commit dilakukan sesi terpisah setelah review).
- [ ] Selesai bila: 3 test baru hijau + singleton lama hijau + gate hijau + S5 observasi hari-H memenuhi kriteria + S6 keputusan tercatat.
