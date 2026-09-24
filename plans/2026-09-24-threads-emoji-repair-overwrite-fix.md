# Threads Emoji-Repair Overwrite Fix (draf 0bcf2f6e)

Created: 2026-09-24 10:30:00

## Objective

Perbaiki akar masalah draf threads `0bcf2f6e-cf39-4c21-83b4-0c1e6e4b0862` yang tampil "kosong" di `/konten/review` (kolom `id` berisi placeholder `main`/`reply-N`), dan cegah terulang: repair emoji/length di `generateAndInsertDraft` menimpa thread bagus dengan output repair yang lebih buruk tanpa validasi.

## Scope

- `src/lib/research/thread.ts`: quality guard + `parseThread` hardening + sanitize CJK.
- `src/lib/research/development.ts`: acceptance guard repair emoji + repair length + instruksi anti-skeleton di prompt repair.
- `src/lib/research/development.test.ts`: test regresi insiden 2026-09-24.
- Perbaikan data 1 baris prod `content_drafts 0bcf2f6e…` via skrip cetak-SQL + eksekusi manusia (tidak via MCP write oleh model).
- TIDAK termasuk: komponen UI (`ContentDraftCard`, `ReviewListClient`, `ArticleDraftCard`), `runner.ts`, pipeline artikel, migrasi DB, `.env`, file `.memory/`.

## Milestones

1. Baseline hijau tercatat (S0).
2. Guard murni + test hijau (S1).
3. Guard repair emoji + length dipakai + test hijau (S2, S3).
4. Prompt repair dikeraskan (S4).
5. `parseThread` tolak duplicate-key + placeholder (S5), sanitize CJK (S6).
6. Gate penuh hijau (S8).
7. Data draf 0bcf diperbaiki dan terverifikasi (S7, bisa paralel setelah S0; wajib SEBELUM/Sesudah? independen — lihat dependensi).

## Tasks

- [ ] S0 baseline
- [ ] S1 guard murni di thread.ts
- [ ] S2 guard repair emoji di development.ts
- [ ] S3 guard repair length di development.ts
- [ ] S4 prompt repair anti-skeleton
- [ ] S5 parseThread: duplicate-key + placeholder
- [ ] S6 sanitize CJK di tengah kata
- [ ] S7 perbaikan data draf 0bcf (prod, via manusia)
- [ ] S8 gate penuh + verifikasi akhir

## Implementation Steps

### S0 — Baseline hijau (wajib pertama)

- Tujuan: catat titik awal hijau sebelum menyentuh kode.
- Finding/req: prasyarat semua langkah; insiden paper trail.
- Dependency: tidak ada.
- File dibaca: `package.json:6-15` (scripts), `vitest.config.ts` (include `src/**/*.test.{ts,tsx}`).
- File diubah: tidak ada.
- Simbol: `npm run typecheck` (`tsc --noEmit`), `npm run lint` (`eslint .`), `npm test` (`vitest run`).
- Kondisi saat ini: repo diklaim hijau (memory: 915 tests). Verifikasi ulang oleh pelaksana.
- Perubahan: tidak ada. Hanya jalankan command.
- Behavior dipertahankan: n/a.
- Error/edge: jika baseline merah, STOP, catat failure di Progress Log plan ini, jangan lanjut ke S1.
- Test: n/a (menjalankan suite yang ada).
- Command verifikasi: `npm run typecheck`, lalu `npm run lint`, lalu `npx vitest run src/lib/research/development.test.ts`, lalu `npm test`.
- Hasil verifikasi diharapkan: keempat command exit 0. Catat jumlah test `npm test` (ekspektasi ±915 pass).
- Completion criteria: 4 hasil hijau tercatat di Progress Log dengan angka test.
- Dilarang diubah: semua file repo.

### S1 — Guard kualitas thread murni di `thread.ts` (fondasi S2/S3)

