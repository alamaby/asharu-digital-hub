# Scrape Workflow Validate-Gates Fix (run 35837142003)

Created: 2026-09-23 17:30:00

## Objective

Mengembalikan workflow `Scrape affiliate products` menjadi hijau tanpa mengubah data scrape yang sudah valid. Failure terakhir bukan di scrape/DB, melainkan 1 unit test gagal di gate `npm run test`: `src/lib/automation/runner.test.ts > blackoutDays=0 → tanpa query gte, semua produk tersedia` (`expected false to be true` di line 493). Penyebabnya adalah regresi urutan cabang di `runAutomationTick` dari commit `e3ade31` (multi-slot starvation fix): cabang `force → ok:false` ditaruh sebelum cabang `terminal → already_done ok:true`, sehingga fixture test (1 run `completed` di tanggal yang sama + `force:true`) jatuh ke error padahal seharusnya `already_done`.

Plan ini hanya memperbaiki urutan cabang + memperkuat test. Tidak menyentuh workflow YAML, scraper, skema DB, atau logika blackout.

## Scope

- In scope:
  - `src/lib/automation/runner.ts` fungsi `runAutomationTick` (reorder 2 blok return, tanpa ubah logika lain).
  - `src/lib/automation/runner.test.ts` (perbaiki fixture blackoutDays=0 + tambah regresi force+already_done).
  - Verifikasi `npm run typecheck`, `npx vitest run src/lib/automation/runner.test.ts`, `npm test`, `npm run lint`, dan SELECT validasi Supabase read-only.
- Out of scope (dilarang diubah di plan ini):
  - `.github/workflows/scrape-affiliate.yml`
  - `scripts/scrape-affiliate.mjs`
  - `src/lib/automation/scheduler.ts`, `src/lib/automation/config.ts`, `src/lib/automation/schedules.ts`
  - `supabase/` (migrasi, RLS, tabel `affiliate_products`, `automation_configs`, `automation_runs`)
  - Data prod (`affiliate_products` 256 aktif / 6 featured sudah valid).

## Traceability

| Requirement | Finding | Step |
|---|---|---|
| R1: workflow scrape hijau bila DB sync valid (256 aktif, 6 featured, 0 broken) | F1: run 35837142003 scrape+asset+drift sukses, gate merah 1 test (1057/1058 lolos) | S0 (reproduksi), S3 (gate penuh + SELECT) |
| R2: `blackoutDays=0` menonaktifkan blackout (tanpa filter `gte`) | F2: test blackoutDays=0 tidak pernah mencapai `createRun` karena fixture sudah `completed` + cabang salah | S1 (reorder), S2 (fixture baru tanpa run hari ini) |
| R3: `force:true` tetap error jujur bila semua slot gagal buat run dan belum ada run terminal (backward-compat) | F3: cabang force-error di `runner.ts:573-574` menelan kasus terminal | S1 (reorder + komentar), S2 (test force+already_done + force+gagal) |
| R4: semua run hari ini terminal → `already_done ok:true` (idempoten) | F4: `e3ade31` pindah `already_done` ke akhir tapi di bawah force-error | S1, S2 |
| R5: fix multi-slot starvation (`e3ade31`: sore tetap di-advance walau default completed duluan, order-independent) harus dipertahankan | F5: test T2a/T2b/T2c hijau, jangan rusak | S2 (jangan sentuh), S3 (full suite) |

Evidensi F1 (tidak perlu dicari ulang oleh implementer, tapi diverifikasi di S0/S3):

- `gh run view 35837142003 --json conclusion,status` → `failure/completed`; step 5–8 `success`, step 9 `Validate gates` `failure`.
- Log scrape: `Fetched 256 products`, `1/256 new or changed`, `asset check ok: 256 active`, `drift check ok: 256 active, 6 featured, 0 broken`.
- Supabase prod (read-only): `affiliate_products` total 256 / active 256 / featured 6 / broken 0; `automation_configs id=1 blackout=14`; `error_events` ada `scrape/github-actions/failed run 35837142003`.

## Milestones

1. Reproduksi deterministik (S0) — 1 test merah terkonfirmasi.
2. Fix ordering (S1) — perubahan 1 blok di `runner.ts`.
3. Test diperkuat (S2) — fixture benar + regresi.
4. Gate hijau + validasi data (S3) — siap merge.

