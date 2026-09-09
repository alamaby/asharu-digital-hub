# Threads Semi-Otomatis: Approve via Server Action + Badge Antrean

## Task
Unblock pipeline konten yang sudah direview: approve langsung enqueue idempoten ke `social_post_queue`, tampil badge antrean di review, salin per-post tetap via CopyButton, tandai-posted manual via URL di /admin/sosial — fallback saat OAuth Meta invite tak sync ke Active (full-otomatis ditunda).

## Key files changed
- `src/components/content/ContentDraftCard.tsx` + `.test.tsx` — Setujui (`approved`) dialihkan dari `createSupabaseBrowser().update(status)` ke server action `approveDraftAndQueue(draftId, lang)` (optimistic + rollback + catatan jadwal + badge antrean); tolak (`rejected`) tetap update langsung; badge queue via prop `queue {status,scheduled_at,posted_url}` + catatan `approveQueued/approveNoQueue`.
- `src/app/[locale]/konten/review/[draftId]/page.tsx` — ambil `social_post_queue` (service_role) untuk prop `queue` ke kartu.
- `src/lib/social/actions.ts` — `markQueuePosted(queueId, FormData)` admin-only (validasi `https://www.threads.com/…`, hanya `queued/posting/failed` → `posted` + `posted_url/posted_at`); valid `FormData` (`postedUrl`) agar bind-able di `<form action={markQueuePosted.bind…}>`.
- `src/app/[locale]/admin/sosial/page.tsx` — form tandai-posted manual per baris antrean (hidden label + input url + submit), di bawah link `Lihat postingan`.
- `src/messages/id.json` + `en.json` — 4 kunci baru: `approveQueueNote`, `approveQueued`, `approveNoQueue`, `queueBadge` (parity test lulus).
- `plans/2026-09-06-threads-auto-post-queue.md` — centang tasks + 2 entri progress log (unblock + implementasi).

## Decisions
- Semi-otomatis sebagai unblock resmi saat tester invite 24 jam tak sync (Roles kosong, Active kosong) — full-otomatis tetap plan C (App Review + Live).
- Bahasa antrean diambil dari tab aktif review (`lang`) + resolver `effectiveLang(config, lang)`.
- Typecheck/lint hijau, 315 tests hijau (40 files).

## Assumptions / risks
- Tidak menambah kolom/aplikasi; `social_post_queue` sudah ada dari migrasi sebelumnya.
- OAuth blokir: worker pg_cron tetap no-op (`is_enabled=false`); antrean tetap bisa ditandai manual.

## Verification
- `npm run typecheck` ✓, `npm run lint` ✓, `npm test` 315 passed (40 files) ✓.
- Artefak: `src/components/content/ContentDraftCard.tsx:1` exports `DraftQueueInfo`.

## Commit
- (pending) `feat(social): semi-auto approve-to-queue plus manual posted mark`

## Related
- `plans/2026-09-06-threads-auto-post-queue.md`
- Fork: Threads Threads API (invite sync bug), locally: `supabase/migrations/20260907000001_social_auto_post.sql`