- Tujuan: sediakan fungsi murni penilai kualitas thread + penolakan placeholder, dipakai S2/S3.
- Finding: F4 (skema `min(1)` meloloskan `"main"`/`"reply-1"`), F2/F3 (tidak ada pembanding kualitas).
- Dependency: S0.
- File dibaca: `src/lib/research/thread.ts:1-90` (konstanta, `auditThreadEmoji`, `threadSchema`, `sanitizeThreadText`), `src/lib/research/thread.ts:229-257` (`parseThread`, `replacePlaceholders`); `src/lib/research/development.test.ts:1-17` (helper `thread()`), `:75-165` (blok `describe('parseThread')`).
- File diubah: `src/lib/research/thread.ts` (tambah fungsi + export), `src/lib/research/development.test.ts` (tambah test).
- Simbol: baru `isPlaceholderPostText(text: string): boolean`, baru `isPlaceholderThread(thread): boolean`, baru `shouldAcceptRepairThread(before, after): boolean`; terkait `auditThreadEmoji`, `ThreadGeneration` (`src/lib/llm/types`), `threadSchema`, `parseThread`.
- Kondisi saat ini: tidak ada fungsi guard; `parseThread` return non-null untuk skeleton `{"main":{"id":"main","en":"..."}}` karena `z.string().min(1)` lolos.
- Perubahan konkret di `thread.ts` (urutan edit):
  1. Setelah blok `sanitizeThread` (~baris 90), tambah konstanta `const PLACEHOLDER_POST_RE = /^\s*(main|reply-\d+|\d+)\s*$/i;` + komentar asal: insiden 2026-09-24 repair `03:24:06` mengembalikan label post sebagai konten.
  2. Tambah + export `isPlaceholderPostText`: return `PLACEHOLDER_POST_RE.test(text ?? '')`.
  3. Tambah + export `isPlaceholderThread`: true bila `main.id` placeholder ATAU ≥50% field `id` semua post placeholder ATAU semua field `id`+`en` kosong setelah trim. (Ambang 50% deterministik: hitung `fields = [main.id, main.en, ...replies.flatMap(id,en)]`, `bad = fields.filter(isPlaceholderPostText).length`, return `isPlaceholderPostText(main.id) || bad / fields.length >= 0.5`.)
  4. Tambah + export `shouldAcceptRepairThread(before, after)`: return false bila `isPlaceholderThread(after)` true; return false bila jumlah field non-kosong `after` < `before` (regresi bahasa hilang); return false bila `countPlaceholdersInThread(after) !== 1`; selain itu true. (Perbandingan emoji gap DILAKUKAN di caller development.ts karena butuh `auditThreadEmoji`; fungsi ini hanya guard kualitas konten. Dokumentasikan itu di komentar fungsi.)
- Behavior dipertahankan: `parseThread` sukses untuk input valid yang ada sekarang (semua test S0 tetap pass); `normalizePlaceholder`/`repositionPlaceholder` tidak disentuh.
- Error/edge: input null/undefined → guard return false (jangan throw); thread tanpa replies → tetap dinilai dari main saja.
- Test di `development.test.ts` (blok `describe` baru `threadQualityGuard`, setelah blok `parseThread` ~baris 165):
  1. Input skeleton persis insiden: `main {id:"main", en:"<teks en valid + {{P}}>"}, replies [{id:"reply-1", en:"..."}, ...]` (6 replies, placeholder di semua `id`) → `isPlaceholderThread` true, `shouldAcceptRepairThread(good, skeleton)` false. (`good` = helper `thread()` dengan teks ≥20 char per field + 1 placeholder.)
  2. `shouldAcceptRepairThread` false bila `after` kehilangan satu bahasa (hapus semua `en` → field kosong).
  3. `shouldAcceptRepairThread` true untuk perbaikan valid (gap emoji diperbaiki, semua field ≥1 char non-placeholder, 1 placeholder).
  4. `isPlaceholderPostText("main")` true; `("Main ")` true; `("reply-3")` true; `("7")` true; `("Midi dress ceruti")` false; `("")` false (string kosong bukan placeholder — ditangani skema).
- Command verifikasi: `npx vitest run src/lib/research/development.test.ts`, lalu `npm run typecheck`, `npm run lint`.
- Hasil diharapkan: exit 0 semua; 4+ test baru pass.
- Completion criteria: 3 fungsi ter-export, dipakai minimal oleh S2/S3, test baru hijau, tidak ada test lama merah.
- Dilarang diubah: `normalizePlaceholder`, `repositionPlaceholder`, `replacePlaceholders`, `auditThreadLength`, UI, `runner.ts`.

### S2 — Guard penerimaan repair EMOJI di `development.ts`

