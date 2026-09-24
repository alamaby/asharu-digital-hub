# Isolasi Workflow Scrape dan Guardrails CI/i18n

Created: 2026-09-24 22:16:36

## Objective

Mencegah perubahan source code yang tidak berkaitan dengan scraping—terutama regresi i18n—agar tidak lagi membuat workflow `Scrape affiliate products` berstatus merah. Solusi akan memisahkan quality gate aplikasi dari quality gate scraper, menambahkan validasi message catalog yang mendeteksi duplicate key, serta melindungi branch `main` dengan CI wajib.

## Current Baseline

- Workflow scrape terakhir yang gagal: GitHub Actions run `35974520812`, commit `991013a`, 24 Sep 2026 08:19 UTC.
- Step scrape, asset check, DB self-consistency check, dan cache revalidation pada run tersebut berhasil; kegagalan terjadi pada `Validate gates` (`npm run typecheck` + seluruh `npm test`).
- Penyebab kegagalan terbaru: key top-level `lab` duplikat di `src/messages/id.json` dan `src/messages/en.json`; 15 test `src/components/lab/LabUi.test.tsx` gagal karena namespace `lab.form`, `lab.history`, `lab.stats`, dan `lab.detail` hilang saat JSON di-parse.
- `80958c8` sudah memperbaiki duplicate block tersebut dan menambahkan guard message catalog, tetapi belum ada workflow run setelah fix tersebut.
- `gh workflow list --all` hanya menampilkan `Scrape affiliate products`; belum ada workflow CI terpisah untuk pull request.
- `gh api repos/alamaby/asharu-digital-hub/branches/main/protection` mengembalikan `Branch not protected`.
- `gh api repos/alamaby/asharu-digital-hub/rulesets` mengembalikan array kosong.
- `package.json` belum memiliki script `validate:messages` atau `test:scrape`.
- `src/messages/messages.test.ts` sudah menguji parity dan top-level duplicate key, tetapi duplicate-key check masih bergantung pada regex/format indentasi dan tidak mendeteksi duplicate key di nested object.
- Verifikasi lokal setelah fix i18n: 3 test files / 44 tests related (`messages`, `LabUi`, `automation runner`) lulus.

## Scope

### In scope

- Pemisahan full repository CI dari workflow scraping.
- Workflow CI untuk `pull_request` dan `push` ke `main`.
- Script validasi message catalog yang mendeteksi duplicate key di semua level.
- Test dan script `test:scrape` yang relevan dengan scraper.
- Penghapusan full `npm run typecheck` + `npm test` dari workflow scrape.
- Pembatasan `workflow_dispatch` ke `main` dan pengurangan permission GitHub yang tidak diperlukan.
- Branch protection/ruleset `main` sebagai kontrol proses.
- Dokumentasi operating procedure dan verifikasi rollout.

### Out of scope

- Mengubah logika bisnis scraper, category mapping, mass-deactivation guard, atau kontrak tabel Supabase.
- Mengubah data production `affiliate_products`.
- Menjalankan migrasi atau SQL yang mengubah database.
- Menolak kegagalan scraper, Storage, atau DB dengan `continue-on-error`.
- Mengubah schedule harian dari `0 3 * * *`.
- Mengaktifkan atau memperbaiki provider/LLM/image di luar scope.
- Menjalankan manual production scrape tanpa persetujuan eksplisit user.

## Milestones

1. Baseline dan kontrak gate scraper disepakati.
2. Message catalog validator dan local check selesai.
3. Scraper-specific test suite selesai.
4. Workflow scrape dipisahkan dari full application test suite.
5. Workflow CI aplikasi dan branch protection aktif.
6. Verifikasi end-to-end dan rollout production run dilakukan setelah approval.

## Tasks

- [x] S0: Dokumentasikan baseline failure run `35974520812` dan status repository saat ini.
- [x] S1: Tambahkan parser/validator duplicate key yang mendeteksi semua level object.
- [x] S2: Tambahkan `npm run validate:messages` dan fixture test untuk top-level serta nested duplicate key.
- [x] S3: Tambahkan test scraper-specific untuk data transform, Storage semantics, dan entrypoint syntax.
- [x] S4: Tambahkan `npm run test:scrape` dengan konfigurasi/daftar test yang eksplisit dan mudah diaudit.
- [x] S5: Ganti `Validate gates` penuh pada `scrape-affiliate.yml` dengan scraper-specific gate.
- [x] S6: Batasi production workflow ke `main`, ubah permission menjadi `contents: read`, dan pastikan tidak ada langkah push tersembunyi.
- [x] S7: Tambahkan `.github/workflows/ci.yml` untuk `pull_request` dan `push` ke `main`.
- [x] S8: Aktifkan branch protection/ruleset `main` yang mewajibkan status check quality CI.
- [x] S9: Jalankan seluruh local gates dan validasi YAML/workflow.
- [ ] S10: Trigger satu manual scrape run pada `main` setelah semua gate hijau dan konfirmasi user.
- [x] S11: Update memory/progress dan catat hasil verifikasi.

