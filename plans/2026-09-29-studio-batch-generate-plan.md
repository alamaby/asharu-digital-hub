# Studio Batch Generate Image — Implementation Plan

Created: 2026-09-29 08:00:00

## Objective

Tambah 1 menu sidebar baru di Studio, `/studio/batch`, untuk batch generate image: user paste textarea atau upload file teks (`.txt`/`.md`), prompt dipisah double-newline, satu batch di-enqueue sekaligus dengan setting shared, worker existing memproses satu-per-satu FIFO tanpa perubahan, progress per-batch ter-polling, user bisa retry-gagal-sebatch, hapus-sebatch, dan unduh semua hasil `ready` sekaligus sebagai `.zip` (client-side via `jszip`).

Keputusan user yang mengunci desain (tidak boleh diubah diam-diam):
1. Cap batch = 50, configurable via tabel (`image_studio_config.max_batch_prompts`, default 50).
2. Setting shared untuk V1; override per-prompt masuk TODO eksplisit (tidak diimplementasikan).
3. Rute sidebar baru `/studio/batch` (bukan tab di `/studio`).

## Scope

- IN: migrasi DB (submodule `supabase/`), knob config, tipe, parser batch, 4 server action batch, nav/routing/sidebar, i18n id/en, halaman + 2 komponen batch, ZIP client-side, test + gate.
- OUT (dilarang): ubah `src/lib/studio/worker.ts` (klaim/proses/upload), ubah `MAX_PER_TICK=5` di `src/app/api/studio/process/route.ts`, ubah logika single `/studio` (`StudioForm`, `StudioHistory`, `enqueueStudioImage`), ubah cron/pg_cron/Vault/key-pool/provider, override per-prompt, img2img di batch V1, zip server-side.

## Milestones

1. M1 — Fondasi data: migrasi + knob + tipe (S0–S1).
2. M2 — Logika server: parser + action batch (S2–S3).
3. M3 — Navigasi + bahasa: sidebar/route/i18n (S4–S5).
4. M4 — UI batch + unduh zip (S6–S7).
5. M5 — Gate hijau + handoff (S8–S9).

## Tasks

- [x] S0 — Migrasi DB batch (submodule dulu)
- [x] S1 — Tipe + knob `max_batch_prompts`
- [x] S2 — Parser + validasi batch
- [x] S3 — Server action batch (enqueue/list/retry/delete)
- [x] S4 — Nav + routing + sidebar-active fix
- [x] S5 — Katalog i18n id/en
- [x] S6 — Halaman + form + histori batch
- [x] S7 — Unduh semua sebagai ZIP (client-side)
- [x] S8 — Update/extend test yang terdampak
- [ ] S9 — Gate penuh + verifikasi manual + handoff

## Risks

- R1 — `daily_limit` default 20 vs batch 50: batch 50 selalu ditolak sampai admin naikkan limit (atau set null). Bukan bug; tulis eksplisit di UI + plan. Opsi dibahas di Open Questions.
- R2 — Throughput: `MAX_PER_TICK=5`/5 mnt → batch 50 ≈ ±50 mnt. Tanpa perubahan worker; ekspektasi ditulis di UI.
- R3 — Sidebar prefix-match (`isNavActive`): `/studio` ikut aktif di `/studio/batch` bila tidak di-`exact`-kan. Ditangani S4.
- R4 — i18n parity (`messages.test.ts` + `validate-messages.mjs`): key id/en harus identik; satu key hilang = test merah.
- R5 — ZIP 50 gambar di RAM browser mobile bisa puluhan MB. Mitigasi: unduh bertahap + saran desktop + lewati file gagal.
- R6 — Submodule `supabase/`: migrasi harus commit+push di submodule DULU, baru parent pointer. Urutan terbalik = CI/prod tidak lihat migrasi.
- R7 — Secret: JANGAN pernah commit/print `sb_secret_*`, `SUPABASE_*`, `CRON_SECRET`, isi `.env*`. Test pakai mock client (pola `actions.test.ts`), bukan kredensial asli.

## Progress Log

- 2026-09-29 08:00:00 — Plan dibuat dari analisis + 3 keputusan user; belum ada implementasi.
- 2026-09-29 11:22:00 — S0–S7 selesai, S8 selesai setelah 2 kali perbaikan gate: (a) build failed karena `export function clampMaxBatch` di modul `'use server'` → menjadi non-export lokal; (b) batch action tests pakai `vi.hoisted` di dalam describe menghasilkan konflik `Identifier 'clientRef2' has already been declared` → dirapikan pakai `clientRef.current` top-level + tambah `beforeEach` ke import vitest + koreksi assertion test cap (cap=1, bukan cap=3 yang < jumlah prompt). Gate final: typecheck green, lint 0 error (warning lama saja), test 1194/119 file hijau, build sukses.
- 2026-09-29 11:43:00 — Migrasi `20260929000001_studio_batch` applied prod via MCP (`studio_batch`, `20260929044323`); verifikasi tabel/kolom/index/policy hijau.
- 2026-09-29 17:00:00 — Follow-up opsi A (UX preview batch): `BatchForm` tampilkan "{count} blok dari {lines} baris", daftar tolak sebut nomor blok 1-based + panjang karakter (`rejectedItem`), hint `splitHint`, notice submit ikut format sama (perbaiki hardcoded ID + index 0-based). Helper murni `countBatchLines` + 4 test. Gate: typecheck ✓ lint 0 error ✓ 1198 tests ✓ messages ✓ build ✓.
- 2026-09-29 17:15:00 — Opsi C: daftar rincian blok ditolak di `BatchForm` — tiap blok tampil full text dengan karakter > `max_prompt_length` (ikut config, bukan hardcode) ditandai merah (`bg-red-100/dark:red-900/30`, konvensi `BatchHistory`). Key baru `overflowHeading` id/en. Gate: typecheck ✓ lint 0 error ✓ 1198 tests ✓ messages ✓ build ✓.

