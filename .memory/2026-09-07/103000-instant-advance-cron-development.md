# Advance cepat: UI verifikasi mulai, backend via cron

- Task: development terasa lama karena inline-run LLM di dalam server action (30 dtk-menit, bahkan timeout); UI cukup verifikasi "sudah dimulai".
- Akar: `advanceToDevelopment` menjalankan `advanceStage` inline; ironisnya `current_stage_started_at=now()` membuat guard cron 5 mnt TIDAK memungut sesi — inline satu-satunya eksekutor awal.
- Key files: `actions.ts` (hapus inline-run, transisi + backdate −10 mnt + log info; return <1 dtk), `messages/id+en.json` (banner jujur: draf bertahap di backend, refresh berkala, Resume bila macet).
- Decisions: tanpa polling/auto-refresh; cron pengeksekusi tunggal; trade-off draf pertama lebih lambat dari inline yang berhasil — diterima demi UI responsif.
- Verification: `typecheck` ✓, `lint` ✓, `275/275` tests ✓.
- Commit proposal: `feat(admin): instant advance with cron-backed development`
