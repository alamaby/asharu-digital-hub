# Review Follow-up — Deep-link, Opener, Parse Resilience, 6+1 Replies (0244379)

Created: 2026-09-04 08:50:00

## Objective
Audit implementasi commit `0244379` (202 ins, 7 file): deep-link draf riset, rule opener afiliasi ID/EN, toleransi schema string-coerce, per-topic guard + retry, default 7 reply (6 konten + 1 affiliate), `maxTokens 2200`, routing `[draftId]`. Klasifikasikan temuan, perbaiki, verifikasi, commit + push.

## Scope
- In: `page.tsx` riset detail, `routing.ts`, `prompt.ts`, `thread.ts`, `development.ts`, `development.test.ts`, `ContentRequestForm.tsx`, `process-legacy/route.ts`, `messages/*.json`.
- Out: discovery/verification/scoring, Vault/cron, scraper.

## Milestones
1. Klasifikasi temuan P0/P1/P2
2. Fix P0/P1
3. Fix P2 + tests
4. Verifikasi + push

## Tasks

### P0 — Kritis
- [x] P0-1 `thread.ts:124-143` `normalizePlaceholder` asumsi `{id,en}` — diverifikasi: `normalizePlaceholder(t)` hanya dipanggil pasca-zod (`threadSchema` sudah coerce string→object), jadi tidak ada path string mentah. Tidak perlu guard tambahan; ditutup via test regresi string-coerce.
- [x] P0-2 `development.ts:130-147` after-check basis salah — diperbaiki: query `.in(pendingTopics.map(id))`, hitung `pendingTopics.filter(done).length`; jika 0 → `failed` dengan pesan jumlah pending.

### P1 — Tinggi
- [x] P1-1 `thread.ts:95` backstop opener ditempel di tengah — diperbaiki: pisah `BASA_BASI_OPENER/BODY(_EN)`, prepend `${opener} ${lowered(target)} ${body}` agar reply diawali opener; bare-link fallback ke template penuh.
- [x] P1-2 `process-legacy/route.ts` samakan 6+1 — `targetReplyCount: 7` untuk threads/twitter + `maxTokens: 2200` (opener ikut otomatis via `buildThreadPrompt`).
- [x] P1-3 `ContentRequestForm.tsx:45` default `'6'`→`'7'` + hint ID/EN "6 konten + 1 affiliate = 7".
- [x] P1-4 `prompt.ts:51` guard N kecil — `n>=3` formula 6+1, `0<n<3` fallback rule generik (tanpa "0 CONTENT").
- [x] P1-5 `development.ts:222-250` retry saat attempt-1 throw — attempt-1 `.catch(()=>null)` + `activeLlm` tracking (meta dari attempt yang sukses); `resolvedLlm` dipakai untuk provider/model/meta.
- [x] P1-6 `development.ts:140` `newDraftCount` basis — gabung fix P0-2.

### P2 — Sedang
- [x] P2-1 `development.test.ts` cover baru: normalize-backstop inject placeholder, 7-reply middle idx, opener prefix, opener rule di thread+rewrite prompt, guard N=1, regresi string-coerce 2aa5be7d.
- [x] P2-2 `routing.ts` EN `/content/review/[draftId]` — `tsc OK` + tidak ada konflik list (exact match); no code change tambahan.
- [x] P2-3 `page.tsx` "Lihat semua →" hardcode — key `viewAllReview` ID/EN + `t()`.
- [x] P2-4 `thread.ts:33-35` komentar backstop — selaraskan (opener/body split + prepend).
- [x] P2-5 `development.ts` magic 6/7 — `export const CONTENT_REPLIES/TOTAL_REPLIES` module-level.

## Risks
- Ubah `repositionPlaceholder` prepend opener bisa pecah 28 test existing — mitigasi: jalankan test dulu, update ekspektasi seperlunya.
- Default form 6→7 mengubah perilaku user existing — mitigasi: hanya default; custom tetap dihormati + guard P1-4.
- Legacy `maxTokens` + default 7 menaikkan biaya/token jalur lama — mitigasi: legacy cron 5 mnt, batasi 5 req; acceptable.
- `newDraftCount` basis pending-only mengubah status failed edge case — mitigasi: test logika manual via existing data.

## Progress Log
- 2026-09-04 08:40 — Commit 0244379 push (202 ins).
- 2026-09-04 08:50 — Review follow-up mulai; plan dibuat.
- 2026-09-04 10:30 — Fix selesai: P0-2 pending-basis, P1-1 prepend opener, P1-2 legacy 7+2200, P1-3 default 7, P1-4 guard N, P1-5 retry-catch+activeLlm, P2 i18n/tests/const. `npm test` 249/249 passed, `tsc OK`, `next lint OK`.

## Notes
- TOGAF proporsional ringan (Application/Data).
- Verifikasi akhir: `npm test` (target 245+), `tsc --noEmit`, `next lint`, commit Conventional Commits, push origin main.