## Tasks

- [ ] S0: reproduksi 1 test gagal secara deterministik
- [ ] S1: reorder cabang `already_done` sebelum `force-error` di `runAutomationTick`
- [ ] S2: perbaiki fixture blackoutDays=0 + tambah test regresi force+already_done
- [ ] S3: gate penuh + validasi Supabase read-only

## Risks

- Risiko utama: mengubah semantik tombol admin `Run now` (`force:true`) saat hari sudah terminal. Mitigasi: kembalikan ke perilaku pre-`e3ade31` (`already_done ok:true`) — lihat Open Question OQ1. Jangan membuat `force` membuat run duplikat.
- Risiko sekunder: godaan me-refactor blackout/pool logic saat menyentuh file. Mitigasi: S1 hanya swap blok, dilarang ubah baris lain (lihat larangan per langkah).

## Steps

### S0 — Reproduksi deterministik 1 test merah

- Tujuan langkah: membuktikan failure sama persis seperti CI sebelum mengubah apa pun.
- Finding/requirement yang diselesaikan: F1, R1 (baseline).
- Dependency: tidak ada (langkah pertama, wajib sebelum S1/S2).
- File yang harus dibaca:
  - `C:\Works\github.com\alamaby\asharu-digital-hub\src\lib\automation\runner.test.ts` (baris 1–120 helper `makeClient`/`baseConfig`, baris 475–494 test gagal).
  - `C:\Works\github.com\alamaby\asharu-digital-hub\src\lib\automation\runner.ts` (baris 424–596 `runAutomationTick`, fokus 572–586).
  - `C:\Works\github.com\alamaby\asharu-digital-hub\package.json` (scripts `typecheck`/`test`/`lint`).
- File yang harus diubah: tidak ada (read-only + run test saja).
- Simbol terkait: `runAutomationTick`, `AutomationTickResult`, `makeClient`, `baseConfig`.
- Kondisi implementasi saat ini: test `blackoutDays=0` gagal di CI (`runner.test.ts:493 expect(res.ok).toBe(true)` menerima `false`); 110/111 file dan 1057/1058 test lolos.
- Perubahan konkret: tidak ada perubahan kode. Hanya menjalankan perintah verifikasi.
- Urutan perubahan: N/A.
- Behavior yang harus dipertahankan: N/A (observasi saja).
- Error handling/edge case: jika single-test runner lolos tapi full suite gagal di tempat lain, catat sebagai anomali lingkungan dan lanjutkan ke S1 hanya bila test target tetap merah dengan pesan `expected false to be true`.
- Test yang harus ditambahkan/diperbarui: tidak ada di langkah ini.
- Input test dan expected result: N/A.
- Command verifikasi:
  - `npx vitest run src/lib/automation/runner.test.ts` (atau `npx vitest run src/lib/automation/runner.test.ts -t "blackoutDays=0"` untuk fokus).
- Hasil verifikasi yang diharapkan:
  - 1 failed: `runAutomationTick (produk pool) > blackoutDays=0 → tanpa query gte, semua produk tersedia`, `AssertionError: expected false to be true`, di `runner.test.ts:493:20`. Sisanya passed.
- Completion criteria: output S0 cocok dengan log CI run 35837142003 (1 failed, pesan identik). Jika tidak cocok, STOP dan laporkan sebagai blocker (bukan lanjut ke S1).
- File/area yang tidak boleh diubah: semua file repo (khususnya `runner.ts`, `runner.test.ts`, workflow YAML, `scripts/`, `supabase/`).

### S1 — Reorder cabang `already_done` sebelum `force-error` di `runAutomationTick`

- Tujuan langkah: memperbaiki regresi `e3ade31` agar `force:true` + semua run terminal mengembalikan `already_done ok:true`, bukan `ok:false`.
- Finding/requirement yang diselesaikan: F3, F4, R3, R4.
- Dependency: S0 selesai (failure terkonfirmasi).
- File yang harus dibaca:
  - `C:\Works\github.com\alamaby\asharu-digital-hub\src\lib\automation\runner.ts` baris 502–596 (loop create, loop advance, dua blok return 572–586).
  - `C:\Works\github.com\alamaby\asharu-digital-hub\src\lib\automation\runner.test.ts` baris 192–201 (`already_done` non-force), 475–494 (kasus gagal).