## Detailed Implementation Design

### 1. Message catalog validation

#### Current problem

`JSON.parse` menerima duplicate property name, tetapi behavior duplikasi key tidak aman: object hasil parse dapat hanya menyimpan property terakhir. Validator harus memeriksa struktur raw JSON sebelum object tersebut dipakai aplikasi.

#### Proposed design

- Tambahkan dependency parser tree-based, misalnya `jsonc-parser`, ke `devDependencies`.
- Buat `scripts/validate-messages.mjs` yang:
  1. membaca `src/messages/id.json` dan `src/messages/en.json`;
  2. mem-parse JSON ke AST tanpa membuang duplicate nodes;
  3. menelusuri setiap object dan mencatat `file:line`, key, dan path ketika key yang sama muncul dua kali;
  4. membandingkan flattened key set `id` dan `en`;
  5. memastikan required `lab.*` namespaces tersedia;
  6. menolak translation kosong;
  7. keluar dengan status non-zero dan pesan yang menunjuk file/key pertama.
- Tambahkan `validate:messages` ke `package.json`.
- Refactor `src/messages/messages.test.ts` agar semantic assertions tetap tersedia, tetapi duplicate-key assertion menggunakan shared validator atau parser tree yang sama.
- Tambahkan fixture sementara dengan duplicate key top-level dan nested object; fixture harus berada di test/temporary directory dan tidak boleh masuk ke message catalog production.
- Format output error yang stabil, misalnya:

```text
::error file=src/messages/id.json path=lab key=duplicate top-level/nested
```

- Tambahkan opsi internal untuk lint fixture/test, tetapi default command hanya memeriksa catalog production.

#### Acceptance criteria

- Duplikasi `lab` yang pernah terjadi pada `991013a` gagal sebelum build/test aplikasi.
- Duplicate nested key juga gagal.
- Pesan error menyebut file dan path, bukan hanya `JSON.parse failed`.
- `id` dan `en` tetap wajib memiliki key set yang sama.

### 2. Scraper-specific quality gate

#### Boundary

Workflow scrape tidak lagi menjadi owner seluruh regression suite aplikasi. Ia hanya wajib memeriksa kontrak yang paling jelas terkait scraper:

- entrypoint scraper dapat di-parse;
- transform item linktree menjadi `AffiliateProduct` valid;
- fallback image lama hanya dipakai untuk existing product;
- `storage.exists()` dengan `{ data: false, error }` diperlakukan sebagai object belum ada, bukan kegagalan total;
- upload error untuk produk baru tetap menggagalkan run;
- affiliate/product selection logic yang dipakai scraper/automation tetap lulus.

#### Proposed test surface

Tambahkan konfigurasi `vitest.scrape.config.ts` atau daftar test eksplisit yang setara untuk:

- `src/lib/research/affiliate.test.ts` (test existing affiliate selection);
- test baru `scripts/lib/data-writer.test.mjs` untuk whitespace normalization, category mapping, URL/image, dan `featured`;
- test baru `scripts/lib/storage-uploader.test.mjs` untuk `exists` hit/miss, skip upload, upload error, dan public URL failure;
- test entrypoint/syntax untuk `scripts/scrape-affiliate.mjs` serta file `scripts/lib/*.mjs` yang diimpor.

Tambahkan script:

```json
"test:scrape": "vitest run --config vitest.scrape.config.ts"
```

Jika test entrypoint tidak dapat dimasukkan ke Vitest secara langsung, jalankan `node --check scripts/scrape-affiliate.mjs` sebagai step eksplisit di workflow dan masukkan command tersebut ke output gate.

#### Acceptance criteria

- `npm run test:scrape` tidak menjalankan 1.100+ test aplikasi.
- Test failure pada modul scraper/Storage tetap membuat workflow merah.
- Test failure pada `LabUi` tidak lagi menjadi syarat scrape.
- Tidak ada secret atau akses production pada test PR.

### 3. Scrape workflow changes

Ubah `.github/workflows/scrape-affiliate.yml` secara sengaja dan terbatas:

- Ganti step `Validate gates` yang saat ini menjalankan `npm run typecheck` dan `npm test` dengan `npm run test:scrape` serta syntax check scraper.
- Pertahankan `Scrape affiliate products`, asset check, DB sync check, dan mass-deactivation guard sebagai hard failures.
- Pertahankan `continue-on-error: true` hanya untuk cache revalidation dan error digest karena keduanya memang best-effort.
- Tambahkan guard `if: github.ref == 'refs/heads/main'` untuk job production.
- Ubah `permissions.contents` dari `write` menjadi `read` karena workflow sudah tidak melakukan commit/push.
- Jangan menambahkan `continue-on-error` pada test gate.
- Pastikan tidak ada step `git commit`/`git push` atau penggunaan `GITHUB_TOKEN` untuk menulis repository.

### 4. Application quality CI

Buat `.github/workflows/ci.yml` dengan nama job yang stabil, misalnya `Quality CI / quality`.

Trigger:

- `pull_request` ke `main`;
- `push` ke `main`;
- `workflow_dispatch` hanya untuk kebutuhan operasional terbatas.

Job quality minimal:

1. checkout;
2. setup Node 22 + npm cache;
3. `npm ci`;
4. `npm run validate:messages`;
5. `npm run typecheck`;
6. `npm run lint`;
7. `npm test`.

Tambahkan `npm run build` sebagai job terpisah atau step final hanya setelah dipastikan build tidak memerlukan production secret. Jika build tidak dapat berjalan aman pada fork PR, jadikan build wajib pada `push main` dan tetap wajibkan test/typecheck/lint pada PR. Job name harus tidak berubah tanpa memperbarui branch protection.

Tambahkan concurrency cancel-in-progress untuk run PR yang sama supaya commit baru tidak menunggu queue lama.

### 5. Protect `main`

Ini adalah konfigurasi GitHub, bukan perubahan database:

- mewajibkan Pull Request sebelum merge;
- mewajibkan status check `Quality CI / quality` (dan build bila dijadikan required);
- mewajibkan branch up-to-date;
- melarang direct push atau membatasi direct push untuk emergency;
- opsional mewajibkan review approval.

Aktifkan setelah CI workflow publish dan check name stabil. Verifikasi dengan `gh api .../branches/main/protection` dan/atau `gh api .../rulesets`.

Jika proteksi branch belum dapat diaktifkan karena permission repository, tandai sebagai blocker dan jangan memutus deadlock dengan mematikan seluruh test. Gunakan code owner/admin untuk menyelesaikan setting GitHub.

### 6. Rollout sequence

Urutan rollout yang dipilih:

1. Merge validator message + test guard ke branch/feature.
2. Merge CI workflow dan pastikan workflow muncul di `gh workflow list --all`.
3. Aktifkan required check pada `main`.
4. Merge perubahan pemisahan scrape workflow setelah CI required check aktif.
5. Pastikan tidak ada scheduled run selama transisi yang memakai revision lama.
6. Minta persetujuan user sebelum manual production scrape karena command itu menulis DB/Storage.
7. Trigger manual run pada `main` dan verifikasi sampai selesai.

## Verification

### Local gates

Jalankan dari root repo:

```powershell
npm ci
npm run validate:messages
npm run test:scrape
npm run typecheck
npm run lint
npm test
npm run build
```

Nilai yang diharapkan:

- semua command exit `0` jika tidak ada perubahan yang belum selesai;
- `npm run validate:messages` lulus pada catalog saat ini;
- `npm run test:scrape` hanya menjalankan test scraper/affiliate;
- full `npm test` tetap menjadi syarat CI aplikasi, bukan syarat scraping;
- `git status --short` tidak menampilkan file generated yang tidak disengaja.

### Workflow validation

Sebelum merge:

- parse/syntax-check kedua YAML workflow;
- `gh workflow list --all` menampilkan `Quality CI` dan `Scrape affiliate products`;
- `gh workflow view` tidak menunjukkan secret yang tidak disamarkan;
- `gh run list --workflow scrape-affiliate.yml` tidak lagi menampilkan `Validate gates` sebagai full test suite setelah rollout.

### Failure-isolation verification

Dengan fixture/test yang disengaja:

- test aplikasi yang gagal tidak boleh muncul sebagai failure scraper;
- duplicate key message harus gagal di CI quality dan `validate:messages`;
- failure pada data transform/Storage scraper harus tetap membuat `Scrape affiliate products` gagal;
- `workflow_dispatch` dari feature branch harus ditolak atau tidak menjalankan job production.

### Post-fix production run

Hanya setelah user mengizinkan:

```powershell
gh workflow run scrape-affiliate.yml --ref main
gh run list --workflow scrape-affiliate.yml --limit 5
gh run view <run-id> --log-failed
```

