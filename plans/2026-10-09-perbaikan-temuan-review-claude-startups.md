# Perbaikan Temuan Review Claude Startups (O1–O3)

Created: 2026-10-09 13:20:00

## Objective

Menutup 3 temuan review `main` (`a70d1a3`) tanpa mengubah perilaku produk: (O1) copy internal `approveQueueNote` yang terdengar seperti klaim auto-publish, (O2) kata `partnerships` di halaman about EN yang bisa dibaca sebagai klaim kemitraan, (O3) warning build `metadataBase ... /_not-found`. Hasil akhir: seluruh copy publik + internal konsisten dengan narasi jujur (tanpa auto-post, tanpa klaim kemitraan), build bersih dari warning, gate tetap hijau.

## Scope

- Masuk:
  - O1: reword `approveQueueNote` ID+EN di `src/messages/id.json:507`, `src/messages/en.json:507` (tampil di `src/components/content/ContentDraftCard.tsx:413-415` saat `draft.status === 'approved'`).
  - O2: reword `contactBody` EN di `src/messages/en.json:310` (render di `src/app/[locale]/(public)/about/page.tsx:69`).
  - O3: investigasi + perbaikan warning `metadataBase` untuk rute `/_not-found` (tidak ada `src/app/layout.tsx` — lihat Notes).
  - Verifikasi: `validate:messages`, `typecheck`, `lint`, `test`, `build` + scan secret.
- Keluar (dilarang di plan ini):
  - Perubahan perilaku worker/antrean (`approveQueued`, `approveNoQueue`, queue API, cron) — copy saja.
  - Migrasi Supabase, `ANTHROPIC_API_KEY`, auto-post IG/TikTok, klaim metrik/testimoni.
  - Refactor komponen, perubahan kosmetik di luar 3 string + layout root.
  - Melemahkan test / menonaktifkan validasi agar gate lulus.

## Milestones

1. M1 — Copy aman (O2 lalu O1, risiko terendah dulu) + parity messages hijau.
2. M2 — Build warning bersih (O3, risiko tertinggi, investigasi dulu).
3. M3 — Gate penuh + commit + push.

## Tasks

- [ ] T0: baseline. Catat `git status --short` (harus bersih), `git log --oneline -3` (HEAD harus `a70d1a3`). Jangan sentuh file di luar daftar tugas.
- [ ] T1 (O2): di `src/messages/en.json:310` ganti `"For questions, data corrections, or partnerships, please use the contact channels listed on the homepage."` menjadi `"For questions, data corrections, or collaboration inquiries, please use the contact channels listed on the homepage."`. ID (`id.json:310`, `"kerja sama"`) TIDAK diubah (generik, rendah risiko). Acceptance: `npm run validate:messages` PASS; `grep -rn "partnership" src/messages src/app` tidak lagi mengenai halaman publik (sisa yang boleh: teks legal/disclosure tentang program afiliasi bila ada — dokumentasikan bila ditemukan).
- [ ] T2 (O1): di `src/messages/id.json:507` ganti `"Menyetujui akan menjadwalkan posting otomatis."` menjadi `"Menyetujui akan memasukkan draf ke antrean posting internal (diproses worker bila aktif)."`; di `src/messages/en.json:507` ganti `"Approving will schedule auto-posting."` menjadi `"Approving adds the draft to the internal posting queue (processed by the worker when enabled)."` `approveQueued`/`approveNoQueue` TIDAK diubah (menyatakan status antrean dengan jujur). Acceptance: buka `/konten/review` (admin) — note di bawah kartu approved berbunyi sesuai string baru ID/EN; halaman publik `/id/digital-hub` tetap berbunyi `Tanpa terbit otomatis`; `validate:messages` PASS; `src/components/content/ContentDraftCard.test.tsx` tetap hijau tanpa diubah (tidak ada test yang meng-assert string lama — terkonfirmasi via grep, hanya `ContentDraftCard.tsx:414` yang memakai key).
- [ ] T3 (O3 investigasi): jawab dulu sebelum mengubah apa pun — (a) mengapa tidak ada `src/app/layout.tsx` (glob hanya menemukan layout di bawah `[locale]/`, padahal build lolos), (b) file mana yang mengontrol `/_not-found` (cek `src/app/**/_not-found*` dan `not-found.tsx` di grup `(public)`), (c) dari mana 6 warning `metadataBase` berasal (satu per kombinasi locale/rute?). Tulis jawaban 3 baris di Progress Log. Larangan: jangan membuat `src/app/layout.tsx` baru sebelum (a)–(c) terjawab.
- [ ] T4 (O3 fix, hanya bila T3 memberi kandidat aman): terapkan SATU perubahan terkecil (preferensi: `metadataBase: new URL(env.siteUrl)` di layout yang menaungi `/_not-found`, tanpa mengubah title/description/OG). Acceptance: `npm run build` tidak lagi mencetak `metadataBase ... using "http://localhost:3000"`; jumlah halaman (±127) dan rute `/id/digital-hub`, `/en/digital-hub`, OG images tidak berubah. Bila kandidat fix menyentuh layout yang dipakai semua halaman dan build menambah warning baru → revert, catat sebagai blocker, O3 ditunda (O1+O2 tetap dikirim).
- [ ] T5: gate penuh berurutan — `npm run typecheck` → `npm run lint` (`--max-warnings=0`) → `npm test` (harus tetap 135 files / 1344 tests, tanpa test yang dilemahkan) → `npm run build` → `npm run validate:messages`. Setiap edit setelah satu gate hijau MEMBATALKAN gate itu (aturan `AGENTS.md` insiden `c3afbc5`) — re-run dari gate yang batal.
- [ ] T6: final diff review — `git status --short`, `git diff` (hanya file tugas: dua `messages/*.json` + maksimal satu layout), scan `sb_secret_|sb_publishable_|CRON_SECRET=.+|sk-ant-` (yang boleh muncul hanya placeholder/dokumen/test, tanpa nilai real), pastikan tanpa `console.log`, debug, artefak `.next/dist/coverage`. Stage hanya file tugas.
- [ ] T7: commit + push. Pesan satu baris Conventional Commits, mis. `fix: clarify queue and contact copy, silence not-found metadataBase warning`. Dilarang `--no-verify`, force push, amend `a70d1a3`. Bila push ditolak (remote lebih baru): `git fetch`, `git log main..origin/main`, `git pull --no-rebase`, re-run T5, push lagi. Laporkan hash + file kunci.