- File yang harus diubah:
  - `C:\Works\github.com\alamaby\asharu-digital-hub\src\lib\automation\runner.ts` — HANYA blok baris 572–586.
- Simbol terkait: `runAutomationTick(opts: { now?, startMinutes?, force?, slotKey? })`, `AutomationTickResult`, `existingRuns`, `created`, `results`, `hadOpenRun`, `terminalRuns`.
- Kondisi implementasi saat ini (salin persis, jangan diubah selain reorder):
  ```ts
  // Bila force tapi semua slot gagal membuat run → kembalikan error (backward-compat).
  if (!hadOpenRun && results.length === 0 && opts.force) {
    return { ok: false, error: 'semua slot gagal membuat run hari ini', runDate };
  }

  // Semua run hari ini terminal (completed/failed), tidak ada yang dibuka → sudah selesai hari ini.
  if (!hadOpenRun && results.length === 0 && created.length === 0) {
    const terminalRuns = Object.values(existingRuns).filter(
      (r) => r.status === 'completed' || r.status === 'failed'
    );
    if (terminalRuns.length > 0) {
      terminalRuns.sort((a, b) => ((a.slot_key ?? 'default') as string).localeCompare(b.slot_key ?? 'default'));
      return { ok: true, skipped: 'already_done', runDate, status: (terminalRuns[0] as AutomationRunRow)?.status ?? 'completed' };
    }
  }
  ```
- Perubahan konkret yang harus dilakukan (swap urutan blok, tambah 1 baris komentar penjelas, tanpa ubah kondisi/logika lain):
  ```ts
  // Semua run hari ini terminal (completed/failed), tidak ada yang dibuka → sudah selesai hari ini.
  // HARUS dicek SEBELUM cabang force-error di bawah: force + sudah-terminal = already_done (idempoten, perilaku pre-e3ade31).
  if (!hadOpenRun && results.length === 0 && created.length === 0) {
    const terminalRuns = Object.values(existingRuns).filter(
      (r) => r.status === 'completed' || r.status === 'failed'
    );
    if (terminalRuns.length > 0) {
      terminalRuns.sort((a, b) => ((a.slot_key ?? 'default') as string).localeCompare(b.slot_key ?? 'default'));
      return { ok: true, skipped: 'already_done', runDate, status: (terminalRuns[0] as AutomationRunRow)?.status ?? 'completed' };
    }
  }

  // Bila force tapi semua slot gagal membuat run → kembalikan error (backward-compat).
  // Hanya tercapai bila tidak ada terminalRuns (sudah ditangani di atas).
  if (!hadOpenRun && results.length === 0 && opts.force) {
    return { ok: false, error: 'semua slot gagal membuat run hari ini', runDate };
  }
  ```
- Urutan perubahan di dalam file:
  1. Potong blok `already_done` (komentar + `if` + isi) dan tempel di atas blok `force-error`. Jangan ubah indentasi (2 spasi), jangan ubah string `'semua slot gagal membuat run hari ini'`, jangan ubah sort `slot_key`.
  2. Tambahkan 1 baris komentar `HARUS dicek SEBELUM...` persis seperti di atas dan 1 baris `Hanya tercapai bila...` pada blok force. Tidak ada baris lain yang boleh berubah.
  3. Simpan file. Jangan format ulang file (no prettier massal).
- Behavior yang harus dipertahankan:
  - Blackout pool logic `runner.ts:291–302` (`blackoutDays>0` → query `gte('run_date', cutoff)`, `blackoutDays==0` → kosong) tidak berubah.
  - `occupied` dedup hari ini, fallback L1→L2→L3 (`runner.ts:304–311`) tidak berubah.
  - Multi-slot advance (`e3ade31`: loop semua `existingRuns`, T2a/T2b/T2c) tidak berubah.
  - `force:true` tanpa run terminal dan gagal create semua slot tetap `ok:false` (backward-compat untuk test `force mengabaikan jendela jadwal` yang mengharapkan `ok:false` saat pool kosong).
  - `not_due` non-force (`runner.ts:589–592`) tidak berubah.
