# Implementation Plan — Threads Playwright Poster (manual run, laptop)

Created: 2026-10-02 07:00:00

## 1. Objective

Membangun tooling Playwright yang dijalankan manual dari laptop untuk memposting satu thread ke Threads (@asharu.id): post utama (teks + location + image + community/topic bila di-set), reply 1..N berantai (opsional image), jeda acak antar-publish 300–600 detik dan jeda acak antar-aksi UI 4–12 detik (keduanya configurable), serta melaporkan URL post Threads. Mode headed untuk probe/debug, headless untuk run stabil.

Jalur ini dipilih karena full-otomatis via Threads API terblokir bug Meta (invite tester tidak sync ke Active — lihat `plans/2026-09-06-threads-auto-post-queue.md` Progress Log 2026-09-06 s.d. 2026-09-07). Pipeline semi-otomatis yang sudah ada (`approveDraftAndQueue` + `markQueuePosted`) tetap dipertahankan dan TIDAK diubah.

## 2. Requirement Traceability

| ID | Requirement / Finding | Langkah | Verifikasi |
|---|---|---|---|
| R1 | Post utama: teks + location + upload image + community/topic bila di-set | S6 | S9 live test |
| R2 | Reply 1..N berantai (reply N membalas reply N−1), image opsional per reply | S7 | S9 live test |
| R3 | Jeda acak 300–600 dtk antar publish, configurable | S2, S3, S8 | unit test S2/S3 |
| R4 | Jeda acak 4–12 dtk antar klik/aksi UI, configurable | S2, S3, S8 | unit test S2/S3 |
| R5 | Melaporkan link post Threads (console + file report JSON) | S4 | unit test S4 + S9 |
| R6 | Headed untuk probe/debug, headless untuk run stabil | S0, S8 | S9 kedua mode |
| R7 | Dijalankan manual di laptop (`node ... --job job.json`) | S1, S5, S8 | S9 |
| F1 | Bug Meta: invite tester tak sync → API penuh ditunda | konteks (tanpa kode) | — |
| F2 | Location/topic picker mungkin hanya ada di mobile, belum tentu di web | S0 | capability flags |
| F3 | Selector web Threads rapuh/berubah-ubah | S0, S6 | `selectors.json` + re-probe |
| F4 | Headless lebih mudah dikenali bot | S9 | uji kedua mode + fallback |
| F5 | Durasi run panjang (main + 5 reply ≈ 35–60 mnt) | S8 | `--fast` + runbook |
| F6 | Hygiene secret: sesi browser tak boleh ke-commit | S1, S5 | gitignore + cek `git status` |

## 3. Prinsip Eksekusi (mengikat semua langkah)

1. Urutan langkah S0→S9 wajib sekuensial kecuali dinyatakan paralel.
2. Hanya file yang disebut di "File yang harus diubah" boleh disentuh. `src/**`, `supabase/**`, `.env*`, dan pipeline sosial yang sudah ada (`src/lib/social/*`, `src/app/api/social/*`, `scripts/seed-threads-token.mjs`) DILARANG diubah.
3. Semua delay/jeda memakai helper `scripts/threads-poster/delays.mjs` — dilarang `setTimeout` telanjang di `thread.mjs`/`auth.mjs`.
4. Semua nilai configurable merged dengan prioritas CLI > job JSON > default, dan nilai efektif SELALU di-log di awal run.
5. Setiap kegagalan publish menghentikan run (tidak lanjut ke reply berikutnya); progres parsial sudah tertulis di report.

## 4. Langkah Implementasi

### S0 — Probe headed + `selectors.json` + capability flags (PALING BERISIKO, KERJAKAN PERTAMA)

