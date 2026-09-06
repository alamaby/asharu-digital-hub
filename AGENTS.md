# AGENTS.md — Asharu Digital Hub (repo-local agent instructions)

Instruksi ini adalah perintah eksplisit dan permanen dari pemilik repo,
berlaku untuk setiap sesi kerja agent di repo ini.

## 1. Auto Commit + Push Saat Selesai

- Setiap tugas yang selesai (implementasi, fix, atau perubahan kode/config
  yang sudah lolos gate) WAJIB langsung di-commit dan di-push — tanpa
  menunggu instruksi "commit push" tambahan dari user.
- Gate sebelum commit: `npm run typecheck`, `npm run lint`, `npm test`
  harus hijau. Jangan commit dalam keadaan merah kecuali user meminta.
- Format pesan: Conventional Commits, satu baris, tanpa trailer
  `Co-authored-by:` (termasuk bot/agent).
- Sebelum commit: `git status --short`, `git diff`, `git log --oneline -10`;
  stage hanya file yang dimaksud. Jangan pernah commit secret
  (`.env`, `.env.local`, key `sb_secret_*`/`sb_publishable_*`,
  `CRON_SECRET`, Vault secret) — scan diff dulu bila ragu.
- Submodule `supabase/`: commit dan push migrasi di submodule DULU,
  baru commit parent dengan pointer submodule yang baru.
- Jika push ditolak karena remote lebih baru: `git fetch`, periksa
  `git log main..origin/main`, gabungkan (`git pull --no-rebase`),
  pastikan gate tetap hijau, lalu push lagi.
- Setelah push: laporkan ringkasan commit (hash + pesan + file kunci)
  kepada user.

## 2. Batasan

- Aturan ini TIDAK berlaku bila user eksplisit berkata "jangan commit/push"
  untuk tugas tersebut — instruksi satu kali selalu menang atas aturan ini.
- Aturan ini TIDAK berlaku saat Plan Mode aktif (read-only).
