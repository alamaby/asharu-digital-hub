# Artikel — Gambar Produk Afiliasi Hilang (Inline + Panel)

Created: 2026-09-15 19:05:00

## Objective

Perbaiki 2 laporan di `https://asharu.id/id/artikel/kipas-genggam-bandung-solusi-panas`:

1. Paragraf produk afiliasi inline belum ada image dari produk afiliasi.
2. Panel "Produk yang disebut di artikel ini" image produk tidak tampil.

Keputusan user (via clarifikasi 15 Sep):
- Inline: **tambah gambar** (bukan teks-only).
- Strategi: **Fallback saja** — tanpa melebarkan CSP, tanpa menunggu migrasi Storage DB-only selesai. Gambar asli tetap URL DB apa adanya; bila kosong/gagal load → placeholder lokal.

Hasil akhir yang diharapkan (contoh panel, mengikuti `AffiliateProductPicker.tsx:203-217`):

```tsx
<img
  src={affiliate.image || FALLBACK_IMAGE}
  alt={affiliate.name ?? title}
  width={64}
  height={64}
  loading="lazy"
  className="size-16 shrink-0 rounded-lg border border-line object-cover"
  onError={(event) => {
    const img = event.currentTarget;
    if (img.dataset.fallback === 'true') return;
    img.dataset.fallback = 'true';
    img.src = FALLBACK_IMAGE;
  }}
/>
```

Contoh hasil akhir inline (paragraf yang memuat URL afiliasi):

```tsx
<div className="mt-4 flex items-start gap-3">
  <img
    src={affiliate.image || FALLBACK_IMAGE}
    alt={affiliate.name ?? ''}
    width={48}
    height={48}
    loading="lazy"
    className="size-12 shrink-0 rounded-lg border border-line object-cover"
    onError={handleImgError}
  />
  <p className="leading-relaxed text-ink">{renderRichText(text)}</p>
</div>
```

## Scope

- In:
  - `src/components/articles/ArticlePublicView.tsx` — panel `affiliate` (baris ~205-232) + `ArticleMarkdownBody` (baris ~118-153) + wiring di `ArticlePublicView` (baris ~201-202).
  - `src/components/articles/ArticlePublicView.test.tsx` — test baru panel + inline + fallback.
- Out (jangan disentuh):
  - CSP `next.config.ts:40-41` (`img-src`) dan `images.remotePatterns` — **jangan** tambah `cf.shopee.sg` / `collshp.com` / wildcard merchant. Keputusan sadar: CSP tetap ketat.
  - Query Supabase / RLS / skema: `src/lib/articles/public.ts:71-84` (`getArticleProduct`), `src/app/[locale]/(public)/artikel/[slug]/page.tsx:86-90` — kolom `image` sudah di-select, wiring sudah benar.
  - Migrasi DB, re-scrape, bucket `affiliate-images`, `src/data/schemas.ts` — perbaikan permanen (gambar Storage) tetap task terpisah M4.1, jangan dicampur.
  - Tab Draf review `src/components/content/ArticleDraftCard.tsx:226-237` (badge 24px) — di luar laporan; tab Pratinjau (`:289-309`) ikut sembuh otomatis karena reuse `ArticlePublicView`, tanpa edit.
  - Isi `body_md` tersimpan — render-time only, tanpa ubah data artikel.

## Milestones

1. Thumbnail panel selalu tampil (gambar asli / placeholder + `onError` sekali)
2. Paragraf afiliasi inline tampilkan thumbnail yang sama (kecil, tidak mendominasi)
3. Test + gate hijau

## Konteks & Root Cause (sudah diverifikasi read-only, jangan verifikasi ulang)

1. Data ada, bukan NULL. Query prod 15 Sep:
   - `articles`: `slug='kipas-genggam-bandung-solusi-panas'`, `locale='id'`, `status='published'`, `product_id='d2d524c3-5069-478d-adfd-0a0f44799639'`, `affiliate_url='https://s.shopee.co.id/112qfaWS1r'`.
   - `affiliate_products`: `friendly_code='ASH-239'`, `is_active=true`, `image='https://cf.shopee.sg/file/id-11134207-81ztm-msji1e9lgrgkb7'`.
2. Panel `ArticlePublicView.tsx:208-218` hanya render `<img>` bila `affiliate.image` truthy, tanpa fallback/`onError`:
   ```tsx
   {affiliate.image ? (
     /* eslint-disable-next-line @next/next/no-img-element */
     <img src={affiliate.image} ... />
   ) : null}
   ```
   URL `cf.shopee.sg` **diblokir CSP** `img-src 'self' data: ... https://<ref>.supabase.co` (`next.config.ts:40-41`) → browser buang gambar diam-diam → panel tampil tanpa thumbnail.
