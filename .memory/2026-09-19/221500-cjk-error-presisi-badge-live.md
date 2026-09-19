# Fix Pesan CJK Berulang — Error Presisi + Badge Live

Completed: 2026-09-19 malam (local time)

## Masalah

User klik Simpan di editor draf artikel selalu dapat pesan
"ada section yang memuat karakter CJK terlarang" — berulang-ulang.

## RCA (terverifikasi via SELECT read-only ke prod, tanpa ubah data)

- BUKAN false positive. Draf `36bb2945` locale `id` masih memuat **5 titik
  CJK di 3 field**: Section 2 (isi) `团战`, Section 3 (isi) `关闭` + `散热`,
  FAQ #4 q+a `夹式`. Locale `en` bersih. Judul masih typo `Lemat`.
- Gate `updateArticleDraft` menolak save selama masih ada 1 titik pun, dan
  semua titik harus bersih dalam **1x simpan** (patch = full array).
  Pesan generik tak menunjukkan lokasi → user perbaiki 1 titik, save,
  gagal lagi di titik lain → kesan "setiap klik simpan gagal".
- Gap tambahan: identifikasi error tak memeriksa `meta_title`/`meta_desc`
  (padahal `parseArticleLang` menolak CJK di sana) + typo `validasi gaga`.

## Perubahan

- `src/lib/articles/actions.ts` — blok identifikasi CJK di
  `updateArticleDraft` ditulis ulang: cek array gabungan (bukan hanya
  `patch.*`), pesan presisi `Section N (isi/judul) "X" (…konteks…)` /
  `FAQ #N (pertanyaan/jawaban) …` / judul / slug / excerpt / meta_title /
  meta_desc + helper `asText` anti-throw untuk input non-string.
- `src/components/content/ArticleDraftCard.tsx` — komponen `CjkBadge`
  (badge merah live per field pakai `findCjkHit`) + banner penghitung
  field tersisa di atas form edit; badge di judul, excerpt, tiap kartu
  section/FAQ, meta_title, meta_desc.
- `src/messages/id.json`, `src/messages/en.json` — kunci baru
  `articleCjkWarn`, `articleCjkRemaining`.
- `src/lib/articles/actions-article-edit.test.ts` — 18 tests: assertion
  diperkuat (`Section 1` + `散`, `FAQ #2` + `夹`, `meta_title` + `散`).

## Verifikasi

- typecheck ✓, lint 0 errors, tests file 18/18 ✓
- suite penuh 952/953 — 1 gagal flaky `FeaturedProductBoard` spinner-timing
  (tak terkait perubahan; lolos 12/12 saat dijalankan sendiri)
- build ✓

## Tindak lanjut user (via UI, bukan SQL)

Di halaman review draf `36bb2945`, klik Sunting → badge merah kini
menunjukkan semua titik: Section 2 (`团战`→`teamfight`), Section 3
(`关闭`→`tutup`, `散热`→`pelepasan panas`), FAQ #4 (`夹式`→`model jepit`),
judul `Lemat`→`Lemot`. Bersihkan SEMUA dalam 1x Simpan.