- Tujuan: repair emoji tidak boleh menimpa thread bagus dengan output skeleton/buruk (kejadian persis `03:24:06` menimpa `03:23:40`).
- Finding: F2 (overwrite buta `development.ts:714-725`).
- Dependency: S1 (wajib — memakai `shouldAcceptRepairThread`, `isPlaceholderThread`).
- File dibaca: `src/lib/research/development.ts:1-20` (import dari `./thread`), `:688-735` (blok emoji repair: `auditThreadEmoji` → `retryEmoji` → `parsedEmoji` → assign `finalThread`).
- File diubah: `src/lib/research/development.ts` (blok emoji saja), `src/lib/research/development.test.ts` (test logika keputusan bila memungkinkan tanpa supabase — lihat di bawah).
- Simbol: `generateAndInsertDraft`, `auditThreadEmoji`, `parseThread`, `repositionPlaceholder`, `replacePlaceholders`, `shouldAcceptRepairThread` (baru S1).
- Kondisi saat ini (`:714-725`): `if (parsedEmoji) { ...; finalThread = ...; activeLlm = retryEmoji; emojiGaps = auditThreadEmoji(finalThread); }` — diterima selama parse sukses.
- Perubahan konkret (urutan edit, hanya dalam blok `if (parsedEmoji)`):
  1. Tambah import `shouldAcceptRepairThread` ke import `./thread` di baris 20 (sisip alfabetis setelah `repositionPlaceholder`).
  2. Di dalam `if (parsedEmoji)`, SEBELUM assign: bangun kandidat `candidate` persis seperti kode sekarang (reposition + replacePlaceholder ke variabel sementara, jangan langsung ke `finalThread`).
  3. Hitung `candidateGaps = auditThreadEmoji(candidate)`.
  4. Terima kandidat hanya bila `shouldAcceptRepairThread(finalThread, candidate) && candidateGaps.length <= emojiGaps.length`. Bila diterima: `finalThread = candidate; activeLlm = retryEmoji; emojiGaps = candidateGaps;` (+ reposition `resolvedPostIndex` seperti sekarang).
  5. Bila ditolak: JANGAN assign; insert log `content_research_logs` (`stage 'developing'`, `level 'warn'`, message persis: `` `topic ${topicId} × ${platform.slug}: emoji repair ditolak (quality guard, gaps ${emojiGaps.length}→${candidateGaps.length}) — pakai thread awal` ``).
- Behavior dipertahankan: repair bagus (kasus normal: gap berkurang, konten utuh) tetap diterima; placeholder `{{PRODUCT_URL}}` tetap tepat 1 via `replacePlaceholders`; `resolvedPostIndex` hanya berubah saat diterima.
- Error/edge: `retryEmoji` null / parse null → jalur lama (tidak ada perubahan, tidak log guard); `candidateGaps` impseri vs `emojiGaps` sama tapi konten valid → diterima (kondisi `<=`); kandidat tanpa placeholder → `shouldAcceptRepairThread` false → ditolak + log.
- Test: logika di dalam `generateAndInsertDraft` butuh supabase mock (berat). Test yang diwajibkan di level unit untuk keputusan murni: tambah di `development.test.ts` tabel kasus `shouldAcceptRepairThread` + `auditThreadEmoji` gabungan: (a) before=attempt-1-like (7 replies, semua field ≥20 char, 1 placeholder) vs after=skeleton insiden → keputusan TOLAK; (b) before vs after=perbaikan valid (gap 8→0) → TERIMA. Data skeleton meniru `llm_call_logs 03:24:06` (id `main`/`reply-1..6`). Expected result eksplisit per kasus.
- Command verifikasi: `npx vitest run src/lib/research/development.test.ts`, `npm run typecheck`, `npm run lint`.
- Hasil diharapkan: exit 0; tidak ada perubahan perilaku untuk repair valid (tidak ada test lama merah).
- Completion criteria: kode assign-bersyarat + log penolakan ada; 2 kasus keputusan hijau.
- Dilarang diubah: blok length repair (S3), prompt string repair (S4), threshold `<=` (jangan ubah jadi `<` tanpa alasan tercatat).

### S3 — Guard penerimaan repair LENGTH di `development.ts`

