# RCA Riset Relevansi — Input Dinamis, Bukan Hardcode Gen Z

Created: 2026-09-05

## Konteks
Sesi `5da790d3-7baa-4df7-af6a-ee92d77e35d2` status `awaiting_selection`: 5 topik (Wisata Premium shortlisted, 3 ekonomi), Parameter Riset banyak `—` di UI. User klarifikasi: Gen Z adalah **variabel input** dari form, bukan konstanta — harus diteruskan dinamis ke Tavily & discovery LLM.

## RCA Terverifikasi (DB)
- `content_research_sessions` `topic=null language=null target_category=null ...` karena sesi dibuat sebelum `20260904000002_research_detail_fields.sql` (8 kolom baru) — sesi baru sudah terisi via `actions.ts:212`.
- `buildQueries` `discovery.ts:48` hanya pakai `interests.slice(0,2)` + `allowedCategories.slice(0,2)` + 3 query generik `berita terbaru` → Tavily `topic:news` bias finance. `chunk 10×300char` `prompts.ts:149` potong niche.
- `buildDiscoveryPrompt` `prompts.ts:68` `TARGET AUDIENS` hanya teks di `system`, `WAJIB >=5 JANGAN mengarang di luar search` di `user` lebih kuat → finance lolos demi kuota.
- Affiliate `affiliate.ts:36` literal `keyword>=4` tanpa thesaurus, `topic.category=inspirasi` ≠ `fashion` → score 0, pool `fashion 158` dominan tapi tanpa `liburan`.

## Objective
Jadikan **semua relevansi dinamis dari input user** (audience, audienceAge, audienceInterests, targetCategory, allowedCategories, accountGoal, keywords, language, targetLocation) — bukan hardcode Gen Z/finance — baik ke Tavily query maupun ke prompt LLM.

## Tasks
- [x] `discovery.ts:48` `buildQueries(input)` — pakai **seluruh** `audience`, `audienceInterests[]`, `targetCategory`, `allowedCategories[]`, `accountGoal`, `keywords` untuk derivasi query; fallback `allowedCategories` kosong → derivasi dari `targetCategory`/`keywords`; prioritaskan query audiens-first, generik `berita terbaru` jadi fallback terakhir; dedup cap 8
- [x] `prompts.ts:68` `buildDiscoveryPrompt` — perkuat `TARGET AUDIENS` jadi hard filter: "Tolak topik yang tidak relevan dengan Audiens/Minat/Kategori diperbolehkan meski kredibel; lebih baik kembalikan <5 daripada paksa finance"; tampilkan `audience/topicHint/targetCategory/keywords/purpose/cta/constraints` dinamis; `content.slice 300→500` + `user` hard filter
- [x] `discovery.ts:85` naik `slice 10→15` (15×500) agar niche tidak terpotong, audience-first order
- [x] `actions.ts:212` insert 8 kolom baru sudah fix; `orchestrator.ts:29` forward `audience, language, target_category, keywords, topicHint, purpose, ctaStyle, constraints` + derivasi `allowed` dari `target_category`
- [x] `prompts.ts:3` `DiscoveryInput` extend 7 field dinamis (audience, targetCategory, keywords, topicHint, purpose, ctaStyle, constraints)
- [x] Verifikasi: `typecheck` ✓ `lint` ✓ `240 tests` ✓ `build` ✓

## Risks
- Query spesifik terlalu sempit → Tavily return <10 → mitigasi fallback generik tetap ada di akhir list.
- Naik slice 15×500 naik token → mitigasi `nemotron-3-ultra` sudah `reasoning max` (byNara 9) cukup.

## Progress Log
- 2026-09-05 — RCA dinamis diklarifikasi, plan dibuat, build aktif.
- 2026-09-05 — Build selesai: `orchestrator.ts:29` forward dinamis, `prompts.ts:3` extend + hard filter + 500char, `discovery.ts:48` audience-first 8 queries + slice 15. Gate hijau, siap commit.
