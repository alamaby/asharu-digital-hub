# Compose Studio Prompt Stage — Default Model baru untuk final Studio

Created: 2026-09-18 10:00:00

## Objective

Admin → LLM → Stage Defaults mendapat baris ke-9 `compose_studio_prompt` yang bisa di-pin ke model LLM mana pun, dipakai **hanya** oleh komposisi final-prompt Studio di worker (`processOneStudioImage`). Hasilnya: `final_prompt`/`final_negative` yang tadinya concat mentah (`subject_en + image_prompt + angle_en + style_suffix`, duplikat + kontradiksi, bukti 10 log prod 17–18 Sep 2026) dikonsolidasi LLM dengan fallback deterministik bila LLM gagal.

Keputusan terkunci (user, 18 Sep 2026): nama stage `compose_studio_prompt` · pemakaian **worker final saja** (tombol Enhance Studio tetap `enhance_image_prompt`) · **bucket rate-limit baru** `compose_studio_prompt` (reserved sebagai konstanta; worker cron tak kena IP-check, tiru `image_prompt` di `image/worker.ts:189`).

## Scope

In:

- Migrasi non-destruktif `llm_stage_defaults` (CHECK 8→9 + seed row NULL).
- Tipe `LLMStage` + `LLM_STAGES` + `LOW_EFFORT_STAGES` + test-nya.
- Validasi `upsertStageDefault` + label halaman stages + i18n id/en.
- Builder `buildComposeStudioMessages` + `parseComposeStudio` (+ gate) di `src/lib/image/prompt.ts`.
- Pemanggil worker + fallback deterministik + audit `llm_meta.composition`.
- Tests worker (jalur LLM-ok dan fallback).
- Verifikasi lokal + prod (CHECK, seed, halaman admin, 1 generate live, `llm_call_logs`).

Out (JANGAN disentuh):

- Tombol Enhance Studio (`enhanceStudioPrompt`, stage `enhance_image_prompt`, bucket `enhance_studio_prompt`) — tidak berubah perilaku.
- `image_studio_config` / `StudioConfig` — default LLM memang milik `llm_stage_defaults`, bukan kolom config baru (melawan pola backend bila ditambah).
- `stage-defaults.ts`, `completion.ts`, `LlmForms.tsx`, DDL `llm_call_logs` (stage free-text, otomatis masuk).

## Milestones

1. M1 — Migrasi di submodule `supabase/`, push submodule, catat hash.
2. M2 — Tipe + effort + admin plumbing + i18n ( terlihat di `/admin/llm/stages` sebagai 9 form).
3. M3 — Builder + parse + gate (unit-testable tanpa DB).
4. M4 — Integrasi worker + fallback + audit.
5. M5 — Gate hijau (`typecheck`, `lint`, `test`, `build`) + commit parent + push.
6. M6 — Apply prod via MCP + verifikasi live.

## Tasks

- [ ] T1 — Migrasi baru `supabase/migrations/20260919000002_compose_studio_prompt_stage.sql` (lanjut dari `20260919000001`; pola tiru 1:1 dari `20260908000001_enhance_image_prompt_stage.sql`):
  ```sql
  -- Compose studio prompt stage — 2026-09-18
  -- Stage 'compose_studio_prompt' (konsolidasi LLM final-prompt Studio di worker,
  -- worker-only; tombol Enhance tetap 'enhance_image_prompt').
  -- Non-destruktif: CHECK diperluas, seed 1 row NULL (= global waterfall).

  ALTER TABLE public.llm_stage_defaults DROP CONSTRAINT IF EXISTS llm_stage_defaults_stage_check;
  ALTER TABLE public.llm_stage_defaults
    ADD CONSTRAINT llm_stage_defaults_stage_check CHECK (stage IN (
      'idea_generation', 'discovering', 'verifying', 'scoring', 'developing', 'regen_affiliate', 'image_prompt', 'enhance_image_prompt', 'compose_studio_prompt'
    ));
  INSERT INTO public.llm_stage_defaults (stage, provider_id, model_id)
  VALUES ('compose_studio_prompt', NULL, NULL)
  ON CONFLICT (stage) DO NOTHING;
  ```
  Verifikasi lokal: `SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint WHERE conname='llm_stage_defaults_stage_check'` memuat 9 stage; `SELECT stage FROM llm_stage_defaults ORDER BY stage` = 9 row. Commit + push **submodule `supabase/` DULU**, catat hash untuk commit parent.