- Tujuan: membuktikan alur posting web Threads bisa diotomasi dan merekam selector + ketersediaan fitur sebelum satu baris otomasi ditulis.
- Requirement: F2, F3, R6. Dependency: tidak ada (langkah pertama). Blocker potensial B1.
- File yang harus dibaca: tidak ada (situs live `https://www.threads.com`, login manual sebagai @asharu.id).
- File yang harus diubah: SATU file baru `scripts/threads-poster/selectors.json` (dibuat di langkah ini).
- Simbol terkait: belum ada (belum ada kode).
- Kondisi saat ini: belum ada tooling Playwright; `playwright` belum ada di `package.json`.
- Perubahan konkret: install sekali `npx playwright install chromium` (hanya mengisi browser cache, bukan repo), lalu buka Chromium headed, login manual, dan catat ke `selectors.json` dengan skema PASTI berikut (nilai `null` = tidak ditemukan):
  ```json
  {
    "composerButton": "<role+name locator, mis. getByRole button name Pattern>",
    "textBox": "<locator>",
    "imageInput": "<locator input file atau null>",
    "locationField": "<locator atau null>",
    "topicField": "<locator atau null>",
    "submitButton": "<locator>",
    "replyButton": "<locator tombol reply pada suatu post>",
    "capabilities": { "location": true, "topic": true, "image": true },
    "urlPattern": "^https://www\\.threads\\.com/@[^/]+/post/[^/]+$"
  }
  ```
- Urutan: install browser → login → composer post utama → isi teks dummy → (bila ada) location/topic/image → screenshot tiap kontrol → balas post sendiri 1x → catat pola URL → tulis `selectors.json` → HAPUS post dummy.
- Behavior dipertahankan: tidak ada (kode baru).
- Error/edge: bila `locationField`/`topicField` null (kontrol hanya di mobile) → set `capabilities` false, LANJUTKAN langkah lain, dan catat sebagai Blocker B1 di `## Progress Log` file ini. Bila composer tidak bisa dibuka sama sekali → STOP, seluruh plan dibekukan, laporkan ke user.
- Test: tidak ada (manual). Bukti verifikasi = screenshot probe + `selectors.json` terisi.
- Command: `npx playwright install chromium` (sukses = `Chromium ... downloaded`). Tidak ada gate repo yang terpengaruh.
- Completion criteria: `selectors.json` ada, semua key terisi string-atau-null, minimal `composerButton`, `textBox`, `submitButton`, `replyButton` non-null, dan post dummy sudah dihapus.
- Dilarang diubah: semua file repo selain `selectors.json`.

### S1 — Scaffold direktori, dependensi, npm scripts, gitignore

- Tujuan: fondasi tooling tanpa menyentuh kode existing.
- Requirement: R7. Dependency: tidak ada (paralel dengan S0).
- File dibaca: `package.json` (scripts + devDependencies), `.gitignore`.
- File diubah: `package.json` (tambah SATU devDependency `playwright` + DUA script), `.gitignore` (tambah 2 baris); file baru: `scripts/threads-poster/job.example.json`.
- Simbol: npm scripts `threads:auth`, `threads:post`.
- Kondisi: `playwright` belum jadi dependensi; pola script existing: `"scrape:affiliate": "node scripts/scrape-affiliate.mjs"`.
- Perubahan konkret, urutan: (1) `npm install -D playwright` (catat versi ter-resolve di Progress Log); (2) tambah scripts `"threads:auth": "node scripts/threads-poster/auth.mjs"`, `"threads:post": "node scripts/threads-poster/thread.mjs"`; (3) append `.gitignore`: `scripts/threads-poster/auth.json`, `scripts/threads-poster/reports/`; (4) tulis `job.example.json` persis skema:
  ```json
  {
    "text": "contoh post utama",
    "image": null,
    "location": null,
    "topic": null,
    "delays": { "action": { "minSec": 4, "maxSec": 12 }, "publish": { "minSec": 300, "maxSec": 600 } },
    "replies": [{ "text": "contoh reply 1", "image": null }]
  }
  ```
- Behavior dipertahankan: semua script npm existing tetap jalan; tidak ada perubahan runtime app.
- Error/edge: bila `npm install` gagal (offline) → STOP dan laporkan; jangan pin versi manual tanpa verifikasi.
- Test: tidak ada. Verifikasi: `npm run typecheck` tetap hijau (file `.mjs` tidak di-typecheck — ekspektasi: 0 error baru), `git status --short` menunjukkan hanya `package.json`, `package-lock.json`, `.gitignore`, file baru.
- Completion: `node --version` ≥20.9, `npx playwright --version` sukses, `npm run lint` hijau.
- Dilarang: `src/**`, `supabase/**`, `.env*`, `scripts/seed-threads-token.mjs`, workflow scrape.

