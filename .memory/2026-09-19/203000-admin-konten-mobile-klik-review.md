# Admin Konten Mobile: Kartu Bisa Di-tap ke Review + Touch Target + Hapus Dead Code

Timestamp: 2026-09-19 20:30 (local time)

## Task

Implementasi plan `plans/2026-09-19-admin-konten-mobile-klik-review.md`:
- Mobile kartu draf di `/admin/konten` kini bisa di-tap → `/konten/review/[draftId]`.
- Sel aksi desktop table → ber-ID untuk draf, "—" untuk request.
- `RecentDraftsList` dashboard → href ber-ID draf.
- Touch target ≥44px (`min-h-touch`) pada tombol sort, platform select-all/clear, Reset, PaginationLink, FilterSelect, MultiSelect buttons, Terapkan, Reset, Prev/Next, Edit, Reject, CopyButton.
- Hapus dead code `src/components/content/DraftListCard.tsx`.

## Key Files Changed

- `src/components/admin/KontenList.tsx` — blok mobile `md:hidden` (L323-366), sel aksi desktop (L297-308), kontrol kecil
- `src/components/admin/DashboardCards.tsx` — `RecentDraftsList` (L237)
- `src/components/admin/ReviewListClient.tsx` — tombol filter/pagination (L59, L69-80, L196-197, L256-257)
- `src/components/content/ContentDraftCard.tsx` — tombol Edit (L296) + Reject (L385)
- `src/components/content/CopyButton.tsx` — tombol copy (L33)
- Dihapus: `src/components/content/DraftListCard.tsx` (tidak ada import dari mana pun)

## Technical Decisions

- Menggunakan pola link i18n yang sudah terbukti: `{ pathname: '/konten/review/[draftId]', params: { draftId: ... } }` dari `admin/llm/logs/page.tsx:225`.
- Tombol `.btn-primary`/. `.btn-secondary` tidak disentuh (sudah ada `min-h-touch` di `globals.css`).
- Baris `kind === 'request'` di mobile dan desktop tetap non-link ("—") sesuai keputusan user awal.

## Gate

- `npm run typecheck` ✓
- `npm run lint` — 0 error, 10 warning (pre-existing, bukan dari task ini)
- `npm test` — 951 passed (sama dengan gate sebelumnya)
- `npm run build` ✓ (82 routes, metadataBase warning pre-existing)

## Commit

`3e343ca` → `main` @ origin/main

## Blockers / Open Items

- [ ] Verifikasi manual live: dev server / viewport ~360px → tap kartu draf harus masuk `/id/konten/review/[draftId]`; baris request tidak merespons tap; desktop link "Lihat" masuk detail draf; RecentDrafts list membuka detail.

## Notes

Rencana juga menyebut P2 touch target di `ResearchListClient`/detail riset, tapi out-of-scope untuk task ini.