- Tujuan: repair pemendek (`retryShort`) tidak boleh menimpa dengan skeleton (lubang yang sama dengan S2).
- Finding: F3 (overwrite buta `development.ts:758-770`).
- Dependency: S1 (wajib). S2 sebaiknya sudah merge dulu (berbagi fungsi `generateAndInsertDraft`; edit hunk berbeda — S2 hunk `:701-735`, S3 hunk `:745-770`).
- File dibaca: `src/lib/research/development.ts:737-779` (blok length: `auditThreadLength` → `retryShort` → `parsedShort` → assign).
- File diubah: `src/lib/research/development.ts` (blok length saja).
- Simbol: `auditThreadLength`, `LengthIssue`, `shouldAcceptRepairThread`.
- Kondisi saat ini (`:759-769`): `if (parsedShort) { ...; finalThread = ...; lengthIssues = auditThreadLength(finalThread, ...); }`.
- Perubahan konkret (cermin S2):
  1. Bangun `candidate` ke variabel sementara (reposition + replacePlaceholder).
  2. `candidateIssues = auditThreadLength(candidate, platform.maxChars)`.
  3. Terima hanya bila `shouldAcceptRepairThread(finalThread, candidate) && candidateIssues.length <= lengthIssues.length`; saat diterima assign + `lengthIssues = candidateIssues` (+ `activeLlm`, `resolvedPostIndex` seperti sekarang).
  4. Saat ditolak: insert log warn message persis: `` `topic ${topicId} × ${platform.slug}: length repair ditolak (quality guard, issues ${lengthIssues.length}→${candidateIssues.length}) — pakai thread awal` ``.
- Behavior dipertahankan: repair pemendek valid tetap diterima; flag `overLimit` dihitung dari hasil final seperti sekarang (`:771-779` tidak disentuh).
- Error/edge: sama dengan S2; `platform.maxChars` null → `auditThreadLength` return `[]`, kondisi `0<=0` true, keputusan diserahkan ke `shouldAcceptRepairThread`.
- Test: tambah 2 kasus keputusan (TOLAK skeleton, TERIMA pemendekan valid yang tetap ≥1 char/field dan 1 placeholder) di `development.test.ts`, pola sama S2. Expected eksplisit.
- Command verifikasi: sama S2.
- Hasil diharapkan: exit 0.
- Completion criteria: assign-bersyarat + log penolakan ada; 2 kasus hijau.
- Dilarang diubah: blok emoji (S2), `:771-779` (`overLimit` handling), prompt string (S4).

### S4 — Kekerasan prompt repair (anti-skeleton)

- Tujuan: kecilkan peluang model mengembalikan label post sebagai konten saat repair.
- Finding: F5 (gap descriptor `post-0 id` mirip label konten).
- Dependency: S2+S3 (teks prompt di hunk yang sama fungsi; edit SETELAH S2/S3 agar tidak konflik).
- File dibaca: `src/lib/research/development.ts:693-713` (user prompt emoji), `:739-757` (user prompt length).
- File diubah: `src/lib/research/development.ts` (dua string user prompt saja).
- Simbol: tidak ada simbol baru.
- Kondisi saat ini: emoji: `` `... post berikut TIDAK mengandung emoji: ${gapDesc}. Tulis ulang thread yang SAMA ...` `` dengan `gapDesc` format `post-${g.post} ${g.lang}` (`:697-700`); length: format `post-${o.post} ${o.lang} (${o.chars}/${o.max})` (`:741-744`).
- Perubahan konkret (urutan):
  1. Emoji prompt: ganti daftar gap menjadi format berquote `"Balasan 1 (bahasa ID)"` — ubah mapper `:697-700` menjadi `` `Balasan ${g.post} (bahasa ${g.lang === 'id' ? 'ID' : 'EN'})` `` dan tambah kalimat larangan persis: `DILARANG mengembalikan label seperti "main", "reply-1", atau angka saja sebagai isi post — setiap field id dan en WAJIB kalimat lengkap (>20 karakter). Kembalikan SEMUA post (bukan hanya yang gap), dengan struktur JSON dan jumlah reply yang SAMA persis.` (sisip sebelum `(jangan ganti kata...)`).
  2. Length prompt: tambah kalimat persis: `DILARANG mengembalikan label seperti "main"/"reply-N" sebagai isi; setiap field WAJIB kalimat lengkap. Pertahankan jumlah reply dan struktur JSON yang sama persis.`
  3. Jangan ubah aturan lain (HARD LIMIT, placeholder, fakta/CTA/URL).