---

# Langkah implementasi (atomik, deterministik)

Konvensi: setiap langkah mencantumkan Tujuan, Finding/Requirement, Dependency, File dibaca, File diubah, Simbol terkait, Kondisi saat ini, Perubahan konkret + urutan, Behavior dipertahankan, Error/edge, Test, Verifikasi, Completion, Larangan.

---

## S0 — Migrasi DB batch (submodule `supabase/` DULU)

- Tujuan: sediakan `studio_batches`, `batch_id` anak, dan knob `max_batch_prompts` secara non-destructive.
- Finding/Requirement: F-batch-grouping (progres per batch butuh FK, bukan `LIKE` di `llm_meta`), F-cap-50-configurable (knob di tabel, bukan konstanta kode).
- Dependency: tidak ada (langkah pertama; semua langkah DB-dependen menunggu ini).
- File yang harus dibaca:
  - `supabase/migrations/20260911000002_image_studio.sql` (pola tabel + RLS + cron)
  - `supabase/migrations/20260918000004_studio_final_prompt.sql` (pola aditif `ADD COLUMN IF NOT EXISTS`)
- File yang harus diubah (di dalam submodule `supabase/`):
  - BARU: `supabase/migrations/20260929000001_studio_batch.sql`
- Simbol terkait: `public.image_studio_config`, `public.user_image_generations`, `public.studio_batches`, `is_admin()`, `auth.uid()`.
- Kondisi saat ini: `image_studio_config` tanpa kolom batch; `user_image_generations` tanpa `batch_id`; tidak ada tabel batch.
- Perubahan konkret (tulis file migrasi persis urutan ini):
  1. `ALTER TABLE public.image_studio_config ADD COLUMN IF NOT EXISTS max_batch_prompts int NOT NULL DEFAULT 50 CHECK (max_batch_prompts BETWEEN 1 AND 50);`
  2. `CREATE TABLE IF NOT EXISTS public.studio_batches (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE, name text NULL CHECK (name IS NULL OR char_length(name) <= 120), settings jsonb NOT NULL DEFAULT '{}'::jsonb, total int NOT NULL CHECK (total BETWEEN 1 AND 50), created_at timestamptz NOT NULL DEFAULT now());`
  3. `ALTER TABLE public.user_image_generations ADD COLUMN IF NOT EXISTS batch_id uuid NULL REFERENCES public.studio_batches(id) ON DELETE CASCADE;`
  4. `CREATE INDEX IF NOT EXISTS idx_user_images_batch ON public.user_image_generations (batch_id, created_at ASC) WHERE batch_id IS NOT NULL;`
  5. `CREATE INDEX IF NOT EXISTS idx_studio_batches_owner ON public.studio_batches (user_id, created_at DESC);`
  6. RLS: `ALTER TABLE public.studio_batches ENABLE ROW LEVEL SECURITY;` + 3 policy (drop-if-exists dulu, tiru `user_images_*`): `studio_batches_owner_read` (SELECT authenticated `auth.uid()=user_id OR is_admin()`), `studio_batches_admin` (ALL authenticated `is_admin()`), `studio_batches_service` (ALL service_role true).
  7. Komentar SQL: batch row persist setelah anak expired (audit); cleanup tidak hapus batch.
- Behavior dipertahankan: tidak ada `DROP/ALTER` kolom lama; CHECK lama utuh; cron existing tidak disentuh.
- Error/edge: migrasi harus idempotent (`IF NOT EXISTS`); `total` ≤50 konsisten dengan CHECK knob; FK `ON DELETE CASCADE` (hapus batch = hapus anak DB; file Storage dihapus di action S3 SEBELUM delete).
- Test: tidak ada test unit untuk SQL; verifikasi via apply lokal (`supabase db push --dry-run` bila tersedia, atau review manual) + langkah S3 mengasumsikan kolom ada (test mock menyertakan kolom).
- Command verifikasi: `git -C supabase status --short` (hanya 1 file baru), review `git -C supabase diff --cached`.
- Hasil yang diharapkan: 1 file migrasi baru, tidak ada modifikasi file migrasi lama.
- Completion: file migrasi ada, lolos review pola aditif, commit+push SUBMODULE dulu (lihat Handoff), parent belum diapa-apakan.
- Dilarang: edit migrasi lama; edit `worker.ts`; tambah cron; ubah RLS tabel lain.

## S1 — Tipe + knob `max_batch_prompts`

