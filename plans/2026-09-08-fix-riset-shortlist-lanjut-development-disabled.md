# Fix riset shortlist — tombol "Lanjut ke Development" tetap disabled (8739330d)

Created: 2026-09-08 02:15:00

## Objective
Tombol "Lanjut ke Development" enabled segera setelah ≥1 topik benar-benar `shortlisted` di DB; banner `shortlistCount` konsisten dengan DB; gagal persist tidak tampil sebagai success palsu. Sesi `8739330d-ced1-4a8d-b7b2-1ccf7015b380` (mekanisme dua) jadi case rujukan.

## Scope
- `src/components/admin/ResearchSessionActions.tsx` — hitung, optimistic state, checked vs badge
- `src/lib/content/actions.ts` — `shortlistTopics`/`rejectTopics`/`advanceToDevelopment` validasi rows + `revalidatePath`
- `src/app/[locale]/admin/riset/[sessionId]/page.tsx` — cache/revalidate guard (jika perlu)
- `src/messages/id.json` `en.json` — copy (opsional)
- Tidak ubah skema DB (enum `pending/shortlisted/rejected` di `content_research_topics` sudah benar, `migrations/20260901000002_research_pipeline.sql:48`)

## Milestones
1. Investigasi DB sesi rujukan
2. Fix server (validasi rows affected + revalidate)
3. Fix client (single source of truth + optimistic update + pisah checked/badge)
4. Verifikasi gate + QA manual

## Tasks
- [x] T1 Investigasi DB sesi `8739330d-ced1-4a8d-b7b2-1ccf7015b380` — SELECT `content_research_sessions`/`topics`/`logs` (service role). Hasil: session `awaiting_selection` mekanisme `dua`, 5 topics `status=shortlisted` (rank1-5, `final_score=0`, `verification_status=pending`), log `admin shortlisted 5 topic(s)` @02:08:06 UTC, 0 drafts. Screenshot `0 topik shortlisted` vs banner `5 topik ditandai shortlist` + checkbox kosong + tombol disabled konsisten dengan divergensi ephemeral `selected.size` vs DB `status='shortlisted'` sebelum `router.refresh()` selesai / RSC belum re-fetch.
- [x] T2 Fix server `src/lib/content/actions.ts:808-854` — `shortlistTopics`/`rejectTopics` `.update(...).select('id')`, cek `data.length`, return `{success:false, error}` jika 0 rows atau parsial, log tetap, tambah `revalidatePath` untuk `/[locale]/admin/riset/[sessionId]` (dan `advanceToDevelopment`).
- [x] T3 Fix client `src/components/admin/ResearchSessionActions.tsx:52-294` — simpan `localTopics` dari props (sync `useEffect`), `shortlistedCount` derive dari `localTopics`; `onShortlist`/`onReject` optimistic patch `localTopics` pakai `updatedCount` sebelum `router.refresh()`; pisah `checked = selected.has(id)` vs badge/icon `shortlisted`; banner pakai `updatedCount`/DB count bukan `selected.size` mentah.
- [x] T4 Revalidasi RSC — `revalidatePath` di server actions cukup; tidak perlu `dynamic='force-dynamic'` tambahan (router.refresh + revalidatePath menutup stale RSC).
- [x] T5 Telemetri & i18n — `friendlyError` tangani `no rows`/`only ... updated`, surface `refresh & coba lagi`; `statusErrorNoShortlist` tetap untuk zero-case.
- [x] T6 Tests & QA — gate `npm run typecheck` ✅ `npm run lint` ✅ `npm test` ✅ (314 passed). QA manual sesi `8739330d` siap: DB 5 shortlisted, tombol `Lanjut ke Development` harus enabled setelah fix (optimistic localTopics + revalidate).

## Risks
- Optimistic update bisa bohong jika rollback — mitigasi: hanya optimistic setelah `updatedCount` valid, refresh overwrite.
- `.select('id')` tambah latency — worth untuk correctness; alternatif count head-check tetap race.
- Jika root cause adalah props stale akibat `retrySession` yang hapus topik, validasi rows akan surface error tapi user tetap harus re-select — UX perlu "topik tidak ditemukan, refresh".
- Scope dibatasi tanpa migrasi DB; jika perlu DB-enforced `shortlist_count` view, buat plan terpisah.

## Progress Log
- 2026-09-08 02:08 UTC — investigasi DB: 5 topics shortlisted, screenshot divergensi `0 vs 5` terkonfirmasi (race/refresh).
- 2026-09-08 02:15 UTC — plan dibuat; eksekusi T2-T6 pending (build mode).
- 2026-09-08 02:36 UTC — T2-T6 done: server validasi rows + revalidatePath, client optimistic localTopics + pisah checked vs badge, gate hijau (typecheck/lint/test 314).

## Notes
- Domain non-telecom — tidak pakai Oracle C2M/TM Forum ODA; acuan TOGAF ADM ringan (Data/Application) untuk state machine `pending→shortlisted/rejected→developing`.
- Gate sebelum commit (AGENTS.md): `npm run typecheck`, `npm run lint`, `npm test` hijau; Conventional Commits satu baris tanpa trailer; submodule `supabase/` commit dulu jika migrasi.
