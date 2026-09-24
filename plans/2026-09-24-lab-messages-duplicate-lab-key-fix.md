# Lab Messages Duplicate `lab` Key Fix (LabUi 15 failures)

Created: 2026-09-24 16:25:00

## Objective

Perbaiki 15 failures di `src/components/lab/LabUi.test.tsx` (baseline S0 merah pada plan threads) yang disebabkan DUPLIKAT top-level key `"lab"` di `src/messages/id.json` dan `src/messages/en.json`. Blok kedua (`"lab": {"try": {...}}`, dari commit Endpoint Try `991013a`) menimpa blok pertama (`form/result/history/stats/detail/...`) saat JSON di-parse — semua namespace `lab.*` kecuali `lab.try` hilang di runtime maupun test. Fix: gabungkan `try` ke dalam blok `lab` pertama, hapus blok duplikat, tambah guard test anti-duplikat.

## Scope

- `src/messages/id.json`: merge blok `try` ke blok `lab` pertama, hapus blok `lab` kedua.
- `src/messages/en.json`: sama persis.
- `src/lib/research/../messages.test.ts` → tepatnya `src/messages/messages.test.ts`: tambah guard test.
- TIDAK termasuk: komponen lab (`*.tsx`), `thread.ts`, `development.ts`, `runner.ts`, migrasi, `.env`, `.memory/`, plan threads (kecuali update Progress Log S6).

## Milestones

1. Inventarisasi key tercatat (S1).
2. `id.json` + `en.json` tergabung, masing-masing tepat 1 top-level `"lab"` (S2, S3).
3. Guard test hijau (S4).
4. `LabUi.test.tsx` 16/16 hijau + gate scoped hijau (S5).
5. Plan threads di-update (S6).

## Tasks

- [x] S1 inventarisasi key lab
- [x] S2 merge id.json
- [x] S3 merge en.json
- [x] S4 guard test duplikat + namespace
- [x] S5 verifikasi penuh scope
- [x] S6 update Progress Log plan threads

## Implementation Steps

### S1 — Inventarisasi key (read-only, wajib pertama)

- Tujuan: buktikan duplikat + catat isi kedua blok sebelum diubah.
- Finding: F-LAB1 (15 failures LabUi: `lab.history.*`/`lab.detail.*` mentah); hipotesis duplikat key.
- Dependency: tidak ada.
- File dibaca: `src/messages/id.json`, `src/messages/en.json` (via command, jangan edit).
- File diubah: tidak ada.
- Simbol/command (read-only, PowerShell-safe, tanpa `grep`/`tail`):
  - `python3 -c "import json; d=json.load(open('src/messages/id.json')); print(sorted(d['lab'].keys()))"` → ekspektasi SAAT INI: `['try']` (bukti blok pertama hilang saat parse).
  - Ulangi untuk `en.json` → ekspektasi sama.
- Behavior dipertahankan: n/a.
- Error/edge: bila hasil BUKAN `['try']` (mis. blok sudah tergabung), STOP dan lapor — plan ini tidak lagi relevan.
- Test: n/a.
- Completion criteria: kedua output `['try']` tercatat di Progress Log plan ini.
- Dilarang diubah: semua file repo.

### S2 — Merge `id.json` (satu-satunya edit struktur)

- Tujuan: tepat 1 top-level `"lab"` berisi SEMUA namespace: `title,intro,quota,form,result,history,stats,notice,tabCompare,tabTry,detail,try`.
- Finding: F-LAB1. Penyebab: baris 1057 `"lab"` (blok penuh, tutup baris 1189) + baris 1190 `"lab"` (hanya `try`, tutup baris 1240). JSON last-wins → blok 1057 hilang.
- Dependency: S1 (bukti tercatat).
- File dibaca: `src/messages/id.json:1057-1066` (awal blok 1), `:1176-1192` (sambungan detail→blok 2), `:1237-1241` (EOF).
- File diubah: `src/messages/id.json` SAJA pada langkah ini.
- Simbol: tidak ada (file data).
- Kondisi saat ini: baris 1188 `    }` (tutup `detail`), 1189 `  },` (tutup lab-1), 1190 `  "lab": {`, 1191 `    "try": {` … 1239 `    }` (tutup try), 1240 `  }` (tutup lab-2), 1241 `}` (EOF).
- Perubahan konkret (urutan edit, 4 edit kecil):
  1. Baris 1188: `    }` → `    },` (detail kini diikuti `try`).
  2. Sisip SETELAH baris 1188 (hasil edit 1): seluruh blok `    "try": {` … `    }` disalin VERBATIM dari baris 1191–1239 (isi tidak diubah satu karakter pun).
  3. Hapus baris 1190 (`  "lab": {`) beserta baris 1191–1240 ASLI (blok duplikat + penutupnya). Perhatian: yang dihapus adalah blok KEDUA; salinan di langkah 2 yang dipertahankan.
  4. Baris 1189 (`  },`) → `  }` (blok `lab` kini terakhir sebelum EOF `}`; tanpa koma).