Acceptance criteria run:

- `npm ci` berhasil;
- scraper/DB/asset checks berhasil;
- `test:scrape` berhasil;
- tidak ada failure akibat full `LabUi` suite;
- cache revalidation tetap boleh best-effort;
- run selesai dengan conclusion `success`.

## Rollout and Rollback

### Rollback

- Rollback workflow/script changes dengan revert commit; jangan mengubah data production untuk menutupi failure CI.
- Jika `test:scrape` terlalu sempit, perluas test surface terlebih dahulu; jangan menghapus test atau memakai `continue-on-error`.
- Jika `jsonc-parser` dependency bermasalah, ganti dengan parser duplicate-key yang maintained, bukan kembali ke regex yang rapuh.
- Jika branch protection mencegah merge penting, admin dapat melakukan exception sementara dengan mencatat alasannya, lalu memulihkan required check setelah merge.
- Jangan revert schema atau data `affiliate_products` karena kegagalan ini terbukti berasal dari pipeline/gate, bukan corrupted data.

### Observability

- Bedakan failure `scrape`, `asset`, `db`, `test:scrape`, dan `ci quality` dalam nama step/message.
- Error digest tetap hanya melaporkan failure scrape; error CI reporting ditangani oleh GitHub checks.
- Setiap run harus menampilkan jumlah produk, jumlah upsert, asset check result, dan DB consistency result tanpa mencetak secret.

## Risks

- **Dependency/lockfile churn:** menambah parser dapat mengubah `package-lock.json`; gate `npm ci` harus tetap reproducible.
- **Test scope terlalu sempit:** scraper dapat bergantung pada helper yang belum masuk `test:scrape`; dependency map harus diperbarui setiap kali import scraper berubah.
- **CI duration:** full typecheck/lint/test/build menambah waktu PR; gunakan concurrency cancel-in-progress dan pisahkan build bila perlu.
- **False green risk:** menghapus full test dari scrape dapat membuat bug aplikasi tidak terlihat di run scrape; branch protection + CI wajib menjadi kontrol utama.
- **Branch protection dependency:** check name atau job name yang berubah dapat memblokir merge; stabilkan nama dan update ruleset bersamaan.
- **Production write:** manual run scraper mengubah DB/Storage; require explicit user approval dan jangan menjalankannya otomatis dari PR.
- **External failure tetap mungkin:** network Shopee, Supabase, Storage, atau rate limit dapat membuat scrape gagal; target utama bukan menghilangkan failure eksternal, tetapi memastikan failure tersebut terisolasi dan jelas.

## Progress Log

- 2026-09-24 22:16:36 — Baseline selesai: run `35974520812` gagal pada full test gate akibat duplikasi key `lab`; scrape/DB/asset steps hijau. Main saat ini sudah memiliki `80958c8`, tetapi belum ada post-fix workflow run; `main` belum protected dan belum ada ruleset. Plan implementasi dibuat; belum ada kode atau workflow yang diubah oleh plan ini.
- 2026-09-24 22:41:11 — Implementasi lokal S1-S7 selesai: `jsonc-parser` + validator duplicate-key, `validate:messages`, fixture tests, scraper syntax/test gate, `vitest.scrape.config.ts`, full CI workflow, dan scrape workflow isolation. `npm run validate:messages`, `npm run check:scraper`, `npm run test:scrape`, `npm test`, `npm run typecheck`, `npm run lint`, dan `npm run build` semuanya hijau (lint/build hanya warning pre-existing). S8 branch protection, S9 final remote workflow validation, dan S10 production run masih pending.
- 2026-09-24 22:46:38 — S8-S11 selesai: commit `1fb448a` dipush, Quality CI run `36022241163` success, kedua workflow terdaftar, YAML kedua workflow tervalidasi, dan `main` sekarang mewajibkan check `Quality` dengan strict up-to-date branch, admin enforcement, serta melarang force-push/delete. S10 tetap pending karena manual scrape production menulis DB/Storage dan memerlukan persetujuan eksplisit user.

## Notes

- Failure terbaru bukan data scrape failure: 256 active, 6 featured, 0 broken images, asset Storage check OK, revalidation HTTP 200.
- `src/messages/messages.test.ts:33-41` adalah guard pertama yang berhasil ditambahkan pada `80958c8`, tetapi regex top-level-based masih perlu diganti oleh validator AST.
- Plan ini tidak mengusulkan migrasi atau SQL terhadap production.
- Satu-line Conventional Commit proposal setelah implementasi: `ci: isolate scrape workflow from application quality gates`
- Related existing plan: `plans/2026-09-23-scrape-validate-gates-fix.md`.