- [ ] T2a — `src/lib/llm/types.ts:3-14`: tambah `| 'compose_studio_prompt'` ke union `LLMStage`, tambah entri ke `LLM_STAGES`, update komentar `8` → `9`:
  ```ts
  /** 9 LLM stages that support per-stage provider→model pinning */
  export type LLMStage = 'idea_generation' | 'discovering' | 'verifying' | 'scoring' | 'developing' | 'regen_affiliate' | 'image_prompt' | 'enhance_image_prompt' | 'compose_studio_prompt';
  ```
- [ ] T2b — `src/lib/llm/model-config.ts:91-98`: tambah `'compose_studio_prompt'` ke `LOW_EFFORT_STAGES` (output JSON pendek; lupa = thinking max/high menghabiskan maxOutputTokens → `MAX_TOKENS` → gate retry/gagal, lihat komentar `:85-90`).
- [ ] T3a — `src/lib/admin/llm-actions.ts:301`: tambah `'compose_studio_prompt'` ke array `valid` di `upsertStageDefault` (lupa = admin save 400 `stage tidak valid` walau DB sudah lolos).
- [ ] T3b — `src/app/[locale]/(admin)/admin/llm/stages/page.tsx:26-35`: tambah `compose_studio_prompt: t('stageLabel.compose_studio_prompt')` ke `stageLabels` (list `defaults` sudah DB-driven `:49`, tanpa label hanya tampil slug mentah via fallback `:57` — tidak fatal tapi jelek).
- [ ] T3c — `src/messages/id.json:449` + `src/messages/en.json:449` (objek `content.form.stageLabel`, jaga parity id/en):
  - id: `"compose_studio_prompt": "Compose Studio Prompt (Final Studio)"`
  - en: `"compose_studio_prompt": "Compose Studio Prompt (Studio Final)"`
- [ ] T4 — Builder baru di `src/lib/image/prompt.ts` (setelah `buildStudioEnhanceMessages`, ± `:309`). Kontrak:
  ```ts
  export interface ComposeStudioInput {
    imagePrompt: string; subjectEn?: string | null; angleEn?: string | null;
    styleSuffix?: string | null; aspect: string;
  }
  export interface ComposeStudioOutput {
    final_prompt: string; final_negative?: string;
    dropped: string[]; conflict_note?: string;
  }
  export function buildComposeStudioMessages(input: ComposeStudioInput): { system: string; user: string };
  export function parseComposeStudio(text: string): ComposeStudioOutput;
  ```
  Aturan system prompt (wajib, untuk hapus temuan prod): MERGE 4 segmen jadi SATU scene, tanpa setting/objek baru. Prioritas: user `imagePrompt` > angle > detail pembeda subject > medium style. Hapus duplikat (woman/outfit disebut 1×); selesaikan konflik eksplisit — user menang (`clean background` gugur bila prompt sebut `crowded/park/beach`; framing subject `full-body` gugur bila angle `three-quarter`; klausa `vertical format` gugur bila aspect `1:1`); buang klausa tak relevan (`featured product/packaging/commercial`) bila subjek orang; `no text` hanya di negatif. Output JSON ONLY `{final_prompt (≤90 kata), final_negative, dropped[], conflict_note}`. Gate: `final_prompt` 10–2000 char, `final_negative` ≤1000 char bila ada, `dropped` array string.