### S2 — `scripts/threads-poster/delays.mjs` + unit test (pure logic)

- Tujuan: satu-satunya sumber jeda acak (R3, R4).
- Dependency: S1. File dibaca: tidak ada. File diubah (baru): `scripts/threads-poster/delays.mjs`, `scripts/threads-poster/delays.test.mjs`.
- Simbol (nama PASTI): `randomSec(minSec, maxSec, rng?) → number` (integer detik, inklusif dua sisi, pakai `Math.floor(rng() * (max - min + 1)) + min`; default `rng = Math.random`); `sleep(ms, sleepImpl?) → Promise<void>`; `actionDelayMs(effective, rng?, sleepImpl?)`; `publishDelayMs(effective, rng?, sleepImpl?)` (keduanya = sleep dari `randomSec(...) * 1000` lalu return ms aktual agar bisa di-log).
- Kondisi: file belum ada.
- Urutan dalam file: konstanta default `DEFAULT_ACTION_DELAY = { minSec: 4, maxSec: 12 }`, `DEFAULT_PUBLISH_DELAY = { minSec: 300, maxSec: 600 }` → `randomSec` → `sleep` → dua wrapper.
- Behavior: tidak ada (baru). Larangan: tidak ada `Date.now` di file ini (waktu ditangani report).
- Error/edge: `minSec > maxSec` → `throw new Error('delay minSec (X) must be <= maxSec (Y)')`; nilai negatif/non-integer/non-finite → `throw new Error('delay bounds must be non-negative integers')`. Validasi di sini + di S3 (lapis ganda, pesan konsisten).
- Test (`delays.test.mjs`, pola import seperti `scripts/lib/message-catalog.test.mjs`): (a) `randomSec(4, 12, () => 0)` → `4`; `rng () => 0.999999` → `12`; (b) 200 sampel `randomSec(300, 600)` semua dalam [300, 600]; (c) `actionDelayMs` dengan `sleepImpl` mock записа ms yang dilewatkan = nilai return; (d) `randomSec(12, 4)` throw dengan pesan persis di atas; (e) `randomSec(-1, 5)` throw.
- Verifikasi: `npm test -- scripts/threads-poster/delays.test.mjs` (ekspektasi: 5/5 hijau); `npm run lint` hijau.
- Completion: semua test hijau, tidak ada `setTimeout` di luar `sleep`.
- Dilarang: file browser (`auth.mjs`/`thread.mjs`) belum boleh dibuat di langkah ini.

### S3 — `scripts/threads-poster/job.mjs` + unit test (validasi & merge config)