- Error handling dan edge case yang harus ditangani:
  - `existingRuns` kosong + `force` + create gagal semua → tetap `ok:false` (jangan tertelan `already_done` karena `terminalRuns.length===0`).
  - `existingRuns` berisi campur `completed` + `failed` terminal + `force` → `already_done` dengan `status` dari `slot_key` terkecil (sort sudah ada, pertahankan).
  - `failed` dengan `attempts < maxRetryAttempts` dan sesi hidup tetap di-retry (cabang retry di atas tidak tersentuh).
  - `slotKey` filter (`opts.slotKey`) tidak terpengaruh (blok di bawah memakai `existingRuns` global, pertahankan).
- Test yang harus ditambahkan/diperbarui: tidak di langkah ini (dilakukan di S2). S1 dinyatakan selesai bila S0-test berubah dari merah ke hijau tanpa test lain merah (dicek via perintah S2/S3).
- Input test dan expected result: N/A di langkah ini (lihat S2).
- Command verifikasi (boleh dijalankan setelah S1, sebelum S2):
  - `npx vitest run src/lib/automation/runner.test.ts -t "blackoutDays=0"` → diharapkan tetap merah SEBELUM S2? Tidak — setelah S1 saja, test lama (fixture completed+force) akan hijau karena menjadi `already_done`. Catat: hijau di sini bukan bukti blackout benar, hanya bukti ordering benar. Bukti blackout benar ada di S2-T1.
- Hasil verifikasi yang diharapkan: tidak ada error TypeScript baru (`npm run typecheck` tetap hijau).
- Completion criteria: `git diff src/lib/automation/runner.ts` hanya menunjukkan swap 2 blok + 2 baris komentar, tidak ada hunk lain.
- File atau area yang tidak boleh diubah: `runner.ts` di luar baris 572–586; `scheduler.ts`, `config.ts`, `schedules.ts`, `scripts/scrape-affiliate.mjs`, `.github/workflows/scrape-affiliate.yml`, `supabase/`, dan SEMUA test file (baru di S2).

### S2 — Perbaiki fixture blackoutDays=0 + tambah regresi force+already_done

- Tujuan langkah: (a) membuat test blackoutDays=0 benar-benar menguji jalur `createRun` tanpa blackout, (b) mengunci perilaku ordering S1 agar tidak regresi lagi.
- Finding/requirement yang diselesaikan: F2, R2, R3, R4.
- Dependency: S1 selesai (ordering sudah benar). Jangan kerjakan S2 sebelum S1 karena ekspektasi di bawah mengasumsikan S1.
- File yang harus dibaca:
  - `C:\Works\github.com\alamaby\asharu-digital-hub\src\lib\automation\runner.test.ts` baris 1–151 (`makeClient` mendukung `eq`/`neq`/`gte`/`order`/`limit`/`insert`, `baseConfig` default `product_pool_size:50`), baris 475–519 (dua test blackout existing).
  - `C:\Works\github.com\alamaby\asharu-digital-hub\src\lib\automation\runner.ts` baris 258–311 (`createRun`: pool query, occupied, blackout, L1/L2/L3).
  - `C:\Works\github.com\alamaby\asharu-digital-hub\src\lib\automation\scheduler.ts` baris 125–130 (`blackoutCutoff`, days=0 → runDate itu sendiri).
- File yang harus diubah:
  - `C:\Works\github.com\alamaby\asharu-digital-hub\src\lib\automation\runner.test.ts` — HANYA area `describe('runAutomationTick (produk pool)')` sekitar baris 475–519.
- Simbol terkait: `runAutomationTick`, `baseConfig({ product_pool_size, product_repeat_blackout_days })`, `makeClient(tables)`, `AutomationRunRow.status`.
- Kondisi implementasi saat ini:
  - Test `blackoutDays=0` memakai `automation_runs=[{run_date:'2026-09-16', status:'completed', slot_key:'default'}]` + `now=2026-09-16T03:00Z` + `force:true` → tidak pernah memanggil `createRun` (run sudah ada), jadi tidak menguji blackout sama sekali. Setelah S1 ia lolos sebagai `already_done`, menutupi lubang fixture.