- Tujuan: `StudioConfig` membawa knob batch sampai ke UI/server tanpa hardcode.
- Finding: F-cap-50-configurable.
- Dependency: S0 (nama kolom harus sama persis: `max_batch_prompts`).
- Baca: `src/lib/studio/types.ts` (seluruh file, 146 baris).
- Ubah: `src/lib/studio/types.ts` SAJA.
- Simbol: `StudioConfig`, `DEFAULT_STUDIO_CONFIG`, `StudioGenerationRow`, BARU `StudioBatch { id, user_id, name, settings, total, created_at }` + BARU `StudioBatchWithCounts extends StudioBatch { pending, ready, failed }`.
- Kondisi: `StudioConfig` ada 12 field tanpa batch; `DEFAULT_STUDIO_CONFIG` tanpa batch; `StudioGenerationRow` tanpa `batch_id`.
- Perubahan (urutan dalam file):
  1. Tambah `max_batch_prompts: number;` di `interface StudioConfig` setelah `polling_interval_sec`.
  2. Tambah `max_batch_prompts: 50` di `DEFAULT_STUDIO_CONFIG`.
  3. Tambah `batch_id: string | null;` di `StudioGenerationRow` setelah `camera_slug` (posisi bebas asal ada; catat di sini agar konsisten).
  4. Tambah 2 interface batch baru di bawah `StudioGenerationRow`.
  5. Tambah komentar `// TODO(batch): override per-prompt (mis. [style:...] per blok) — V1 shared saja.` tepat di atas `StudioBatch`.
- Pertahankan: semua tipe lama utuh; tidak ada rename.
- Error/edge: kode harus tahan config lama tanpa kolom (fallback `?? 50` dilakukan di S3, bukan di tipe).
- Test: tidak ada test baru (dicakup S8 via actions test yang membaca config).
- Verifikasi: `npm run typecheck` hijau.
- Completion: typecheck hijau, diff hanya `src/lib/studio/types.ts`.
- Dilarang: ubah `actions.ts`, `validation.ts`, `worker.ts` di langkah ini.

## S2 — Parser + validasi batch

- Tujuan: satu fungsi murni split double-newline dipakai client preview DAN server (anti-bypass).
- Finding: F-input-paste-upload (pisah `\n\n`, trim, buang kosong).
- Dependency: S1 (butuh `max_prompt_length` dari config sebagai argumen, bukan import config).
- Baca: `src/lib/studio/validation.ts` (123 baris), `src/lib/studio/validation.test.ts` (97 baris).
- Ubah: `src/lib/studio/validation.ts` (tambah), `src/lib/studio/validation.test.ts` (tambah test; edit test dilarang selain append describe baru).
- Simbol: BARU `parseBatchPrompts(raw: string): string[]`, BARU `BATCH_FILE_MAX_BYTES = 102400`, BARU `validateBatchPrompts(prompts: string[], maxPromptLength: number, maxBatch: number): { valid: string[]; rejected: { index: number; reason: string }[] }`, BARU `checkStudioQuotaForBatch(usedToday: number, dailyLimit: number | null, n: number)`, reuse `studioInputSchema`, `checkStudioQuota`.
- Kondisi: belum ada parser batch; `checkStudioQuota` hanya cek 1 slot (`usedToday < limit`).
- Perubahan `validation.ts` (append di akhir file, urutan):
  1. Konstanta `BATCH_FILE_MAX_BYTES`.
  2. `parseBatchPrompts`: `raw.split(/\r?\n\s*\r?\n/).map(s=>s.trim()).filter(s=>s.length>0)` — TIDAK memfilter `<10` di sini (penolakan `<10` masuk `rejected` agar preview jujur).
  3. `validateBatchPrompts`: untuk tiap prompt: tolak bila `<10` (`'Prompt minimal 10 karakter.'`), tolak bila `> maxPromptLength` (`'Prompt maksimal {max} karakter.'`); tolak seluruh batch bila `prompts.length === 0` atau `> maxBatch` (reason di index -1, pesan `'Maksimal {max} prompt per batch.'`); kembalikan `{ valid, rejected }`.
  4. `checkStudioQuotaForBatch`: limit null → `{ allowed:true, remaining:null }`; else `{ allowed: usedToday + n <= limit, remaining: max(0, limit - usedToday) }`.
  5. Komentar TODO per-prompt override di atas `parseBatchPrompts`.
- Pertahankan: fungsi lama tidak diubah; pesan error Indonesia konsisten.
- Error/edge: `\r\n` Windows; blok hanya-spasi; file kosong → `valid=[]`; `maxBatch` clamp 1–50 di caller (S3); `maxPromptLength` dari config live.
- Test (append describe baru di `validation.test.ts`, JANGAN ubah test lama):
  - `parseBatchPrompts`: input `"a lively cat portrait...\n\n\n   \nsecond vivid street scene..."` → 2 item trim; `\r\n\r\n` → 2 item; blok kosong dibuang.
  - `validateBatchPrompts`: 1 item 5 char → rejected reason `/minimal 10/`; 51-char item dengan max 50 → rejected `/maksimal 50/`; 51 item dengan max 50 → `valid=[]` + rejected berisi index -1 `/Maksimal 50/`; happy 2 item → valid 2.
  - `checkStudioQuotaForBatch`: `(19,20,1)` allowed+remaining 1; `(19,20,2)` allowed false; `(0,null,50)` allowed.