- Behavior dipertahankan: SEMUA string nilai tidak berubah; urutan key dalam blok: `..., "tabTry", "detail", "try"` (try paling akhir — urutan tidak berpengaruh ke JSON).
- Error/edge: setelah edit, file HARUS valid JSON (`JSON.parse` sukses); `lab` muncul tepat 1x sebagai top-level key (cek S5). Bila ragu di tengah jalan: `git diff src/messages/id.json` dan `git checkout -- src/messages/id.json` untuk ulang dari nol (aman, belum commit apa-apa).
- Test: belum (S4/S5).
- Command verifikasi (read-only): `python3 -c "import json; d=json.load(open('src/messages/id.json')); print(sorted(d['lab'].keys()))"` → ekspektasi: `['detail', 'form', 'history', 'intro', 'notice', 'quota', 'result', 'stats', 'tabCompare', 'tabTry', 'title', 'try']` (12 keys, urutan alfabetis di output `sorted`).
- Completion criteria: command di atas mencetak 12 keys termasuk `try` + semua lama; file valid JSON.
- Dilarang diubah: nilai string apa pun; `en.json` (S3); file lain.

### S3 — Merge `en.json` (cermin S2)

- Tujuan: struktur identik dengan `id.json` pasca-S2 (parity diuji `messages.test.ts`).
- Finding: F-LAB1 (en.json duplikat identik: baris 1057/1190, EOF 1241).
- Dependency: S2 selesai (pola edit terbukti).
- File dibaca: `src/messages/en.json:1176-1192`, `:1237-1241` (verifikasi cermin id.json sebelum edit; ABORT langkah ini bila nomor baris/isi beda — lapor).
- File diubah: `src/messages/en.json` SAJA.
- Perubahan konkret: 4 edit IDENTIK dengan S2 (1188 `}`→`},`; sisip salinan verbatim `try` 1191–1239; hapus blok kedua 1190–1240; 1189 `},`→`}`).
- Behavior: nilai EN tidak berubah.
- Error/edge: sama S2.
- Command verifikasi: `python3 -c "import json; d=json.load(open('src/messages/en.json')); print(sorted(d['lab'].keys()))"` → ekspektasi 12 keys SAMA PERSIS dengan S2.
- Completion criteria: key sets `lab` id dan en identik (12 keys); file valid JSON.
- Dilarang diubah: nilai string; `id.json` (sudah selesai); file lain.

### S4 — Guard test di `messages.test.ts`

- Tujuan: (a) duplikat top-level key tidak terulang; (b) namespace yang dipakai komponen lab dijamin ada di kedua locale.
- Finding: F-LAB2 (test parity lolos padahal data rusak — `JSON.parse` menyembunyikan duplikat; kedua file rusak identik).
- Dependency: S2+S3 (test ditulis terhadap struktur benar).
- File dibaca: `src/messages/messages.test.ts:1-61` (helper `load`, `flatten`, 3 test eksisting).
- File diubah: `src/messages/messages.test.ts` (tambah 2 test; JANGAN ubah 3 test eksisting).
- Simbol: `load`, `flatten` (pakai ulang); baru: inline regex scan + daftar namespace.
- Kondisi saat ini: 3 test (parity, no-empty, homepage meta). Tidak ada deteksi duplikat.
- Perubahan konkret (tambah di dalam `describe('message catalogs')`, setelah test parity):
  1. Test `top-level keys are unique (no duplicate blocks)`: untuk tiap locale `['id','en']`, baca RAW text (`readFileSync`), cocokkan SEMUA baris `^  "([^"]+)":` (regex multiline: `/^  "([^"]+)":/gm`), kumpulkan; assert tidak ada duplikat (`new Set(keys).size === keys.length`). Komentar: `// 2026-09-24: duplikat "lab" (Endpoint Try) menghapus lab.* saat parse`.
  2. Test `lab namespaces used by components exist`: daftar paths WAJIB: `lab.title`, `lab.form.promptLabel`, `lab.form.submit`, `lab.result.heading`, `lab.history.heading`, `lab.history.pageOf`, `lab.history.prev`, `lab.history.next`, `lab.history.reuse`, `lab.history.openDetail`, `lab.history.delete`, `lab.stats.heading`, `lab.notice.running`, `lab.detail.heading`, `lab.detail.downloadCard`, `lab.detail.shareCard`, `lab.try.title`, `lab.try.sendButton`. Untuk tiap locale + tiap path: resolve via `flatten`-style reduce (contoh ada di test no-empty) dan assert string non-kosong. Daftar ini diturunkan dari `useTranslations('...')` di `LabHistory.tsx:57`, `LabCardActions.tsx:17`, `LabStats.tsx:93`, `LabRankTables.tsx:18,61`, `LabForm.tsx:32-34`, `LabCompareGrid.tsx:59-60`, `LabPageClient.tsx:26`, `EndpointTryClient.tsx:26` + key yang diassert `LabUi.test.tsx`.
