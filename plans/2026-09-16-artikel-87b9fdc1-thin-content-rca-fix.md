# RCA + Fix Draf Artikel `87b9fdc1` — Thin Content 505 Kata & Publish Terblokir

Created: 2026-09-16 14:05:00

## Objective

Memulihkan draf artikel otomasi `87b9fdc1-3669-4465-bec8-f7c74c20525e` (sesi `fa620eb4-a689-41bb-9097-23d99d06ec55`, automation run `fa60c0e9`) yang berhenti di `needs_review` dengan 505 kata dan tidak pernah publish walau cover sudah `selected`, serta mencegah terulangnya kelas kegagalan yang sama (LLM output under-length + JSON cacat → repair gagal parse → fallback draf tipis → gate publish menolak).

## Scope

- Tolerant JSON salvage di level parser artikel (`repairArticleJson`).
- Retry + hardening aturan JSON pada thin-repair otomatis dan prompt artikel.
- Perbaikan wiring pin model pada `expandArticleDraft`.
- Penanganan `thin_content` di automation runner sebelum loop cover/publish.
- Unit test dengan fixture payload cacat asli.
- Pemulihan draf `87b9fdc1` (tindakan manual admin pasca-deploy).

## Non-Scope

- Mengubah `ARTICLE_MIN_WORDS` (tetap 600) atau memasukkan FAQ ke `countArticleWords`.
- Menambah dependency baru (mis. `jsonrepair`).
- Mutasi langsung DB produksi (MCP read-only).

## Milestones

1. Fase 1 — Tolerant JSON salvage + test.
2. Fase 2 — Retry repair + hardening prompt + fix pin model.
3. Fase 3 — Automation menangani thin_content lebih awal.
4. Gate + pemulihan draf.

## Tasks

- [x] Fase 1: tambah `repairArticleJson(text)` dan panggil dari `parseArticleDraft` setelah `JSON.parse` gagal.
- [x] Fase 1: unit test fixture payload malformed `8ed0ec63` (5 section, 4 FAQ, > 600 kata).
- [x] Fase 2: retry 1x pada thin-repair di `development.ts`.
- [x] Fase 2: aturan validitas JSON eksplisit di `buildArticlePrompt` + `buildArticleExpandPrompt`.
- [x] Fase 2b: diverifikasi pin model SUDAH dihormati (`resolveStageModel` override menang) — tanpa perubahan kode.
- [x] Fase 3: runner cek `llm_meta.thin_content` sebelum `awaiting_cover` (fail-fast, `article_draft_id` disimpan untuk retry admin).
- [ ] Gate: `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`.
- [ ] Pasca-deploy: expand + publish manual draf `87b9fdc1`.

## Risks

- Repair berbasis string rapuh dan bisa false-positive bila body kebetulan memuat literal `","h2":`. Mitigasi: hanya dijalankan setelah parse ketat gagal, hasil tetap divalidasi struktur.
- Menambah retry memperpanjang durasi tick (`maxDuration 300`). Mitigasi: hanya 1 retry, pola sama dengan retry generate awal yang sudah ada.
- Perubahan runner menyentuh alur otomasi yang baru live; salah gate bisa membuat run gagal lebih awal. Mitigasi: hanya menandai lebih jelas, tidak menghapus jalur cover.

## Progress Log

- 2026-09-16 14:05:00 — Plan dibuat. RCA: LLM expand menghasilkan 910 kata valid tapi JSON kehilangan kurung tutup antar-elemen `sections` (`","h2":` seharusnya `"},{"h2":`), sehingga `sections` ter-parse 1 elemen (< 3) → `parseArticleLang` null → repair gagal → fallback draf 505 kata → gate publish menolak walau cover sudah `selected`.
- 2026-09-16 17:19:00 — Implementasi selesai. Fase 1: `repairArticleJson` (deteksi signature kolaps + menang-banyak-section, fallback `}{`/trailing-comma) + 4 test baru. Fase 2: retry thin-repair 1x (temp 0.3 + reminder) + aturan JSON eksplisit di kedua prompt artikel. Fase 2b: pin model expand ternyata sudah dihormati — tanpa perubahan. Fase 3: runner fail-fast untuk `thin_content` (hemat cover+publish, `article_draft_id` disimpan untuk retry) + 2 test baru. Gate: typecheck ✓ lint ✓ test 698/698 ✓ build ✓ (SSG mencakup slug artikel ini).
- 2026-09-16 17:20:00 — Operasional: user expand manual (827 kata) + publish 09:33 UTC → artikel live `/id/artikel/tren-fashion-koko-anak-acara-spesial` dengan cover. Sisa: deploy Vercel agar fix kode aktif untuk run berikutnya.

## Notes

- Gate yang dimaksud adalah jumlah **kata** (`ARTICLE_MIN_WORDS = 600`), bukan karakter.
- `automation_runs.fa60c0e9` sudah `failed` dengan `attempts = 3/3`, tidak akan retry otomatis.
