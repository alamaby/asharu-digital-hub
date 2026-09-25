# 2026-09-25 — Endpoint Try: pertahankan path prefix upstream (fix BlazeAPI 404)

Tanggal: 2026-09-25 ~08:25 WIB
Topik: `/lab/try` proxy membuang path prefix base URL → `Upstream 404` untuk provider ber-prefix seperti BlazeAPI (`/paid/v1`).

## Masalah
- User isi base URL `https://api.blazeapi.org/paid/v1`, dapat error:
  `Upstream 404: {"error":{"message":"Not found. Use https://api.blazeapi.org/paid/v1/chat/completions or /paid/v1/messages",...}}`.
- Akar: `assertAllowedBaseUrl` mengembalikan `origin` (scheme+host saja); kedua proxy (`chat/route.ts`, `models/route.ts`) membangun URL upstream dari `origin`, sehingga `/paid/v1` hilang dan request mendarat di `https://api.blazeapi.org/chat/completions` yang memang tidak ada. Bug di kode kita, bukan di BlazeAPI.

## Perubahan
- `src/lib/endpoint-try/validation.ts`: helper baru `joinUpstreamPath(base, suffix)` — gabung base (prefix path dipertahankan, query/hash dibuang, trailing slash dinormalisasi, suffix ganda dicegah case-insensitive).
- `src/app/api/endpoint-try/chat/route.ts`: pakai `r.base` + `joinUpstreamPath(…, '/chat/completions' | '/messages')`.
- `src/app/api/endpoint-try/models/route.ts`: pakai `r.base` + `joinUpstreamPath(…, '/models')`.
- `src/lib/endpoint-try/validation.test.ts`: 3 test regresi (prefix dipertahankan untuk chat/models/messages, root path tak berubah, suffix ganda dicegah).
- Perilaku lama untuk base tanpa prefix (`https://api.openai.com/v1`) tidak berubah.

## Asumsi & risiko
- SSRF guard tak berubah (masih `origin`-based: userinfo/protocol/blocked-hostname); path prefix tidak menambah permukaan SSRF karena origin sama.
- Bila user mengetik full path endpoint (`…/chat/completions`), helper memakai base apa adanya (tidak digandakan).
- Counter-argument: provider yang menaruh `/models` di path berbeda tetap bisa 404 — tapi itu keterbatasan wajar proxy generik, pesan upstream sudah diteruskan jujur ke UI.

## Verifikasi
- `npm run typecheck` ✓ hijau.
- Targeted: `src/lib/endpoint-try` + `messages` = 78 tests ✓ (validation 36 incl. 3 baru).
- Full `npm test` ✓ 117 files / 1155 tests hijau.
- `npm run lint` standalone tetap tak bisa jalan (instalasi eslint lokal rusak — pre-existing).

## Tindak lanjut (user)
- Coba lagi di `/lab/try` dengan base `https://api.blazeapi.org/paid/v1` → Uji List Model lalu Kirim. Perlu deploy Vercel dulu agar fix live.
