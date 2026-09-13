# Studio: tampilkan pesan error asli (hindari masking Server Action)

- **Task:** Error Studio di production tersamar Next.js jadi "An error occurred in the Server Components render..." — user tak pernah lihat pesan asli. Ubah action yang dipanggil client agar mengembalikan hasil, bukan throw.
- **Akar:** Next.js production mengganti pesan error yang **dilempar** dari Server Action dengan digest generik (proteksi kebocoran). Pola `throw new Error(pesanIndonesia)` tak bisa tampil di UI.

## Key Files Changed

- `src/lib/studio/actions.ts` — tipe `StudioActionResult<T> = {ok:true,data}|{ok:false,error}` + `fail()`; 5 action client-facing dibungkus try/catch via `*Impl`: `uploadStudioReference`, `enqueueStudioImage`, `enhanceStudioPrompt`, `retryFailedStudioImage`, `deleteStudioImage`. Sama pola `ActionResult` di `src/lib/content/actions.ts`.
- `src/components/studio/StudioForm.tsx` — `res.ok` cek di upload referensi, enqueue, enhance → tampilkan `res.error`.
- `src/components/studio/StudioHistory.tsx` — `res.ok` cek di retry + delete.
- `src/lib/studio/actions.test.ts` — bentuk hasil baru + test "error validasi mengembalikan pesan asli sebagai data".
- `src/components/studio/StudioUi.test.tsx` — mock action bentuk `{ok,data}` (+ `uploadStudioReference`).
- `plans/2026-09-13-studio-surface-real-errors.md` — plan + progress log.

## Technical / Business Decisions

- Hanya action yang dipicu user + ber-feedback yang diubah. `listUserImages`/`getStudioImage`/`getStudioQuota` (RSC/polling) tetap throw.
- `requireUser` tetap throw tapi dipanggil di dalam try → tertangkap jadi `ok:false`.
- Tanpa `useActionState`; tetap pemanggilan langsung + state notice existing (minim churn).

## Assumptions / Risks

- Perubahan signature = breaking; seluruh pemanggil (hanya StudioForm/StudioHistory + test) sudah dicek & diperbarui via grep.

## Verification

- `npm run typecheck` hijau; `npm run lint` hijau; `npm test` 527 tests hijau (63 file).
- [USER ACTION] Setelah deploy: error apa pun di Studio (mis. referensi/validasi/kuota) kini menampilkan pesan asli berbahasa Indonesia, bukan teks digest generik.

## Commit

- `fix(studio): kembalikan pesan error asli dari server action, bukan digest generik` (`b222157`, pushed origin/main, 6 files +177/-36).