- Behavior dipertahankan: jumlah reply, posisi placeholder, struktur JSON tetap sama; hanya instruksi tambahan.
- Error/edge: mapper baru harus tetap stabil untuk `g.post=0` (main) → rende `"Balasan 0 (bahasa ID)"`; terima (tidak perlu kasus khusus main) — catat di komentar kode 1 baris.
- Test: tambah test string di `development.test.ts`? Prompt dirakit inline (tidak diekspor) → test yang diwajibkan: tidak ada (tidak testable murni). Ganti dengan verifikasi statik: `grep` pola `DILARANG mengembalikan label` muncul 2x di `development.ts`. Tulis di Progress Log hasil grep. (Pengecualian test-code didokumentasikan di sini; S2/S3/S5/S6 tetap punya test.)
- Command verifikasi: `npm run typecheck`, `npm run lint`, grep pola (read-only).
- Hasil diharapkan: exit 0; 2 kemunculan string.
- Completion criteria: kedua prompt mengandung kalimat larangan persis; tidak ada perubahan logika lain di hunk.
- Dilarang diubah: logika acceptance (S2/S3), `gapDesc` variabel lain, prompt artikel (`buildArticlePrompt`).

### S5 — `parseThread`: tolak duplicate-key JSON + konten placeholder

- Tujuan: output cacat attempt-1 (`{"id":"1","en":"...","id":"..."}`) tidak lolos diam-diam; skeleton `03:24:06` ditolak di pintu parse.
- Finding: F6 (duplicate key), F4 (placeholder lolos parse).
- Dependency: S1 (memakai `isPlaceholderThread`; edit file sama `thread.ts` — kerjakan SETELAH S1 agar hunk tidak tabrakan: S1 hunk ~90, S5 hunk `parseThread` ~229).
- File dibaca: `src/lib/research/thread.ts:229-249` (`parseThread`), test `development.test.ts:75-165`.
- File diubah: `src/lib/research/thread.ts` (`parseThread` + 1 helper), `src/lib/research/development.test.ts`.
- Simbol: `parseThread`, `threadSchema`, `isPlaceholderThread` (S1).
- Kondisi saat ini: `JSON.parse` diam-diam menang-key-terakhir untuk duplicate key; tidak ada cek placeholder.
- Perubahan konkret (urutan, di `parseThread` setelah `safeParse` sukses, sebelum `normalizePlaceholder`):
  1. Tambah helper lokal (tidak perlu export): `function hasDuplicateIdKey(text: string): boolean { const m = text.match(/"id"\s*:/g); ... }` — implementasi deterministik: kumpulkan SEMUA kemunculan `"id":` di luar string? Terlalu berat. Aturan sederhana yang disepakati: hitung kemunculan regex `/"id"\s*:/g` pada raw text; hitung jumlah post dari hasil parse (`1 + replies.length`); bila kemunculan > jumlah post → return null (duplicate key terdeteksi). Komentar: heuristik, menutup kasus insiden (7 post vs 14+ kemunculan `"id"`).
  2. Setelah `safeParse`, tambah: `if (hasDuplicateIdKey(trimmed)) return null;` lalu `if (isPlaceholderThread(t)) return null;` sebelum `normalizePlaceholder`.
  3. PENTING — perilaku berubah untuk attempt-1 insiden (akan return null → retry suhu 0.3 seperti kode `:630-663` sudah menangani). Ini disengaja; dokumentasikan di komentar: `// 2026-09-24: duplicate-key (id ganda per reply) ditolak agar retry memproduksi JSON bersih`.
- Behavior dipertahankan: JSON valid tanpa duplikat + konten non-placeholder tetap parse (semua test lama hijau); retry path `development.ts:630-663` tidak diubah.
- Error/edge: `"id"` muncul di dalam nilai teks (mis. kalimat `kata "id" tersebut`) → false positive mungkin; mitigasi: heuristik hanya menolak bila kelebihan ≥2 (bukan 1) — tulis ambang di kode: `if (occurrences >= postCount + 2) return null`. Catat ambang di komentar.
- Test di `development.test.ts` (blok `parseThread`):
  1. Raw attempt-1-like: `{"main":{"id":"...","en":"..."},"replies":[{"id":"1","en":"E","id":"I"}, ...]}` (1 reply cukup) → `parseThread` null.
  2. Skeleton insiden (id `main`/`reply-1..2`, en valid, 1 placeholder) → null.
  3. Kontrol valid tetap non-null (sudah ada; tambah 1 kasus 7 replies bilingual valid → non-null) agar guard tidak over-blocking.