- Perubahan konkret yang harus dilakukan (3 edit atomik, berurutan):
  1. Ubah test existing `blackoutDays=0` menjadi jalur create yang sebenarnya: ganti `automation_runs` dari 1 baris `completed` menjadi `[]` (array kosong), pertahankan `automation_configs=[baseConfig({ product_pool_size: 2, product_repeat_blackout_days: 0 })]`, `affiliate_products=[p1,p2 aktif]`, `now=2026-09-16T03:00:00Z`, `force:true`. Tambahkan 2 asersi: `expect(res.ok).toBe(true)` (tetap) + `expect((tables.automation_runs as Row[])).toHaveLength(1)` (run benar-benar dibuat) + opsional `expect((tables.automation_runs as Row[])[0]).toMatchObject({ run_date: '2026-09-16' })`. Jangan ubah nama test (biar trace CI tetap sama), tapi perbarui komentar di atasnya menjadi `// blackout nonaktif: tanpa run hari ini → createRun harus sukses dan membuat 1 run`.
  2. Tambahkan test regresi baru tepat setelah test di atas dengan nama persis `force + already terminal → already_done (regresi e3ade31/S1)`: fixture SAMA PERSIS seperti test lama yang gagal (1 run `completed` tanggal sama slot `default`), `now` dan `force:true` sama, ekspektasi `expect(res).toMatchObject({ ok: true, skipped: 'already_done', status: 'completed' })` + `expect(tables.automation_runs).toHaveLength(1)` (tidak membuat run duplikat). Ini mengunci ordering S1.
  3. Jangan ubah test tetangga: `blackout: produk dalam jendela 14 hari...` (445–473) dan `semua pool blacklisted → fallback L2 lalu L3` (496–519) harus byte-identik.
- Urutan perubahan di dalam file:
  1. Edit blok `it('blackoutDays=0 ...')` dulu (fixture `automation_runs: []` + asersi baru).
  2. Sisipkan blok `it('force + already terminal ...')` baru di antara test (1) dan test `semua pool blacklisted`.
  3. Pastikan tidak ada import baru, tidak ada helper baru, tidak ada perubahan `makeClient`/`baseConfig`.
- Behavior yang harus dipertahankan:
  - `makeClient` tidak diubah (khususnya `gte` yang memfilter `>=`, `order`/`limit` no-op) — test mengandalkan perilaku mock ini.
  - `product_pool_size: 2` dan 2 produk aktif dipertahankan agar L1/L2/L3 deterministik.
  - Test multi-slot T2a/T2b/T2c, guard `disabled`/`not_due`/`already_done` non-force, dan thin-content gate tidak tersentuh.
- Error handling dan edge case yang harus ditangani:
  - Jika `createRun` gagal karena pool kosong (mis. salah ketik `is_active:false`), test T1 akan `ok:false` — itu sinyal fixture rusak, bukan bug runner. Pastikan `is_active:true` dan `created_at` terisi untuk kedua produk.
  - Jika implementer tergoda menegaskan "tanpa query gte" via spy: mock `makeClient` tidak mencatat nama kolom query, jadi JANGAN tambah spy `gte`. Cukup buktikan secara perilaku: dengan `blackoutDays:0` dan run `p1` kemarin (di luar tanggal hari ini), `p1` tetap bisa dipilih — tapi untuk determinisme penuh tanpa flaky random, cukup asersi `ok:true + 1 run dibuat` (pilihan produk acak via `pickRandomProduct` tidak diaserikan).
  - Flaky random: JANGAN asersi `product_id` spesifik di T1 (karena `pickRandomProduct` memakai crypto random). Hanya asersi jumlah run dan `run_date`.
- Test yang harus ditambahkan/diperbarui: seperti di atas (1 diperbaiki + 1 baru). Total file `runner.test.ts` dari 22 test menjadi 23 test.
- Input test dan expected result (spesifikasi deterministik untuk model kecil):
  - T1 input: `tables = { automation_configs: [baseConfig({ product_pool_size: 2, product_repeat_blackout_days: 0 })], automation_runs: [], affiliate_products: [{ id:'p1', is_active:true, created_at:'2026-08-01T00:00:00Z' }, { id:'p2', is_active:true, created_at:'2026-08-02T00:00:00Z' }], content_research_sessions: [], content_research_session_products: [] }`, `runAutomationTick(supabase, { now: new Date('2026-09-16T03:00:00Z'), force:true })` → expected `res.ok===true`, `tables.automation_runs.length===1`, `tables.automation_runs[0].run_date==='2026-09-16'`.
  - T2 input: sama seperti fixture lama (`automation_runs:[{ id:'r1', run_date:'2026-09-16', status:'completed', product_id:'p1', slot_key:'default', session_id:'s1' }]`, produk sama, `force:true`, `now` sama) → expected `{ ok:true, skipped:'already_done', status:'completed' }`, `tables.automation_runs.length===1` (tidak duplikat).