3. Sistemik, bukan 1 slug: agregasi prod 15 Sep → 240 produk aktif semuanya eksternal (`110 shopee-external` + `130 other-external`, `0 supabase-storage`). Semua panel artikel bernasib sama sampai scrape CI mengisi bucket `affiliate-images` (blokir M4.1, entry memori `2026-09-15/181000-affiliate-db-only-migration.md:35-37`).
4. Inline by-design teks-only: `renderArticleMarkdown` (`src/lib/articles/types.ts:33-39`) hanya emit `excerpt + ## + body`; `ArticleMarkdownBody` (`ArticlePublicView.tsx:119-153`) hanya `## → h2`, baris lain `→ p` via `renderRichText`. URL afiliasi hanya di-linkify (`linkifyText`/`renderRichText`), tidak ada `<img>` yang di-emit.
5. Pola pembanding yang benar (wajib tiru, jangan ciptakan pola baru):
   - `src/components/admin/FixedProductCard.tsx:3,24-40` — `FALLBACK_IMAGE = '/images/products/product-placeholder-1.svg'` + `onError` sekali (guard `dataset.fallback`).
   - `src/components/content/AffiliateProductPicker.tsx:33,203-217,253-267` — `src={p.image || FALLBACK_IMAGE}` + `onError` sama, plain `<img>` (bukan `next/image`, agar URL eksternal tak butuh allowlist optimizer). Test: `AffiliateProductPicker.test.tsx:72-81`.
   - Placeholder tersedia: `public/images/products/product-placeholder-1.svg` (juga `-2`, `-3`; pakai `-1` agar konsisten dengan picker/card).
6. Alur data (tidak diubah):
   ```
   affiliate_products.image
     → getArticleProduct(product_id) live lookup (public.ts:71-84)
       → page.tsx:86-90 { name, url, image }
         → ArticlePublicView affiliate panel (:205-232)
   ```

## Tasks

- [x] T0. Baca wajib sebelum coding (penuh, bukan potongan):
  - `src/components/articles/ArticlePublicView.tsx` (262 baris) — lokasi edit utama.
  - `src/components/articles/ArticlePublicView.test.tsx` (56 baris) — pola test existing.
  - `src/components/admin/FixedProductCard.tsx:1-40` — pola fallback canonical.
  - `src/components/content/ArticleDraftCard.tsx:283-312` — pastikan preview reuse tanpa perlu edit (baca saja).
- [x] T1. Panel "Produk yang disebut di artikel ini" (`ArticlePublicView.tsx:205-232`):
  - Tambah di level modul (di atas `ArticleMarkdownBody`, dekat `URL_RE`):
    ```ts
    const FALLBACK_IMAGE = '/images/products/product-placeholder-1.svg';

    function handleAffiliateImgError(event: React.SyntheticEvent<HTMLImageElement>) {
      const img = event.currentTarget;
      if (img.dataset.fallback === 'true') return;
      img.dataset.fallback = 'true';
      img.src = FALLBACK_IMAGE;
    }
    ```
  - Ganti guard `{affiliate.image ? (<img ... />) : null}` menjadi render **selalu** saat `affiliate` ada:
    ```tsx
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img
      src={affiliate.image || FALLBACK_IMAGE}
      alt={affiliate.name ?? title}
      width={64}
      height={64}
      className="size-16 shrink-0 rounded-lg border border-line object-cover"
      loading="lazy"
      onError={handleAffiliateImgError}
    />
    ```
  - Jangan ubah teks/CTA/note, jangan ganti ke `next/image`, jangan ubah ukuran (tetap `size-16` agar hierarki vs picker `size-10` / form `size-12` terjaga).
  - Kriteria: `affiliate.image=null` → `src` placeholder; `affiliate.image=url-rusak` → `onError` → placeholder, tanpa loop (guard dataset).
