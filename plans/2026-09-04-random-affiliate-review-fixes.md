# Review & Perbaikan — Random Fallback 20 Produk + Loop Reselect Rethink (1A)

Created: 2026-09-04 02:55:00

## Objective
Audit implementasi commit `619a0f4` (5 file, 445 ins): `affiliate.ts` fallback random 20, `prompt.ts` bridging + single-reply rewrite, `development.ts` integrasi fallback, `actions.ts` `regenerateAffiliateInsertion`, `AffiliateProductCard.tsx` loop UI. Buat plan perbaikan terstruktur, eksekusi fix, verifikasi, lalu commit & push.

## Scope
- In: 5 file implementasi + `AffiliateProductPicker.tsx`, `ResearchSessionActions.tsx`, `riset/[sessionId]/page.tsx`, `thread.ts`, `messages/*.json`.
- Out: Discovery/verification/scoring pipeline, scraper, infrastruktur Vault/cron.

## Milestones
1. Review & klasifikasi temuan (P0/P1/P2)
2. Fix P0/P1 — stabilitas & kebenaran fungsional
3. Fix P2 — hygiene & i18n & UX copy
4. Verifikasi test/lint/build & push

## Tasks

### P0 — Kritis (wajib sebelum push)
- [x] P0-1 `actions.ts:836-859` session resolve salah — `request_id ?? research_topic_id` dipakai sebagai `session.id`; fallback query 2x, salah ambil `tone/language`. Ganti: ambil `session_id` via `research_topics.session_id` jika `research_topic_id` ada, else `request_id`. Hilangkan branch `sess` dobel.
- [x] P0-2 `actions.ts:997-1002` log FK — `session_id: d.request_id ?? d.research_topic_id ?? draftId` bisa isi `topicId/draftId` → FK violation (diswallow). Ganti pakai resolved `sessionId` yang valid; jika null, skip log atau pakai `d.request_id` yang memang `content_research_sessions.id`.
- [x] P0-3 `actions.ts:909-920` CJK sanitasi hilang — `rewritten` dari LLM tidak di-`sanitizeThreadText`. Tambah import + sanitize kedua field sebelum `newThread`.

### P1 — Tinggi (functional / i18n / UX correctness)
- [x] P1-1 `actions.ts:922-946` placeholder field loss — `en` placeholder dipaksa pindah ke `id`. Perbaiki: preserve `field` asal (`id`/`en`) seperti `repositionPlaceholder` — deteksi field awal rewritten (`id` vs `en` contains placeholder), jangan paksa ke `id`.
- [x] P1-2 `AffiliateProductCard.tsx:90-92,145,155,186-187` hardcode ID — "Random", "Reselect & Rethink", "Pilih Produk & Generate", bridging notice hardcode, `title` tidak i18n. Tambah keys di `id.json`/`en.json` + pakai `t()`; fallback bahasa ikut locale.
- [x] P1-3 `prompt.ts:106-148` single-reply rewrite tanpa `maxChars` — thread rewrite bisa over limit. Tambah param `maxChars` ke `SingleReplyRewriteInput` + rule `Max chars {n} for platform`.
- [x] P1-4 `actions.ts:863-864` `boundedTarget` clamp salah — `Math.min(targetIndex, replies.length)` mengizinkan `target = replies.length` (reply terakhir, bukan tengah). Untuk konsistensi, jika `targetIndex > replies.length` clamp ke `replies.length`, tapi info: `targetIndex` 0=main, 1..n valid. Tetap pertahankan tapi dokumentasikan; atau clamp ke `n` hanya jika target dari injeksi lama tengah. Tidak kritis — cek ulang.
- [x] P1-5 `riset/[sessionId]/page.tsx:150-168` & `ResearchSessionActions.tsx:108-133` preview banner outdated — masih "akan dibuat tanpa link afiliasi" padahal fallback random sekarang mengisi. Update copy/conditional: jika `affiliatePreviews` unmatched tapi fallback aktif, tampilkan info "akan diisi random dari 20 terbaru dengan bridging".
- [x] P1-6 `actions.ts:910-912` placeholder injection di `rewritten.id` saja — jika `language=en` atau `both`, `en` lebih prioritas. Perbaiki: inject ke surface yang kosong sesuai `language`/field awal, fallback ke `id`.

