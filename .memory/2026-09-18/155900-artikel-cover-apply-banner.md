# Artikel cover apply banner — A1+B1+B2 + gate

2026-09-18 sore. Cara ganti cover artikel publish via banner review selesai.

## Perubahan kode

**`src/lib/articles/actions.ts`** — aksi baru `applyDraftCoverToArticle(draftId, draftImageId)`:
- Gate admin + validasi keras: gambar harus ada, milik draf yang sama, post_index=0, status ready/selected (TOLAK pending/prompt_ready/failed), public_url non-empty, artikel publish ada.
- Update `articles.cover_image_url` + `updated_at` per locale terbit. HANYA 2 kolom — judul/isi tak tersentuh (bedanya dengan re-publish).
- Audit ke `content_research_logs` stage `cover_apply`.
- Revalidasi dua varian per locale (`/id/artikel/...` + `/en/articles/...`) + `/konten/review/[draftId]`.

**`src/lib/articles/actions-apply-cover.test.ts`** — 9 test mock Supabase (pola ala `runner.test.ts`): non-admin, kosong id, gambar hilang, draf lain, post_index salah, status belum ready, URL kosong, tanpa artikel publish, sukses 2 locale. 9/9 hijau.

**`src/components/content/ApplyCoverBanner.tsx`** — komponen klien: thumbnail live vs draft, badge Sinkron/Berbeda/LiveTanpaCover/DrafTanpaCover, tombol Terapkan (useTransition), pesan sukses + link live. Props serializable saja (no fungsi, pelajaran digest 2863325395).

**`src/app/[locale]/(admin)/konten/review/[draftId]/page.tsx`** — fetch tambah `cover_image_url` di publishedArticles, render banner hanya bila platform artikel + ada article terbit.

**i18n** — +10 key `content.review.coverBanner*` di id/en.

## Gate

`typecheck` ✓, `lint` ✓ (2 warning `<img>` admin-only, terima), `test` 869/869 ✓, `build` ✓. Commit `52f985b`.

## Next (belum dieksekusi)

Verifikasi manual e2e dev/staging:
1. Buat/dapatkan 1 draf artikel yang sudah publish.
2. Generate cover baru di review → Pilih sebagai cover draf (status `selected`).
3. Banner tampil `Berbeda` → klik `Terapkan cover draf ke artikel`.
4. Banner jadi `Sinkron` + muncul pesan + link `Lihat artikel live`.
5. Klik link → URL artikel live <60 detik harus tunjukkan cover baru (revalidasi locale works).
6. Kasus tolak: klik tanpa cover draf (tombol disabled); artikel sudah di-archive (action return error ramah).