- Verifikasi: `npm test -- src/lib/studio/validation.test.ts` (semua hijau incl. lama), `npm run typecheck`, `npm run lint`.
- Completion: 3 fungsi + 1 konstanta ada, 3 grup test baru hijau, test lama utuh.
- Dilarang: ubah skema single; ubah worker; baca config/env di fungsi murni ini.

## S3 — Server action batch (enqueue/list/retry/delete)

- Tujuan: enqueue N prompt atomik-tolak-penuh + query per-batch + retry/hapus sebatch.
- Finding: F-quota-N (tolak penuh bila `used+N>limit`), F-grouping (FK `batch_id`), F-batch-lifecycle.
- Dependency: S0 (kolom/tabel), S1 (tipe), S2 (parser/kuota).
- Baca: `src/lib/studio/actions.ts` (599 baris, fokus `enqueueStudioImageImpl:185-320`, `listUserImages:326-349`, `retryFailedStudioImageImpl:532-553`, `deleteStudioImageImpl:565-583`, `getStudioQuota:586-599`), `src/lib/studio/types.ts` (hasil S1).
- Ubah: `src/lib/studio/actions.ts` SAJA (append; JANGAN refactor fungsi single).
- Simbol: BARU `EnqueueBatchInput { prompts: string[]; batchName?: string | null; negativePrompt?; providerId?; modelId?; styleSlug?; subjectSlug?; cameraSlug?; aspectSlug: string; guidance?; steps?; seed?; reqWidth?; reqHeight? }`, BARU `enqueueStudioBatch(input)`, BARU `listStudioBatches(limit?: number)`, BARU `listBatchImages(batchId: string)`, BARU `retryFailedBatchImages(batchId)`, BARU `deleteStudioBatch(batchId)`, reuse `studioInputSchema`, `validateProviderModelLink`, `buildStudioExpiry`, `checkStudioQuotaForBatch`, `removeUserImage`, `revalidatePath`.
- Kondisi: hanya ada single-enqueue; tidak ada query batch.
- Perubahan (append setelah `getStudioQuota`, urutan):
  1. `EnqueueBatchInput` + helper `clampMaxBatch(raw: unknown, fallback=50)`: `floor 1–50`.
  2. `enqueueStudioBatch`: requireUser → getStudioConfig → `maxBatch = clampMaxBatch(config.max_batch_prompts)` → `validateBatchPrompts(prompts, config.max_prompt_length, maxBatch)` → bila rejected non-kosong → return `{ ok:false, error: 'Batch ditolak: {N} prompt tidak valid — {reason pertama} (blok {i}).' }` (jangan sebutkan isi prompt di error bila >80 char; potong) → validasi FK persis pola single (provider/model/aspect/style/subject/camera aktif; `validateProviderModelLink`; img2img: bila `referencePublicUrl` terisi → throw `'Batch V1 tidak mendukung gambar referensi.'`) → hitung `usedToday` (pola dayStart UTC single) → `checkStudioQuotaForBatch(used, daily_limit, valid.length)` → bila tidak allowed → `{ ok:false, error: 'Kuota kurang: butuh {N}, sisa {remaining} dari limit {limit}/hari.' }` → insert `studio_batches{user_id, name: batchName?.slice(0,120) ?? null, settings: {negativePrompt, providerId, modelId, styleSlug, subjectSlug, cameraSlug, aspectSlug, guidance, steps, seed, reqWidth, reqHeight}, total: valid.length}` → ambil `batchId` → loop insert `user_image_generations` per prompt dengan field shared + `batch_id: batchId`, `expires_at` via `buildStudioExpiry` → `revalidatePath('/studio/batch')` + `revalidatePath('/studio')` → return `{ ok:true, data:{ batchId, enqueued: valid.length } }`. Semua error via `fail(e)` (ok:false), TIDAK throw (pola `StudioActionResult`).
  3. `listStudioBatches(limit=20 clamp 1–50)`: requireUser → select `studio_batches` milik user order created desc + untuk tiap batch hitung counts via 1 query `user_image_generations.select('status').eq('batch_id', id)` (N+1 diterima untuk V1, limit 20) → return `StudioBatchWithCounts[]`.
  4. `listBatchImages(batchId)`: requireUser → verifikasi batch milik user (maybeSingle; bila null → throw `'Batch tidak ditemukan.'`) → select children `eq batch_id` order created asc limit 100 → return rows.
  5. `retryFailedBatchImages(batchId)`: verifikasi milik user → `update {status:'pending', attempts:0, last_error:null} eq batch_id eq status failed` → revalidate kedua path → return `{ retried: count }` (count dari select failed sebelum update, atau 0).
  6. `deleteStudioBatch(batchId)`: verifikasi milik user → select children `storage_path` → loop `removeUserImage(p).catch(()=>{})` → `delete from studio_batches eq id eq user_id` (cascade hapus anak) → revalidate kedua path.