- Tujuan: parse job JSON, validasi ketat, merge prioritas CLI > job > default (R3, R4, R1 parsial).
- Dependency: S2 (memakai pesan error delay yang sama). File dibaca: `scripts/threads-poster/job.example.json`, `scripts/threads-poster/delays.mjs`. File diubah (baru): `scripts/threads-poster/job.mjs`, `scripts/threads-poster/job.test.mjs`.
- Simbol (nama PASTI): tipe `EffectiveDelays = { action: { minSec, maxSec }, publish: { minSec, maxSec } }`; `parseJobFile(path, readImpl?) → Job` (throw `job file <path> not found` bila hilang; throw `job file <path> is not valid JSON` bila parse gagal); `parseDelayFlag(value, name)` (format PASTI `"min,max"` mis. `"4,12"`; selain itu throw `invalid --<name>-delay "<value>", expected "min,max" in seconds`); `mergeDelays(jobDelays?, cliDelays?) → EffectiveDelays` (aturan PASTI: tiap knob `action`/`publish` diambil utuh dari CLI bila flag ada, else dari job bila ada, else default S2; knob tidak pernah di-mix parsial); `validateJob(job) → string[]` (return daftar error, kosong = valid).
- Aturan validasi PASTI: `text` string non-kosong setelah trim (error `job.text must be a non-empty string`); `text.length <= 500` (error `job.text exceeds 500 characters`); tiap reply sama (`replies[N].text ...`); `image` null-atau-string (bila string: file harus ada saat run — cek di S6, bukan di sini); `location`/`topic` null-atau-string-non-kosong; `replies` array (boleh kosong); delay bounds memakai aturan S2.
- Urutan dalam file: konstanta batas (`MAX_TEXT = 500`) → `parseJobFile` → `parseDelayFlag` → `mergeDelays` → `validateJob`.
- Behavior: tidak ada (baru).
- Error/edge: job tanpa key `delays` → default penuh; CLI hanya `--action-delay` → publish ikut job/default; `replies: []` → valid (hanya post utama).
- Test (`job.test.mjs`): (a) job minimal `{text}` → delays = default; (b) CLI menimpa penuh satu knob; (c) flag `"12,4"` throw pesan persis; (d) teks 501 char → error persis; (e) reply kosong → `replies[1].text must be a non-empty string`; (f) file hilang/invalid JSON → pesan persis. Ekspektasi: 6/6 hijau via `npm test -- scripts/threads-poster/job.test.mjs`.
- Completion: merge terdokumentasi di Progress Log; `npm run lint` hijau.
- Dilarang: menyentuh `delays.mjs` (sudah final di S2 kecuali bug — bila bug, catat di Progress Log dulu).

### S4 — `scripts/threads-poster/report.mjs` + unit test (R5)

- Tujuan: membangun dan menyimpan laporan URL post.
- Dependency: S1. File dibaca: `src/lib/social/actions.ts:209-215` (pola validasi URL threads — DISALIN polanya, file tersebut DILARANG diubah). File diubah (baru): `scripts/threads-poster/report.mjs`, `scripts/threads-poster/report.test.mjs`.
- Simbol (nama PASTI): `THREADS_URL_RE = /^https:\/\/www\.threads\.com\//` (pola SAMA dengan `actions.ts:213`); `isThreadsUrl(url) → boolean`; `createReport(jobName, effectiveDelays) → Report` (`{ job, startedAt: ISO, effectiveDelays, mainUrl: null, replies: [], actionDelaysSec: [], publishDelaysSec: [] }`); `recordPost(report, url)` (url pertama → `mainUrl`, sisanya push ke `replies`; throw `refusing to record non-threads URL: <url>` bila tidak match); `saveReport(report, dir, writeImpl?) → path` (nama file PASTI `report-<YYYYMMDD-HHmmss>.json`, waktu lokal WIB dikodekan eksplisit).
- Urutan dalam file: regex → `isThreadsUrl` → `createReport` → `recordPost` → `saveReport`.
- Behavior dipertahankan: regex identik dengan validasi `markQueuePosted` (konsistensi definisi "URL Threads").
- Error/edge: URL `threads.net` atau `https://threads.com/...` DITOLAK (hanya `www.threads.com`, mengikuti `actions.ts:213`); `saveReport` gagal tulis → throw dan run dianggap gagal.
- Test: (a) `isThreadsUrl('https://www.threads.com/@x/post/1')` true; `https://threads.com/...` false; (b) record 1 + 2 reply → `mainUrl` + `replies` length 2; (c) record URL non-threads throw pesan persis; (d) `saveReport` dengan `writeImpl` mock menghasilkan nama file match `/^report-\d{8}-\d{6}\.json$/`. Ekspektasi 4/4 hijau.
- Completion: `npm run lint` hijau; contoh report tercetak di Progress Log (tanpa URL asli bila belum ada run live).
- Dilarang: `src/lib/social/actions.ts` (baca saja).

### S5 — `scripts/threads-poster/auth.mjs` (login sekali, simpan sesi)