- [x] T2. Gambar inline paragraf afiliasi (`ArticleMarkdownBody`, `ArticlePublicView.tsx:118-153`):
  - Ubah signature menjadi:
    ```tsx
    export function ArticleMarkdownBody({ md, affiliate }: { md: string; affiliate?: ArticleViewAffiliate | null }) {
    ```
    `affiliate` opsional agar test existing tanpa prop tetap lolos.
  - Bentuk block internal tambah flag: `{ type: 'h2' | 'p'; text: string }` tetap; saat render `p`, hitung `isAffiliatePara = Boolean(affiliate?.url) && text.includes(affiliate.url)`.
  - Bila `isAffiliatePara` true, render thumbnail + paragraf berdampingan (ukuran kecil `size-12`, 48px, agar tidak mendominasi panel `size-16`):
    ```tsx
    {isAffiliatePara && affiliate ? (
      <div key={i} className="mt-4 flex items-start gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={affiliate.image || FALLBACK_IMAGE}
          alt={affiliate.name ?? ''}
          width={48}
          height={48}
          loading="lazy"
          className="size-12 shrink-0 rounded-lg border border-line object-cover"
          onError={handleAffiliateImgError}
        />
        <p className="leading-relaxed text-ink">{renderRichText(b.text)}</p>
      </div>
    ) : (
      <p key={i} className="mt-4 leading-relaxed text-ink">{renderRichText(b.text)}</p>
    )}
    ```
  - Hanya paragraf (`type==='p'`); `h2` tidak pernah bergambar walau mengandung URL.
  - Bila beberapa paragraf mengandung URL (jarang; normalnya 1), gambar di setiap paragraf yang cocok — sederhana, stateless, tanpa pelacakan "first only".
  - Tanpa `affiliate` / URL tak cocok → render persis seperti sekarang (tidak ada perubahan visual paragraf lain).
- [x] T3. Wiring di `ArticlePublicView` (`:201-203`):
  - Ganti `<ArticleMarkdownBody md={bodyMd} />` menjadi `<ArticleMarkdownBody md={bodyMd} affiliate={affiliate} />`.
  - Tidak perlu ubah caller (`page.tsx:74-100`, `ArticleDraftCard.tsx:289-309`) — mereka sudah passing `affiliate`; preview review ikut sembuh otomatis.
- [x] T4. Test (`src/components/articles/ArticlePublicView.test.tsx`, tambah describe baru, jangan ubah test existing kecuali perlu):
  - (a) Panel: render `ArticlePublicView` dengan `affiliate={{ name: 'Kipas', url: 'https://s.shopee.co.id/xyz', image: null }}` (+ props string minimal) → `img[alt]` ada dengan `src` placeholder. Lihat pola `AffiliateProductPicker.test.tsx:72-81`.
  - (b) Panel `onError` → placeholder tanpa loop: render dengan `image='https://example.com/rusak.jpg'`, fire `error` pada img, assert `src` jadi placeholder; fire `error` kedua, assert tetap placeholder (guard `dataset.fallback`). Pakai `fireEvent.error` dari `@testing-library/react`.
  - (c) Inline: render `<ArticleMarkdownBody md={'Intro\n\nBeli https://s.shopee.co.id/xyz di sini\n\nOutro'} affiliate={{ name: 'Kipas', url: 'https://s.shopee.co.id/xyz', image: null }} />` → tepat 1 `img` (di paragraf tengah), 2 paragraf lain tanpa img.
  - (d) Inline negatif: `md` tanpa URL afiliasi + `affiliate` ada → tidak ada `img` di body.
  - (e) Regresi: `<ArticleMarkdownBody md={...} />` tanpa prop `affiliate` tetap render seperti dulu (test existing harus hijau tanpa modifikasi).
- [x] T5. Gate (berurutan, di root repo):
  1. `npm run typecheck`
  2. `npm run lint`
  3. `npm test -- src/components/articles/ArticlePublicView.test.tsx` (dulu, cepat), lalu `npm test` penuh.
  4. `npm run build` — wajib karena menyentuh render path yang dipakai SSG/ISR artikel (pola sensitif build).
  - Semua harus hijau. Bila merah, fix dan **re-run dari langkah 1** (satu edit kecil pun membatalkan gate sebelumnya).
- [ ] T6. Verifikasi manual (setelah deploy preview/prod, bukan di CI):
  - Buka `/id/artikel/kipas-genggam-bandung-solusi-panas` → panel tampil thumbnail (diprediksi placeholder sampai M4.1 Storage terisi, karena `cf.shopee.sg` tetap diblokir CSP) + paragraf konser ("...seperti https://s.shopee.co.id/112qfaWS1r – ASH-239...") tampil thumbnail kecil di kiri teks.
  - DevTools → tidak ada layout rusak; warning CSP untuk `cf.shopee.sg` masih muncul (expected, harmless) sampai gambar Storage.
  - ISR `revalidate=3600`: artikel lama sembuh setelah regenerasi — tidak perlu re-publish.