- Behavior dipertahankan: 3 test lama tidak disentuh.
- Error/edge: regex hanya menangkap top-level (indent tepat 2 spasi) — file memakai 2-spasi konsisten; catat asumsi di komentar test.
- Input/expected: (1) file pasca-S2/S3 → 0 duplikat → pass; simulasi negatif tidak perlu file rusak (cukup 1 test positif + komentar). (2) semua 18 paths × 2 locale non-empty → pass.
- Command verifikasi: `npx vitest run src/messages/messages.test.ts` → exit 0.
- Completion criteria: 5 tests pass (3 lama + 2 baru).
- Dilarang diubah: 3 test eksisting; komponen; file messages (sudah selesai S2/S3).

### S5 — Verifikasi penuh scope

- Tujuan: buktikan LabUi hijau tanpa regresi di pesan lain.
- Dependency: S2+S3+S4.
- File dibaca: tidak ada (jalankan command).
- File diubah: tidak ada.
- Command (urutan): `npx vitest run src/messages/messages.test.ts` → `npx vitest run src/components/lab/LabUi.test.tsx` → `npm run typecheck` → `npm run lint`.
- Hasil diharapkan: messages 5/5; LabUi 16/16 (sebelumnya 1/16 — ekspektasi SEMUA 16 hijau karena `lab.*` kembali lengkap); typecheck exit 0; lint 0 errors (12 warnings pre-existing S0, jumlah TIDAK bertambah).
- Error/edge: bila LabUi masih ada failures di luar pola i18n mentah → catat nama test + diff di Progress Log, STOP, lapor (jangan melebar ke komponen).
- Completion criteria: 4 command hijau dengan angka tercatat.
- Dilarang: `npm test` penuh BUKAN gate langkah ini (tetap merah ekspektasi? TIDAK — setelah fix ini full suite mestinya hijau kecuali sisa pre-existing lain; full suite dijalankan di S8 plan threads. Di sini cukup 4 command scope.)

### S6 — Update plan threads

- Tujuan: buka blokir S0 plan threads (`plans/2026-09-24-threads-emoji-repair-overwrite-fix.md`).
- Dependency: S5 hijau.
- File dibaca: Progress Log plan threads (1 entri STOP).
- File diubah: plan threads SAJA (Tasks + Progress Log).
- Perubahan: tambah entri Progress Log: tanggal, `LabUi 15 failures` teratasi oleh plan ini (file plan ini sebagai referensi), S0 plan threads dinyatakan `baseline-scoped-hijau` (typecheck/lint/development.test hijau + LabUi kini hijau), S1–S6 boleh lanjut; S8 tetap wajib `npm test` penuh.
- Completion criteria: entri tercatat; tidak ada perubahan lain di file itu.
- Dilarang: implementasi S1–S6 threads di langkah ini.

## Traceability

| Finding | Bukti | Langkah | Verifikasi |
|---|---|---|---|
| F-LAB1 `lab.*` hilang (15 failures) | `lab` parse = `['try']`; 2× top-level `"lab"` (1057/1190) id+en; raw keys di DOM | S2, S3 | python key-list 12 keys; LabUi 16/16 |
| F-LAB2 parity test buta-duplikat | `messages.test.ts` lolos dgn data rusak | S4 | 2 test baru hijau |

