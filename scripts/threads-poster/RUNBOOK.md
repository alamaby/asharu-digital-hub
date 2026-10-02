# RUNBOOK — Threads Playwright Poster

Tool manual-run untuk memposting thread ke Threads (@asharu.id) via Playwright.
Dijalankan dari laptop, bukan server. Butuh interaksi manusia untuk login dan
verifikasi visual.

## Prasyarat

1. **Node.js ≥ 20.9** dan npm
2. **Playwright Chromium** terinstall: `npx playwright install chromium`
3. **Sesi login** tersimpan: `npm run threads:auth` (login manual sekali)
4. **Selectors terverifikasi**: `npm run threads:probe` (probe headed sekali)
5. **Job JSON** berisi teks + replies yang mau diposting

## Alur Kerja

### 1. Login sekali (atau bila sesi expired)

```bash
npm run threads:auth
```

- Browser headed terbuka → login manual sebagai @asharu.id (termasuk 2FA)
- Tekan ENTER di terminal setelah feed Threads tampil
- Sesi tersimpan di `scripts/threads-poster/auth.json` (TER-GITIGNORE)

### 2. Probe selectors (pertama kali / setelah UI Threads berubah)

```bash
npm run threads:probe
```

- Browser headed terbuka → login bila diminta
- Script memandu verifikasi locator: composeOpen, composeText, imageInput,
  locationField, topicField, submitButton, replyButton
- Hasil disimpan ke `selectors.json` dengan `verified: true/false`
- **Bila `verified: false`**: field yang gagal verifikasi akan di-skip dengan
  warning saat posting. Re-probe setelah UI Threads berubah.

### 3. Dry-run (tanpa publish)

```bash
npm run threads:post -- --job scripts/threads-poster/job.example.json --dry-run --headed
```

- Membuka composer, mengisi semua field, screenshot — TIDAK submit
- Verifikasi visual: apakah teks, image, location, topic terisi dengan benar
- Screenshot tersimpan di `reports/dryrun-main.png`

### 4. Posting sungguhan

```bash
# Headless (default) — untuk run stabil
npm run threads:post -- --job myjob.json

# Headed — untuk debug visual
npm run threads:post -- --job myjob.json --headed

# Fast mode (delay kecil, untuk uji cepat)
npm run threads:post -- --job myjob.json --fast --yes

# Override delay
npm run threads:post -- --job myjob.json --action-delay 4,12 --publish-delay 300,600
```

### 5. Cek hasil

- **Console**: URL post utama + URL tiap reply tercetak dengan prefix `[link]`
- **Report JSON**: `scripts/threads-poster/reports/report-YYYYMMDD-HHmmss.json`
  - `mainUrl`: URL post utama
  - `replies[]`: URL tiap reply (berantai)
  - `actionDelaysSec[]`: jeda aksi UI aktual (detik)
  - `publishDelaysSec[]`: jeda publish aktual (detik)
  - `skipped[]`: field yang dilewati (mis. location tidak didukung web)
  - `failedAt`: bila run gagal di tengah chain

## Job Schema

```json
{
  "text": "post utama (wajib, max 500 char)",
  "image": "path/to/image.jpg atau null",
  "location": "Jakarta atau null",
  "topic": "fotografi atau null",
  "delays": {
    "action": { "minSec": 4, "maxSec": 12 },
    "publish": { "minSec": 300, "maxSec": 600 }
  },
  "replies": [
    { "text": "reply 1", "image": null },
    { "text": "reply 2", "image": "path/to/reply2.jpg" }
  ]
}
```

- `text` wajib, max 500 karakter
- `image`, `location`, `topic` opsional (null = skip)
- `replies` boleh kosong (hanya post utama)
- `delays` opsional (default: action 4–12s, publish 300–600s)

## Delay Configurable

| Knob | Default | Fungsi | Override |
|---|---|---|---|
| `action` | 4–12 detik | jeda antar klik/isi UI | `--action-delay 4,12` atau job JSON |
| `publish` | 300–600 detik | jeda antar publish | `--publish-delay 300,600` atau job JSON |

**Prioritas**: CLI > job JSON > default. Nilai efektif selalu di-log di awal run.

**Fast mode** (`--fast`): action → 1–2s, publish → 5–10s. Hanya untuk uji cepat.
Wajib konfirmasi `YA` kecuali `--yes`.

## Troubleshooting

### Sesi expired / login page muncul

```
Error: sesi tidak valid; jalankan npm run threads:auth
```

→ Jalankan `npm run threads:auth`, login ulang, ENTER.

### Selector tidak ditemukan

```
Error: selectors.json: composeOpen belum di-set — jalankan npm run threads:probe
```

→ Jalankan `npm run threads:probe`, verifikasi semua field, pastikan `verified: true`.

### Publish timeout

```
Error: publish timeout setelah 60s (url tetap ...)
```

→ Bisa karena:
- UI Threads berubah (selector submitButton salah) → re-probe
- Koneksi lambat → coba lagi
- Threads challenge/2FA → login manual di browser headed

### Location/topic tidak didukung web

```
[warn] location tidak tersedia di web / belum diprobe — dilewati
```

→ Location/topic picker mungkin hanya ada di aplikasi mobile. Field di-skip,
post tetap terkirim tanpa metadata tersebut. Cek `selectors.json` → `capabilities`.

### Laptop sleep saat run

→ Run akan gagal. Set power plan "Never sleep" selama run, atau gunakan
`--fast` untuk uji cepat. Report parsial tetap tersimpan.

## Keamanan

- `auth.json` (sesi browser) TER-GITIGNORE — jangan pernah di-commit
- `reports/` TER-GITIGNORE — berisi URL post yang bisa sensitif
- Jangan share `auth.json` atau isi `reports/` ke publik
- Sesi expired otomatis setelah beberapa hari → re-run `npm run threads:auth`

## Estimasi Durasi

| Jumlah reply | Delay publish (300–600s) | Delay aksi (4–12s) | Total estimasi |
|---|---|---|---|
| 0 (hanya main) | 0 | ~10–30s | ~30s |
| 1 | 5–10 mnt | ~20–60s | ~6–11 mnt |
| 5 | 25–50 mnt | ~2–5 mnt | ~27–55 mnt |

Laptop harus tetap ON dan tidak sleep selama seluruh run.
