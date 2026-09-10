# Review Multi-Select + Logs Image + Admin Image/Account-ID

Tanggal: 2026-09-10 14:30 (local). Plan: `plans/2026-09-10-review-multiselect-logs-image-admin.md`. Keputusan user: section image di /admin/visual, account_id LLM + image.

## Yang diminta & dikerjakan
1. **Review multi-select** — Status/Provider/Platform jadi dropdown checkbox (`?status=a,b&...`), tiru pola admin/konten (state + sync navigasi + Pilih semua/Hapus). Badge platform per kartu `{platform_slug ?? llm_meta.platform ?? all}`. Bonus: tanggal kartu ikut zona user (sebelumnya toLocaleString tanpa tz).
2. **Logs image** — tab "Image" baru baca `content_draft_images` (tanpa tabel baru): thumbnail + Lihat, provider/model, link draf, status, prompt, error; filter provider/status. Trade-off: riwayat hasil, bukan log HTTP mentah (latency per-call tak tersimpan).
3. **Waktu logs WIB** — 3 tab pakai `getDisplayTimezone()` + `formatDateTimeSeconds` (profil → USER_TZ device → Asia/Jakarta). Sebelumnya `toLocaleString` tanpa tz = UTC di Vercel.
4. **Urutan provider/model image** — section di `/admin/visual` (Provider/Model/Key + drag + rollback + toggle + tambah + Suspense), aksi `image-admin-actions.ts` (Vault by-name + suffix + label meniru seed).
5. **Account-ID cloudflare** — editor merge `config` + field pair di form tambah key (LLM + image); validasi 32-hex; identifier tampil plaintext seperti base_url.

## File diubah
- `src/lib/admin/review-list.ts` (+test), `konten/review/page.tsx`, `ReviewListClient.tsx`
- `admin/llm/logs/page.tsx`, `admin/llm/[providerId]/page.tsx`, `admin/visual/page.tsx`
- `src/lib/admin/image-admin-actions.ts` (baru), `llm-actions.ts` (+account), `components/admin/visual/ImageBoards.tsx` + `ImageForms.tsx` (baru), `components/admin/llm/LlmForms.tsx` (+AccountIdForm/pair)

## Verifikasi
- `typecheck` ✓, `lint` ✓, `npm test` 376/376 (50 files) ✓.
- Belum QA manual: filter multi review, tab Image + jam, drag urutan image, simpan account_id (cek config), tambah key image (cek Vault + fallback decrypt).

## Commit
- `feat(review,logs,visual): multi-select badge tab-image admin-image account-id`
