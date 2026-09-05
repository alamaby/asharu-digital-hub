# Mekanisme 2: kartu produk + urutan form + ide berbasis produk

- Task: (1) kartu produk terpilih, (2) mekanisme paling atas + produk dulu baru topik/ide, (3) ide LLM pakai produk terpilih, (4) kelengkapan field terjamin.
- Key files:
  - `AffiliateProductPicker.tsx`: `PickerSelection` (id/nama/gambar/kategori/merchant/url) di `onConfirmSelect`.
  - `ContentRequestForm.tsx`: blok mekanisme pindah ke paling atas (di atas topik); kartu produk (gambar, nama, kategori·merchant, link, hapus); `ideaProduct[]` ke FormData bila dua; banner kelengkapan N/17 + field kosong.
  - `actions.ts` generateIdea: hint PRODUK TETAP + aturan topik-sekitar-produk (hint saja; sesi validasi ID).
  - `messages/id+en.json`: `viewProduct` (form), `ideaCompleteness`, `ideaMissingFields`.
- Decisions: banner tanpa retry (pilihan user); snapshot kartu saat pilih + validasi sesi existing cegah basi.
- Verification: `typecheck` ✓, `lint` ✓, `272/272` tests ✓ (+1 urutan).
- Commit proposal: `feat(research): mechanism-two product cards order idea context`
