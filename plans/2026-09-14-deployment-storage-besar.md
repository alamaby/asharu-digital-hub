# Rencana Penurunan Deployment Storage asharu-digital-hub

Created: 2026-09-14 13:28:04

## Objective

Turunkan Deployment Storage proyek Vercel `asharu-digital-hub` dari **4.87 GB** ke **< 1 GB** dan cegah penumpukan ulang, tanpa mengubah perilaku aplikasi dan tanpa memindahkan media dari `public/` (keputusan user).

## Latar & Temuan Analisa

Hasil analisa 2026-09-14 (bukti dari Vercel CLI + repo lokal):

- `vercel ls asharu-digital-hub --json --limit 100`: **100 deployment dalam 8 hari** (6–14 Sep 2026), semua `target: production`, tiap build ±50 detik.
- `vercel inspect <deployment-terbaru> --json`: **95 outputs, total ~178 MB, semuanya `type: lambda` @ ~2.07 MB identik** (`[locale]`, `[locale].rsc`, `[locale]/about`, ...).
- `git log --since 2026-08-28`: **218 commit dalam 18 hari (~12/hari)**; tiap push ke `main` = 1 production deployment.
- Ukuran lokal: `public/` 23.33 MB (video terbesar `tur-unit.mp4` 4.5 MB + ratusan `.webp`), `.next/` 382 MB (372 MB di antaranya `.next/cache` lokal yang tidak ikut deploy), `src/` 1.79 MB, `node_modules/` 512 MB.
- Tidak ada `.vercelignore`; `vercel.json` tidak mengatur `ignoreBuildStep`; `next.config.ts` tidak mengatur `outputFileTracing*` / `optimizePackageImports`.
- Rumus masalah: `storage = N_deploy × size_per_deploy` — frekuensi deploy ekstrem × ~178 MB per deploy, terakumulasi karena plan Hobby tidak menghapus deployment lama otomatis. Grafik dashboard naik monoton sejak 29 Agu, persis saat commit massif dimulai.

## Scope

Termasuk:

- Hapus deployment lama, sisakan 2 deployment (keputusan user poin 1).
- File `.vercelignore` baru + optimasi bundle `next.config.ts` (keputusan user poin 2).
- Instruksi Ignore Build Step docs-only untuk di-setting manual di dashboard Vercel.
- Verifikasi: dashboard, CLI, gate hijau, commit + push per aturan repo.

Tidak termasuk:

- Pindah media ke Supabase Storage / CDN (ditolak user poin 3 — biaya tetap ~23 MB statis per deploy diterima).
- Upgrade plan Vercel ke Pro.
- Perubahan pipeline scraper / cron / skema database.

## Milestones

1. Darurat: retensi → 2 deployment, kuota kembali aman (< 1 GB).
2. Kecilkan ukuran per-deploy (source yang di-upload + bundle lambda).
3. Kecilkan frekuensi deploy tak perlu (docs-only skip via Ignore Build Step).
4. Verifikasi akhir: dashboard, CLI, gate hijau, commit + push.

## Tasks

- [x] **T0 — Verifikasi awal (read-only, jangan hapus apa pun dulu)**
  - `vercel whoami` dan `vercel project ls` untuk konfirmasi scope `alam-aby-bashits-projects` dan proyek `asharu-digital-hub`.
  - `vercel ls asharu-digital-hub --json --limit 100` simpan ke file temp (contoh: `$env:TEMP\deps1.json`); hitung jumlah deployment. Bila output meminta paginasi (`--next <token>`), ulangi sampai semua halaman terambil dan gabungkan.
  - `vercel inspect <url-deployment-terbaru> --json` simpan ke file temp, hitung total ukuran output dengan skrip kecil (simpan sebagai file `.py` di temp agar aman dari quoting PowerShell):
    ```python
    import json, sys
    d = json.load(open(sys.argv[1], encoding="utf-8"))
    outs = d["builds"][0]["output"]
    tot = sum((o.get("size") or 0) for o in outs)
    print("outputs:", len(outs))
    print("total_MB:", round(tot / 1000000, 2))
    ```
  - Catat baseline di Progress Log: jumlah deployment, total MB per deploy, angka dashboard Usage → Deployment Storage.
