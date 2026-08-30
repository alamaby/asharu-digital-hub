# Add NaraRouter Provider to Opencode (Global)

Created: 2026-08-27 08:00:00

## Objective
Menambahkan custom provider `naraya` (NaraRouter via `@ai-sdk/openai-compatible`, `https://router.bynara.id/v1`) ke global `opencode.json` dengan 8 model dan default `nemotron-3-ultra`, sesuai konfirmasi user global + hardcode placeholder.

## Scope
- File target: `C:\Users\alama\.config\opencode\opencode.json` (global, deep-merge)
- Preserve: `mcp` (5 servers), `provider.9router`, `provider.freellmapi`, `agent.explorer`, `$schema`
- Tambah: `provider.naraya` dengan 8 models
- Update: `model` dari `freellmapi/auto` → `naraya/nemotron-3-ultra`
- Não scope: project-level `asharu-digital-hub/opencode.json` (tidak dibuat)

## Milestones
1. Backup & validasi global config existing
2. Tambah provider naraya + 8 models
3. Validasi JSONC & restart opencode

## Tasks
- [x] Konfirmasi scope global, hardcode, 8 model list, default `nemotron-3-ultra`
- [x] Backup global `opencode.json` (existing backups ada di `~/.config/opencode/opencode.json.bak-*`)
- [x] Edit `opencode.json` tambah `provider.naraya` (hardcode `sk_nry_your_api_key`)
- [x] Validasi JSON (allowTrailingCommas, allowComments) dan schema `https://opencode.ai/config.json`
- [x] Restart opencode & verifikasi `/model` menampilkan 8 `naraya/*` — `opencode models naraya` sukses

## Risks
- Hardcode `apiKey` plaintext di global JSON — mitigasi: permission 600, jangan share backup. Trade-off disetujui user (placeholder).
- `qwen-3.8-max-free` / `qwen3.8-27b` mengandung `.` — valid di schema `ProviderConfig.models` (string key), tapi harus match persis id di NaraRouter; jika salah, model tidak ditemukan saat chat.
- Trailing comma di `9router.models` existing (allowTrailingCommas: true) — preserve agar tidak break startup.
- Default global `naraya/nemotron-3-ultra` akan jadi default untuk semua project yang tidak override `model`.

## Progress Log
- 2026-08-27 08:00:00 — Plan dibuat setelah eksplorasi global config (2 provider existing, no naraya) dan schema fetch valid.
- 2026-08-27 08:00:00 — User konfirmasi: global, hardcode placeholder, default `nemotron-3-ultra`, 8 models list.
- 2026-08-27 08:00:00 — Build mode aktif, mulai eksekusi.
- 2026-08-27 08:00:00 — Edit `C:\Users\alama\.config\opencode\opencode.json:87-154` tambah `provider.naraya` 8 models, `model` → `naraya/nemotron-3-ultra`.
- 2026-08-27 08:00:00 — Validasi: `opencode models naraya` menampilkan 8 model, `opencode models` menampilkan `9router/*`, `freellmapi/*`, `naraya/*` — config valid.

## Notes
- Provider shape: `npm: "@ai-sdk/openai-compatible"`, `name: "NaraRouter"`, `options.baseURL`, `options.apiKey`, `models.*.modalities {input:[text,image], output:[text]}` — sesuai `ProviderConfig` di schema.
- API key placeholder `sk_nry_your_api_key` — ganti manual ke key asli Nara jika ingin pakai, atau ubah ke `{env:NARAYA_API_KEY}` nanti untuk env-var.
- Setelah save, wajib quit & restart opencode (config tidak hot-reload). Jika config broken, escape hatch: `OPENCODE_DISABLE_PROJECT_CONFIG=1` atau `OPENCODE_CONFIG_CONTENT`.