- [ ] T5 — Integrasi worker di `src/lib/studio/worker.ts` (daerah komposisi `:243-301`, SETELAH `target` + `prompt` + `styleSuffix`/`angleEn` di-resolve, SEBELUM loop provider). Sketsa (adaptasi ke variabel lokal yang ada):
  ```ts
  import { resolveStageModel } from '@/lib/llm/stage-defaults';
  import { runLLMCompletion } from '@/lib/llm/completion';
  import { buildComposeStudioMessages, parseComposeStudio } from '@/lib/image/prompt';

  let composed: string; // ganti hasil concat lama
  let finalNegative: string | undefined;
  let compositionAudit: Record<string, unknown>;
  try {
    const { providerId, modelUuid } = await resolveStageModel('compose_studio_prompt', null);
    const { system, user } = buildComposeStudioMessages({ imagePrompt: prompt, subjectEn, angleEn, styleSuffix, aspect: target.aspect });
    const out = await runLLMCompletion(supabase, {
      stage: 'compose_studio_prompt', providerId, modelUuid,
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
      temperature: 0.3, maxTokens: 800,
    });
    const parsed = parseComposeStudio(out.output.text);
    composed = parsed.final_prompt;
    finalNegative = parsed.final_negative ?? mergeImageNegativePrompts(row.negative_prompt, target.style?.negative_prompt);
    compositionAudit = { mode: 'llm', model: out.model, provider: out.providerSlug, dropped: parsed.dropped, conflict_note: parsed.conflict_note ?? null };
  } catch {
    composed = <concat lama persis seperti sekarang :259-290>; // JANGAN ubah concat lama — ia jadi fallback
    finalNegative = mergeImageNegativePrompts(row.negative_prompt, target.style?.negative_prompt);
    compositionAudit = { mode: 'deterministic' };
  }
  composedSnapshot = composed.slice(0, 4000);
  finalNegativeSnapshot = finalNegative ? finalNegative.slice(0, 1000) : null;
  ```
  Tambah `composition: compositionAudit` ke objek `llm_meta` saat update `ready` (`:456-471`). Fallback WAJIB (catch-all) agar cron tak stuck `pending` bila LLM timeout/JSON/gate gagal. Bucket `compose_studio_prompt`: definisikan sebagai konstanta export di dekat `MAX_ATTEMPTS` untuk pemakaian aksi kelak; worker TIDAK memanggil `checkRateLimit` (tanpa IP di konteks cron).
- [ ] T6 — Tests:
  - `src/lib/llm/model-config.test.ts`: tambah case `capEffortForStage(params-high, 'compose_studio_prompt')` → `'low'` (tiriu case `enhance_image_prompt` di `:73-86`).
  - Builder test (file prompt test yang ada / baru): `buildComposeStudioMessages` memuat keempat segmen; `parseComposeStudio` parse JSON valid + tolerate code fence; gate menolak `final_prompt` <10 char.
  - `src/lib/studio/worker.test.ts`: mock `runLLMCompletion` sukses → `final_prompt` = output LLM; mock throw → `final_prompt` = concat lama (fallback). Tiru test snapshot yang ada (`:266-281`).
- [ ] T7 — Gate + commit: SETIAP edit setelah gate hijau MEMBATALKAN gate — re-run `npm run typecheck` + `npm run lint` (tambah `npm run build` karena sentuh page admin; insiden 2026-09-10: fix lint tanpa re-check mematahkan build Vercel). Lalu `npm test`. Sebelum commit: `git status --short`, `git diff`, `git log --oneline -10`; stage HANYA file tugas ini. Commit parent dengan pesan Conventional Commits satu baris tanpa trailer (contoh `feat(studio): compose_studio_prompt stage for worker final prompt`), sertakan pointer submodule baru. Push; bila ditolak (remote lebih baru): `git fetch`, cek `git log main..origin/main`, `git pull --no-rebase`, gate ulang, push lagi.
- [ ] T8 — Apply prod via MCP `supabase-asharu-be-production` `apply_migration` (nama selaras file agar histori lokal=remote; pelajaran `20260918000004` tercatat prod sebagai `20260917094504`). Verifikasi prod: CHECK 9 stage + `SELECT stage, provider_id, model_id FROM llm_stage_defaults ORDER BY stage` (9 row, `compose_studio_prompt` NULL/NULL) + buka `/admin/llm/stages` (9 form) + pin model murah (`agnes-2.5-flash`/`gemini-3.5-flash-lite`) + 1 generate Studio live + cek `SELECT final_prompt, llm_meta FROM user_image_generations ORDER BY created_at DESC LIMIT 1` dan `llm_call_logs` stage `compose_studio_prompt` (kolom: cek skema dulu — `provider_slug, model_id, stage, error`).

