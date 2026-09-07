# Facebook Domain Verification Plan

Created: 2026-09-07 13:10:00

## Objective
Sematkan `<meta name="facebook-domain-verification" content="wt9cbx9npb6njy0lcqrpe85dal7pmz" />` di `<head>` HTML homepage secara server-rendered agar lolos verifikasi Meta Business (`http://asharu.id/`).

## Scope
- In: `src/lib/seo/metadata.ts` (token site-wide), `src/app/[locale]/layout.tsx` (lepas `cookies()` → SSG), `src/components/admin/KontenList.tsx` (timeZone eksplisit), `src/app/[locale]/admin/konten/page.tsx` (resolve tz)
- Out: metode verifikasi lain (DNS TXT / file upload), perubahan middleware/routing, secret handling.

## Milestones
1. Implementasi metadata
2. Gate + verifikasi head
3. Deploy + klik Verify di Meta

## Tasks
- [x] Tambah konstanta `FACEBOOK_DOMAIN_VERIFICATION_TOKEN` + `other` di `buildMetadata()`
- [x] Tambah unit test tag verifikasi di `metadata.test.ts`
- [x] Lepas `getDisplayTimezone()`/`cookies()` dari locale layout → SSG statis (tag literal di `<head>`)
- [x] `KontenList` terima `timeZone`+`locale` eksplisit (ganti `useFormatter`), page `/admin/konten` resolve via `getDisplayTimezone()`
- [x] `npm run typecheck`, `npm run lint`, `npm test` (308), `next build` — hijau; verifikasi `.next/server/app/id.html`: tag di byte 1632 < `</head>` 3070
- [ ] Commit + push; deploy Vercel prod, klik Verify di Business Manager (user)

## Risks
- Redirect `/`→`/id`: crawler Meta tanpa follow-redirect tidak lihat tag di `/` mentah. Mitigasi: tag site-wide sehingga target redirect `/id` mengandung tag; bila tetap gagal, fallback root statis atau verifikasi DNS.
- Cache Vercel/CDN: hard-refresh setelah deploy sebelum klik Verify.

## Progress Log
- 2026-09-07 13:05 — investigasi read-only selesai (Plan Mode), plan disusun.
- 2026-09-07 13:10 — mode build: implementasi `other.facebook-domain-verification` + test; gate berjalan.
- 2026-09-07 13:30 — TEMUAN: tag Metadata API tidak literal di `<head>` mentah (byte 71984, setelah `</head>` 1343) karena layout async baca `cookies()` → dynamic render, metadata di-stream via Flight + hoist JS. Helper injeksi middleware (`facebook-verification.ts`) dibuat lalu DIBATALKAN (middleware matcher tidak cover `/`, `/` redirect; rewrite HTML tidak viable di Next).
- 2026-09-07 13:45 — FIX AKAR: layout pakai `DEFAULT_TIMEZONE` statis (hilangkan `getDisplayTimezone()`); `KontenList` terima `timeZone`+`locale` eksplisit; `/admin/konten` resolve sendiri. Build: `/id`+`/en` SSG, `id.html` tag literal byte 1632 < `</head>` 3070. Gate hijau (typecheck/lint/build/308 tests).

## Notes
- Bukan sistem rating/billing telekomunikasi, jadi standar Oracle C2M / TM Forum ODA tidak relevan; feature kecil tanpa seremoni TOGAF ADM penuh.
- `content="wt9cbx..."` bersifat publik by-design (terlihat di view-source oleh siapa pun), aman di-commit — bukan secret.
- Trade-off: tag site-wide (+~100 byte/halaman) vs homepage-only; dipilih site-wide agar target redirect `/id` pasti mengandung tag.
- Trade-off timezone: provider next-intl kini selalu `Asia/Jakarta` statis di SSG; halaman admin dinamis tetap resolve user/device tz sendiri (`getDisplayTimezone()` tetap ada untuk `/admin/konten`, `/admin/riset`, review). `KontenList` kini format tanggal via `formatDateTime` eksplisit (identik dengan pola `ResearchListClient`/`ResearchStepper`). Perubahan perilaku: pengunjung non-WIB melihat tanggal admin `/admin/konten` dalam WIB sampai cookie USER_TZ dibaca di request berikutnya — sama seperti sebelum perubahan pada first-visit (cookie belum ada → default WIB); halaman dinamis lain tidak berubah.