## Risks

- O1 reword bisa ditafsirkan sebagai melemahkan makna antrean internal → mitigasi: kata `antrean/worker` dipertahankan, hanya kata `otomatis` yang dihapus; perilaku queue tidak disentuh.
- O2 EN `collaboration inquiries` vs ID `kerja sama` tidak literal → mitigasi: parity messages hanya mensyaratkan kesetaraan key, bukan terjemahan kata-per-kata (sudah pola existing); `validate:messages` + `messages.test.ts` sebagai juri.
- O3 menyentuh layout root berisiko memengaruhi semua halaman (risiko tertinggi, dikerjakan terakhir, dengan opsi revert-eksplisit di T4).
- Counter-argument: ketiga temuan ber-severity Info dan pre-existing — alternatif valid adalah menunda semuanya. Plan ini tetap mengeksekusi karena biaya copy-fix (T1–T2) mendekati nol sementara manfaatnya (konsistensi narasi untuk reviewer Anthropic) nyata; O3 dibatasi agar tidak menjadi proyek layout.

## Progress Log

- 2026-10-09 13:20:00 — Plan ditulis dari review `a70d1a3` (typecheck ✓, lint 0 warning ✓, 1344 tests ✓, build 127 pages ✓, GitHub metadata PUBLIC ✓). Belum ada eksekusi T0–T7.

## Notes

- Temuan sumber (review 2026-10-09): O1 `en.json:507`/`id.json:507` via `ContentDraftCard.tsx:414` (internal, status approved); O2 `en.json:310` via `about/page.tsx:69`; O3 warning build `metadataBase ... /_not-found` (kosmetik, sudah dicatat di README trade-offs #7).
- Perintah standar: `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, `npm run validate:messages`. Format script tidak ada (baseline).
- Jangan `cat .env.local`; jangan commit `.env*`, `sb_secret_*`, `sb_publishable_*`, `CRON_SECRET`, Vault secret. Submodule `supabase/` tidak tersentuh plan ini.
- Satu file = satu plan. Update `## Tasks` (`- [x]`) + `## Progress Log` per milestone saat eksekusi; jangan campur plan lain ke file ini.