- Tujuan: menghasilkan `auth.json` untuk dipakai ulang semua run (R7, F6).
- Dependency: S1. File dibaca: tidak ada. File diubah (baru): `scripts/threads-poster/auth.mjs` saja.
- Simbol: fungsi `main()`; memakai `chromium.launch({ headless: false })` SELALU headed (login butuh interaksi manusia); `context.storageState({ path: 'scripts/threads-poster/auth.json' })`.
- Kondisi: `auth.json` belum ada.
- Perubahan konkret, urutan dalam file: import playwright → launch headed → `goto('https://www.threads.com/login')` → `console.log` instruksi "login manual sebagai @asharu.id, tekan ENTER di terminal" → tunggu ENTER via `node:readline` → simpan storageState → `console.log` sukses (JANGAN print isi token/cookie) → close.
- Behavior: tidak ada (baru).
- Error/edge: ENTER sebelum login selesai → sesi invalid; tangani dengan verifikasi: setelah ENTER, cek `page.url()` mengandung `threads.com` dan bukan `/login`; bila masih login page → pesan `login belum selesai, ulangi` + exit code 1 tanpa menimpa `auth.json` lama (tulis ke file temp lalu rename hanya bila valid).
- Test: tidak ada (interaktif). Verifikasi: `npm run threads:auth`, lakukan login, ENTER → `auth.json` tercipta; `git status --short` TIDAK menampilkan `auth.json` (tertutup gitignore S1 — bila muncul, STOP dan perbaiki gitignore dulu).
- Completion: `auth.json` ada, ter-gitignore, tidak ada secret tercetak di terminal.
- Dilarang: menyimpan kredensial dalam bentuk apa pun selain `auth.json` Playwright; memodifikasi file S2–S4.

### S6 — `thread.mjs` bagian 1: composer post utama (R1)

- Tujuan: memposting post utama persis sesuai job.
- Dependency: S0 (selector + capability), S2, S3, S4, S5. File dibaca: `selectors.json`, `job.mjs`, `delays.mjs`, `report.mjs`. File diubah (baru): `scripts/threads-poster/thread.mjs` (langkah ini mengisi: bootstrap CLI + `postMain()`; chain reply di S7).
- Simbol (nama PASTI): `pacedAction(page, action, effective, rng?)` (wrapper WAJIB untuk tiap klik/isi: sleep acak action-delay SEBELUM aksi, jalankan, catat detik aktual ke `report.actionDelaysSec`); `postMain(page, job, report, effective) → url`.
- Kondisi: `thread.mjs` belum ada.
- Perubahan konkret, urutan di `postMain`: (1) goto post/composer via `selectors.json`; (2) `pacedAction` isi `textBox` (pakai `fill`, bukan `type` per karakter — anti typo, tetap natural karena jeda antar-aksi); (3) bila `job.image` non-null: `setInputFiles` ke `imageInput`, lalu verifikasi file ada dulu via `node:fs` (`image file not found: <path>` → throw SEBELUM membuka composer); (4) bila `job.location` non-null DAN `capabilities.location`: ketik + `pacedAction` pilih suggestion pertama; bila capability false → `console.warn` `location tidak didukung web, dilewati` dan LANJUT (lihat B1); (5) sama untuk `topic`; (6) screenshot pre-submit ke `reports/`; (7) bila `--dry-run`: STOP di sini tanpa submit (return null, report ditandai `dryRun: true`); (8) submit, tunggu URL match `urlPattern` S0 (timeout 60 dtk), return URL.
- Locator WAJIB berbasis role/placeholder dari `selectors.json`; DILARANG hardcode class CSS hasil inspect.
- Behavior: tidak ada (baru).
- Error/edge: file image hilang; suggestion location tidak muncul (timeout 15 dtk → warn + lanjut TANPA location, catat di report `skipped: ['location']`); submit timeout → screenshot + throw `publish timeout after 60s` (report parsial tetap disimpan oleh S7/S8 `finally`).
- Test: tidak ada unit test (butuh browser); verifikasi di S9.
- Completion: `node scripts/threads-poster/thread.mjs --help` mencetak usage; `--dry-run` lolos tanpa membuka sesi auth (tidak perlu login).
- Dilarang: mengimplementasikan reply chain (itu S7); mengubah S2–S4.

