# Image Prompt Reasoning (Before Strategy)

Created: 2026-09-07 15:30:00

## Objective
Fix contradiction where pain-hook main post ("sempit dan berantakan") gets aspirational After visual (neat/organized/spacious). Add explicit LLM reasoning + deterministic contradiction gate before provider call, default visual_strategy=before for pain hooks.

## Scope
- src/lib/image/prompt.ts (builder + parser + gate)
- src/lib/image/worker.ts (full context + gate + retry + persist reasoning)
- supabase migration: content_draft_images.reasoning jsonb (non-destructive ADD COLUMN IF NOT EXISTS)
- tests: providers.test.ts + gate tests
- UI: DraftImageCard + review page show strategy/justification

## Milestones
1. Prompt builder with reasoning schema
2. Worker gate + retry + persist
3. Migration applied (submodule then parent)
4. Tests + UI + gates green + commit/push

## Tasks
- [x] Plan file + baca file terkait
- [ ] Perluas prompt builder dengan reasoning Before
- [ ] Update worker: konteks penuh + gate contradiction + retry + simpan reasoning
- [ ] Migrasi reasoning jsonb (submodule + parent)
- [x] Test builder/parser + gate
- [x] UI review tampilkan strategi/justifikasi
- [x] Gate typecheck/lint/test + commit+push

## Risks
- Before yang terlalu kumuh turunkan CTR — mitigasi: brief "relatable messy, not filthy/disgusting".
- Retry tambah biaya/latensi LLM — batasi maxTokens 500, retry hanya saat gate gagal.
- Migrasi submodule + parent pointer — lakukan submodule dulu baru parent.

## Progress Log
- 2026-09-07 15:30:00 — Plan dibuat dari analisa draft 6d9658e9 (pain-hook vs After visual). Strategi: Before pain-forward default + kolom reasoning baru.

## Notes
- Deviation from Oracle C2M/TM Forum ODA: not applicable — this is a content-pipeline bugfix, not telecom rating/billing. No domain model deviation.
- pain keywords ID/EN: sempit/berantakan/cramped/messy; after-words banned under before: neat/organized/spacious/aesthetic and spacious/luas/rapi/estetik sebagai kondisi (bukan janji).