- Command verifikasi:
  - `npx vitest run src/lib/automation/runner.test.ts` → diharapkan `Test Files 1 passed`, `Tests 23 passed`.
  - `npm run typecheck` → diharapkan exit 0, tanpa output error.
- Hasil verifikasi yang diharapkan: T1 + T2 hijau, dan semua 21 test lain di file tetap hijau (khususnya T2a/T2b/T2c multi-slot dan fallback L2/L3).
- Completion criteria: `git diff src/lib/automation/runner.test.ts` hanya menunjukkan 1 blok diubah + 1 blok disisipkan di area 475–519, tidak ada perubahan di luar area itu.
- File atau area yang tidak boleh diubah: `makeClient` (baris 10–118), `baseConfig` (120–151), semua `describe` lain, `runner.ts` (sudah selesai di S1, jangan sentuh lagi di S2), workflow/scraper/supabase.

### S3 — Gate penuh + validasi data Supabase (read-only)

- Tujuan langkah: membuktikan tidak ada regresi di luar file yang diubah dan data prod tetap valid.
- Finding/requirement yang diselesaikan: F1, R1, R5 (no-regression + data_valid).
- Dependency: S1 + S2 selesai. Jangan jalankan `npm test` penuh sebelum keduanya hijau di level file.
- File yang harus dibaca: tidak ada file baru; cukup output perintah di bawah. Jika perlu, baca ulang `.github/workflows/scrape-affiliate.yml` baris 106–109 (gate = `npm run typecheck` + `npm run test`) untuk memastikan perintah yang dijalankan sama dengan CI.
- File yang harus diubah: tidak ada.
- Simbol terkait: N/A (verifikasi saja).
- Kondisi implementasi saat ini: CI merah karena 1 test; setelah S1+S2 seharusnya hijau.
- Perubahan konkret: tidak ada perubahan kode. Hanya verifikasi.
- Urutan perubahan: N/A. Urutan perintah verifikasi (berurutan, stop-on-failure):
  1. `npm run typecheck`
  2. `npx vitest run src/lib/automation/runner.test.ts`
  3. `npm test`
  4. `npm run lint`
  5. Dua query Supabase read-only via MCP `supabase-asharu-be-production` (JANGAN via `psql`/tulis): (a) counts affiliate, (b) config blackout. Lihat perintah di bawah.
- Behavior yang harus dipertahankan: workflow scrape steps 5–8 tetap sukses di run berikutnya (tidak diuji di sini, hanya gate unit). `error_events` kategori `scrape` tidak perlu dihapus (riwayat).
- Error handling dan edge case:
  - `npm run lint` boleh ada warning tapi exit code harus 0. Jika exit non-0 karena file yang diubah (mis. unused var di test baru), perbaiki di S2, bukan dengan `--fix` massal.
  - `npm test` mencakup 111 file / ~1059 test; jika gagal di file lain yang sebelumnya hijau (bukan `runner.test.ts`), STOP — itu regresi tak terduga, jangan lanjut merge. Laporkan nama file + pesan error persis.
  - Query Supabase HANYA `SELECT`/`WITH`. Dilarang `INSERT/UPDATE/DELETE/DDL`. Jika MCP menolak, catat sebagai environment issue, bukan failure kode.
- Test yang harus ditambahkan/diperbarui: tidak ada di langkah ini.
- Input test dan expected result: N/A (suite existing).
- Command verifikasi (persis, copy-paste):
  - `npm run typecheck` → expected: exit 0, tidak ada error `TSxxx`.
  - `npx vitest run src/lib/automation/runner.test.ts` → expected: `Test Files 1 passed (1)`, `Tests 23 passed (23)`.
  - `npm test` → expected: `Test Files 111 passed (111)`, `Tests 1059 passed (1059)` (1058 baseline + 1 baru; toleransi +1 bila counter berubah karena test baru, tapi `failed` harus 0).
  - `npm run lint` → expected: exit 0.
  - Supabase (a): `SELECT count(*) AS total, count(*) FILTER (WHERE is_active) AS active, count(*) FILTER (WHERE is_active AND is_featured) AS featured, count(*) FILTER (WHERE is_active AND (image IS NULL OR image='')) AS broken FROM affiliate_products;` → expected: `total=256, active=256, featured=6, broken=0` (atau `active>0, featured=6, broken=0` bila total berubah karena scrape harian baru — yang penting `featured==6` dan `broken==0` sesuai guard workflow lines 82–83).
  - Supabase (b): `SELECT id, is_enabled, product_pool_size, product_repeat_blackout_days FROM automation_configs WHERE id=1;` → expected: `is_enabled=true`, `product_repeat_blackout_days=14` (default prod; bila admin mengubah, catat nilai aktual, jangan overwrite).