- [ ] T7. Commit + push per `AGENTS.md` repo (Conventional Commits satu baris, tanpa trailer `Co-authored-by`):
  - Sebelum commit: `git status --short`, `git diff`, `git log --oneline -10`; stage hanya file yang dimaksud (`ArticlePublicView.tsx` + test-nya).
  - Jangan commit secret (`.env*`, `sb_secret_*`, `CRON_SECRET`).
  - Setelah push: laporkan hash + pesan + file kunci.

## Risks

- `onError` menutupi data rusak: 240 produk aktif akan terlihat "placeholder rapi" sampai scrape CI (M4.1) mengisi URL Storage — visual konsisten tapi bukan foto asli. Ini interim yang disengaja; pembersihan data `image` adalah task terpisah, jangan dicampur ke plan ini.
- Warning CSP di console tetap ada untuk host Shopee (request gagal lalu fallback). Harmless secara visual, tapi jangan "memperbaiki" dengan melebarkan `img-src` — ditolak sadar demi CSP ketat.
- Deteksi inline via `text.includes(affiliate.url)` rapuh bila LLM memvariasikan format link (mis. trailing slash, shortlink berbeda). Kasus live (`...seperti https://s.shopee.co.id/112qfaWS1r – ASH-239...`) cocok mentah, jadi cukup untuk sekarang; normalisasi URL adalah follow-up, bukan scope ini.
- Duplikasi visual: halaman kini menampilkan thumbnail yang sama 2x (inline kecil + panel). Dinilai dapat diterima karena user eksplisit meminta gambar inline; ukuran dibedakan (`size-12` vs `size-16`) agar hierarki jelas.
- Counter-argument: alternatif "tunggu Storage" akan memberi foto asli sekaligus tanpa placeholder, tapi membiarkan bug live berbulan-bulan (M4.1 masih blocked CI, `collshp.com` 503 dari dev). Fallback sekarang + Storage nanti adalah kombinasi yang benar, bukan salah satu.

## Progress Log

- 2026-09-15 19:05:00 — Plan detail dibuat untuk small model; implementasi belum dimulai. Investigasi read-only selesai: snapshot live + query `articles`/`affiliate_products` + baca CSP + pola fallback picker/card.
- 2026-09-15 ~13:05 — T0–T5 dieksekusi: panel selalu render img + fallback placeholder sekali-guard; `ArticleMarkdownBody` terima `affiliate` opsional + thumbnail `size-12` di paragraf ber-URL afiliasi (h2 dikecualikan); wiring di `ArticlePublicView`; 5 test baru (12/12 file); gate typecheck ✓ lint ✓ test 608/608 ✓ build ✓. Catatan: asumsi plan "240 eksternal" sudah kedaluwarsa — scrape CI hijau → 240/240 Storage; panel live sudah sembuh via data, fallback tetap dipasang untuk null/rusak. Sisa T6 manual + T7 commit.
- 2026-09-15 ~13:17 — INSIDEN live digest 1391377559: `onError` (function prop) di `<img>` dalam Server Component `ArticlePublicView` ditolak serialisasi RSC. Fix: island client `AffiliateImage.tsx` ('use client', `AFFILIATE_FALLBACK_IMAGE` diekspor) dipakai panel + inline; handler dihapus dari server. Pelajaran: build hijau tak menjamin runtime ISR tanpa data (prerender [slug] kosong saat build) — unit test pun tak menangkapnya; verifikasi via `next start` lokal: HTTP 200, size-12=2, size-16=2, ApplicationError=0. Gate ulang: typecheck ✓ lint ✓ test 610/610 ✓ build ✓ (tanpa digest).

## Notes

- Non-telecom bugfix UI kecil → standar TOGAF/ODA proporsional, tanpa ceremony enterprise (AGENTS.md §3). Tanpa migrasi DB.
- Keputusan desain yang sudah dikunci user: plain `<img>` (bukan `next/image`) + placeholder `product-placeholder-1.svg` + strategi "Fallback saja" (tanpa ubah CSP). Small model jangan membuka ulang keputusan ini; bila menemui bukti kuat keputusan ini salah, hentikan dan tanya user.
- Tanpa harga fiktif / tanpa klaim Product JSON-LD baru — tidak relevan untuk fix ini.
- File referensi wajib: `src/components/articles/ArticlePublicView.tsx:1-75,118-232`, `src/components/content/ArticleDraftCard.tsx:283-312`, `src/components/admin/FixedProductCard.tsx:1-40`, `src/components/content/AffiliateProductPicker.tsx:195-267`, `next.config.ts:40-41` (baca saja, jangan ubah).
