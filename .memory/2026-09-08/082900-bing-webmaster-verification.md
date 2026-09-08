# Bing Webmaster Verification

Task: jadikan `public/BingSiteAuth.xml` tersaji di root domain untuk verifikasi Bing Webmaster Tools.

## Keputusan
- Tidak ada perubahan kode: `public/` Next.js otomatis tersaji di root (`/BingSiteAuth.xml`); middleware matcher `src/middleware.ts` sudah mengecualikan path ber-dot sehingga bypass i18n.
- File lokal apa adanya dari user (kode `002E5C6685DDF7D2AD3FBB7D83904BCB`), hanya di-stage khusus file itu.

## File berubah
- `public/BingSiteAuth.xml` (new, 4 baris XML verifikasi).

## Verifikasi
- Lokal `http://localhost:3000/BingSiteAuth.xml` → 200, `Content-Type: application/xml`, body cocok dengan file.
- Gate: `npm run typecheck` ✓, `npm run lint` ✓, `npm test` ✓ (40 files, 314 tests).
- Prod 08:29 masih 404 — deploy Vercel dari push `a45947c` kemungkinan masih jalan/queued. **Update 08:3x: prod `https://asharu.id/BingSiteAuth.xml` → 200 XML cocok. Siap diklik Verify.**

## Status / tindak lanjut
- Commit `a45947c` `feat(seo): add BingSiteAuth verification file`, pushed ke `main`.
- [USER ACTION] ~~Tunggu deploy Vercel selesai → cek `https://asharu.id/BingSiteAuth.xml` (harus 200 XML) →~~ klik Verify di Bing Webmaster Tools (file prod sudah 200).

## Commit
`feat(seo): add BingSiteAuth verification file`