- Command verifikasi: `npx vitest run src/lib/research/development.test.ts`, `npm run typecheck`, `npm run lint`.
- Hasil diharapkan: exit 0; 3 kasus hijau; tidak ada test lama merah.
- Completion criteria: kedua penolakan aktif + test hijau.
- Dilarang diubah: `threadSchema` (bentuk zod tetap), `normalizePlaceholder`, retry logic `development.ts:630-663`, ambang `+2` (jangan ubah tanpa catat).

### S6 — Sanitize CJK di tengah kata Latin

- Tujuan: `anti过thinking` (draf twitter `2721d135…`) tidak menjadi `antithinking` yang salah eja.
- Finding: F7 minor (sampingan insiden; `sanitizeThreadText` replace CJK dengan `''`).
- Dependency: S5 (file sama `thread.ts`; kerjakan setelah S5).
- File dibaca: `src/lib/research/thread.ts:76-90` (`CJK_PATTERN`, `sanitizeThreadText`, `sanitizeThread`).
- File diubah: `src/lib/research/thread.ts` (1 baris + komentar), `src/lib/research/development.test.ts` (test).
- Simbol: `sanitizeThreadText`, `CJK_PATTERN`.
- Kondisi saat ini: `s.replace(CJK_PATTERN, '').replace(/\s{2,}/g, ' ').trim()` → `anti过thinking` → `antithinking`.
- Perubahan konkret: ganti `''` menjadi `' '` (spasi): `s.replace(CJK_PATTERN, ' ').replace(/\s{2,}/g, ' ').trim()` + komentar `// 2026-09-24: CJK di tengah kata Latin dipisah spasi agar tidak tersambung (anti过thinking → anti thinking)`.
- Behavior dipertahankan: CJK mandiri tetap hilang bersih (` halo世界test ` → `halo test`); collapse spasi ganda tetap.
- Error/edge: teks tanpa CJK → identik dengan sebelumnya (tidak ada perubahan).
- Test: `sanitizeThreadText('anti过thinking ⏰')` → `'anti thinking ⏰'`; `sanitizeThreadText('halo 世界 test')` → `'halo test'`; teks tanpa CJK tidak berubah.
- Command verifikasi: `npx vitest run src/lib/research/development.test.ts`, `npm run typecheck`, `npm run lint`.
- Hasil diharapkan: exit 0.
- Completion criteria: 3 assertion hijau.
- Dilarang diubah: `CJK_PATTERN` itu sendiri, aturan prompt `BAHASA` di `prompt.ts:115`.

### S7 — Perbaikan data draf `0bcf2f6e…` (prod; model Menyiapkan, manusia mengeksekusi)

- Tujuan: kembalikan kolom `id` Indonesia yang placeholder menjadi konten asli.
- Finding: F1 (data rusak prod).
- Dependency: S0 (snapshot). Independen dari S1–S6 (boleh paralel; direkomendasikan setelah S0).
- File dibaca: tidak ada file repo (baca via MCP read-only): `content_drafts 0bcf…`, `llm_call_logs` sesi `68c0fd0b…` (`03:23:40` len 4128), `content_drafts` saudara (`e9b23466…`, `2721d135…`).
- File diubah oleh pelaksana: SATU file baru `scripts/repair-thread-0bcf.mjs` (tidak di-commit; atau commit bila repo menghendaki — default: jangan commit, hapus setelah dipakai). TIDAK ada file repo lain.
- Simbol: n/a (skrip sekali pakai; pakai `SUPABASE_SECRET_KEY` dari env lokal, jangan hardcode).
- Kondisi saat ini (snapshot wajib diverifikasi ulang — ABORT bila beda): draf `0bcf…` masih `platform_slug='threads'`, `status='needs_review'`, `research_topic_id='fecc3d55…'`, `generated_thread.main.id='main'`, semua `replies[].id` = `reply-N`; `llm_call_logs` attempt-1 `03:23:40.552913` len 4128 masih ada.
- Perubahan konkret (skrip `scripts/repair-thread-0bcf.mjs`, urutan):
  1. SELECT draf + SELECT `response_text` attempt-1; ABORT (exit 1 + pesan) bila snapshot tidak cocok.
  2. `JSON.parse` raw attempt-1 (duplicate-key → key terakhir menang = teks Indonesia; deterministik di V8). Validasi: 1 main + 7 replies; tiap field `id`/`en` length ≥20; tiap field tidak placeholder (`/^\s*(main|reply-\d+|\d+)\s*$/i`); placeholder `{{PRODUCT_URL}}` totalrusak? Terapkan pipeline repo: `parseThread` hasil-null-diprediksi (S5 menolak duplikat) → JANGAN pakai `parseThread`; langsung ambil objek hasil `JSON.parse`, ganti `{{PRODUCT_URL}}` dengan `https://s.shopee.co.id/5fommHcJr9`, pertahankan urutan + `post_index=4` (reply idx 3) sesuai `affiliate_injections` eksisting.
  3. Skrip TIDAK update DB. Skrip MENCETAK satu statement SQL `UPDATE public.content_drafts SET generated_thread = '<JSON>'::jsonb, updated_at = now() WHERE id = '0bcf2f6e…' AND generated_thread->'main'->>'id' = 'main';` + `SELECT` verifikasi. Manusia review diff (7 `id` berubah, `en`/injeksi/meta tidak berubah) lalu eksekusi manual di SQL editor.
