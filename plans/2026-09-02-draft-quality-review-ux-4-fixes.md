# Research Draft Quality & Review UX — 4 Fixes

Created: 2026-09-02 12:00:00

## Objective
Memperbaiki 4 isu dari sesi `b01339ae-93c5-4ffb-a9af-6b6b75694d46` (8 topik di-shortlist → hanya 1 draft; review numpuk; CJK garbled "巡航"; link afiliasi tidak menampilkan produk).

## Issue → Fix Mapping

### Issue #1 — Generate draft untuk semua topik shortlisted
- `development.ts:42` `.limit(1)` → hapus, ambil semua.
- Idempotency: cek draft eksisting per topic, skip yang sudah ada (cron re-pick aman).
- Loop sequential tiap topic tanpa draft → `generateAndInsertDraft`.
- Cron 300s, inline 60s, re-pick safety net.

### Issue #2 — Review: list → detail route
- List `/konten/review`: compact cards (snippet + status + chip produk + link → detail).
- Detail `/konten/review/[draftId]`: full ContentDraftCard + affiliate_products fetch + back link.

### Issue #3 — Sanitizer CJK + prompt rule
- `thread.ts` `sanitizeThreadText`: strip U+4E00–9FFF, U+3400–4DBF, U+3040–30FF, U+AC00–D7AF.
- Apply di `parseThread` setelah normalize, sebelum reposition.
- `prompt.ts`: rule anti-CJK + no-empty-name-slot.

### Issue #4 — Info produk + link clickable
- `development.ts`/`actions.ts`/`process-legacy`: simpan name/image/category/merchant di injection JSON.
- `ContentDraftCard.tsx:129`: URL plain `<p>` → `<a target="_blank">`.
- `AffiliateProductCard.tsx`: tampilkan image + nama.
- Review list/detail: fetch affiliate_products by friendly_code untuk draft lama.

## Tasks
- [x] Buat plan file ini
- [x] `thread.ts`: `sanitizeThreadText` + apply di parseThread + tests
- [x] `prompt.ts`: rule anti-CJK + no-empty-name-slot
- [x] `development.ts`: loop all shortlisted + idempotency + expand injection JSON
- [x] `actions.ts` swapAffiliateProduct: expand injection JSON + dynamic import advanceStage (server-only isolation)
- [x] `process-legacy/route.ts`: expand injection JSON
- [x] `ContentDraftCard.tsx`: URL clickable + pass product info
- [x] `AffiliateProductCard.tsx`: image + nama produk
- [x] `DraftListCard.tsx`: new compact card
- [x] `review/page.tsx`: list compact cards
- [x] `review/[draftId]/page.tsx`: new detail route
- [x] messages id/en: i18n keys
- [x] tests: sanitizer + idempotency skip
- [x] lint + typecheck + test
- [x] commit + push

## Risks
- #1 timeout: 8×40s=320s vs cron 300s → cron re-pick + idempotency skip jamin completion.
- #3 sanitizer over-strip: aman untuk ID/EN (CJK block). Nama merek Latin (Muji) tidak ter-strip.
- #4 denormalize: draft lama tetap simpan nama lama jika produk rename — acceptable (snapshot historis).
- #4 affiliate mismatch ASH-155 (piyama vs BBM): issue matching, di-flag plan terpisah.

## Progress Log
- 2026-09-02 12:00:00 — Plan dibuat setelah investigasi 4 isu via DB + codebase explorer. Konfirmasi: 8 shortlisted, 1 draft (limit(1)); CJK "巡航" di reply 4; injection JSON no name/image; URL plain text.
- 2026-09-02 14:10:00 — Implementasi lengkap: sanitizer CJK + prompt rule, loop all shortlisted + idempotency skip, expand injection JSON (dev/swap/legacy), ContentDraftCard URL clickable, AffiliateProductCard image+nama, DraftListCard compact, review list→detail route, i18n. Dynamic import advanceStage untuk isolasi server-only (pecah rantai import client bundle). lint ✓ typecheck ✓ test ✓ (34 file / 227 test, +6 sanitizer).
