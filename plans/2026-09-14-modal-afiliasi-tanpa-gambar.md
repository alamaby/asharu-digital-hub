# Modal Pilih Produk Afiliasi Tanpa Gambar (konten/baru, Mekanisme 2)

Created: 2026-09-14 12:30:00

## Objective

Saat user memilih mekanisme 2 (produk-dulu) di halaman `konten/baru`, modal `Pilih Produk Afiliasi` menampilkan record produk tanpa gambar (hanya nama + kode + kategori + merchant). Setelah konfirmasi, gambar baru muncul di form. Tujuan: setiap baris di modal menampilkan thumbnail produk dengan fallback placeholder yang konsisten, di mode single maupun multi (mekanisme 2), tanpa merusak flow swap/regen/ganti produk.

Contoh hasil akhir per baris (multi):

```tsx
<label className="flex w-full cursor-pointer items-center gap-3 ...">
  <input type="checkbox" ... />
  <img src={p.image || FALLBACK} alt={p.name_id} width={40} height={40}
    loading="lazy" className="size-10 shrink-0 rounded-lg border border-line object-cover"
    onError={handleImgError} />
  <span className="min-w-0 flex-1">...</span>
</label>
```

## Scope

- In:
  - `src/components/content/AffiliateProductPicker.tsx` — render list modal (single + multi) + `onConfirmSelect`.
  - Test baru untuk picker (thumbnail + fallback + preservasi gambar lintas query).
- Out (jangan disentuh):
  - Query Supabase / RLS / skema `affiliate_products` (kolom `image` sudah di-select).
  - Logic riset mekanisme 2 (`src/lib/content/actions.ts`, `src/lib/research/*`).
  - `AffiliateProductCard.tsx`, `ContentRequestForm.tsx`, `FixedProductCard.tsx` (hanya jadi referensi pola).
  - Tidak perlu migrasi DB.

## Milestones

1. Thumbnail muncul di modal (single + multi) dengan fallback
2. Seleksi multi lintas query tidak lagi menghilangkan gambar
3. Test + gate hijau

## Konteks & Root Cause (sudah diverifikasi read-only)

1. `src/components/content/AffiliateProductPicker.tsx:31` — `PRODUCT_COLUMNS` sudah memuat `image`; interface `Product:7-16` punya `image: string`.
2. Render baris mode single (`176-198`) dan multi (`202-230`) hanya render `name_id` + `friendly_code/category/merchant`. Tidak ada `<img>` / `<Image>`. Ini root cause utama.
3. `onConfirmSelect` (`243-256`) memetakan `image/category/merchant/url`, dan `ContentRequestForm.tsx:353-363` merender `<img>` bila `p.image` ada. Jadi gambar muncul *setelah* pilih, tapi tidak *saat* memilih — sesuai laporan user.
4. Bug sekunder: `multiSelected:59-61` bertipe `Map<string, string>` (id → nama saja). `onConfirmSelect` membangun `byId` hanya dari `products` yang sedang terlihat (`latest` atau `results`). Skenario gagal: search "A" → centang → hapus query (kembali ke `latest`) → Konfirmasi → `byId.get(id)` undefined → fallback `image: ''` → item terpilih di form tanpa gambar walau DB punya gambar.
5. Pola pembanding yang benar:
   - `src/components/admin/FixedProductCard.tsx:3,24-40` — plain `<img size-12 object-cover>` + `FALLBACK_IMAGE = '/images/products/product-placeholder-1.svg'` + `onError` sekali (guard `dataset.fallback`).
   - `src/components/content/AffiliateProductCard.tsx:188-197` — `next/image size-16` dengan guard `product_image ? ... : null`.
6. Plan terkait tapi berbeda: `plans/2026-09-14-riset-9a24c768-gambar-produk-404.md` menangani file `.webp` 404 (drift DB↔repo). Plan ini menangani modal yang tidak merender `<img>` sama sekali. Jangan digabung.

## Tasks

- [ ] T1. Tambah konstanta fallback di `AffiliateProductPicker.tsx` (ikuti `FixedProductCard`):
  ```ts
  const FALLBACK_IMAGE = '/images/products/product-placeholder-1.svg';
  ```
- [ ] T2. Tambah helper `onError` sekali (hindari loop bila placeholder ikut gagal):
  ```tsx
  function handleImgError(event: React.SyntheticEvent<HTMLImageElement>) {
    const img = event.currentTarget;
    if (img.dataset.fallback === 'true') return;
    img.dataset.fallback = 'true';
    img.src = FALLBACK_IMAGE;
  }
  ```
