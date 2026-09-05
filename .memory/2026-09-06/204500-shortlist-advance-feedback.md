# Shortlist/advance: feedback working/success/error

- Task: shortlist + lanjut development tanpa feedback jelas (proses/selesai/berhasil/gagal).
- Root cause: `ResearchSessionActions` hanya `aria-busy` tanpa visual, tanpa pesan sukses, error mentah; advance inline bisa 30-90 dtk+ (chunking 6 pasangan/tick) dan status tetap developing setelahnya.
- Key files: `src/components/admin/ResearchSessionActions.tsx` (state notice working/success per aksi + jumlah, spinner tombol, error ramah + details teknis, reset pilihan usai sukses), `src/messages/id+en.json` (11 keys `status*` di `admin.research`).
- Decisions: pola sama kartu afiliasi (banner inline); banner advance jelaskan batch + cron + Resume bila macet; tanpa polling real-time (progres via refresh + log).
- Verification: `typecheck` ✓, `lint` ✓, `267/267` tests ✓.
- Commit proposal: `feat(admin): clear shortlist advance feedback with progress note`