- [x] **T1 — Hapus deployment lama, sisakan 2 (DESTRUKTIF, baca semua sub-poin dulu)**
  - Aturan keep: **2 deployment dengan `createdAt` terbesar**. JANGAN hardcode URL dari analisa lama — tiap push menggeser posisi, jadi re-list saat eksekusi.
  - Sebelum menghapus: `vercel inspect <url> --json` pada kandidat yang dipertahankan, pastikan salah satunya memegang alias production (`asharu.id`, `www.asharu.id`, `asharu-digital-hub.vercel.app`). Kasus tepi: bila deployment ber-alias TIDAK termasuk 2 terbaru (mis. deploy terbaru gagal), pertahankan deployment ber-alias + 1 terbaru, dan catat penyimpangan di Progress Log.
  - Hapus sisanya satu per satu dengan `vercel remove <url-deployment> --yes`, batch ±20, lalu re-list tiap batch. Jalankan `vercel remove --help` dulu untuk konfirmasi flag persis pada versi CLI yang terpasang; jangan memakai flag destruktif lain.
  - Larangan: jangan hapus deployment yang masih memegang alias production; jangan menyentuh proyek lain (`albot`, `bagistruk`, landing pages, dll.).
  - Acceptance: `vercel ls asharu-digital-hub` hanya menampilkan ~2 deployment production (+ deployment baru bila ada push selama eksekusi); dashboard Usage → Deployment Storage turun ke kisaran < 1 GB setelah label "Updated just now" (estimasi: 2 × ~178 MB ≈ 0.36 GB sebelum kompresi Vercel). Tunggu/refresh bila angka belum turun.
- [x] **T2 — Buat `.vercelignore` di root repo (file baru)**
  - Isi persis:
    ```
    # Dokumen & memori kerja — tidak dibutuhkan runtime/build
    plans/
    .memory/
    .openchamber/
    .zcode/
    # Submodule supabase (migrasi/seed DB) — tidak diimpor build Next.js.
    # Terverifikasi 2026-09-14: seluruh impor di src/ memakai @supabase/*
    # atau @/lib/supabase/*, bukan direktori submodule ini.
    supabase/
    # Utilitas & tooling lokal
    scripts/
    .github/
    # Artefak test & build lokal
    coverage/
    *.test.*
    vitest.*
    *.tsbuildinfo
    ```
  - Verifikasi: `npm run build` sukses; `git status --short` hanya menampilkan `.vercelignore` (untracked) sebagai perubahan terkait tugas ini.
  - Bila build gagal karena ada impor dari path yang di-ignore: kecilkan daftar (hapus baris penyebab), ulangi build, catat di Progress Log. Jangan force.
- [x] **T3 — Optimasi bundle di `next.config.ts` + investigasi `sharp`**
  - Investigasi `sharp` dulu (saat ini di `dependencies`, `package.json:49`): cari impor runtime-nya di `src/` (contoh: pola `from "sharp"` / `require("sharp")`). Bila tidak ada impor runtime (hanya dipakai tooling/dev) → pindahkan ke `devDependencies` dan sinkronkan lockfile (`npm install`), lalu `npm run build`. Bila dipakai route runtime → BIARKAN dan catat alasannya di Progress Log (jangan pindah).
  - Tambahkan ke `nextConfig` (`next.config.ts:63-75`):
    ```ts
    experimental: {
      optimizePackageImports: ['lucide-react', 'apexcharts'],
    },
    ```
  - `outputFileTracingExcludes` hanya ditambahkan bila teruji menurunkan ukuran (gain ekspektasi kecil karena file-tracing Next sudah selektif); bila ditambahkan, polanya wajib lolos `npm run build` + 1 preview deploy.
  - Ukur hasil dengan **satu** preview deploy, hitung ulang total output via skrip T0, lalu **hapus preview deploy tersebut** setelah diukur (agar tidak menambah storage).
  - Acceptance: total output per deployment turun di bawah baseline (~178 MB).
