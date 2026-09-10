# Review Multi-Select + Logs Image + Admin Image/Account-ID

Created: 2026-09-10 14:30:00

## Objective
6 permintaan: (A) filter Status/Provider/Platform multi + badge platform di konten/review; (B) tab log image + waktu device/GMT+7 di admin/llm/logs; (C) atur urutan provider/model image + input account_id cloudflare (LLM + image). Keputusan user: section di /admin/visual, account_id LLM + image.

## Scope
- Review: `review-list.ts` (+test), `review/page.tsx`, `ReviewListClient.tsx`
- Logs: `llm/logs/page.tsx` (tab Image + timezone 3 tab)
- Visual: `image-admin-actions.ts`, `ImageBoards.tsx`, `ImageForms.tsx`, section provider/model/key
- Account-ID: `llm-actions` (update + pair saat add key), `AccountIdForm`, detail provider LLM

## Milestones
1. Review multi + badge
2. Logs image + WIB
3. Admin image + account pair

## Tasks
- [x] Helper `parseMultiParam/serializeMultiParam/paginateReview` + 4 test
- [x] Review: `.in()` status/provider(jsonb)/platform; explicit select + platform_slug; fallback pertahankan filter; badge `{platform_slug ?? llm_meta.platform ?? all}`; tanggal via getDisplayTimezone
- [x] Logs: tab Image (content_draft_images + thumbnail + link review + filter provider/status); 3 tab pakai formatDateTimeSeconds(tz user)
- [x] Visual: section Provider/Model/Key image (drag+rollback+toggle+notice+Suspense); add model/key (Vault by-name + suffix + label); replace key
- [x] Account-ID cloudflare LLM + image: editor merge config + field pair di form tambah key; validasi 32-hex
- [x] Gate: typecheck/lint/376 tests hijau

## Risks
- `.in()` pada `llm_meta->>provider` diyakini didukung PostgREST; bila gagal ada fallback berfilter + notice (terverifikasi pola, bukan live).
- Tanpa migrasi DB (semua tabel sudah ada).
- Ulangi manual image tak terbatas (eksplisit per klik; diterima sebelumnya).

## Progress Log
- 2026-09-10 14:30:00 — SELESAI & gate hijau. Parent-only commit (tanpa perubahan submodule).

## Notes
- C2M/TM Forum tidak relevan (admin tooling internal).
- account_id = identifier (plaintext di config, seperti base_url) — bukan secret.
