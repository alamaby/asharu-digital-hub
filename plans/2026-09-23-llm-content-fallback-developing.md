# LLM Content-Aware Fallback (Developing Artikel)

Created: 2026-09-23 10:40:00

## Objective

Kegagalan sesi `db9d92e8-2511-4244-82fe-df6d8df072a8` tidak terulang: `parse artikel gagal / CJK` dianggap gagal LLM dan memicu fallback lintas model/provider (termasuk Cloudflare) dalam 1 attempt, bukan mengulang model yang sama 4x lalu `failed`.

## Scope

- `src/lib/llm/completion.ts` — definisi gagal + waterfall (tambah jalur fallback konten).
- `src/lib/llm/prompt.ts` — `debugArticleRejectReason` saat `id+en null`, pesan `semua field valid` yang menyesatkan.
- `src/lib/research/development.ts` — retry artikel pakai model/provider berbeda, batas attempt, log warn fallback konten.
- Audit data: 3 model Cloudflare `failure_count=6` tapi masih `is_active=true`.
- Tidak termasuk: rename key `id/en`, ubah semantik batch `failed vs partial` (follow-up terpisah).

## Milestones

1. Reproduksi +konfirmasi akar (log prod + unit test gagal).
2. Fallback konten-aware di developing (coba model/provider berikut, max 2 fallback/attempt).
3. Perbaiki pesan debug + audit auto-disable CF.
4. Gate hijau + review manual 1 sesi artikel.

## Tasks

- [ ] Tambah test gagal: `parseArticleDraft` null/CJK → `runLLMCompletion`/wrapper lanjut ke kandidat berikut (bukan return sukses).
- [ ] Implementasi `tryNextModelOnContentReject` di developing: loop kandidat `fetchOrderedModels` lintas provider (naraya→cloudflare→gemini→ciora), `markModelFailure` hanya untuk reject konten (tidak menaikkan `key failure`).
- [ ] Cap max 2 fallback konten per attempt + log `content_research_logs warn` (`parse-fail <reason> → fallback <provider/model>`).
- [ ] Perbaiki `debugArticleRejectReason`: bila `id+en` null → `kedua bahasa null (butuh id)`, bukan `semua field valid`.
- [ ] Audit 3 model CF `failure_count=6 & is_active=true`; nonaktifkan manual atau perbaiki threshold bila memang seharusnya mati.
- [ ] Re-run `npm run typecheck`, `npm run lint`, `npm test` relevan; verifikasi 1 sesi artikel E2E (atau dry-run developing saja).

## Risks

- Biaya/latensi naik: 1 attempt bisa 2-3 LLM call. Mitigasi: cap 2 fallback + hanya untuk reject parse/CJK, bukan thin-content/emoji.
- `markModelFailure` konten bisa menonaktifkan model bagus yang sekali apes. Mitigasi: counter terpisah (`content_failure_count`) atau threshold lebih longgar dari gagal transport.
- Fallback lintas provider mengubah gaya bahasa artikel antar-retry. Mitigasi: urutan deterministik + catat `llm_meta.fallback_chain` di draf.
- Counter-argument: alternatif murah adalah perketat prompt saja (contoh negatif duplikat-key, tegaskan `jangan output null`). Itu tidak mengatasi bias CJK model yang berulang — prompt-only sudah dicoba (aturan Latin-only + CJK gate) dan tetap bocor 4x di sesi ini.

## Progress Log

- 2026-09-23 10:40:00 — Plan dibuat dari RCA sesi `db9d92e8`: naraya `agnes-2.5-flash` 4x gagal (CJK `支气管/尤其/间断/习惯`, duplikat `"id"`, `sections` top-level, meta-only), Cloudflare sehat tapi tak tersentuh karena fallback hanya transport-level. Menunggu persetujuan implementasi.

## Notes

- Bukti: `llm_call_logs` 6 baris sesi ini semua naraya, `is_fallback=false`, `finish=stop`; `llm_stage_defaults.developing=null/null` (waterfall global); `DEVELOP_PAIRS_PER_TICK=6` (`src/lib/research/thread.ts:12`); fail mark di `src/lib/research/development.ts:441-450`, retry di `930-944`; guard sukses semu di `src/lib/llm/completion.ts:145-212`.
- Skala kecil (1 stage, 1 jenis reject) → tidak pakai ceremony TOGAF ADM penuh; cukup desain + test + log audit di file ini.
