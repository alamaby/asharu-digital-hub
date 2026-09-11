# Studio History Kronologis + Enhance Prompt

Created: 2026-09-12 00:00:00

## Objective
1. Riwayat `/studio` menjadi daftar kronologis: sort tanggal, filter per parameter enqueue, prompt penuh + copy/reuse, timestamp zona-user, detail log gagal.
2. Form Studio dapat tombol enhance prompt (LLM, side-by-side Terima/Batal) + pilihan provider/model LLM.

## Scope
- `src/lib/studio/{actions,types}.ts`, komponen `studio/*`, `studio/page.tsx`, key `studio.*` id/en.
- Tanpa migrasi DB (kolom filter sudah ada). Review (`ImageHistoryCarousel`) tidak disentuh.
- Di luar scope: pencarian teks prompt, paginasi "muat lagi".

## Milestones
1. Server: filter/sort `listUserImages` + `tz` di page.
2. UI riwayat daftar + copy/reuse + detail log.
3. Enhance prompt Studio end-to-end.
4. Tests + gate + commit.

## Tasks
- [x] Server filter/sort `listUserImages` + tz
- [x] Komponen daftar riwayat (toolbar, timestamp, prompt penuh, salin/pakai ulang, detail log `<details>`)
- [x] Aksi `enhanceStudioPrompt` + rate limit 30/jam terpisah
- [x] Picker LLM + tombol Sempurnakan + side-by-side Terima/Batal di `StudioForm`
- [x] i18n id/en
- [x] Tests + gate + commit

## Risks
- Toolbar banyak di mobile → grup primer + "Filter lanjutan".
- Mengganti carousel = kehilangan UX galeri (disengaja).
- Gate self-consistency enhance Studio belum teruji → longgarkan bila false-positive.
- Polling harus membawa filter aktif saat refresh.

## Progress Log
- 2026-09-12 — Rencana disetujui user ("Lanjut"); eksekusi dimulai.
- 2026-09-12 — SELESAI: carousel → daftar kronologis (`StudioHistory` rewrite), filter server-side (status/provider/model/style/subject/camera/aspect) + sort created/updated asc-desc, timestamp zona-user (`getDisplayTimezone` di page), prompt penuh + Salin + Pakai ulang (isi form + scroll top), detail log `<details>` (last_error/attempts/llm_meta/dimensi/timestamp). Enhance: `enhanceStudioPrompt` (stage enhance_image_prompt, bucket rate-limit `enhance_studio_prompt` 30/jam terpisah, builder `buildStudioEnhanceMessages` tanpa konteks post) + picker provider/model LLM + side-by-side Terima/Batal/Urungkan. i18n `studio.form.reused` + `studio.enhance.*` + `studio.history.*` (id/en parity; `prevSlide/nextSlide` dihapus). Tests: `actions.test.ts` baru (5) + `StudioUi.test.tsx` rewrite (12). Gate: typecheck ✓ lint ✓ 489/489 ✓ build 61 hlm ✓. Commit `8adb83d` pushed.

## Notes
- Bukan domain billing/rating → C2M/ODA tidak relevan.
