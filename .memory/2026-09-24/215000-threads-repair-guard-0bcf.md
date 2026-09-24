# Threads repair quality-guard + draf 0bcf2f6e

Created: 2026-09-24 21:50:00

## Problem

Draf threads prod `0bcf2f6e-cf39-4c21-83b4-0c1e6e4b0862` (sesi `68c0fd0b…`, run `73f081a2…`) tampil "kosong" di `/konten/review`: kolom `id` (Indonesia) berisi placeholder `main` dan `reply-1..6`, bukan konten. Kolom `en` sebenarnya utuh — default tab UI adalah ID, jadi yang terlihat kosong.

## Root cause (terverifikasi via MCP read-only prod)

- `generateAndInsertDraft` menjalankan repair emoji. Raw attempt-1 `llm_call_logs 2026-09-24 03:23:40.552913+00` (len 4128) **utuh** (7 post bilingual) tetapi punya duplicate-key `"id"` per reply — V8 `JSON.parse` diam-diam memakai key terakhir.
- Raw repair emoji `03:24:06.082304+00` (len 2155) mengembalikan kerangka: `{"id":"main",…}` / `{"id":"reply-N",…}` + teks Inggris. Kode lama (`development.ts:714-725`) **menerima apa pun** selama `parseThread` sukses, langsung menimpa thread bagus.
- `threadSchema` hanya `z.string().min(1)`, jadi `"main"`/`"reply-1"` lolos sebagai konten sah.
- Draf saudara satu topik normal: artikel `e9b23466…` (1206 kata, sudah published `id/5-outfit-semi-formal-kantor-elegan-nyaman`) + twitter `2721d135…`. Yang rusak hanya threads.

## Changes

- `src/lib/research/thread.ts`:
  - `PLACEHOLDER_POST_RE` + `isPlaceholderPostText(text)` — deteksi label post sebagai konten.
  - `isPlaceholderThread(thread)` — true bila `main.id` placeholder atau ≥50% field placeholder.
  - `shouldAcceptRepairThread(before, after)` — tolak skeleton, tolak kehilangan bahasa, tolak placeholder ≠ 1.
  - `hasExcessIdKeys(trimmed, postCount)` — heuristik duplicate-key `"id"` dengan ambang `postCount + 2`; dipakai di `parseThread` sebelum `normalizePlaceholder`.
  - `sanitizeThreadText`: replacement CJK `''` → `' '` (fix `anti过thinking` → `anti thinking`).
- `src/lib/research/development.ts`:
  - Repair emoji (:714) dan repair length (:773) membangun kandidat ke variabel sementara, hanya diterima bila `shouldAcceptRepairThread(...)` DAN gap/issues tidak bertambah; ditolak → log warn `quality guard` di `content_research_logs`.
  - Prompt repair: gap dideskripsikan `Balasan N (bahasa ID/EN)` + larangan eksplisit mengembalikan label `main`/`reply-N`/angka sebagai isi.
- `src/lib/research/development.test.ts`: 12 test baru (guard skeleton/bahasa hilang/repair valid, keputusan emoji & length, parse duplicate-key + skeleton + kontrol 7-reply, CJK mid-word).
- `src/components/admin/FeaturedProductBoard.test.tsx`: test `aria-busy` diubah dari `setTimeout(50ms)` ke deferred promise manual (flaky di bawah beban suite penuh).

## Decisions

- Ambang duplicate-key `postCount + 2` (bukan `> postCount`) untuk mengurangi false positive bila literal `"id":` muncul di dalam teks.
- Tidak mengubah `threadSchema`, `normalizePlaceholder`, `repositionPlaceholder`, `replacePlaceholders`, atau jalur retry (`:630-663`).
- CJK dipisah dengan spasi, bukan dihapus, agar tidak menyatu kata Latin.

## Verification

`npm run typecheck` ✓ · `npm run lint` ✓ 0 errors (12 warnings pre-existing) · `npm test` ✓ **1141/1141** · `npm run build` ✓ (93 routes).

## Open / next

- **S7 belum dieksekusi (prod read-only).** Skrip `scripts/repair-thread-0bcf.mjs` sudah siap dan hanya **mencetak** statement SQL; tidak menyentuh DB. Jalankan `node scripts/repair-thread-0bcf.mjs`, review output, lalu eksekusi SQL-nya manual. Klausa `AND generated_thread->'main'->>'id' = 'main'` membuat statement no-op bila sudah diperbaiki.
- OQ-1: setelah update, `replies[0].en` masih beraksen Indonesia ("Rasanya kamu …") — artefak duplicate-key LLM. Rekomendasi: terima, lalu edit manual di UI bila diinginkan.
- `StudioUi.test.tsx` masih flaky di bawah beban suite penuh (lolos 31/31 saat isolasi) — follow-up terpisah, di luar scope.
- Deploy Vercel diperlukan agar guard aktif di produksi.

## Related plan

`plans/2026-09-24-threads-emoji-repair-overwrite-fix.md`

## Commit proposal

`fix(research): reject degraded LLM repair output for threads`