- OPEN QUESTION OQ-1 (tidak diputuskan diam-diam): `en` attempt-1 reply idx0 berisi teks Indonesia (`Rasanya kamu…`) akibat duplicate-key — opsi: (O1, rekomendasi) pakai attempt-1 apa adanya untuk `id`+`en` (koheren satu generasi; 1 reply `en`-nya Indonesia — terima sebagai cacat kecil yang bisa diedit di UI); (O2) `id` dari attempt-1 + `en` dari draf tersimpan (campuran dua generasi, terjemahan tidak sejajar); (O3) tulis ulang manual via UI. Risiko O1: satu reply EN beraksen ID. Rekomendasi O1 + edit manual 1 reply di `/konten/review/0bcf…` setelah UPDATE.
- Behavior dipertahankan: hanya kolom `generated_thread` baris itu; `status`, `article_draft_id` run, draf saudara, `articles` published tidak disentuh. Klausa `AND ...->>'id' = 'main'` membuat statement idempoten-aman (0 rows bila sudah diperbaiki orang lain).
- Error/edge: skrip exit 1 bila snapshot beda / validasi gagal; statement UPDATE harus mengembalikan 1 row; bila 0 rows → STOP, lapor.
- Verifikasi: SELECT ulang `generated_thread` (7 `id` ≥20 char, tidak placeholder); buka `/konten/review/0bcf…` tab ID tampil Indonesia; `npm` n/a.
- Completion criteria: tab ID berisi konten Indonesia asli; `en` utuh; link afiliasi 1x; status tetap `needs_review`.
- Dilarang: UPDATE tanpa klausa guard; menyentuh baris lain; menyimpan key di file.

### S8 — Gate penuh + verifikasi akhir

- Tujuan: pastikan tidak ada regresi.
- Dependency: S1–S6 (wajib setelah semua).
- File dibaca: Progress Log plan ini.
- File diubah: tidak ada (kecuali mencentang Tasks + Progress Log plan ini).
- Command verifikasi: `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`.
- Hasil diharapkan: exit 0 semua; `npm test` pass count ≥ baseline S0 (ekspektasi ±915 + ~15 baru); `npm run build` sukses.
- Completion criteria: 4 gate hijau; Tasks S0–S6 checked; S7 checked bila data fix selesai (atau tercatat tertunda di Open Items bila menunggu manusia).
- Dilarang: commit/push dari langkah ini (lihat Notes).

## Traceability

| Finding | Sumber bukti | Langkah | Verifikasi |
|---|---|---|---|
| F1 draf 0bcf `id` placeholder | `content_drafts` row; `generated_thread` | S7 | SELECT + UI tab ID |
| F2 emoji-repair overwrite buta | `development.ts:714-725`; log `03:24:06`; raw `llm_call_logs` len 2155 | S2 (+S1) | unit keputusan + typecheck/lint |
| F3 length-repair overwrite buta | `development.ts:759-769` | S3 (+S1) | unit keputusan + typecheck/lint |
| F4 skema loloskan placeholder | `thread.ts:65-74` | S1, S5 | 4+3 test baru |
| F5 prompt gap ambigu | `development.ts:697-700` + raw repair | S4 | grep 2 kemunculan |
| F6 duplicate-key JSON | raw `03:23:40` len 4128 | S5 | test null + kontrol valid |
| F7 CJK tersambung | draf twitter `2721d135…` (`anti过thinking`) | S6 | 3 assertion |
| F8 kesan kosong (tab ID default, snippet pakai `main.id`) | `ContentDraftCard.tsx:59`; `ReviewListClient.tsx:209-212` | n/a (perilaku benar setelah data+guard; tanpa perubahan UI) | verifikasi UI S7 |