- Pertahankan: single-enqueue, list, retry, delete single tidak berubah; pola error `ok:false`; `revalidatePath('/studio')` single tetap.
- Error/edge: batch kosong; N>maxBatch; N>sisa kuota (tolak penuh, tidak partial); FK nonaktif (pesan refresh); batch milik user lain (not found, jangan bocorkan); delete dengan file hilang (best-effort); `settings` jsonb tidak berisi secret.
- Test: extend `src/lib/studio/actions.test.ts` dengan append describe baru (mock client pola file itu; tambahkan tabel `studio_batches`, `image_studio_config` di mock):
  - quota: used 19/limit 20/N 2 → ok:false `/Kuota kurang/`; used 0/limit null/N 50 → ok:true.
  - cap: 51 prompt + max_batch 50 → ok:false `/Maksimal 50/`; invalid 1 blok pendek → ok:false `/tidak valid/`.
  - insert: happy 2 prompt → mock catat 1 insert batch + 2 insert children dengan `batch_id` sama; `total=2`.
  - kepemilikan: `listBatchImages` batch user lain → throw `/tidak ditemukan/`.
- Verifikasi: `npm test -- src/lib/studio/actions.test.ts`, `npm run typecheck`, `npm run lint`.
- Completion: 4 action + 1 tipe input ada; test baru hijau; test lama hijau.
- Dilarang: ubah `enqueueStudioImageImpl`, `processOneStudioImage`, `uploadUserImage*`, cron, RLS via kode; simpan secret di `settings`.

## S4 — Nav + routing + sidebar-active fix

- Tujuan: menu sidebar baru `/studio/batch` tanpa double-highlight.
- Finding: F-sidebar-route.
- Dependency: tidak ada ketergantungan DB (bisa paralel S0–S3, tapi halaman S6 butuh route ini).
- Baca: `src/config/navigation.ts` (86 baris), `src/components/admin/shell/admin-nav.ts` (81 baris), `src/i18n/routing.ts` (158 baris), `src/components/admin/shell/admin-nav.test.ts` (28 baris).
- Ubah: 3 file produksi + 1 file test (append):
  - `src/config/navigation.ts`
  - `src/components/admin/shell/admin-nav.ts`
  - `src/i18n/routing.ts`
  - `src/components/admin/shell/admin-nav.test.ts` (append test)
- Simbol: `NavItem`, `adminNavItems`, `adminNavGroups`, `AdminNavEntry`, `isNavActive`, `routing.pathnames`.
- Kondisi: key union tanpa `studioBatch`; pathname union tanpa `/studio/batch`; entri sidebar `studio` non-exact (prefix) sehingga akan double-aktif.
- Perubahan per file (urutan):
  1. `navigation.ts`: tambah `'studioBatch'` ke key union (setelah `'studio'`); tambah `'/studio/batch'` ke pathname union (setelah `'/studio'`); tambah `{ key:'studioBatch', pathname:'/studio/batch' }` di `adminNavItems` setelah entri studio.
  2. `admin-nav.ts`: tambah `Layers` ke import lucide (urutan alfabet: `... Image, Layers, LayoutDashboard ...`); ubah entri studio jadi `exact:true`; tambah `{ key:'studioBatch', pathname:'/studio/batch', icon:Layers, adminOnly:false, exact:true }` setelah studio.
  3. `routing.ts`: tambah `'/studio/batch': { id:'/studio/batch', en:'/studio/batch' }` setelah blok `'/studio'`.
  4. Test append: `isNavActive('/studio/batch', studioExactEntry)` false; `isNavActive('/studio/batch', batchEntry)` true; `isNavActive('/studio', studioExactEntry)` true.
- Pertahankan: `mainNavItems` (publik) tidak berubah; `/lab` tidak berubah; admin guard tidak berubah (batch ikut login-guard non-admin seperti `/studio` karena middleware prefix non-publik; tidak masuk `ADMIN_INTERNAL_PATHS`).
- Error/edge: locale `/en/studio/batch` ikut bekerja via pathnames; route dalam `(admin)` butuh file halaman S6 agar tidak 404 (terima 404 sementara sampai S6).
- Test: `npm test -- src/components/admin/shell/admin-nav.test.ts`; parity i18n menyusul S5.
- Verifikasi: typecheck + lint hijau; sidebar render tanpa error tipe (`key` union mencakup `studioBatch`, jadi label `nav.studioBatch` wajib ada — S5).
- Completion: 3 file berubah + test aktif-highlight hijau.
- Dilarang: ubah `middleware.ts` (tidak perlu — login guard otomatis via matcher non-publik); ubah `mainNavItems`; jadikan batch adminOnly.

## S5 — Katalog i18n id/en (parity penuh)