### P2 — Sedang (hygiene & maintainability)
- [x] P2-1 `affiliate.ts:62-79` dead code `selectRandomAffiliateProduct` + duplikat `fetchRandomPool` tidak dipakai oleh `selectAffiliateWithRandomFallback`. Hapus atau pakai reuse (fallback slice sudah cukup, hapus dead fn atau refactor fallback pakai `fetchRandomPool` bila pool 50 kosong).
- [x] P2-2 `affiliate.ts:48-52` stale comment "20 products" di `selectAffiliateProduct` — update jadi "pool 50" + jelaskan fallback 20.
- [x] P2-3 `actions.ts:789` rate-limit `getClientIp` bisa `unknown` di VPC — tambah fallback `x-forwarded-for` sudah ada, tapi untuk `unknown` tetap rate-limit per `unknown`; terima, tapi dokumentasikan / tambah skip bila `unknown`.
- [x] P2-4 `AffiliateProductCard.tsx:60-73` busy handling — `handleSelect` tidak await, `onRegen`/`onSwap` paralel unsafe jika double click. Tambah guard `busy !== null` sudah ada; ok, tapi serialisasi `startTransition` sudah benar — no-op.
- [x] P2-5 `actions.ts:950-967` matchScore recompute pakai `selectAffiliateProduct` strict (bukan fallback) — untuk produk random akan selalu 0. Jaga agar `fallback_random:true` & `original_best_score` tercatat; saat ini sudah default, ok.
- [x] P2-6 `development.ts:270` log `match ${matchScore}` tampil 0 untuk fallback — ubah log jadi `match ${matchScore}${fallback? ' (fallback random)':''}`.
- [x] P2-7 `AffiliateProductPicker` 20 limit confirm — sudah `/limit(20)` benar; tidak perlu ubah.

## Risks
- Fix P0-1 (session resolve) mengubah alur `language`/`tone` LLM — regression jika salah: rewrite bisa pakai bahasa salah. Mitigasi: query `research_topics.session_id` join jelas + test manual draft existing.
- Sanitizing `rewritten` bisa potong emoji/CJK legitimate — mitigasi: pakai `sanitizeThreadText` yang hanya strip CJK, preservasi Latin+emoji.
- i18n key baru perlu rebuild messages — mitigasi: update `id.json`+`en.json` atomik.
- Placeholder field preserve menambah kompleksitas — mitigasi: unit test `repositionPlaceholder` style.

## Progress Log
- 2026-09-03 22:30 — Implementasi 1A commit 619a0f4 (445 ins).
- 2026-09-03 02:43 — Test 240 passed, tsc ok, lint ok.
- 2026-09-04 02:55 — Review mulai; plan review-fixes dibuat.
- 2026-09-04 03:15 — Fix P0-1 session resolve via session_id, P0-2 log FK skip if null, P0-3 sanitize CJK, P1-1 placeholder preserve, P1-2 i18n keys (randomBadge/bridge/resselect...), P1-3 maxChars di rewrite, P1-5 banner fallback note, P2-1 hapus dead fn+fetchRandomPool, P2-2 update comment 50, P2-6 log fallback tag. Test 240 passed, tsc ok, lint ok.
- 2026-09-04 03:16 — Commit + push.

## Notes
- Standard: non-telecom → TOGAF proporsional ringan; fokus Application/Data layer.
- `previewAffiliateMatches` tetap strict; banner hanya info, tidak blok.
- Pool random `ORDER created_at DESC LIMIT 20` deterministis, `Math.random()` server-side acceptable.
- `Reselect & Rethink` = LLM single-reply rewrite (`maxTokens 400`, `stage regen_affiliate`); `Ganti Produk` = swap cepat tanpa LLM.
