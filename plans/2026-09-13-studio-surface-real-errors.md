# Studio: tampilkan pesan error asli (hindari masking Server Action)

Created: 2026-09-13 02:00:00

## Objective

Error dari Server Action Studio di production tersamar Next.js menjadi teks generik "An error occurred in the Server Components render. The specific message is omitted in production builds..." — pesan asli (mis. "Referensi harus dari upload...", "Prompt minimal 10 karakter") tak sampai ke user. Ubah action Studio yang dipanggil client agar mengembalikan hasil `{ok,data}|{ok,error}` alih-alih `throw`.

## Scope

- `src/lib/studio/actions.ts` — tambah tipe `StudioActionResult<T>` + `fail()`; bungkus `uploadStudioReference`, `enqueueStudioImage`, `enhanceStudioPrompt`, `retryFailedStudioImage`, `deleteStudioImage` (logika pindah ke `*Impl` agar error tertangkap rapi).
- `src/components/studio/StudioForm.tsx` — cek `res.ok` → tampilkan `res.error` (upload/enqueue/enhance).
- `src/components/studio/StudioHistory.tsx` — cek `res.ok` (retry/delete).
- Test: `actions.test.ts` (bentuk hasil + test pesan asli), `StudioUi.test.tsx` (mock bentuk baru).
- Tanpa migrasi DB.

## Milestones

1. Action kembalikan hasil + client render pesan
2. Gate → commit → push → memory

## Tasks

- [x] `StudioActionResult` + `fail()` + 5 action dibungkus
- [x] StudioForm + StudioHistory pakai `res.ok`
- [x] Test diperbarui + 1 test pesan asli
- [x] Gate: typecheck + lint + 527 tests hijau
- [ ] Commit + push origin/main
- [ ] Entri `.memory/` + update README

## Risks

- Mengubah signature action = breaking untuk pemanggil lama; sudah dicek seluruh pemanggil (hanya StudioForm/StudioHistory + test) dan diperbarui.
- `listUserImages`/`getStudioImage`/`getStudioQuota` sengaja TIDAK diubah (dipakai RSC/polling, bukan aksi user ber-feedback).
- `requireUser` masih throw, tapi sudah di dalam try → tertangkap jadi `ok:false`.

## Progress Log

- 2026-09-13 02:00:00 — Implementasi + gate hijau.

## Notes

- Alasan: Next.js menyamarkan error yang dilempar dari Server Action di production build (digest), jadi pola throw tidak bisa menampilkan pesan asli. Pola `{ok,error}` sama seperti `ActionResult` di `src/lib/content/actions.ts`.
- Ini juga memperbaiki UX saat error apa pun di masa depan (validasi, kuota, storage) — pesan asli selalu tampil.