- Tujuan: semua string batch ada di id+en dengan key identik.
- Finding: F-i18n-parity (test `messages.test.ts` + `validate-messages.mjs` merah bila timpang).
- Dependency: S4 (key `nav.studioBatch` wajib ada agar sidebar tidak render undefined).
- Baca: `src/messages/id.json` (blok `nav:73-101`, `studio:896-1056`), `src/messages/en.json` (blok sama, bandingkan), `src/messages/messages.test.ts`, `scripts/validate-messages.mjs` + `scripts/lib/message-catalog.mjs`.
- Ubah: `src/messages/id.json`, `src/messages/en.json` (tambah key; JANGAN ubah key lama; JANGAN duplikat top-level).
- Simbol: `nav.studioBatch`, `meta.studioBatch`, `studio.batch.*`.
- Kondisi: belum ada key batch.
- Perubahan (urutan dalam tiap file, id dulu lalu en dengan key SAMA persis):
  1. `nav`: tambah `"studioBatch": "Batch"` (id) / `"Batch"` (en) setelah `"studio"`.
  2. `meta`: tiru blok `meta.studio` menjadi `meta.studioBatch` (title+description; jangan index: batch pages `robots index:false` seperti studio — diatur di page S6).
  3. `studio.batch`: tambah objek dengan key WAJIB (nilai id / en wajar): `title, intro, pasteLabel, pastePlaceholder, pasteHint, fileLabel, fileHint, fileTooBig, fileBadType, previewValid, previewRejected, previewEmpty, overCap, needQuota, estimatedTime, submit, submitting, enqueued, listHeading, progressLabel, retryFailed, retrying, deleteBatch, deleteConfirm, cancelDelete, deleted, downloadAll, downloading, downloadPartial, empty, quotaShort`.
- Pertahankan: key lama utuh; indent 2 spasi; tidak ada duplikat top-level `"studio"`/`"lab"`.
- Error/edge: placeholder `{n}/{max}/{remaining}/{limit}/{minutes}` harus sama di id+en; string tidak boleh kosong.
- Test: tidak tulis test baru (test parity existing otomatis mencakup); bila `messages.test.ts` mensyaratkan daftar required per namespace, tambahkan key batch ke daftar required HANYA bila pola itu dipakai untuk studio (cek file dulu; bila tidak ada required-studio list, lewati).
- Verifikasi: `npm test -- src/messages/messages.test.ts`, `npm run validate:messages` → `message catalogs valid...`.
- Completion: kedua command hijau.
- Dilarang: ubah string single-studio; ubah `lab.*`; format file di luar penambahan key.

## S6 — Halaman + form + histori batch

- Tujuan: `/studio/batch` fungsional: input paste+file, preview valid/ditolak, setting shared reuse, antre, progres, retry/hapus.
- Finding: F-batch-ux (double-newline, preview jujur, estimasi waktu, kuota).
- Dependency: S1–S5 (tipe, parser, action, route, string).
- Baca: `src/app/[locale]/(admin)/studio/page.tsx` (75 baris — tiru guard + load), `src/components/studio/StudioPageClient.tsx` (100 baris), `src/components/studio/StudioForm.tsx` (picker + advanced, 761 baris), `src/components/studio/StudioHistory.tsx` (polling + download + retry/delete, 743 baris).
- Ubah (BARU, JANGAN edit file single):
  - BARU `src/app/[locale]/(admin)/studio/batch/page.tsx`
  - BARU `src/components/studio/BatchPageClient.tsx`
  - BARU `src/components/studio/BatchForm.tsx`
  - BARU `src/components/studio/BatchHistory.tsx`
- Simbol: `listStudioOptions`, `getStudioQuota`, `listStudioBatches`, `listBatchImages`, `enqueueStudioBatch`, `retryFailedBatchImages`, `deleteStudioBatch`, `parseBatchPrompts`, `validateBatchPrompts`, `BATCH_FILE_MAX_BYTES`, `StudioOptions`, `StudioQuota`, `StudioBatchWithCounts`.
- Kondisi: route S4 tanpa halaman (404) sampai langkah ini.
- Perubahan (urutan):
  1. `batch/page.tsx`: tiru `studio/page.tsx` (locale guard, `createSupabaseServer` → redirect `/masuk`, `getDisplayTimezone`, `Promise.all([listStudioOptions(), getStudioQuota(), listStudioBatches(20)])`, `generateMetadata` path `/studio/batch`, robots noindex) → render `BatchPageClient`.
  2. `BatchForm.tsx`: state `rawText`, `fileName`, `settings` (provider/model/style/subject/camera/aspect + negative + advanced — tiru pola `StudioForm:23-64` tapi TANPA reference/enhance), `preview {valid, rejected}` via `parseBatchPrompts`+`validateBatchPrompts` memakai `options.config.max_prompt_length` dan `max_batch_prompts ?? 50`; upload file: `accept=".txt,.md,text/plain,text/markdown"`, tolak `size > BATCH_FILE_MAX_BYTES` dan tipe tak dikenal; tampilkan daftar rejected dengan nomor blok; estimasi `ceil(N/5)*5 menit`; tombol submit disabled bila `N===0 || N>sisaKuota || N>maxBatch || isPending`; sukses → kosongkan textarea + `onEnqueued`.
  3. `BatchHistory.tsx`: daftar `StudioBatchWithCounts` + klik batch → `listBatchImages` → tampilkan baris anak ringkas (status badge reuse class `STATUS_CLASS`, prompt, thumb bila ready); polling `setInterval(polling_interval_sec*1000)` HANYA bila batch terbuka punya `pending>0`; tombol retry-gagal-sebatch + hapus-sebatch dua-tahap (tiru `StudioHistory:581-626`).
  4. `BatchPageClient.tsx`: tiru `StudioPageClient` (quota badge, `historyRefreshKey`, layout `max-w-3xl`) + render `BatchForm` + `BatchHistory`.