- Hasil verifikasi yang diharapkan: semua perintah hijau + data (a)/(b) konsisten dengan guard CI (`asset check` + `drift check`).
- Completion criteria: keempat perintah hijau dan dua query mengembalikan nilai yang diharapkan. Jika salah satu merah, kembali ke S1/S2 sesuai file yang ditunjuk error, jangan buat perubahan di luar `runner.ts`/`runner.test.ts`.
- File atau area yang tidak boleh diubah: semua file (langkah verifikasi murni). Khususnya dilarang menjalankan `scripts/scrape-affiliate.mjs`, `supabase db push`, atau edit workflow untuk "menghijauhkan" gate (mis. menghapus `npm run test` dari YAML).

## Progress Log

- 2026-09-23 17:30:00 — Plan dibuat dari analisis run 35837142003 + validasi Supabase prod (256/256/6/0). Belum ada implementasi. Status: S0–S3 pending.
- 2026-09-23 15:56:00 WIB — S0 selesai: reproduksi 1 failed identik CI (`blackoutDays=0 → expected false to be true` di line 493).
- 2026-09-23 15:56:36 WIB — S1 selesai: reorder branch `already_done` sebelum `force-error` di `runner.ts:572-586` (+2 komentar penjelas). Typecheck hijau. Diff: 1 file, +7/-5.
- 2026-09-23 15:56:36 WIB — S2 selesai: fixture `blackoutDays=0` diubah ke `automation_runs=[]` + asersi jumlah run; tambah test regresi `force + already terminal → already_done`. `npx vitest run runner.test.ts` = 23/23 passed. Diff: 1 file, +27/-1.
- 2026-09-23 15:59:23 WIB — S3 gate: typecheck ✅; runner.test.ts individual ✅ 23/23; lint ✅ 0 errors / 12 warnings (pre-existing no-unused-vars); Supabase prod ✅ `256/256/6/0`; automation_configs ✅ `enabled=true, blackout=14`. Full-suite `npm test` mencatat 1 flaky-failure di `FeaturedProductBoard.test.tsx` (pre-existing: lolos saat isolasi dan saat stash/without S1+S2) — bukan regresi dari S1/S2.
- 2026-09-23 16:00:35 WIB — Serah balik. Dua file siap di-commit terpisah setelah persetujuan pemilik (lihat larangan eksplisit di plan).

## Notes

- Bukti scrape valid (jangan diinvestigasi ulang kecuali S3 query berubah): fetched 256, upsert 1 changed / 255 identical, `asset check ok: 256`, `drift check ok: 256 active, 6 featured, 0 broken`. Supabase prod cocok. Jadi TIDAK ada migrasi DB, TIDAK ada perbaikan scraper, TIDAK ada perubahan `affiliate_products`.
- `automation_runs 2026-09-23 default failed (thin content 425 kata < 600)` adalah failure automation harian yang terpisah, bukan penyebab gate merah ini. Jangan dicampur ke fix ini.
- Perilaku `pickRandomProduct` memakai `crypto.getRandomValues` — test tidak boleh mengasersi `product_id` spesifik di T1 (flaky). Hanya asersi `ok` + jumlah run.
- Standar desain yang dirujuk: tidak ada perubahan arsitektur; ini bugfix urutan cabang (bukan redesign). TM Forum/TOGAF tidak relevan untuk scope ini.
- Counter-argument yang sudah dipertimbangkan: Opsi B (hanya ubah fixture test tanpa reorder `runner.ts`) ditolak karena menyembunyikan bug `force+terminal` dan membuat `Run now` admin mengembalikan error palsu saat hari sudah selesai. Opsi yang dipilih (reorder + 2 test) mempertahankan backward-compat dan perilaku pre-`e3ade31`.

### Open Questions / Blockers