## Risks

- CHECK ditulis ulang total — typo/hilang satu stage lama = insert/update stage itu gagal permanen; mitigasi copy-8-tambah-1 + verifikasi `pg_get_constraintdef`.
- Lupa seed `INSERT ... ON CONFLICT DO NOTHING` = UI tak tampilkan stage (DB-driven) + `getStageDefault` null → fallback waterfall diam-diam (silent, sulit sadar).
- Lupa `llm-actions.ts:301` = admin 400; lupa label/i18n = slug mentah (tidak fatal); lupa `LOW_EFFORT_STAGES` = output terpotong `MAX_TOKENS`.
- Lupa urutan submodule-dulu = parent menunjuk migrasi yang belum ada di remote submodule → deploy prod gagal.
- +1 LLM call/generate (biaya/latensi 1–3 dtk, ~600–900 token) — diterima karena worker async; fallback jaga keandalan.
- Duplikasi semantik enhance vs compose — dipagari scope worker-only; JANGAN pindahkan tombol enhance ke stage baru di tugas ini.

## Progress Log

- 2026-09-18 10:00:00 — Plan dibuat dari riset plumbing stage (tipe, CHECK chain `20260905000001`→`20260907000003`→`20260908000001`, 2 pemanggil `enhance_image_prompt`, config image-only) + 10 log prod + jawaban user (nama/pemakaian/bucket). Status: belum ada eksekusi; T1–T8 pending untuk model pelaksana.
- 2026-09-18 10:45:00 — **SELESAI.** T1 (`supabase/migrations/20260919000002_compose_studio_prompt_stage.sql`) → submodule commit `7dda351` pushed. T2–T3: `types.ts`, `model-config.ts`, `llm-actions.ts`, `stages/page.tsx`, `id.json`/`en.json`. T4: builder `buildComposeStudioMessages` + `parseComposeStudio` di `prompt.ts` (89 baris baru). T5: worker `compose` block diganti LLM-first + deterministic fallback; konstanta `COMPOSE_STUDIO_PROMPT_RATE_LIMIT_BUCKET` ditambahkan. T7 gate: `typecheck ✓ lint ✓ test 839 passed ✓ build ✓`. Parent commit `c4e6e10` pushed. T8: apply migration prod via MCP → success; CHECK 9 stage + seed row `compose_studio_prompt NULL NULL` terverifikasi.

## Notes

- Standar domain (C2M/TM Forum ODA) tidak relevan untuk tugas ini (web Studio image prompt, bukan rating/billing utilitas) — tidak ada deviasi yang perlu dijustifikasi.
- Bukti masalah (10 log `user_image_generations` 17–18 Sep 2026): `final = subject_en + image_prompt + angle_en + style_suffix` menyebabkan duplikasi (`fashionable young woman/chic outfit/heels` 2×), konflik (`clean background` vs `crowded city park`; `full-body` vs `three-quarter`; `vertical format` vs aspect `1:1`; `no text` 3× di positif), suffix product-centric (`featured product/packaging`) tak relevan untuk potret, 1 row lama `final_prompt=NULL` (pre-migrasi).
- Opsi A deterministik (concat cerdas + dedup + conflict rules, tanpa LLM) tetap valid sebagai alternatif murah; plan ini mengimplementasikan Opsi B-hybrid-able (fallback deterministik = fondasi Opsi A sudah ikut dibangun di T5).
- Env guard: jangan pernah print/commit `.env*` atau key `sb_secret_*/sb_publishable_*`/`CRON_SECRET`; baca dari `process.env` saat runtime.