- Pertahankan: `StudioForm`/`StudioHistory`/`StudioPageClient` tidak berubah; pola `role="status"` notice; `aria-busy` submit.
- Error/edge: file biner diganti nama `.txt` (baca sebagai text gagal → pesan `fileBadType`); paste 0 valid; N>kuota (tampilkan `needQuota` + jangan panggil server); polling berhenti saat tidak ada pending; batch baru muncul via `refreshKey`.
- Test: langkah ini tanpa test komponen baru (dicakup S8 parsial); verifikasi via typecheck+lint+build.
- Verifikasi: `npm run typecheck`, `npm run lint`, `npm run build` (route `/studio/batch` ter-render).
- Completion: halaman id+en 200 saat login, 404/anon redirect `/masuk` (lihat S8 middleware test), enqueue batch muncul di list + polling jalan.
- Dilarang: tambah enhance/reference ke batch; ubah komponen single; ubah worker/cron.

## S7 — Unduh semua sebagai ZIP (client-side)

- Tujuan: 1 klik unduh semua `ready` dalam batch sebagai zip.
- Finding: F-download-all (tanpa endpoint server, tanpa timeout Vercel).
- Dependency: S6 (butuh daftar `public_url` ready per batch).
- Baca: `src/components/studio/StudioHistory.tsx:174-196` (pola `fetch→blob→anchor`), `package.json` (cek `jszip` belum ada).
- Ubah:
  - `package.json` + `package-lock.json` (via `npm install jszip` — SATU-SATUNYA perubahan dependency)
  - BARU `src/lib/studio/batch-zip.ts` (helper murni)
  - `src/components/studio/BatchHistory.tsx` (tambah tombol + handler; JANGAN ubah logika lain)
- Simbol: BARU `buildBatchZipName(batchId: string): string`, BARU `toZipFilename(index: number, imageId: string): string`, `JSZip` (dynamic import).
- Kondisi: hanya unduh satuan.
- Perubahan (urutan):
  1. `npm install jszip` (terima versi ^3.10.x yang terpasang; jangan pin manual).
  2. `batch-zip.ts`: `buildBatchZipName = batchId => 'studio-batch-{id8}.zip'`; `toZipFilename = (i, id) => 'batch-{nnn}-{id8}.png'` (nnn = String(i+1).padStart(3,'0')).
  3. `BatchHistory.tsx`: tombol `Unduh semua (.zip)` visible bila `readyCount>0`, disabled saat `isZipping`; handler: `const { default: JSZip } = await import('jszip')` → `zip = new JSZip()` → loop ready rows: `fetch(public_url)` → `blob()` → `zip.file(toZipFilename(i,id), blob)`; fetch gagal → catat `skipped[]`, lanjut; `generateAsync({type:'blob'})` → anchor download `buildBatchZipName(batchId)` → notice `downloadPartial` bila skipped non-kosong else `ready`; `finally` revoke object URL.
- Pertahankan: unduh satuan existing; tidak ada API route baru; tidak ada `file-saver` (anchor manual cukup).
- Error/edge: 0 ready (tombol hidden); CORS fetch gagal → fallback `window.open(url)` per file? TIDAK — untuk zip: lewati + laporkan (fallback per-file hanya untuk unduh satuan); zip >100MB di mobile (tulis hint desktop di `downloadPartial`); `isZipping` cegah klik ganda.
- Test: BARU `src/lib/studio/batch-zip.test.ts`: `buildBatchZipName('abcdef12-...')` → `studio-batch-abcdef12.zip`; `toZipFilename(0,'abcdef12-...')` → `batch-001-abcdef12.png`; index 9 → `batch-010-...`.
- Verifikasi: `npm test -- src/lib/studio/batch-zip.test.ts`, `npm run typecheck`, `npm run lint`.
- Completion: helper + tombol ada, test hijau, tidak ada route server baru.
- Dilarang: tambah endpoint `/api/studio/batch/zip`; ubah `storage.ts`; tambah dep selain `jszip`.

## S8 — Update/extend test yang terdampak

- Tujuan: tidak ada regresi nav/guard/parity; perilaku baru terkunci test.
- Finding: semua (setiap finding ≥1 test/verifikasi).
- Dependency: S2–S7 (kode yang diuji sudah ada).
- Baca: file test yang diubah + `src/middleware.test.ts` (204 baris).
- Ubah (append SAJA, JANGAN ubah test lama):
  - `src/lib/studio/validation.test.ts` (lihat S2)
  - `src/lib/studio/actions.test.ts` (lihat S3; perluasan mock: tambah tabel `studio_batches: []`, `image_studio_config: [{ max_batch_prompts: 50, max_prompt_length: 500, daily_limit: 20, retention_days: 30 }]` di `useEnqueueTables`)
  - `src/components/admin/shell/admin-nav.test.ts` (lihat S4)
  - BARU `src/lib/studio/batch-zip.test.ts` (lihat S7)
  - `src/middleware.test.ts` (append): tambah `'/id/studio/batch'`, `'/en/studio/batch'` ke `loginOnlyRoutes`; tambah test logged-in akses `/id/studio/batch` tanpa redirect (tiru test `/id/studio:100-105`).