## Risks

- Salah hapus blok (blok 1057 vs 1190 tertukar) → mitigasi: verifikasi key-list S2/S3 + `git diff` review; rollback `git checkout --` sebelum commit.
- `en`/`id` tidak parity setelah merge → mitigasi: S3 cermin S2 + test parity eksisting tetap jalan di S5 implisit (tidak wajib, tapi `npx vitest run src/messages/messages.test.ts` mencakupnya).
- Indentasi file tidak konsisten di masa depan (regex S4 rapuh) → mitigasi: komentar asumsi di test; test namespace (2) tetap menangkap dampaknya.
- Scope creep ke komponen lab → dilarang eksplisit per langkah.

## Progress Log

- 2026-09-24 16:25:00 — Plan dibuat. Bukti: parsed `lab` id+en = `['try']`; top-level `"lab"` 3 match (53 nested-meta + 1057 + 1190 duplikat) di kedua file; komponen pakai `lab/history/detail/stats/form/result/notice/try` (grep 13 match). Belum ada implementasi.
- 2026-09-24 16:32:00 — S1 selesai: `id.json` + `en.json` parsed `lab` = `['try']` ×2 (bukti duplikat, blok pertama hilang saat parse). Tanpa edit file.
- 2026-09-24 16:33:00 — S2 selesai: `id.json` merge (skrip verbatim, EOF tanpa trailing newline dipertahankan). Diff `1+/3-`. Key-list: 12 keys (`detail,form,history,intro,notice,quota,result,stats,tabCompare,tabTry,title,try`).
- 2026-09-24 16:34:00 — S3 selesai: `en.json` merge cermin S2 (assert layout lolos). Diff `1+/3-`. Key sets id/en identik.
- 2026-09-24 16:44:00 — S4 selesai: 2 guard test ditambahkan di `messages.test.ts` (murni aditif +49, 3 test lama utuh). Koreksi pasca-review: argumen `expect` (label sebagai argumen ke-2) + assertion `not.toBe('')` diganti `toBe(true)` atas `value.length > 0` — `typeof v==='string' && v` menghasilkan `false` (bukan `''`) untuk key hilang sehingga lolos `not.toBe` (false negative). Simulasi negatif: hapus `lab.try.sendButton` dari `id.json` → guard baru FAIL (`id:lab.try.sendButton: expected false to be true`) + parity ikut FAIL; restore → 5/5 hijau. Bukti guard benar-benar menangkap regresi.
- 2026-09-24 16:45:00 — S5 selesai: `messages.test.ts` 5/5 ✓; `LabUi.test.tsx` 16/16 ✓ (sebelumnya 1/16); `npm run typecheck` exit 0 ✓; `npm run lint` 0 errors, 12 warnings pre-existing ✓ (tidak bertambah). Digabung: 21/21 ✓.
- 2026-09-24 16:40:00 — S6 selesai: entri unblock ditambahkan ke Progress Log `plans/2026-09-24-threads-emoji-repair-overwrite-fix.md`; S0 plan threads = `baseline-scoped-hijau`.

## Notes

- Handoff checklist: [x] S1 output `['try']`×2 tercatat; [x] S2 key-list 12 keys; [x] S3 key-list identik; [x] S4 5/5 hijau; [x] S5 LabUi 16/16 + typecheck + lint (warnings tetap 12); [x] S6 plan threads di-update.
- Selesai 2026-09-24 ~16:45. Semua 6 tasks checked. Tidak di-commit/push per larangan plan (menunggu instruksi user). File siap commit: `src/messages/id.json` (1+/3-), `src/messages/en.json` (1+/3-), `src/messages/messages.test.ts` (+49 aditif).
- Catatan kerja di luar plan: `plans/2026-09-24-threads-emoji-repair-overwrite-fix.md` hanya +1 entri Progress Log (S6); `plans/2026-09-23-scrape-validate-gates-fix.md` berisi entri Progress Log S0–S3 dari sesi/paralel lain — BUKAN dari plan ini, jangan di-commit sebagai bagian fix ini tanpa verifikasi pemilik.
- Blocker: tidak ada. Setelah S5 hijau, S0 plan threads resmi unblocked.
- Dilarang pelaksana: edit `*.tsx` lab; edit plan threads selain S6; commit/push (lapor hash + file bila diminta user).