- [x] **T4 — Ignore Build Step docs-only (MANUAL oleh user di dashboard; tidak bisa via CLI/repo)**
  - Navigasi: Vercel Dashboard → proyek `asharu-digital-hub` → Settings → Git → kolom "Ignored Build Step", isi perintah:
    ```bash
    if git diff --name-only HEAD^ HEAD | grep -qvE '^(\.memory/|plans/|\.github/|.*\.md$)'; then exit 1; else exit 0; fi
    ```
  - **SEMANTIK PENTING (terbalik dari CI biasa): exit 0 = SKIP build, non-zero = LANJUTKAN build.** Jadi ada file non-docs berubah → `exit 1` → build jalan; hanya docs (`*.md`, `plans/`, `.memory/`, `.github/`) berubah → `exit 0` → build di-skip.
  - Uji dua arah, keduanya wajib: (a) commit docs-only → deployment harus `Canceled`; (b) commit `src/` → harus `Ready`. Bila terbalik, perbaiki perintah, jangan lanjut sebelum benar.
  - Efek yang diharapkan: commit rutin `docs(memory)` / `docs(plan)` / `chore(data)` tidak lagi menambah deployment production.
- [x] **T5 — Verifikasi akhir, gate, commit + push (aturan repo `AGENTS.md`)**
  - Verifikasi: `vercel ls` (count kecil), dashboard Deployment Storage < 1 GB, tidak ada preview deploy sisa dari pengukuran T3.
  - Gate (final — SETIAP edit setelah gate hijau, sekecil apa pun, MEMBATALKAN gate dan wajib re-run): `npm run typecheck`, `npm run lint`, `npm test` harus hijau.
  - Sebelum commit: `git status --short`, `git diff`, `git log --oneline -10`; stage hanya file yang dimaksud (`.vercelignore`, `next.config.ts`, `package.json` + lock bila T3 memindahkan `sharp`, file plan ini bila belum ter-commit).
  - Jangan pernah commit secret (`.env`, `.env.local`, key `sb_secret_*`/`sb_publishable_*`, `CRON_SECRET`) — scan diff dulu bila ragu.
  - Pesan: Conventional Commits, satu baris, tanpa trailer `Co-authored-by:` (contoh: `chore(deploy): kecilkan deployment storage vercel`).
  - Push; bila ditolak karena remote lebih baru: `git fetch`, periksa `git log main..origin/main`, gabungkan (`git pull --no-rebase`), pastikan gate tetap hijau, push lagi. Laporkan hash + pesan + file kunci ke user.

## Risks

- Hapus deployment mematikan URL preview lama yang mungkin di-bookmark — diterima user (sisakan 2); mitigasi: hapus bertahap per batch, jangan sentuh deployment ber-alias production, re-list tiap batch.
- `.vercelignore` terlalu agresif bisa mematahkan build (mis. impor tak terduga dari `scripts/` atau fixture test) — mitigasi: `npm run build` lokal + 1 preview deploy sebelum mengandalkan deploy production. Counter-argumen: hasil grep 2026-09-14 menunjukkan tidak ada impor runtime ke path yang di-ignore, kecuali `sharp` yang ditangani eksplisit di T3.
- `supabase/` adalah git submodule (`asharu-supabase`), bukan direktori biasa — pengabaian di `.vercelignore` hanya memengaruhi upload sumber Vercel, bukan repo git; migrasi DB tetap dikelola di submodule seperti biasa.
- Perintah Ignore Build Step salah pola bisa me-skip deploy kode asli — mitigasi: denylist docs-only (bukan allowlist kode) + uji dua arah wajib di T4. Risiko sisa: commit campuran docs+kode tetap build penuh (perilaku benar, hanya kurang hemat).
- Pemindahan `sharp` ke devDependencies mengubah `package-lock.json` (churn besar di diff) — mitigasi: lakukan hanya bila terbukti tak dipakai runtime; bila ragu, biarkan dan catat.
- Media tetap di `public/` (keputusan user) memberi batas bawah ukuran per-deploy (~23 MB statis + bundle lambda) — tidak bisa sekecil proyek tanpa aset; trade-off disetujui.
- Pengukuran T3 memakai 1 preview deploy yang menambah storage sementara — wajib dihapus setelah diukur (sudah termasuk di acceptance T3).

