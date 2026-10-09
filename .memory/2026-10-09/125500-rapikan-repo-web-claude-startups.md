# 2026-10-09 — Rapikan repo publik dan web untuk Claude Startups application

## Task / problem

Melakukan finalisasi dan verifikasi menyeluruh untuk kesiapan review Claude Startups sesuai plan `plans/2026-10-09-rapikan-repo-web-claude-startups.md`: verifikasi baseline dan rute publik live, perapihan README badge status + tautan live, pengaturan metadata GitHub repo (deskripsi, homepage, topik), pembuatan route-specific OpenGraph image untuk `/digital-hub`, audit secret, dan konfirmasi apply-pack.

## Key files changed

* Added: `src/app/[locale]/(public)/digital-hub/opengraph-image.tsx`
* Modified: `README.md`, `plans/2026-10-09-rapikan-repo-web-claude-startups.md`, `.memory/README.md`

## Decisions

* Menambahkan OpenGraph image spesifik rute `src/app/[locale]/(public)/digital-hub/opengraph-image.tsx` (ID/EN) yang menampilkan badge prototipe, judul workspace UMKM, alur 5-tahap, dan branding Content-to-Portfolio jujur, menggantikan ketergantungan pada fallback hero umum root.
* Mengatur deskripsi repo GitHub (`AI-assisted content ops + portfolio untuk UMKM Indonesia`), URL About (`https://asharu.id/id/digital-hub`), dan 5 topik relevan (`ai, content-ops, indonesia, nextjs, umkm`) via `gh repo edit`.
* Menjaga framing Claude secara jujur sebagai "plan to use" (prototyping credits, evaluasi bahasa Indonesia) dengan persetujuan manusia wajib (`assertHumanApproval`), tanpa overclaiming automasi penuh atau traffic produksi palsu.

## Assumptions / risks

* Antrean review program Claude Startups bertahap dan kredit $1K berpotensi over capacity; nilai kemitraan Startup Stack dan office hours menjadi target realistis.
* Formulir waitlist tetap memvalidasi via server action + rate limit tanpa penyimpanan DB otomatis (P1 tersendiri).

## Blockers / unresolved

* Review dan pengajuan aplikasi manual via `platform.claude.com/offers/startups-application` oleh pemilik repo menggunakan akun email domain `asharu.id`.

## Verification

* `npm run typecheck` PASS
* `npm run lint` PASS (0 warning, `--max-warnings=0`)
* `npm test` PASS (135 test files, 1344 tests)
* `npm run validate:messages` PASS (paritas id/en konsisten)
* `npm run build` PASS (122 static pages + OG images SSG `/id/digital-hub/opengraph-image-*` & `/en/digital-hub/opengraph-image-*`)
* Live verification `https://asharu.id/id/digital-hub`, `/en/digital-hub`, `/sitemap.xml`, `/robots.txt`, dan link repo GitHub semua 200 OK.

## Conventional commit proposal

`chore(digital-hub): rapikan repo publik dan tambahkan OG image untuk apply claude startups`

## Related

* `plans/2026-10-09-rapikan-repo-web-claude-startups.md`
* `docs/claude-startups-readiness.md`
* `docs/implementation-report.md`