### S7 — `thread.mjs` bagian 2: reply chain + publish delay + report (R2, R3, R5)

- Tujuan: reply berantai + jeda publish + laporan final.
- Dependency: S6. File dibaca: `thread.mjs` (hasil S6). File diubah: `thread.mjs` (tambah) saja.
- Simbol (nama PASTI): `postReply(page, parentUrl, item, index, report, effective) → url` (navigasi ke `parentUrl`, klik `replyButton`, isi teks + image opsional — reuse logika S6 langkah 2–3); `runThread(...)` orkestrator: `postMain` → untuk tiap reply: `publishDelayMs` SEBELUM publish reply ke-1..N (acak 300–600 dtk, catat ke `report.publishDelaysSec`), `postReply`, `recordPost`; `finally`: `saveReport` SELALU ditulis walau throw (parsial).
- Urutan: `postReply` dulu, lalu `runThread`, lalu `finally` guarantee. Struktur chain PASTI: parent reply-1 = URL main; parent reply-k = URL reply-(k−1) (return value sebelumnya, bukan query ulang).
- Behavior dipertahankan: alur S6 tidak berubah; `pacedAction` tetap dipakai di dalam `postReply`.
- Error/edge: gagal di reply-k → throw, report berisi URL s.d. reply-(k−1) + `failedAt: { index, error }`; resume manual = job baru berisi sisa reply dengan teks reply yang sudah terbit DIHAPUS dari job (tidak ada auto-resume — keputusan eksplisit, lihat B5); image reply hilang → throw sebelum publish reply itu.
- Test: tidak ada unit (browser). Verifikasi S9.
- Completion: `--dry-run` dengan 2 reply mencetak urutan aksi tanpa publish; tidak ada publish nyata di dry-run (bukti: tidak ada URL baru di akun).
- Dilarang: mengubah `job.mjs`/`delays.mjs`/`report.mjs`; menambah flag CLI baru (itu S8).

### S8 — CLI final: flags, validasi fail-fast, log config, `--fast` (R3, R4, R6, R7, F5)

- Tujuan: antarmuka run final yang aman dan terdokumentasi.
- Dependency: S3, S6, S7. File dibaca: `thread.mjs`. File diubah: `thread.mjs` (blok CLI) + `scripts/threads-poster/job.example.json` (tambah contoh delays bila belum) — dua file saja.
- Flag PASTI: `--job <path>` (wajib), `--headed` / `--headless` (default headless; keduanya eksplisit didukung), `--dry-run`, `--fast` (override: action → 1–2 dtk, publish → 5–10 dtk, DICETAK sebagai warning `FAST MODE — bukan delay produksi`), `--action-delay min,max`, `--publish-delay min,max`.
- Urutan di `main()`: (1) parse flag (flag tak dikenal → usage + exit 2); (2) `parseJobFile` + `validateJob` (error → cetak SEMUA error + exit 2, SEBELUM browser dibuka); (3) `mergeDelays` → console.log JSON `effectiveDelays` + jalankan browser (`headless: !headed`, `storageState: auth.json`; bila `auth.json` hilang → `run npm run threads:auth first` + exit 1); (4) `runThread`; (5) cetak URL tiap post ke console + path report.
- Behavior: default (tanpa flag delay) = 4–12 dtk aksi, 300–600 dtk publish.
- Error/edge: `--fast` + tanpa `--dry-run` → tetap publish nyata (tujuan: uji live cepat) TAPI wajib konfirmasi interaktif `ketik YA untuk lanjut` kecuali `--yes`; power/hibernate = tanggung jawab operator (cantumkan di runbook S9).
- Test: verifikasi manual `--help`, `--dry-run` tanpa auth, job invalid (exit 2 + semua error tercetak).
- Verifikasi: `npm run lint` hijau; `node scripts/threads-poster/thread.mjs --job scripts/threads-poster/job.example.json --dry-run --headed` selesai tanpa error (jendela browser boleh terbuka lalu tertutup).
- Completion: semua flag bekerja; config efektif selalu ter-log.
- Dilarang: mengubah logika S6/S7 selain wiring flag.

