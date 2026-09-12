# Studio riwayat: UUID + icon Lihat + konfirmasi hapus

- **Task:** (1) Tampilkan UUID tiap record generate agar mudah identifikasi (sebelumnya ID tak terlihat di UI). (2) Aksi "Lihat" belum ada icon (inkonsisten vs Unduh/Ulangi/Hapus yang ber-icon). (3) Hapus langsung eksekusi tanpa konfirmasi — wajib konfirmasi dulu.
- **UX hapus:** dua-tahap inline (bukan `window.confirm` agar testable + konsisten mobile): klik "Hapus" → tombol berubah jadi "Yakin hapus?" (merah tegas) + "Batal" → klik kedua eksekusi, "Batal" reset. State `confirmDeleteId` dibersihkan di `finally` aksi hapus.

## Key Files Changed

- `src/components/studio/StudioHistory.tsx` — tombol UUID mono per baris (`ID <8-char>` + tooltip UUID penuh + salin via `copyId`, state centang terpisah `id:<uuid>` agar tak bentrok indikator salin-prompt); icon `Eye` lucide di link Lihat; hapus dua-tahap + tombol Batal.
- `src/messages/{id,en}.json` — key baru namespace `studio.history`: `idLabel`, `copyId`, `deleteConfirm`, `cancelDelete`.
- `src/components/studio/StudioUi.test.tsx` — 4 test baru: UUID tampil + title penuh, Lihat punya `<svg>`, klik Hapus pertama tak memanggil `deleteStudioImage` + muncul konfirmasi, Batal membatalkan + klik kedua eksekusi dengan id benar.

## Technical / Business Decisions

- UUID tampil 8 karakter pertama (cukup untuk identifikasi visual antar-baris) + full di `title` + salin penuh sekali klik — kompromi kerapian vs kebutuhan mapping ke DB (`user_image_generations.id`).
- Tanpa `window.confirm`: pola inline selaras tombol busy/disabled existing + bisa diuji RTL.

## Assumptions / Risks

- Tak ada.

## Verification

- `npm run typecheck` hijau; `npm run lint` hijau; `npm test` 519 tests hijau (63 file; StudioUi 20 tests).

## Commit

- `feat(studio): tampilkan UUID + icon Lihat + konfirmasi hapus di riwayat` (`537fcd0`, pushed origin/main, 4 files +117/-6).