- Simbol: pola mock `makeClient`, `requireUser`, `createSupabaseService`, `revalidatePath`.
- Kondisi: middleware men-guard semua non-publik otomatis (tidak ada perubahan kode guard).
- Perubahan: hanya append blok `it(...)`/entri array; tidak ada edit assertion lama.
- Pertahankan: seluruh test lama hijau.
- Error/edge: mock `insert` untuk `studio_batches` harus return `{ id: 'batch-1' }` agar children dapat `batch_id` sama (sesuaikan helper mock lokal di describe baru, jangan ubah helper lama).
- Verifikasi per file: `npm test -- <file>` masing-masing hijau; lalu `npm run validate:messages`.
- Completion: 5 file test hijau + validate-messages hijau.
- Dilarang: ubah assertion lama agar hijau (perbaiki kode, bukan test); tambah kredensial asli.

## S9 — Gate penuh + verifikasi manual + handoff

- Tujuan: buktikan tidak ada regresi sebelum handoff ke implementor.
- Dependency: S0–S8.
- Baca: tidak ada (jalankan command).
- Ubah: tidak ada file (kecuali bila gate merah → kembali ke langkah pemilik bug, bukan fix diam-diam di sini).
- Verifikasi (urutan, semua dari root repo):
  1. `npm run typecheck` → 0 error.
  2. `npm run lint` → 0 error/warning baru (bandingkan baseline).
  3. `npm test` (penuh, bukan per-file) → semua pass (catat angka, mis. ~11xx).
  4. `npm run validate:messages` → `message catalogs valid...`.
  5. `npm run build` → sukses (route `/studio/batch` terdaftar).
- Manual QA (oleh manusia, bukan model kecil): login → `/id/studio/batch` → paste 3 prompt double-newline → enqueue → polling pending→ready → unduh zip berisi 3 file; anon → redirect `/masuk`; batch 51 prompt → ditolak `/Maksimal 50/`; kuota kurang → ditolak `/Kuota kurang/` tanpa partial.
- Completion: 5 command hijau + QA checklist terisi.
- Dilarang: staging/commit/push kode (kecuali file plan ini bila diminta); menjalankan migrasi ke PROD dari plan ini.

---

## Notes

- Konvensi repo yang ditemukan dan harus diikuti implementor: error Server Action sebagai data `{ ok:false }` (bukan throw — lihat `actions.ts:42`); pesan Indonesia; `revalidatePath` batch + single; RLS owner+admin+service_role; Storage tulis via service_role; test mock client rantai (lihat `actions.test.ts:28-72`).
- TODO eksplisit (bukan scope plan ini): override per-prompt; `settings` batch editable pasca-enqueue; batch `name` editable; grafik progres; notifikasi selesai; hapus batch otomatis saat anak expired; naikkan `MAX_PER_TICK` (butuh uji beban).
- Jejak standar: fitur kecil ini tidak memakai ceremony TOGAF penuh; pola antrean existing dipertahankan (worker FIFO + strict-pin + audit `llm_meta` tidak berubah).

## Open Questions / Blockers

1. **Kuota vs cap 50 (BLOCKER operasional, bukan kode).** Opsi: (a) naikkan `daily_limit` ≥50 (mis. 100) — rekomendasi, 1 update config; risiko: biaya provider naik; (b) `daily_limit=null` (unlimited) — risiko: abuse; (c) knob batch-quota terpisah — ditolak untuk V1 (tambah kompleksitas). Tanpa (a)/(b), batch 50 selalu ditolak oleh cek kuota yang benar. Rekomendasi: set `daily_limit=100` sebelum uji batch-50.
2. **Nama file migrasi.** `20260929000001_studio_batch.sql` = slot berikutnya setelah `20260927000001` (cek `supabase/migrations/` saat implementasi; bila ada file lebih baru, naikkan stamp, jangan timpa).
3. **ZIP besar.** Opsi: (a) client-side V1 (rekomendasi — tanpa timeout server); (b) server-side menyusul bila keluhan mobile. Risiko (a): RAM mobile; mitigasi hint desktop.
4. **Estimasi waktu batch-50 (±50 mnt).** Opsi: (a) tulis ekspektasi di UI (rekomendasi); (b) naikkan tick — ditolak V1 tanpa data beban.

## Handoff Checklist (untuk model implementor)

- [ ] Baca S0–S9 berurutan; JANGAN lompat (dependency DB → tipe → validasi → action → nav → i18n → UI → zip → test → gate).
- [ ] Submodule DULU: buat migrasi di `supabase/`, `git -C supabase add/commit/push`, catat hash; lalu update pointer di parent (`git add supabase`, tunjukkan `git diff --stat` hanya pointer + file tugas).
- [ ] Jangan commit secret; scan `git diff` sebelum stage; stage hanya file tugas.
- [ ] Setiap edit setelah gate hijau MEMBATALKAN gate — re-run `typecheck+lint` (dan `build` bila sentuh konstanta/import) sebelum klaim selesai.
- [ ] Setiap finding di Scope harus bisa ditunjuk ke ≥1 langkah + ≥1 test/command di atas; bila tidak bisa, STOP dan laporkan sebagai blocker (jangan desain diam-diam).
- [ ] Selesai: laporkan hash + file kunci + 5 hasil gate (bukan auto-push tanpa instruksi user).
