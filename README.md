# Asharu Digital Hub

**asharu.id** — *Semua yang Anda cari, dalam satu tempat.* / *Everything you need, in one place.*

Production-ready bilingual (ID/EN) digital hub yang mengonsolidasikan toko online, media sosial, etalase produk afiliasi, dan listing properti — static-first, aksesibel, aman, dan hemat resource. Tanpa database, tanpa CMS berbayar, tanpa server terus-menerus.

---

## Daftar Isi

1. [Arsitektur](#arsitektur)
2. [Struktur Folder](#struktur-folder)
3. [Local Development](#local-development)
4. [Environment Variables](#environment-variables)
5. [Mengganti Konten Placeholder](#mengganti-konten-placeholder)
6. [Google Analytics 4](#google-analytics-4)
7. [Deployment ke Vercel](#deployment-ke-vercel)
8. [Konfigurasi Domain asharu.id](#konfigurasi-domain-asharuid)
9. [Testing & Quality Gates](#testing--quality-gates)
10. [Keputusan Teknis & Trade-offs](#keputusan-teknis--trade-offs)
11. [Checklist Sebelum Launch](#checklist-sebelum-launch)

---

## Arsitektur

| Aspek | Keputusan |
|---|---|
| Framework | Next.js 15 (App Router), React 19, TypeScript strict |
| Rendering | SSG untuk seluruh halaman (`generateStaticParams` + `setRequestLocale`); RSC default; hanya 6 client components (mobile nav, language switcher, property filter, consent banner + settings button, GA loader) |
| i18n | next-intl v4 — locale `id` (default) & `en`; localized pathnames (`/id/produk` ↔ `/en/products`); root `/` → `/id` via middleware **tanpa loop**; locale detection header dimatikan agar crawler selalu melihat `/id` deterministik |
| Data | File type-safe di `src/data/`, divalidasi skema Zod (`src/data/schemas.ts`); tidak ada database/API saat render |
| Styling | Tailwind CSS 3.4 dengan palet color-blind-safe WCAG AA |
| Font | Inter via `next/font` (self-hosted, zero layout shift) |
| Analytics | GA4 consent-gated: script Google sama sekali tidak dimuat sebelum pengunjung menyetujui; 7 event type-safe tanpa PII (termasuk click_math_app) |
| SEO | Metadata per-halaman (canonical, hreflang id/en/x-default), sitemap dengan alternates, robots.txt, manifest, OG image dinamis build-time, JSON-LD (WebSite, Organization, ItemList, RealEstateListing, BreadcrumbList) |
| Keamanan | CSP + HSTS + nosniff + Referrer-Policy + Permissions-Policy + frame-ancestors 'none' via `next.config.ts`; URL eksternal divalidasi protokol https/mailto/tel; JSON-LD di-escape terhadap `</script>` breakout |

## Struktur Folder

```
├── next.config.ts            # CSP & security headers
├── src/
│   ├── middleware.ts         # next-intl middleware (root redirect, rewrite pathnames)
│   ├── messages/
│   │   ├── id.json           # terjemahan Indonesia (sumber kebenaran UI)
│   │   └── en.json           # terjemahan Inggris (paritas kunci penuh, diuji)
│   ├── data/                 # DATA KONTEN — edit di sini
│   │   ├── schemas.ts        # skema Zod semua entitas
│   │   ├── shop-links.ts     # toko online
│   │   ├── social-links.ts   # media sosial (WhatsApp dari env)
│   │   ├── affiliate-products.ts
│   │   ├── properties.ts
│   │   └── math-app.ts       # promosi Asharu Math (subdomain)
│   ├── config/
│   │   ├── site.ts           # nama site, domain, kanal kontak (env-driven)
│   │   ├── navigation.ts     # item nav utama
│   │   └── content.ts        # tanggal revisi kebijakan
│   ├── lib/
│   │   ├── env.ts            # validasi env Zod (fail-fast saat build)
│   │   ├── analytics/        # events.ts (type-safe) + consent.ts (localStorage)
│   │   ├── seo/              # metadata builder, pathnames resolver, JSON-LD builders
│   │   └── utils/            # cn, format (Intl), safe-url, pageHeading
│   ├── components/
│   │   ├── layout/           # Header, NavMenu, MobileNav, LanguageSwitcher,
│   │   │                     # Footer, SkipLink, ConsentSettingsButton
│   │   ├── home/             # ShopCard, SocialLinksGrid, AffiliateDisclosure, ContactCTA
│   │   ├── cards/            # ProductCard, PropertyCard, PropertyBrowser (filter client)
│   │   ├── analytics/        # GoogleAnalytics (consent-gated), ConsentBanner
│   │   └── ui/               # ExternalLink, TrackedExternalLink, SectionHeading,
│   │                         # ResponsiveImage, JsonLd, EmptyState, PlatformIcon
│   ├── i18n/                 # routing (pathnames), request, navigation
│   └── app/
│       ├── globals.css
│       ├── [locale]/         # layout (html lang) + home, products, properties(+[slug]),
│       │                     # about, privacy-policy, affiliate-disclosure, not-found
│       ├── sitemap.ts / robots.ts / manifest.ts / icon.svg / opengraph-image.tsx
├── public/images/            # placeholder SVG (label "contoh") — ganti sebelum launch
└── plans/                    # rencana implementasi (dokumentasi proses)
```

## Local Development

```bash
npm install          # Node >= 20.9
cp .env.example .env.local
npm run dev          # http://localhost:3000 → redirect ke /id
```

Quality gates:

```bash
npm run lint         # ESLint flat config (next/core-web-vitals + TS)
npm run typecheck    # tsc --noEmit (strict + noUncheckedIndexedAccess)
npm run test         # Vitest + Testing Library (115 assertions)
npm run build        # produksi — 27 halaman statis
```

## Environment Variables

Lihat `.env.example`. Semua variabel bersifat publik (`NEXT_PUBLIC_`) — **tidak ada secret** di proyek ini.

| Variabel | Wajib? | Efek jika kosong |
|---|---|---|
| `NEXT_PUBLIC_SITE_URL` | Tidak (default `https://asharu.id`) | — |
| `NEXT_PUBLIC_GA_MEASUREMENT_ID` | Tidak | Analytics sepenuhnya nonaktif; banner consent tetap tampil? **Tidak** — tombol preferensi footer juga disembunyikan |
| `NEXT_PUBLIC_WHATSAPP_URL` | Tidak | CTA WhatsApp disembunyikan (kartu properti, kontak, sosial) |
| `NEXT_PUBLIC_CONTACT_EMAIL` | Tidak | CTA email disembunyikan |

Nilai invalid (mis. ID GA salah format) **membuat build gagal** dengan pesan jelas — validasi via Zod di `src/lib/env.ts`.

## Mengganti Konten Placeholder

Semua file di `src/data/` dan gambar di `public/images/` adalah **placeholder berlabel contoh**. Sebelum launch:

1. **Toko** — `shop-links.ts`: ganti URL ke profil toko asli.
   - `url` = tujuan kanonis permanen (mis. `https://shopee.co.id/shop/9268731`).
   - `affiliateUrl` *(opsional)* = link terlacak program afiliasi; kartu otomatis memakainya dengan `rel="sponsored nofollow"` dan jatuh kembali ke `url` jika field dikosongkan/dihapus.
   - ⚠️ Komisi afiliasi tidak berlaku untuk pembelian Anda sendiri (self-referral dilarang program afiliasi marketplace).
   - Link share seperti `shp.ee/...` dapat kedaluwarsa bila diedit di dashboard — refresh nilainya berkala atau hapus field tersebut.
   - `handle` *(opsional)* menampilkan baris kecil `@namatoko` di kartu.
2. **Sosial** — `social-links.ts`: ganti handle/URL; WhatsApp otomatis muncul begitu env diset.
3. **Produk afiliasi** — `affiliate-products.ts`: ganti `url` dengan link afiliasi resmi, `image` dengan foto produk WebP/JPG (rasio 4:3, min. 800×600). Setiap kartu sudah otomatis memakai `rel="sponsored nofollow"`.

### Scraper Produk Afiliasi (Shopee Linktree)

Konten `affiliate-products.ts` dapat ditarik otomatis dari halaman afiliasi Shopee Linktree *"Racun outfit asharu"* (`collshp.com/asharu`) via **GraphQL API publik**-nya (tanpa auth, tanpa browser):

- Endpoint: `POST https://collshp.com/api/v3/gql/graphql` — operation `getBaseInfoAndLinks` dengan `urlSuffix: "asharu"`.
- Total tersedia kini **201 produk**; halaman support pagination (`pageSize`/`pageNum`) dan telah dibatasi ke **12 produk terbaru** di data saat ini.
- Skema `AffiliateProduct` → `src/data/schemas.ts` dihasilkan `scripts/lib/data-writer.mjs`, divalidasi Zod sebelum ditulis.

Jalankan scraper:

```bash
npm run scrape:affiliate:dry-run   # lihat hasil transform tanpa menulis file/unduh gambar
npm run scrape:affiliate           # tarik SEMUA produk (~201), unduh+optimasi gambar, tulis data
npm run scrape:affiliate -- --limit 12   # batasi jumlah produk
npm run scrape:affiliate -- --first-page # hanya halaman pertama (tanpa pagination)
```

Perintah tambahan: `--max-width <px>` (default 800), `--insecure` (lewati verifikasi TLS — hanya untuk jaringan korporat/MITM; CI tidak memakainya).

Proses:
1. Fetch GraphQL → baris `linkList { linkId, link, linkName, image, linkType, groupIds }`; dedupe by `linkId`, filter `linkType: "ITEM"` .
2. **Kategori** dipetakan heuristik (kata kunci ID/EN) ke enum `electronics | home-living | fashion | sports-hobby` — sumber kebenaran: `src/lib/affiliate/category.ts` + `scripts/lib/category-keywords.json`. Default fallback `fashion`.
3. **Gambar** diunduh (module `https`) → dioptimasi Sharp ke WebP (max 800px, kalitas 80) → `public/images/products/affiliate/<linkId>-<hash>.webp`, dedupe by sha256.
4. `featured: true` hanya untuk 6 produk pertama (batas homepage); sisanya `false`.
5. Ditulis ulang ke `src/data/affiliate-products.ts`, lalu validasi `typecheck` + `test`.

**Penjadwalan otomatis:** `.github/workflows/scrape-affiliate.yml` menjalankan `npm run scrape:affiliate` setiap hari 03:00 UTC (atau via *workflow_dispatch*), memvalidasi gate, lalu commit-perubahan bila ada. Nama kategori tidak tersedia pada data GraphQL item harus dipetakan dari judul — verifikasi hasil klasifikasi ukuran dataset penuh sebelum dipublikasikan.
4. **Properti** — `properties.ts`: tiga listing riil (owner-verified) sudah aktif — Kamarasan Residence (dijual), Buah Batu Park (dijual), Sukaraja Jatiwangi (disewakan, *occupied*). Entri contoh lama ditandai `hidden: true`; hapus flag + isi data untuk mempublikasikan. Harga & alamat lengkap hanya diisi dari data pemilik.
   - Media: foto dioptimasi ke WebP via `node scripts/optimize-property-images.mjs --src <dir> --dest public/images/properties/<slug> [--copy]` — manifest dimensi yang dicetak dipakai mengisi `gallery`.
   - **EN copy pada listing migrated adalah hasil terjemahan asisten** — review owner sebelum launch.
5. **Gambar**: hapus SVG placeholder, unggah aset asli. `ResponsiveImage` otomatis mengaktifkan optimasi next/image untuk non-SVG.
6. **Kebijakan** — `src/config/content.ts`: perbarui tanggal revisi; baca ulang isi `privacy-policy`/`affiliate-disclosure` di `src/messages/*.json`.
7. Cari sisa penanda: `grep -rn "Replace with verified production data" src/`.

## Google Analytics 4

Model: **consent-gated opt-in**. `gtag.js` tidak pernah dimuat sebelum pengunjung menekan *Setuju* pada banner. Penarikan persetujuan (footer → *Preferensi analytics*) menyetel flag `ga-disable-<ID>` sehingga hit berhenti tanpa reload.

Setup:

1. Buat property GA4 di [analytics.google.com](https://analytics.google.com) (Admin → Create Property).
2. Tambahkan **Web data stream** untuk `https://asharu.id`.
3. Salin **Measurement ID** (format `G-XXXXXXXXXX`) dari stream detail.
4. Di Vercel: Project → Settings → Environment Variables → tambahkan `NEXT_PUBLIC_GA_MEASUREMENT_ID` (Production + Preview), lalu redeploy.
5. Uji event:
   - Pasang [Google Tag Assistant](https://tagassistant.google.com) atau aktifkan DebugView (`Admin → DebugView`) dengan parameter `debug_mode=1`, atau
   - Pantau laporan **Realtime** sambil menekan CTA toko/sosial/produk dan mengganti bahasa.
6. Pastikan analytics **tidak dimuat dua kali**: tag hanya dirender oleh `<GoogleAnalytics>` di `[locale]/layout.tsx` (single mount, `strategy="afterInteractive"`); tidak ada tag manual di HTML.

Event kustom yang tersedia (lihat `src/lib/analytics/events.ts`): `click_online_store`, `click_social_media`, `click_affiliate_product`, `view_property` (otomatis via `ViewPropertyTracker`), `click_property_contact`, `click_math_app` (CTA ke math.asharu.id — tracked via `platform: math-app`), `change_language`. Selain itu `PageViewTracker` mengirim `page_view` standar pada setiap navigasi client-side. Parameter diizinkan: `item_id`, `item_category`, `platform`, `locale`, `link_position`. **Dilarang mengirim**: nama, email, nomor telepon, alamat lengkap, isi pesan.

## Deployment ke Vercel

1. Push repo ke GitHub.
2. [vercel.com/new](https://vercel.com/new) → import repository. Framework preset terdeteksi otomatis (Next.js). Build command & output default — tidak ada konfigurasi khusus.
3. Set environment variables (lihat atas). Minimum untuk go-live: kosong pun bisa — situs jalan penuh tanpa analytics/kontak.
4. Deploy. Semua halaman statis (SSG); satu edge function kecil hanya middleware next-intl (~47 kB) — sangat hemat invocation, tanpa cron/background worker/fitur Pro.
5. Verifikasi setelah deploy:
   - `https://<preview>.vercel.app/` → 307 ke `/id`
   - `/sitemap.xml` dan `/robots.txt` merujuk domain final (otomatis ikut `NEXT_PUBLIC_SITE_URL`)
   - Header keamanan hadir (`curl -I`)

### Konfigurasi Domain asharu.id

1. Vercel: Project → Settings → Domains → tambahkan `asharu.id` dan `www.asharu.id`.
2. Di registrar domain, arahkan sesuai instruksi Vercel:
   - A record `@` → `76.76.21.21`, **atau**
   - CNAME `www` → `cname.vercel-dns.com` (+ redirect www → apex, default Vercel).
3. Tunggu propagasi DNS; Vercel menerbitkan sertifikat TLS otomatis (HSTS sudah aktif dari header).
4. Set `NEXT_PUBLIC_SITE_URL=https://asharu.id` bila belum, lalu redeploy agar canonical/hreflang/sitemap konsisten.

## Testing & Quality Gates

21 file test / 115 assertions (Vitest + Testing Library):

| Area | Cakupan |
|---|---|
| Env | validasi Zod: format GA, host wa.me, email, https-only, whitespace→unset |
| Data integrity | semua dataset lolos skema Zod, id/slug unik, batas ≤6 featured, gambar ada di disk, tidak ada price/rating/certificate |
| Messages | paritas kunci id↔en, tanpa nilai kosong, judul home sesuai spek |
| SEO | canonical+hreflang (statis & dinamis), OG/Twitter, sitemap (24 URL + alternates + x-default), robots |
| JSON-LD | WebSite/Organization/ItemList/RealEstateListing/Breadcrumb; tanpa offers/review palsu; URL detail berprefiks locale |
| Komponen | ExternalLink rel & blokir javascript:, ProductCard sponsored nofollow + badge, PropertyBrowser filter/live-count/empty/reset, LanguageSwitcher aria-current & preserve-path, MobileNav aria-expanded/Escape/focus-return, ConsentBanner accept/decline/reopen |

Pemeriksaan manual yang direkomendasikan sebelum launch: responsif 320/375/768/1024/1440 px, keyboard-only, screen reader (NVDA/VoiceOver), kontras (sudah AA by design), `prefers-reduced-motion` (dihormati global), Lighthouse ≥90/95/95/95.

## Keputusan Teknis & Trade-offs

1. **CSP `script-src` mengizinkan `'unsafe-inline'`** — Next.js runtime dan gtag.js memerlukan inline script; nonce-based CSP menuntut middleware per-request untuk situs statis. Risiko diterima karena situs tidak memiliki input pengguna/form. Terdokumentasi di `next.config.ts`.
2. **GA opt-in (bukan opt-out)** — sedikit kehilangan cakupan data awal, tetapi patuh untuk pengunjung yurisdiksi ketat (GDPR/PDP) tanpa CMP pihak ketiga.
3. **Halaman detail properti `[slug]`** — di luar daftar route minimal spek; ditambahkan agar CTA "Lihat Detail" berfungsi nyata dan `RealEstateListing` punya konteks. Tetap statis penuh.
4. **Tanpa markup `Product`/harga JSON-LD** — data placeholder tidak memiliki harga terverifikasi; hanya `ItemList` yang dipancarkan. Aktifkan `Product`+`offers` setelah harga real tersedia.
5. **Placeholder gambar SVG `unoptimized`** — optimizer next/image tidak memproses SVG; aset asli (WebP/JPG) otomatis mendapat optimasi penuh tanpa ubah kode.
6. **`localeDetection` dimatikan** — root selalu → `/id` deterministik untuk crawler; preferensi bahasa tetap disimpan di cookie `NEXT_LOCALE` untuk pemakaian mendatang.
7. **Warning build `metadataBase` dari `/_not-found`** — Next membuat route not-found internal tanpa metadataBase; semua halaman nyata sudah menyetelnya. Kosmetik, tidak berdampak.
8. **Tailwind v3.4 (bukan v4)** — stabilitas config dan ekosistem plugin; upgrade dilakukan terpisah bila dibutuhkan.
9. **Pesan i18n di-scope untuk Client Components** (`src/lib/i18n/client-messages.ts`) — hanya namespace yang dipakai client island yang dikirim ke browser; memangkas ukuran dokumen & biaya hidrasi. Tambahkan namespace baru ke `CLIENT_MESSAGE_NAMESPACES` bila Client Component baru butuh terjemahan.
10. **Target browser modern** (browserslist: Chrome/Edge ≥105, Firefox ≥104, Safari ≥15.4, Opera ≥91) — memangkas polyfill legacy (~11 KB). Browser lama tidak didukung secara eksplisit.

## Checklist Sebelum Launch

- [ ] Ganti semua placeholder `src/data/*` + gambar `public/images/*` (grep "Replace with verified production data")
- [ ] Set `NEXT_PUBLIC_WHATSAPP_URL` & `NEXT_PUBLIC_CONTACT_EMAIL` (CTA muncul otomatis)
- [ ] Baca & sesuaikan teks kebijakan privasi + disclosure afiliasi di `src/messages/{id,en}.json`; perbarui tanggal di `src/config/content.ts`
- [ ] `NEXT_PUBLIC_SITE_URL=https://asharu.id` aktif di Vercel Production
- [ ] Jalankan `npm run lint && npm run typecheck && npm run test && npm run build` — hijau semua
- [ ] Domain asharu.id terhubung + HTTPS aktif + redirect www OK
- [ ] `/id`, `/en`, `/sitemap.xml`, `/robots.txt`, `/manifest.webmanifest`, `/icon.svg` dapat diakses
- [ ] Root `/` → `/id`; language switcher menjaga halaman; mobile menu & consent banner bisa dioperasikan keyboard
- [ ] Tautan afiliasi membawa `rel="sponsored nofollow noopener noreferrer"` + disclosure terlihat
- [ ] GA4 Measurement ID terpasang + DebugView/Realtime menerima 7 event (termasuk click_math_app)
- [ ] Lighthouse (mobile): Performance ≥90, A11y ≥95, Best Practices ≥95, SEO ≥95
- [ ] Tidak ada error console di production build
- [ ] Commit pertama dibuat (repo saat ini masih tanpa riwayat commit)

---

*Lisensi konten: milik Asharu. Placeholder data bersifat ilustratif dan tidak boleh dipublikasikan apa adanya.*