### S9 — Verifikasi E2E bertahap + runbook (R1–R7, F4)

- Tujuan: bukti live + runbook operator.
- Dependency: S0–S8. File dibaca: report hasil run. File diubah (baru): `scripts/threads-poster/RUNBOOK.md` saja (runbook: power settings anti-sleep, urutan run, cara re-probe bila selector patah, fallback headed bila headless kena challenge, larangan commit `auth.json`/`reports/`).
- Tahap WAJIB berurutan (berhenti bila satu gagal): (1) `--dry-run --headed` job contoh → ekspektasi: composer terisi, screenshot ada, TIDAK ada post baru; (2) `--fast` TANPA dry-run, job uji 1 reply, headed → ekspektasi: 2 URL `www.threads.com` tercatat, report JSON valid; HAPUS post uji; (3) ulangi (2) headless → ekspektasi sama (bila kena challenge: catat, fallback headed, lanjut); (4) full-speed 1 thread kecil (main + 1 reply, delay produksi) → ekspektasi: total durasi ≈ 5–10 mnt + aksi, URL valid; (5) gate repo: `npm run typecheck` (0 error baru), `npm run lint` (hijau), `npm test` (baseline 1198 + 15 baru S2/S3/S4 = ekspektasi ≥1213 hijau — angka PASTI dihitung executor dari hasil aktual dan dicatat di Progress Log).
- Behavior: tidak ada perubahan kode di langkah ini kecuali perbaikan bug yang ditemukan — tiap perbaikan kembali ke langkah pemiliknya dan gate diulang.
- Error/edge: selector patah (UI berubah) → kembali ke S0 re-probe, update `selectors.json`, ulangi S9 dari tahap 1; challenge/2FA → login ulang via S5; laptop sleep → run gagal parsial, report parsial jadi bukti, ulangi sisa manual.
- Completion: RUNBOOK.md ada; minimal tahap 1–3 lolos; tahap 4 lolos bila user menyediakan slot waktu (bila tidak, catat sebagai open item dengan tanggal).
- Dilarang: memposting konten produksi/asli selama verifikasi (hanya post uji yang dihapus); mengubah kode di langkah ini tanpa kembali ke langkah pemilik.

## 5. Blockers / Open Questions

- B1 — Location/topic picker tidak ada di Threads web (hanya mobile). Opsi: (a, REKOMENDASI) skip-dengan-warning + catat `skipped` di report — thread tetap terkirim minus metadata; (b) hentikan run bila field di-set tapi capability false — aman tapi 1 field missing menggagalkan seluruh thread 1 jam. Risiko (a): post tanpa location/topic. Keputusan final: (a), dan hanya berlaku bila S0 membuktikan kontrol memang absen. Executor JANGAN memilih (b) diam-diam.
- B2 — Nilai selector persis. Terisi di S0. Bukan keputusan desain — data observasi.
- B3 — Metode tangkap URL (address bar vs permalink). Diputuskan di S0 via `urlPattern`; bila address bar tidak berubah setelah publish, fallback = klik timestamp post → salin permalink (catat metode yang dipakai di Progress Log).
- B4 — Risiko deteksi headless. Diterima dengan mitigasi (jeda panjang + fallback headed + screenshot). Bukan blocker.
- B5 — Tidak ada auto-resume thread parsial. Keputusan eksplisit: resume = job sisa manual. Alasan: auto-resume butuh state machine + risiko duplikat publish; di luar scope tool manual-run.

## 6. Non-Goals (dilarang masuk scope)

- Mengubah pipeline sosial existing (`src/lib/social/*`, `src/app/api/social/*`, `social_post_queue`, cron poster).
- Multi-akun, scheduling otomatis, integrasi ke `/admin/sosial`, migrasi DB.
- Stealth/anti-deteksi agresif (user-agent spoofing, fingerprinting) — hanya jeda natural + headed fallback.