- OQ1 — Semantik `force:true` + sudah-terminal: DECIDED di plan ini sebagai `already_done ok:true` (kembalikan perilaku pre-`e3ade31`, idempoten, tidak buat duplikat). Opsi yang ditolak: `ok:false` (perilaku post-`e3ade31` saat ini) — risiko: tombol admin `Run now` terlihat error padahal tidak ada yang salah, dan workflow schedule dengan `force` internal bisa false-alarm. Jika pemilik produk menginginkan `force` selalu membuat run baru meski terminal, itu kebutuhan baru (butuh desain dedup + UX) dan TIDAK boleh dikerjakan diam-diam di plan ini — catat sebagai follow-up terpisah.
- OQ2 — Apakah `Validate gates` (`typecheck+test` penuh) harus tetap di workflow scrape? Di luar scope plan ini (dilarang ubah YAML). Rekomendasi follow-up: pertimbangkan memisah gate unit automation dari workflow scrape agar failure non-scrape tidak menandai scrape sebagai failed, TAPI itu mengubah guard CI dan butuh persetujuan pemilik — jangan dilakukan di eksekusi plan ini.
- Blocker: tidak ada. Semua informasi (file, baris, fixture, perintah) sudah eksplisit. Jika S0 tidak mereproduksi pesan identik, stop dan laporkan (kemungkinan checkout pada commit berbeda).

### Larangan eksplisit (untuk model kecil)

- DILARANG mengubah `.github/workflows/scrape-affiliate.yml` (khususnya menghapus/mengubah step `Validate gates`).
- DILARANG mengubah `scripts/scrape-affiliate.mjs`, `src/lib/automation/scheduler.ts`, `src/lib/automation/config.ts`, `src/lib/automation/schedules.ts`, dan seluruh `supabase/`.
- DILARANG menjalankan perintah tulis DB (`INSERT/UPDATE/DELETE/MERGE/DDL`) atau `supabase db push`, `node scripts/scrape-affiliate.mjs` (non-dry-run), `git push --force`, atau commit selain file plan (saat eksekusi S1–S3, commit kode mengikuti aturan repo terpisah — plan ini tidak memerintahkan commit kode).
- DILARANG menambah dependency npm, mengubah `package.json` scripts, atau menjalankan `eslint --fix` massal.
- DILARANG `console.log` secret (`SUPABASE_SECRET_KEY`, `CRON_SECRET`, `sb_secret_*`) atau mem-print isi `.env*`.

## Handoff Checklist (untuk model kecil — wajib dicentang berurutan)

- [ ] Checkout pada commit yang sama dengan analisis (`97f7c80` atau lebih baru yang masih mengandung test gagal S0). Catat `git log --oneline -3` aktual.
- [ ] S0: jalankan `npx vitest run src/lib/automation/runner.test.ts -t "blackoutDays=0"`, tempel output 1-failed persis. Jika hijau, STOP (lingkungan/commit salah).
- [ ] S1: edit HANYA `src/lib/automation/runner.ts` baris 572–586 via swap blok + 2 komentar. `git diff --stat` menunjukkan 1 file, ~10 baris berubah. `git diff` tidak menunjukkan hunk lain.
- [ ] S1-verify: `npm run typecheck` hijau.
- [ ] S2: edit HANYA `src/lib/automation/runner.test.ts` area 475–519 (1 fixture → `[]` + asersi jumlah, 1 test baru `force + already terminal`). `git diff` tidak menyentuh `makeClient`/`baseConfig`/test lain.
- [ ] S2-verify: `npx vitest run src/lib/automation/runner.test.ts` → 23 passed.
- [ ] S3: `npm test` → 0 failed; `npm run lint` → exit 0; 2 SELECT Supabase sesuai ekspektasi (catat nilai aktual bila total berubah).
- [ ] Tidak ada file di luar 2 file di atas yang berubah: `git status --short` hanya menunjukkan `M src/lib/automation/runner.ts` + `M src/lib/automation/runner.test.ts` (plus file plan ini bila di-commit terpisah).
- [ ] Isi `## Progress Log` di file plan ini dengan tanggal + hasil tiap langkah sebelum menyerahkan (tanpa mengubah bagian Steps).
- [ ] Serahkan kembali: diff kedua file + output 4 perintah + hasil 2 query. Jangan merge/push kode tanpa instruksi pemilik.