- [ ] T3. Mode single (`products.map`, cabang `if (!multi)`, sekitar baris 178-198): selipkan `<img>` antara `<button>` dan `<span className="min-w-0 flex-1">`:
  ```tsx
  // eslint-disable-next-line @next/next/no-img-element
  <img
    src={p.image || FALLBACK_IMAGE}
    alt={p.name_id}
    width={40}
    height={40}
    loading="lazy"
    className="size-10 shrink-0 rounded-lg border border-line object-cover"
    onError={handleImgError}
  />
  ```
  - Jangan ubah `disabled={isCurrent}` / `onSelect(p.id, p.name_id)` / layout teks.
- [ ] T4. Mode multi (cabang checkbox, sekitar baris 202-230): selipkan `<img>` yang sama antara `<input type="checkbox">` dan `<span className="min-w-0 flex-1">`.
- [ ] T5. Perbaiki preservasi data multi-select (pilih salah satu, disarankan Opsi A):
  - Opsi A (disarankan, minimal): tambah cache `productById` yang di-merge dari setiap fetch:
    ```ts
    const [productById, setProductById] = useState<Map<string, Product>>(new Map());
    // di .then initial load: setProductById(prev => new Map([...prev, ...rows.map(r => [r.id, r])]));
    // di .then search: sama
    // di onConfirmSelect: const p = productById.get(id) ?? byId.get(id);
    ```
  - Opsi B: ubah `multiSelected` dari `Map<string, string>` menjadi `Map<string, Product>` (simpan full row saat centang). Lebih invasif, perlu ubah `onChange` + `pickerMultiCount` (pakai `.size` tetap sama) + `onConfirmSelect`.
  - Kriteria: centang di hasil search → hapus query → Konfirmasi → item tetap membawa `image/category/merchant/url` yang benar.
- [ ] T6. Tambah test (mis. `src/components/content/AffiliateProductPicker.test.tsx`, mock `createSupabaseBrowser`):
  - (a) baris merender `img[alt=nama_produk]` dengan `src` gambar DB;
  - (b) `image=''` / `null` → `src` placeholder; `onError` → placeholder (tanpa loop);
  - (c) seleksi lintas query (pilih di search, clear ke latest, confirm) tetap membawa `image`.
  - Lihat pola mock Supabase di test komponen client lain bila ada; jangan panggil DB asli.
- [ ] T7. Gate: `npm run typecheck`, `npm run lint`, `npm test` hijau. Verifikasi manual: `konten/baru` → mekanisme 2 → `Pilih Produk (0/2)` → modal menampilkan thumbnail di latest + saat search → centang 2 → Konfirmasi → list terpilih di form bergambar.
- [ ] T8. Commit + push per `AGENTS.md` repo (Conventional Commits satu baris, tanpa trailer `Co-authored-by`). Setelah push: laporkan hash + file kunci.

## Risks

- `next/image` butuh allowlist domain untuk URL eksternal (mis. `cf.shopee.sg`); bila dipakai di picker bisa gagal build/runtime. Mitigasi: pakai plain `<img>` seperti `FixedProductCard`/`ContentRequestForm` (kehilangan optimasi, tapi aman dan konsisten). Rekomendasi: plain `<img>`.
- Fallback `onError` menutupi data rusak (404 terlihat "baik-baik saja"). Mitigasi: tetap placeholder secara visual; pembersihan data `image` NULL adalah task terpisah, jangan dicampur ke plan ini.
- `image` bertipe `string` non-nullable di interface `Product` tapi DB bisa `NULL`. Mitigasi: selalu pakai `p.image || FALLBACK_IMAGE` dan ketik longgar (`string | null`) bila perlu tanpa mengubah query.
- Scope creep: jangan ubah validasi `productIds` di `actions.ts:290-300` atau tampilan `ContentRequestForm`/`AffiliateProductCard` dalam plan ini.

## Progress Log

- 2026-09-14 12:30:00 — Plan detail dibuat untuk dieksekusi small model; implementasi belum dimulai.

## Notes

- Non-telecom bugfix UI kecil → standar TOGAF/ODA proporsional, tanpa ceremony enterprise (AGENTS.md §3). Tanpa migrasi DB.
- Keputusan desain yang sudah diambil di plan ini: plain `<img>` + placeholder `product-placeholder-1.svg` + `size-10` di modal (form tetap `size-12`, card tetap `size-16` — hierarki visual disengaja).
- File referensi wajib dibaca sebelum coding: `src/components/content/AffiliateProductPicker.tsx` (penuh, 268 baris), `src/components/admin/FixedProductCard.tsx:1-40`, `src/components/content/ContentRequestForm.tsx:344-426`.