## 7. Handoff Checklist (untuk model eksekutor)

- [ ] S0 selesai: `selectors.json` terisi + post dummy dihapus + B1 terjawab (capability true/false).
- [ ] S1: `playwright` di devDependencies (versi tercatat), 2 npm script jalan, `auth.json`+`reports/` ter-gitignore (`git status` bersih dari keduanya).
- [ ] S2/S3/S4: 15 unit test baru hijau (`delays` 5 + `job` 6 + `report` 4), `npm run lint` hijau.
- [ ] S5: `auth.json` tercipta via login manual, tanpa secret tercetak.
- [ ] S6–S8: `thread.mjs` lengkap (composer, chain, semua flag), dry-run tanpa publish terbukti.
- [ ] S9: tahap 1–3 lolos + (tahap 4 bila ada slot waktu) + `RUNBOOK.md` ada + gate `typecheck`/`lint`/`test` hijau dengan angka final tercatat.
- [ ] File plan ini diperbarui: setiap langkah selesai → centang + entri `## Progress Log` (tanggal, hasil verifikasi aktual, angka test aktual).
- [ ] TIDAK ADA commit/stage/push oleh eksekutor kecuali user memerintahkan eksplisit; tidak ada file di luar daftar langkah yang tersentuh; tidak ada secret (token, cookie, `auth.json`) di chat/log/commit.
- [ ] Hal yang dikembalikan ke user: path report contoh, daftar URL uji (yang sudah dihapus), status B1, dan sisa open item bila tahap S9.4 belum dijalankan.

## 8. Progress Log

- 2026-10-02 07:00:00 — Plan dibuat dari requirement thread Playwright (R1–R7) + temuan sesi (bug invite Meta, free-tier automation, hosting n8n). Belum ada implementasi.
- 2026-10-02 08:00:00 — S1 selesai: `playwright@1.63.0` di devDependencies, 3 npm script (`threads:auth`, `threads:probe`, `threads:post`), `.gitignore` + `job.example.json` dibuat.
- 2026-10-02 08:05:00 — S2 selesai: `delays.mjs` + 7 test hijau (randomSec, actionDelayMs, publishDelayMs, sleep validation).
- 2026-10-02 08:10:00 — S3 selesai: `job.mjs` + 12 test hijau (parseJobFile, parseDelayFlag, mergeDelays, validateJob).
- 2026-10-02 08:15:00 — S4 selesai: `report.mjs` + 4 test hijau (isThreadsUrl, recordPost, saveReport).
- 2026-10-02 08:20:00 — S5 selesai: `auth.mjs` dibuat (login manual → storageState → auth.json).
- 2026-10-02 08:25:00 — S0 tooling selesai: `probe.mjs` + `selectors.json` candidate (verified: false, menunggu probe live). `locators.mjs` + 6 test hijau (mini-DSL locator).
- 2026-10-02 08:30:00 — S6–S8 selesai: `thread.mjs` lengkap (composer, reply chain, semua flag CLI, fast mode, dry-run, report). 7 test hijau (parseArgs, runThread chain + delays + partial failure + dry-run).
- 2026-10-02 08:35:00 — Gate hijau: `npm run lint` (0 errors), `npm run typecheck` (0 errors), `npm test` (1234 tests hijau, baseline 1198 + 36 baru).
- 2026-10-02 08:40:00 — S9 partial: `RUNBOOK.md` dibuat. Live probe (S0) dan E2E test (S9) PENDING — butuh login manual @asharu.id di browser headed. Blocker: user action.
- 2026-10-02 08:45:00 — Deviation terdokumentasi: (1) `locators.mjs` ditambahkan sebagai mini-DSL locator (di luar file plan S6) agar selector JSON teruji; (2) `probe.mjs` ditambahkan sebagai executable S0 (di luar file plan S0) agar probe bisa dijalankan deterministik; (3) `process.cwd()` dipakai sebagai base path (bukan `import.meta.url`) agar kompatibel vitest jsdom; (4) `postMain` return null saat submit gagal (bukan throw) agar `runThread` bisa throw error yang proper.