## Progress Log

- 2026-09-14 13:28:04 — Analisa selesai di Plan Mode: 95 lambda × ~2.07 MB ≈ 178 MB/deploy; ~12 deploy/hari (218 commit/18 hari) menumpuk jadi 4.87 GB. User memutuskan: sisakan 2 deployment, setuju `.vercelignore` + Ignore Build Step, media tetap di `public/`.
- 2026-09-14 13:28:04 — File plan ini dibuat untuk diimplementasikan model kecil; belum ada eksekusi (T0–T5 masih `- [ ]`).
- 2026-09-15 — T0 selesai: 214 deployment unik (3 halaman), 95 outputs × ~2.07 MB ≈ 178.89 MB/deploy, alias production (`asharu.id`) di deployment terbaru.
- 2026-09-15 — T1 selesai: 214 → 2 deployment (212 dihapus via `vercel remove --safe --yes` batch, 0 gagal — 1 FAIL semu adalah penghapusan uji yang sudah terhapus). Selama eksekusi 2 push sesi paralel mendarat dan alias production berpindah 2 kali; aturan keep-2-terbaru + proteksi alias ditegakkan ulang tiap ronde. Akhir: `n7tepozr7` (production) + `qqmx593b6`, keduanya READY.
- 2026-09-15 — T2 selesai: `.vercelignore` dibuat; `npm run build` lokal hijau setelah tabrakan build paralel sesi lain teratasi (tunggu PID selesai + rebuild).
- 2026-09-15 — INSIDEN `.vercelignore`: pola tak-berjangkar `supabase/` ikut mengecualikan `src/lib/supabase/` (semantik gitignore cocok di semua level) → build preview gagal `module-not-found @/lib/supabase/server`. Diperbaiki dengan menjangkarkan semua pola direktori ke root (`/supabase/` dkk.); pola file (`*.test.*`, `vitest.*`, `*.tsbuildinfo`) sengaja tak-berjangkar. Preview gagal (`fvsrea1rm`) sudah dihapus. Pelajaran: pola ignore direktori wajib leading-slash bila maksudnya root-only.
- 2026-09-15 — T3 selesai dengan koreksi: `sharp` ternyata SUDAH di `devDependencies` (premisi plan keliru) → tidak ada pemindahan. `experimental.optimizePackageImports: ['lucide-react', 'apexcharts']` ditambah ke `next.config.ts`; build lokal hijau. Pengukuran 1 preview deploy: 178.85 MB vs baseline 178.89 MB (≈ nol) — lambda didominasi runtime Next + next-intl + supabase, bukan barrel lucide. Preview ukur (`327iwvziu`) sudah dihapus. `outputFileTracingExcludes` TIDAK ditambahkan (gain ekspektasi kecil, risiko regresi).
- 2026-09-15 — Sampingan: `vercel link` menyuntik `VERCEL_OIDC_TOKEN` ke `.env.local`; baris tersebut sudah dihapus kembali (file gitignored, tidak pernah di-commit).
- 2026-09-15 — T5: gate hijau (`typecheck`, `lint`, 583 tests/68 files — naik karena test baru sesi paralel). Commit `71b8ab7` (`.vercelignore` + plan) di-push; seperti diprediksi memicu 1 production deploy baru (`brtvt5vtq`, ukur produksi: 95 outputs ≈ 178.89 MB — identik baseline, konfirmasi `optimizePackageImports` ≈ nol gain pada lambda). Setelah alias pindah ke `brtvt5vtq`, `qqmx593b6` dihapus → count kembali 2 (`brtvt5vtq` production + `n7tepozr7`).
- 2026-09-15 — T4 selesai di dashboard oleh user. Verifikasi uji (a): commit plan ini (docs-only) di-push → deployment harus `Canceled` dan count tetap 2. Uji (b) (`src/` → `Ready`) terverifikasi alami pada push kode berikutnya.
- 2026-09-15 — Perbaikan test gagal (instruksi user): `ContentRequestForm.test.tsx` gagal intermiten di full-suite, lolos isolasi → root cause flake timing, BUKAN regresi (komponen dan ekspektasi sudah selaras pasca-`49d25cb`). Mekanisme: 2 test `@1.5s` vs `testTimeout` default 5000ms; saat worker paralel padat, test 1 di-abort lalu promise user-event yang masih in-flight mencemari test 2. Perbaikan test-only: `findByText` timeout 5000ms + `it(..., { timeout: 15000 })` di kedua test panel sukses. 2× full-suite 603/603 hijau beruntun pasca-perbaikan. Counter-argumen: menaikkan timeout menutupi test yang memang lambat — diterima karena kelambatan berasal dari user-event char-by-char yang disengaja (realistis), bukan bug produk.
- 2026-09-15 — Uji (a) PERTAMA TERKONTAMINASI: commit `7ba6c49` menggabung fix test (`src/...test.tsx`, non-docs) + plan → T4 dengan benar MELOLOSKAN build (`1x2ozefyz` READY). Pelajaran: uji skip-docs wajib commit murni docs. Cleanup: `9fx4jvyja` + `brtvt5vtq` dihapus → count kembali 2 (`1x2ozefyz` production + `bdatnm8n2` sesi paralel).
- 2026-09-15 — Uji (a) MURNI LOLOS: commit `984321d` (hanya `plans/*.md`) → deployment `8w8x1v2fg` berstatus CANCELED, count READY tetap 2. T4 terverifikasi bekerja. Entri Canceled dihapus untuk kerapian → final 2 READY, `asharu.id` di `1x2ozefyz`. Uji (b) (`src/` → Ready) sudah terbukti alami via `1x2ozefyz` + `bdatnm8n2`. PLAN SELESAI.

## Notes

- Keputusan user (final): (1) hapus sampai sisa 2 terakhir; (2) setuju `.vercelignore` + Ignore Build Step; (3) media tetap `public/`.
- Skala tugas ini kecil (ops + config), jadi standar enterprise (TOGAF/ODA penuh) tidak diterapkan — proporsional sesuai `AGENTS.md` §3. Tidak ada perubahan skema database; migrasi tetap di submodule `supabase/` dan tidak disentuh.
- File kunci untuk pelaksana: `next.config.ts:63-75` (tambah `experimental.optimizePackageImports`), `package.json:49` (`sharp`, investigasi T3), `vercel.json` (tidak perlu diubah — tidak ada kolom ignore di file ini, setting ada di dashboard), `.gitmodules:1-3` (konteks submodule).
- Estimasi hasil akhir: 2 × ~178 MB ≈ 0.36 GB (+ kompresi Vercel) → < 1 GB; bila T3 berhasil menurunkan per-deploy, hasil lebih kecil lagi.
- Pelaksana wajib membaca `AGENTS.md` repo (aturan gate final + auto commit-push + Env Guard secret) sebelum T5.
