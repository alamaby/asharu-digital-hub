# Bynara 4 model reasoning + reasoning effort per-target di Chat Lab

Tanggal: 2026-09-27 16:17

## Tugas

1. Tambah 4 model Bynara (slug DB `naraya`) dengan reasoning effort max: `agnes-3-flash`, `longcat-2.5`, `space-bunny-alpha`, `space-bunny-alpha-bynara`.
2. Layar Chat Lab (`/lab`): setiap target (provider+model) bisa pilih reasoning effort masing-masing (Ikut model / off / low / medium / high / max).

## File kunci

- `supabase/migrations/20260927000001_llm_models_bynara_reasoning_4.sql` — additive upsert 4 baris `llm_models` (priority 300..330, `config={"reasoning":true,"reasoning_effort":"max"}`).
- `src/lib/lab/types.ts` — `LabEffort = 'off' | ReasoningEffort | null`; `LabTarget.reasoningEffort?`; `LabOptions.models` tambah `config` (default per-model bisa ditampilkan UI).
- `src/lib/lab/validation.ts` — zod `reasoningEffort` enum (`off` + `REASONING_EFFORTS`), default null.
- `src/lib/lab/actions.ts` — `listLabOptions` select `config`; `runChatLabBatchImpl` teruskan `reasoningOverride: t.reasoningEffort ?? null` per target ke `runLLMCompletion`.
- `src/lib/llm/completion.ts` — `ReasoningOverride` + `applyReasoningOverride()` (dipakai di generic waterfall, `tryPinnedModel`, `tryPinnedModelHint`). Semantik: `off` hapus semua knob reasoning (effort+budget+level); nilai effort hanya timpa `reasoningEffort` — `thinking_level`/`thinking_budget` eksplisit DB tetap menang (konsisten `buildThinkingConfig`). Override diterapkan SETELAH `capEffortForStage` (intent eksplisit menang cap; stage `chat_lab` tak kena cap anyway).
- `src/components/lab/LabForm.tsx` — select effort per baris target (`EffortOption` = ''/'off'/efforts), grid `sm:grid-cols-[1fr_1fr_1fr_auto]`, reuse effort default '' (ikut model).
- i18n `src/messages/{id,en}.json` — `lab.form.effortLabel` + `effortFollow`.
- Test: `completion.test.ts` (baru, 5 test `applyReasoningOverride`), `validation.test.ts` (+2), `actions.test.ts` (+1 forwarding per-target; default hoist mock di-cast `(...a: unknown[]) => Promise<unknown>`).

## Keputusan

- Slug DB Bynara = `naraya` (bukan `bynara`; `bynara` hanya image provider) — konsisten semua migrasi model Bynara sebelumnya.
- Default dropdown = "Ikut model" (bukan max) — jaga perilaku lama; effort max tersedia eksplisit.
- Opsi A audit: `chat_lab_runs` TIDAK dikolom-kan effort (riwayat + reuse tidak tahu effort yang dipakai; reuse kembali ke "Ikut model"). Bisa ditambahkan kelak bila perlu audit per-run.
- `space-bunny-alpha` vs `space-bunny-alpha-bynara` diasumsikan 2 model berbeda (konfirmasi user) — bukan alias.

## Verifikasi

- Gate: typecheck ✓, lint ✓ (0 error; hanya warning pre-existing), test ✓ 1173/1173.
- Migrasi applied PROD via MCP `apply_migration` `llm_models_bynara_reasoning_4` (success), verifikasi SELECT: 4 baris aktif priority 300..330 config reasoning max.
- Commit: submodule `e139a8d` pushed; parent `3620097` pushed (11 file).

## Sisa / catatan

- Deploy Vercel agar fitur Lab effort per-target live di prod (DB sudah, kode menunggu deploy).
- Verifikasi live: `/id/lab` → pilih naraya + model baru → submit; effort "off" harus benar-benar tak mengirim `reasoning_effort` ke router (cek `llm_call_logs` bila perlu).
- Bila salah satu `space-bunny-alpha*` ternyata alias yang sama, nonaktifkan lewat admin (`/admin/llm`) tanpa migrasi baru.

## Usul commit

`feat(lab): per-target reasoning effort picker + 4 bynara reasoning models`