## Risks

- Guard terlalu agresif menolak repair valid → mitigasi: ambang `<=` (S2/S3), ambang duplikat `+2` (S5), kontrol valid di test; log penolakan menyimpan jejak.
- Heuristik duplicate-key false positive bila kata `"id"` di dalam teks → mitigasi ambang `+2` + komentar.
- Perbaikan data salah sasaran → mitigasi klausa guard `AND main.id='main'` + review manusia + 0-row abort.
- Konflik hunk S2/S3/S4 (satu fungsi) → urutan S2→S3→S4 dipatuhi; S1→S5→S6 untuk `thread.ts`.
- Test suite penuh lama → jalankan targeted dulu, penuh di S8.

## Progress Log

- 2026-09-24 10:30:00 — Plan dibuat dari temuan terverifikasi prod (draf 0bcf, log sesi 68c0fd0b, raw LLM 03:23:40 vs 03:24:06). Belum ada implementasi.
- 2026-09-24 16:10:00 — S0 BASELINE MERAH → STOP per gate S0. Hasil: `npm run typecheck` ✓ exit 0; `npm run lint` ✓ 0 errors (12 warnings pre-existing); `npx vitest run src/lib/research/development.test.ts` ✓ 64/64; `npm test` ✗ exit 1: 1112 passed / 15 failed, SEMUA 15 di `src/components/lab/LabUi.test.tsx` (i18n key tak ter-resolve: `lab.history.*`/`lab.detail.*` tampil mentah, bukan teks ekspektasi). Pre-existing di HEAD `00b292e` (working tree bersih kecuali file `plans/*`, tanpa sentuhan `src/`). Tidak terkait scope thread/automation. Total test aktual 1127 (bukan ±915 di memory — memory stale). Menunggu keputusan user: (a) lanjut S1–S6 dengan baseline-scope hijau sebagai acuan + S8 tanpa `npm test` penuh, (b) perbaiki LabUi dulu (di luar scope plan ini), atau (c) stop.
- 2026-09-24 16:40:00 — S0 UNBLOCKED oleh `plans/2026-09-24-lab-messages-duplicate-lab-key-fix.md` (S1–S5 hijau). Penyebab 15 failures: duplikat top-level key `"lab"` di `src/messages/id.json` + `en.json` (blok `try` Endpoint Try menimpa blok penuh saat parse) → digabung jadi 1 blok `lab` (12 keys). Verifikasi: messages 5/5 ✓ (3 lama + 2 guard baru); LabUi 16/16 ✓ (sebelumnya 1/16); `npm run typecheck` ✓ exit 0; `npm run lint` ✓ 0 errors (12 warnings pre-existing, tidak bertambah). Status S0 plan ini: `baseline-scoped-hijau` — S1–S6 boleh lanjut; S8 tetap wajib `npm test` penuh.

## Notes

- Handoff untuk model kecil: kerjakan S0→S8 berurutan; JANGAN melompat (S2/S3 butuh S1; S4 butuh S2/S3; S5 butuh S1; S6 butuh S5). Setiap langkah: baca file yang listed → ubah tepat di lokasi → jalankan command verifikasi langkah → catat hasil → lanjut.
- Handoff checklist: [ ] S0 angka baseline tercatat; [ ] S1 3 fungsi + 4 test hijau; [ ] S2 assign-bersyarat + log + 2 kasus hijau; [ ] S3 sama; [ ] S4 2 string + grep; [ ] S5 3 kasus hijau; [ ] S6 3 assertion hijau; [ ] S8 4 gate hijau; [ ] S7 status jelas (selesai / menunggu manusia dengan OQ-1).
- Blocker/open question: OQ-1 (O1 direkomendasikan, lihat S7). Tidak ada blocker kode.
- Dilarang keras bagi pelaksana plan: edit UI/review/runner/artikel/migrasi/`.env`/`.memory`; commit/push (kecuali file plan bila diminta); UPDATE prod langsung oleh model (S7 via manusia); menebak ambang baru tanpa mencatat.
