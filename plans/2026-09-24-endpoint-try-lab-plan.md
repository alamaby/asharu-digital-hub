# Endpoint Try (Coba Endpoint) — Tab di Chat Lab

Created: 2026-09-24 10:00:00

## Objective

Menambah tab "Coba Endpoint" di Chat Lab (`/lab/try`): user login bisa input `kind` (OpenAI-compatible / Anthropic) + `baseUrl` + `apiKey` (transit memori saja, tidak disimpan), klik "Uji & List Model", lalu chat (termasuk streaming) ke endpoint arbitrer via proxy server, dengan riwayat tersimpan di DB tanpa key.

Keputusan user yang sudah final (Q&A 2026-09-24): penempatan = tab baru di `/lab`; key = via proxy server; fitur = list + chat + streaming; riwayat = simpan ke DB.

## Scope

- Termasuk: migrasi `endpoint_try_runs`, lib `src/lib/endpoint-try/*`, 2 API proxy (`models`, `chat`), server action riwayat, halaman `/lab/try` + komponen klien + tab navigasi + i18n id/en, cleanup expired, test + gate.
- Tidak termasuk: mode direct browser-only (follow-up bila threat model menuntut), multi-target compare custom endpoint (follow-up), auto-deteksi kind, penyimpanan key dalam bentuk apa pun, perubahan provider Lab yang sudah ada.

## Milestones

1. Fondasi data + validasi murni (Langkah 1–3).
2. Adapter + proxy API aman (Langkah 4–6).
3. Riwayat DB + UI + i18n (Langkah 7–8).
4. Retensi + gate final + commit (Langkah 0, 9–10).

## Tasks

- [ ] Langkah 0 — Baseline gate (read-only, tanpa ubah kode)
- [ ] Langkah 1 — Migrasi `endpoint_try_runs` (submodule `supabase/`)
- [ ] Langkah 2 — `src/lib/endpoint-try/types.ts` (tipe baru)
- [ ] Langkah 3 — `src/lib/endpoint-try/validation.ts` + test (zod + SSRF guard murni)
- [ ] Langkah 4 — `src/lib/endpoint-try/adapters.ts` + test (normalisasi OpenAI/Anthropic + SSE parser)
- [ ] Langkah 5 — `POST /api/endpoint-try/models` (proxy list model)
- [ ] Langkah 6 — `POST /api/endpoint-try/chat` (proxy chat non-stream + stream)
- [ ] Langkah 7 — `src/lib/endpoint-try/actions.ts` + test (riwayat DB tanpa key)
- [ ] Langkah 8 — UI `/lab/try` + tab + i18n id/en + test komponen
- [ ] Langkah 9 — Cleanup expired via `/api/lab/cleanup`
- [ ] Langkah 10 — Gate final + commit submodule dulu + push

---

### Langkah 0 — Baseline gate (read-only)

- Tujuan: pastikan repo hijau sebelum menyentuh apa pun; catat kegagalan pre-existing bila ada.
- Finding/requirement: prasyarat semua langkah; pola repo (AGENTS.md §1) mewajibkan gate hijau sebelum commit.
- Dependency: tidak ada.
- File yang harus dibaca: `package.json` (scripts), `vitest.config.ts`.
- File yang harus diubah: tidak ada.
- Simbol terkait: tidak ada.
- Kondisi saat ini: diasumsikan hijau (Lab terakhir gate 915+ tests); verifikasi ulang.
- Perubahan konkret: tidak ada perubahan kode.
- Urutan: (1) `npm run typecheck`, (2) `npm run lint`, (3) `npm test`.
- Behavior dipertahankan: semua.
- Error handling/edge: bila ada 1 test pre-existing gagal (mis. pola insiden `blackoutDays=0` di memori 2026-09-22), catat nama file + kasusnya di Progress Log, lanjutkan, jangan "perbaiki" di plan ini.
- Test ditambah/diubah: tidak ada.
- Command verifikasi: `npm run typecheck`, `npm run lint`, `npm test`.
- Hasil verifikasi diharapkan: typecheck 0 error; lint 0 error; test lolos semua (atau 1 fail pre-existing yang dicatat).
- Completion criteria: output 3 command tercatat di Progress Log.
- Tidak boleh diubah: semua file source; `supabase/`; `.env*`.

### Langkah 1 — Migrasi `endpoint_try_runs`

- Tujuan: tabel riwayat eksperimen per-user dengan retensi 30 hari, TANPA kolom key.
- Finding/requirement: R10 (simpan DB), F7 (tabel `chat_lab_*` tak punya kolom endpoint custom; jangan cemari statistik Lab), OQ1 (lihat Notes).
- Dependency: Langkah 0.
- File yang harus dibaca: `supabase/migrations/20260918000001_chat_lab.sql` (pola RLS), `supabase/migrations/20260918000002_chat_lab_has_error.sql` (pola aditif), `supabase/migrations/20260922000003_automation_product_blackout.sql` (gaya terbaru).
- File yang harus diubah (di dalam submodule `supabase/`): buat `supabase/migrations/20260924000001_endpoint_try_runs.sql`.
- Simbol terkait: tabel `public.endpoint_try_runs`; policy `endpoint_try_runs_owner_read/insert/admin/service`; index `idx_endpoint_try_runs_owner`, `idx_endpoint_try_runs_expiry`.
- Kondisi saat ini: tabel belum ada; tidak ada cron untuk tabel ini.
- Perubahan konkret (tulis SQL persis, aditif saja):
  1. `CREATE TABLE IF NOT EXISTS public.endpoint_try_runs` dengan kolom persis: `id uuid PRIMARY KEY DEFAULT gen_random_uuid()`, `user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE`, `provider_kind text NOT NULL CHECK (provider_kind IN ('openai','anthropic'))`, `base_url text NOT NULL CHECK (char_length(base_url) BETWEEN 10 AND 500)`, `model text NOT NULL CHECK (char_length(model) BETWEEN 1 AND 200)`, `system_prompt text NULL CHECK (system_prompt IS NULL OR char_length(system_prompt) <= 2000)`, `user_prompt text NOT NULL CHECK (char_length(user_prompt) BETWEEN 10 AND 4000)`, `temperature numeric NULL CHECK (temperature IS NULL OR (temperature >= 0 AND temperature <= 2))`, `max_tokens int NULL CHECK (max_tokens IS NULL OR (max_tokens BETWEEN 1 AND 4000))`, `prompt_tokens int NULL CHECK (prompt_tokens IS NULL OR prompt_tokens >= 0)`, `completion_tokens int NULL CHECK (... >= 0)`, `total_tokens int NULL CHECK (... >= 0)`, `latency_ms int NULL CHECK (... >= 0)`, `tokens_per_sec numeric NULL CHECK (... >= 0)`, `finish_reason text NULL`, `error text NULL`, `request_messages jsonb NULL`, `response_text text NULL`, `expires_at timestamptz NOT NULL DEFAULT (now() + interval '30 days')`, `created_at timestamptz NOT NULL DEFAULT now()`, `CHECK (error IS NOT NULL OR response_text IS NOT NULL)`. DILARANG menambah kolom `api_key`/secret dalam bentuk apa pun.
  2. Index: `idx_endpoint_try_runs_owner ON (user_id, created_at DESC)`, `idx_endpoint_try_runs_expiry ON (expires_at ASC)`.
  3. `ALTER TABLE ... ENABLE ROW LEVEL SECURITY`; 4 policy meniru `chat_lab_runs`: owner_read (`SELECT ... USING (auth.uid() = user_id OR is_admin())`), owner_insert (`INSERT ... WITH CHECK (auth.uid() = user_id)`), admin (`FOR ALL ... USING (is_admin()) WITH CHECK (is_admin())`), service (`FOR ALL TO service_role USING (true) WITH CHECK (true)`), masing-masing didahului `DROP POLICY IF EXISTS`.
  4. Jangan buat cron baru (cleanup ditangani Langkah 9).
- Urutan di file: komentar header (tujuan + "TANPA kolom key") → CREATE TABLE → INDEX → RLS/policies.
- Behavior dipertahankan: tabel `chat_lab_*` tidak disentuh; tidak ada perubahan RLS lama.
- Error/edge: nama file harus unik (`20260924000001`, belum dipakai); `IF NOT EXISTS` agar rerun aman; CHECK mencegah baris kosong (error dan response NULL dua-duanya).
- Test/verifikasi SQL: tidak ada unit test; verifikasi via `git status --short` di submodule + review diff bahwa kata `api_key`/`secret` tidak muncul di file migrasi.
- Command verifikasi: `git -C supabase status --short`, `git -C supabase diff --stat` (read-only).
- Hasil diharapkan: 1 file baru tampil sebagai untracked/modified di submodule; tidak ada file migrasi lama berubah.
- Completion criteria: file migrasi ada, tanpa kolom secret, tanpa ubah file lain.
- Tidak boleh diubah: semua migrasi lama; `src/**`; cron job; Vault.

### Langkah 2 — `src/lib/endpoint-try/types.ts` (baru)

- Tujuan: tipe bersama kind/request/response/riwayat agar route, action, UI konsisten.
- Finding/requirement: R6/R7 (dua kind), R4/R5 (non-stream + stream), R10 (bentuk baris riwayat).
- Dependency: Langkah 1 (nama kolom/kind mengikuti SQL).
- File yang harus dibaca: `src/lib/lab/types.ts` (gaya tipe + `LabQuota`), `src/lib/llm/types.ts` (bentuk `ChatMessage`).
- File yang harus diubah: buat `src/lib/endpoint-try/types.ts` saja.
- Simbol: `EndpointKind` (`'openai' | 'anthropic'`), `EndpointChatMessage` (`{role:'system'|'user'|'assistant'; content:string}`), `EndpointModelsResult` (`{models:{id:string;ownedBy:string|null}[]; latencyMs:number}`), `EndpointChatResult` (`{text:string; usage:{promptTokens:number;completionTokens:number;totalTokens?:number}|null; finishReason:string|null; latencyMs:number}`), `EndpointTryRunRow` (cerminkan kolom Langkah 1), `ENDPOINT_TRY_RATE_SCOPE='endpoint_try'`, `ENDPOINT_TRY_MAX_TOKENS=4000`.
- Kondisi saat ini: direktori `src/lib/endpoint-try/` belum ada.
- Perubahan konkret: satu file type-only (tanpa runtime, tanpa `server-only`), tidak import zod/fetch.
- Urutan: header komentar → konstanta → tipe request/response → tipe baris DB.
- Behavior dipertahankan: tipe Lab/LLM lama tidak diubah.
- Error/edge: tidak ada runtime; pastikan `EndpointTryRunRow` tidak punya field key.
- Test: tidak ada (type-only); ketik yang salah akan gagal di Langkah 10 (`npm run typecheck`).
- Command verifikasi: `npx tsc --noEmit -p tsconfig.json` (sama dengan `npm run typecheck`).
- Hasil diharapkan: 0 error baru.
- Completion criteria: file ada, diimport Langkah 3–8 tanpa error tipe.
- Tidak boleh diubah: `src/lib/lab/types.ts`, `src/lib/llm/types.ts`, file lain.

### Langkah 3 — `src/lib/endpoint-try/validation.ts` + test

- Tujuan: validasi input + SSRF guard sebagai fungsi murni yang bisa diunit-test.
- Finding/requirement: R1/R2 (baseUrl+key), R11/R12/R13 (login, rate, SSRF), R14 (redaksi).
- Dependency: Langkah 2.
- File yang harus dibaca: `src/lib/lab/validation.ts` (gaya zod + pesan Indonesia), `src/lib/endpoint-try/types.ts` (hasil Langkah 2).
- File yang harus diubah: buat `src/lib/endpoint-try/validation.ts`; buat `src/lib/endpoint-try/validation.test.ts`.
- Simbol: `endpointKindSchema`, `baseUrlSchema`, `apiKeySchema`, `modelsRequestSchema`, `chatRequestSchema` (kind/baseUrl/apiKey/model/system/user/temperature/maxTokens/stream), `assertAllowedBaseUrl(baseUrl:string):{origin:string;base:string}`, `sanitizeErrorMessage(msg:string, secrets:string[]):string`, `isBlockedHostname(hostname:string):boolean`.
- Kondisi saat ini: belum ada; pola Lab pakai zod dengan pesan Indonesia.
- Perubahan konkret:
  1. `baseUrlSchema`: `z.string().trim().url('Base URL harus URL valid.')`, `.max(500)`, `.transform(s=>s.replace(/\/+$/,''))`, refine protokol: produksi hanya `https://`; `http://` hanya bila `NODE_ENV!=='production'`.
  2. `apiKeySchema`: `z.string().min(8,'API key terlalu pendek.')`, `.max(500)`; jangan trim ke kosong (key spasi = invalid).
  3. `chatRequestSchema`: `kind` enum; `model` trim 1–200; `system` nullable max 2000; `user` trim 10–4000 (samakan Lab agar DB CHECK konsisten); `temperature` nullable 0–2; `maxTokens` nullable int 1–4000 (bukan 8000, batas proxy/Vercel); `stream` boolean default false. Untuk kind `anthropic`, di level route nanti default maxTokens=1024 bila null (bukan di zod, agar terekam eksplisit).
  4. `isBlockedHostname`: lowercase; blokir `localhost`, sufiks `.localhost`/`.local`/`.internal`, `0.0.0.0`, `::1`; blokir literal IPv4 pada rentang `127/8`, `10/8`, `172.16/12`, `192.168/16`, `169.254/16` (cek oktet numerik); hostname non-IP yang lolos tetap lanjut (tanpa DNS resolve — didokumentasikan sebagai keterbatasan).
  5. `assertAllowedBaseUrl`: `new URL()` dalam try (gagal → throw `Base URL tidak valid.`); tolak userinfo (`username`/`password` non-kosong → throw); tolak protokol selain http/https; panggil `isBlockedHostname`; kembalikan `{origin, base}` (tanpa trailing slash). Tidak melakukan fetch.
  6. `sanitizeErrorMessage`: untuk tiap secret non-kosong, `split(secret).join('[REDACTED]')`; lalu `slice(0,300)`.
- Urutan di file: import zod → skema kecil → skema request → helper hostname → assert → sanitize.
- Behavior dipertahankan: `labInputSchema` tidak diubah; batas prompt mengikuti Lab (2000/4000) agar konsisten dengan CHECK DB.
- Error/edge: URL dengan `@` (userinfo) ditolak; `http://localhost:11434` ditolak di semua env; `http://` non-local ditolak hanya di production; key kosong/spasi ditolak; pesan error tidak mengandung key (dijamin via sanitize di route, Langkah 5–6).
- Test (`validation.test.ts`, minimal 8 kasus): (a) baseUrl trailing slash dinormalisasi; (b) `http://localhost:11434/v1` → `assertAllowedBaseUrl` throw; (c) `http://169.254.169.254/` → throw; (d) URL `https://user:pass@x.com/v1` → throw; (e) chat valid openai lolos; (f) user 9 char → gagal; (g) maxTokens 5000 → gagal; (h) `sanitizeErrorMessage('...sk-ABC...',['sk-ABC'])` tidak mengandung `sk-ABC` dan mengandung `[REDACTED]`.
- Input/expected: `(baseUrl='https://api.x.com/v1///')` → `{base:'https://api.x.com/v1'}`; `(msg='key sk-ABC invalid', secrets=['sk-ABC'])` → tanpa substring `sk-ABC`.
- Command verifikasi: `npx vitest run src/lib/endpoint-try/validation.test.ts`, lalu `npm run typecheck`, `npm run lint`.
- Hasil diharapkan: 8/8 lolos; typecheck 0 error; lint 0 error pada 2 file baru.
- Completion criteria: semua kasus hijau; route Langkah 5–6 hanya memanggil helper ini (tanpa validasi inline duplikat).
- Tidak boleh diubah: `src/lib/lab/validation.ts`, `src/middleware.ts`, `src/lib/env.ts`, migrasi.

### Langkah 4 — `src/lib/endpoint-try/adapters.ts` + test

- Tujuan: normalisasi respons OpenAI/Anthropic + parser SSE murni (tanpa fetch, tanpa key).
- Finding/requirement: R3/R4/R5/R6/R7; F2 (jangan reuse `OpenAICompatibleProvider` karena memaksa `response_format json_object` — `src/lib/llm/providers/openai-compatible.ts:12-18`); F3 (belum ada mapping Anthropic).
- Dependency: Langkah 2–3.
- File yang harus dibaca: `src/lib/llm/providers/openai-compatible.ts` (bentuk choices/usage — untuk ditiru, bukan diimport), `src/lib/endpoint-try/types.ts`.
- File yang harus diubah: buat `src/lib/endpoint-try/adapters.ts`; buat `src/lib/endpoint-try/adapters.test.ts`.
- Simbol: `normalizeOpenAIModels(json:unknown):{id:string;ownedBy:string|null}[]`, `normalizeAnthropicModels(json:unknown):...` (sama), `buildOpenAIChatBody(p:{model,messages,temperature,maxTokens,stream})`, `buildAnthropicChatBody(p:{model,system,user,temperature,maxTokens,stream})` (system dipisah, messages hanya user/assistant), `normalizeOpenAIChat(json:unknown, fallbackModel:string):{text,usage,finishReason}`, `normalizeAnthropicChat(json:unknown, fallbackModel:string):...` (content blocks → text; usage `input_tokens/output_tokens`), `parseSseChunks(sseText:string):string[]` (kumpulkan `data:` non-`[DONE]`), `extractOpenAIStreamText(dataPayload:string):string|null`, `extractAnthropicStreamText(dataPayload:string):string|null` (minimal: `delta.text` / `content_block_delta`), `tokensPerSec(completion:number|null, latencyMs:number|null):number|null` (tiruan rumus Lab; bila tak bisa dihitung → null).
- Kondisi saat ini: belum ada; provider Lab memaksa JSON mode — adapter ini sebaliknya bebas teks.
- Perubahan konkret:
  1. Normalisasi models toleran: OpenAI `data[]` (array atau `{data:[]}`); Anthropic `{data:[]}`; tiap item ambil `id` string non-kosong, `owned_by`/`ownedBy` opsional; item tanpa `id` dilewati (bukan throw); hasil kosong → kembalikan `[]` (route yang melempar pesan "tidak ada model").
  2. Body OpenAI: `{model, messages, temperature ?? 0.7, max_tokens, stream}` — tanpa `response_format`; `temperature`/`max_tokens` dihilangkan bila undefined/null (jangan kirim null).
  3. Body Anthropic: `{model, system? (hilang bila kosong), messages:[{role:'user',content}], max_tokens: maxTokens ?? 1024, temperature?, stream}` — `stream` boolean selalu dikirim.
  4. Normalisasi chat toleran: OpenAI ambil `choices[0].message.content` (string atau parts[] `text`) atau `choices[0].text`; Anthropic gabungkan `content[]` bertipe `text`; usage dipetakan dari snake/camel (`prompt_tokens|promptTokens|input_tokens`, dst.); kosong dua-duanya → `{text:'', usage:null}` (route yang memutuskan error "respons kosong").
  5. SSE: `parseSseChunks` split `\n`, kumpulkan baris `data:` yang trim-nya bukan `[DONE]`; extractor kembalikan delta teks atau null (jangan throw untuk event ping).
- Urutan di file: normalisasi models → builder body → normalisasi chat → SSE.
- Behavior dipertahankan: `src/lib/llm/providers/*` tidak diubah/diimport; tidak ada network di file ini.
- Error/edge: payload tak berbentuk → normalisasi kembalikan default kosong (route beri pesan user-friendly); `content` array campuran string/objek; event SSE `ping`/`[DONE]` diabaikan.
- Test (`adapters.test.ts`, minimal 10 kasus): models OpenAI `{data:[{id:'a'},{id:'b',owned_by:'o'}]}` → 2 item; item `{}` dilewati; models Anthropic `{data:[{id:'m'}]}` → 1; body OpenAI tanpa `response_format` (assert `!('response_format' in body)`); body Anthropic memisah system + default `max_tokens:1024`; chat OpenAI choices → text; chat Anthropic content blocks → gabungan; usage snake→camel; `parseSseChunks('data: {"a":1}\n\n[DONE]...')` → 1 payload; anthropic delta extractor → teks.
- Input/expected: `normalizeAnthropicChat({content:[{type:'text',text:'Hi'},{type:'text',text:'!'}],usage:{input_tokens:3,output_tokens:2}},'m')` → `{text:'Hi!', usage:{promptTokens:3,completionTokens:2}, finishReason: ...}`.
- Command verifikasi: `npx vitest run src/lib/endpoint-try/adapters.test.ts`, `npm run typecheck`, `npm run lint`.
- Hasil diharapkan: 10/10 lolos; 0 error.
- Completion criteria: route Langkah 5–6 hanya memakai fungsi ini untuk parse/build.
- Tidak boleh diubah: `src/lib/llm/**`, `src/lib/lab/**`, migrasi, UI.

### Langkah 5 — `POST /api/endpoint-try/models`

- Tujuan: proxy list model tanpa menyimpan/log key.
- Finding/requirement: R3 (list model), R6/R7, R9, R11, R12, R13, R14.
- Dependency: Langkah 2–4.
- File yang harus dibaca: `src/app/api/lab/cleanup/route.ts` (gaya route + `maxDuration`), `src/lib/auth/require-user.ts`, `src/lib/content/rate-limit.ts` (`checkRateLimit`, `getClientIp`, `incrementRateLimit`), `src/lib/endpoint-try/validation.ts`, `src/lib/endpoint-try/adapters.ts`.
- File yang harus diubah: buat `src/app/api/endpoint-try/models/route.ts` saja.
- Simbol: `export const maxDuration = 30`; `export async function POST(request: Request)`.
- Kondisi saat ini: direktori belum ada; matcher middleware (`src/middleware.ts:194-200`) mengecualikan `/api` sehingga route wajib guard sendiri.
- Perubahan konkret:
  1. `export const maxDuration = 30;` di baris atas.
  2. `POST`: (a) `await requireUser()` dalam try → gagal = `401 {ok:false,error}` (pesan dari error, tanpa stack); (b) rate: `getClientIp(request.headers)` + `checkRateLimit(ip,'endpoint_try',30)` → tidak allowed = `429`; (c) `await request.json()` dalam try → gagal = `400 'Body harus JSON.'`; (d) validasi `modelsRequestSchema.safeParse` → gagal = `400` issue pertama; (e) `assertAllowedBaseUrl(baseUrl)` → throw = `400`; (f) fetch `GET {base}/models` timeout 25 detik via `AbortController` + `setTimeout` (clear di finally): header OpenAI `{Authorization:'Bearer '+apiKey}`; Anthropic `{'x-api-key':apiKey,'anthropic-version':'2023-06-01'}`; (g) non-ok → baca `res.text()` max 500 char, sanitize, `502 {ok:false,error:'Upstream X: ...'}`; (h) `res.json()` gagal → `502 'Respons models bukan JSON.'`; (i) normalisasi via adapter Langkah 4 → `{ok:true,models,latencyMs}`; (j) `incrementRateLimit(ip,'endpoint_try').catch(()=>{})`; (k) catch-all: sanitize dengan `[apiKey]` lalu `slice(0,300)`, status default 500 (400 untuk error validasi/SSRF bila pakai `instanceof` atau pesan cocok — tentukan satu cara dan konsisten).
  3. Larangan keras di file ini: tidak import/instansiasi Supabase; tidak menulis `llm_call_logs`/`error_events`; tidak `console.log` body/key/header; tidak menyimpan apa pun.
- Urutan di file: `maxDuration` → imports → `POST` (guard → rate → parse → validasi → SSRF → fetch → normalisasi → increment → return) → helper lokal `json(status,body)` bila perlu.
- Behavior dipertahankan: route `/api/lab/*` tidak berubah; tidak ada perubahan middleware.
- Error/edge: body bukan JSON; kind invalid; baseUrl userinfo; timeout (AbortError → `504 'Upstream timeout (25s).'`); upstream 401 (teruskan sebagai 502 dengan pesan sanitized, jangan bocorkan key); `data:[]` → `200 {ok:true,models:[]}` + UI tawarkan input manual (Langkah 8); `AbortController` timeout selalu di-clear.
- Test: tidak ada file route.test (sesuai pola repo: logika sudah teruji di Langkah 3–4); tambahkan SEBUTAN eksplisit di PR: cakupan dijamin via (i) semua cabang validasi/SSRF di `validation.test.ts`, (ii) semua parse di `adapters.test.ts`, (iii) review manual bahwa file route tidak mengandung string `console.` / `llm_call_logs` / `supabase` (verifikasi via grep perintah di bawah).
- Input/expected: `POST {kind:'openai',baseUrl:'https://api.x.com/v1',apiKey:'sk-ABC'}` dengan mock upstream `{data:[{id:'m1'}]}` → `200 {ok:true,models:[{id:'m1',ownedBy:null}],latencyMs:<n>}`; upstream 401 body mengandung key → respons tidak mengandung substring key.
- Command verifikasi: `npm run typecheck`, `npm run lint`, `grep -rn "console\.\|llm_call_logs\|createSupabase\|apiKey" src/app/api/endpoint-try/models/route.ts` lalu pastikan `apiKey` hanya muncul sebagai property akses (tidak di log/store).
- Hasil diharapkan: typecheck/lint hijau; grep menunjukkan tidak ada sink log/store.
- Completion criteria: happy path + 401/429/400/502/504 terimplementasi; key tidak pernah ditulis.
- Tidak boleh diubah: `src/middleware.ts`, `src/lib/llm/**`, `src/lib/lab/**`, `src/messages/*`, migrasi, UI.

### Langkah 6 — `POST /api/endpoint-try/chat`

- Tujuan: proxy chat non-stream + streaming SSE, tanpa menyimpan/log key.
- Finding/requirement: R4/R5/R6/R7/R9/R11–R14; F2 (bebas teks, tanpa json_object paksa).
- Dependency: Langkah 2–5 (pola guard/rate/sanitize sama).
- File yang harus dibaca: sama dengan Langkah 5 + `src/lib/endpoint-try/adapters.ts` (builder + extractor SSE).
- File yang harus diubah: buat `src/app/api/endpoint-try/chat/route.ts` saja.
- Simbol: `export const maxDuration = 60`; `export async function POST(request: Request)`.
- Kondisi saat ini: belum ada.
- Perubahan konkret:
  1. Guard/rate/parse/validasi/SSRF identik Langkah 5 (scope rate sama `endpoint_try`; gagal → 401/429/400).
  2. Bangun messages: `[{role:'system',content:system} bila non-kosong, {role:'user',content:user}]`; `maxTokens` efektif = `maxTokens ?? (kind==='anthropic' ? 1024 : undefined)`; `temperature` teruskan bila bukan null.
  3. Non-stream (`stream===false`): `POST {base}/chat/completions` (openai, body Langkah 4) atau `{base}/messages` (anthropic, header `x-api-key` + `anthropic-version` + `content-type`), timeout 55 detik; non-ok → sanitized `502`; `normalizeOpenAIChat`/`normalizeAnthropicChat`; teks kosong → `502 'Upstream mengembalikan respons kosong.'`; hitung `latencyMs = Date.now()-started`, `tokensPerSec`; return `200 {ok:true,text,usage,finishReason,latencyMs,tokensPerSec}`; `incrementRateLimit` best-effort.
  4. Stream (`stream===true`): fetch upstream yang sama dengan `stream:true` + header `Accept: text/event-stream`; non-ok → `502` JSON (bukan stream); ok → kembalikan `new Response(upstream.body, {headers:{'content-type':'text/event-stream','cache-control':'no-cache',connection:'keep-alive','x-endpoint-try-kind':kind}})` langsung (tanpa buffering/parsing di server; tanpa menyimpan); client merakit teks (Langkah 8) lalu menyimpan via action Langkah 7. Timeout 55 detik tetap via AbortController pada fetch awal.
  5. Larangan sama dengan Langkah 5 + tidak menulis DB/log apa pun.
- Urutan: guard → rate → parse → validasi → SSRF → rakit pesan → cabang stream/non-stream → return.
- Behavior dipertahankan: provider Lab tidak tersentuh; tidak ada fallback waterfall.
- Error/edge: anthropic tanpa maxTokens → default 1024 eksplisit; upstream SSE `200` tapi body kosong → client tampilkan error (Langkah 8); AbortError → `504`; pesan error selalu di-sanitize dengan key; `stream:true` tidak boleh mengembalikan JSON biasa.
- Test: logika build/parse sudah diuji Langkah 4; untuk route ini tambahkan 2 pengujian statis via review + grep (tanpa file test): (i) tidak ada `response_format`, (ii) tidak ada Supabase/log. Nyatakan di PR.
- Input/expected: non-stream openai mock `{choices:[{message:{content:'Halo'},finish_reason:'stop'}],usage:{prompt_tokens:5,completion_tokens:7}}` → `{ok:true,text:'Halo',usage:{promptTokens:5,completionTokens:7},finishReason:'stop'}`; stream → `content-type: text/event-stream` + header `x-endpoint-try-kind`.
- Command verifikasi: `npm run typecheck`, `npm run lint`, `grep -rn "response_format\|console\.\|llm_call_logs\|createSupabase" src/app/api/endpoint-try/chat/route.ts` (harus kosong).
- Hasil diharapkan: hijau + grep kosong.
- Completion criteria: kedua cabang bekerja; tidak ada key tersimpan/terlog; tidak ada json_object paksa.
- Tidak boleh diubah: `src/lib/llm/providers/openai-compatible.ts`, middleware, migrasi, messages, UI.

### Langkah 7 — `src/lib/endpoint-try/actions.ts` + test

- Tujuan: simpan/baca/hapus riwayat milik user (tanpa key) + kuota harian reuse config Lab.
- Finding/requirement: R10/R11, reuse `daily_limit` Lab (hindari tabel config baru).
- Dependency: Langkah 1–2.
- File yang harus dibaca: `src/lib/lab/actions.ts` (pola `LabActionResult`/`fail`, `getLabConfig`, `listLabBatches`, `deleteLabBatch`, `getLabQuota`, `cleanupExpiredLabBatches`, `revalidatePath`), `src/lib/auth/require-user.ts`, `src/lib/supabase/server.ts` (`createSupabaseService`), `src/lib/endpoint-try/types.ts`.
- File yang harus diubah: buat `src/lib/endpoint-try/actions.ts` (`'use server'`); buat `src/lib/endpoint-try/actions.test.ts`.
- Simbol: `EndpointTryActionResult<T>`, `saveEndpointTryRun(input:{providerKind,baseUrl,model,systemPrompt,userPrompt,temperature,maxTokens,promptTokens,completionTokens,totalTokens,latencyMs,tokensPerSec,finishReason,error,requestMessages,responseText})`, `listEndpointTryRuns({page,pageSize}:{page?:number;pageSize?:number})`, `deleteEndpointTryRun(id:string)`, `getEndpointTryQuota()`, `cleanupExpiredEndpointTryRuns()`.
- Kondisi saat ini: belum ada; `chat_lab_config` singleton id=1 sudah ada (retention + daily_limit).
- Perubahan konkret:
  1. `svc()` lokal meniru `src/lib/lab/actions.ts:28-32` (throw bila service client null).
  2. `saveEndpointTryRun`: `requireUser()`; validasi ringan (kind enum, base_url 10–500, model 1–200, user 10–4000, system ≤2000, temperature 0–2, max_tokens 1–4000, `error||responseText` wajib salah satu); tolak bila input mengandung properti `apiKey`/`api_key`/`authorization` (cek `in` pada objek → throw `'API key tidak boleh dikirim ke penyimpanan.'`); cek kuota via `getLabConfig().daily_limit` (hitung `endpoint_try_runs` hari ini, UTC 00:00) → habis = throw pesan seperti Lab; `expires_at = now + retention_days`; insert via service client; `revalidatePath('/lab/try')`; kembalikan `{ok:true,data:{id}}` (pola `try/catch → fail`, JANGAN throw ke UI — tiru `runChatLabBatch:95-103`).
  3. `listEndpointTryRuns`: owner-only (`eq('user_id',userId)`, `gte('expires_at',now)`), order `created_at desc`, range page/pageSize (cap 50); tanpa join.
  4. `deleteEndpointTryRun`: cek milik user (atau admin via `isAdmin()`), lalu delete; `revalidatePath('/lab/try')`.
  5. `getEndpointTryQuota`: sama dengan `getLabQuota:376-389` tetapi menghitung `endpoint_try_runs`.
  6. `cleanupExpiredEndpointTryRuns`: delete `lt('expires_at', now)` + select id → `{deletedRuns}` (dipanggil cron Langkah 9).
- Urutan: `svc` → tipe hasil → save → list → delete → quota → cleanup.
- Behavior dipertahankan: actions Lab tidak berubah; `chat_lab_config` hanya dibaca (tidak diupdate); tidak ada tulis ke `llm_call_logs`.
- Error/edge: input berisi key → ditolak sebelum DB; kuota habis; baris tanpa error maupun response → ditolak (CHECK DB juga menolak); id asing → `Batch tidak ditemukan.`-style message; semua error jadi `{ok:false,error}` bukan throw (kecuali helper list/quota yang melempar seperti Lab — tiru persis).
- Test (`actions.test.ts`, mock `@/lib/supabase/server` + `@/lib/auth/require-user` meniru `src/lib/lab/actions.test.ts`): (a) input mengandung `apiKey` → `{ok:false}` dan `insert` tidak dipanggil; (b) input tanpa error & tanpa response → `{ok:false}`; (c) input valid → `insert` dipanggil dengan objek TANPA properti key (assert `!('apiKey' in payload)`); (d) kuota habis (count >= limit) → pesan `Kuota harian habis`.
- Input/expected: `saveEndpointTryRun({...valid, responseText:'Hi'})` → `{ok:true, data:{id:'uuid'}}`; dengan tambahan `apiKey:'x'` → `{ok:false, error:/tidak boleh/}`.
- Command verifikasi: `npx vitest run src/lib/endpoint-try/actions.test.ts`, `npm run typecheck`, `npm run lint`.
- Hasil diharapkan: semua kasus lolos; 0 error.
- Completion criteria: riwayat tersimpan tanpa key; kuota + retensi reuse config Lab.
- Tidak boleh diubah: `src/lib/lab/actions.ts`, migrasi, route API, UI, messages.

### Langkah 8 — UI `/lab/try` + tab + i18n + test

- Tujuan: tab "Coba Endpoint" sejajar Lab + halaman eksperimen + string id/en.
- Finding/requirement: R1–R5 (form+list+chat+stream), R8 (tab di `/lab`), R15 (i18n), keamanan key di browser.
- Dependency: Langkah 2–7 (endpoint + action sudah ada).
- File yang harus dibaca: `src/app/[locale]/(admin)/lab/page.tsx` (guard login + metadata), `src/components/lab/LabPageClient.tsx` (letak tab), `src/components/lab/LabForm.tsx` (gaya input/label `inputCls`/`labelCls`), `src/i18n/routing.ts` (`/lab` di baris 57–60), `src/messages/id.json` + `en.json` (namespace `lab`, baris ~1057), `src/lib/endpoint-try/actions.ts` (hasil Langkah 7).
- File yang harus diubah: (1) `src/i18n/routing.ts` tambah `'/lab/try': {id:'/lab/try',en:'/lab/try'}` tepat setelah blok `'/lab/[batchId]'`; (2) `src/components/lab/LabPageClient.tsx` tambah tab nav (link "Banding" → `/lab`, "Coba Endpoint" → `/lab/try`) di atas form; (3) buat `src/app/[locale]/(admin)/lab/try/page.tsx` (server, guard login meniru `lab/page.tsx:37-48`, metadata `robots:{index:false,follow:false}`, render klien); (4) buat `src/components/lab/EndpointTryClient.tsx`; (5) `src/messages/id.json` + `en.json` tambah namespace `lab.try.*`; (6) buat `src/components/lab/EndpointTryClient.test.tsx`.
- Simbol: `EndpointTryPage`, `EndpointTryClient`, i18n `lab.try.*` (connection/model/chat/result/history), fungsi klien `loadModels()`, `sendChat()`, `sendStream()` (TextDecoder + `parseSseChunks` versi klien minimal atau duplikasi 15-baris parser — jangan import adapter server bila adapter memakai API node; bila adapter murni, import extractor dari Langkah 4 lebih baik dan harus typecheck client-safe).
- Kondisi saat ini: tidak ada rute `/lab/try`; `LabPageClient` tanpa tab.
- Perubahan konkret:
  1. Routing: satu entri; tidak ada perubahan lain di `routing.ts`.
  2. Tab di `LabPageClient`: `<nav aria-label>` dua `Link` (`pathname:'/lab'` dan `pathname:'/lab/try'`), gaya tab sederhana (border-b aktif), tanpa mengubah form/history/stats di bawahnya.
  3. `try/page.tsx`: tiru `lab/page.tsx` (locale resolve, `setRequestLocale`, `createSupabaseServer` → redirect `/masuk` bila anon, `getDisplayTimezone`, render `<EndpointTryClient locale timeZone/>`); metadata `path:'/lab'` (hindari klaim sitemap baru) + `robots noindex`.
  4. `EndpointTryClient`: seksi Koneksi (select kind default `openai`, input baseUrl placeholder `https://api.openai.com/v1`, input password apiKey + toggle tampil, tombol "Uji & List Model", notice `role="status"`); seksi Model (select hasil + tombol refresh + input manual override); seksi Chat (system textarea ≤2000, user textarea 10–4000 + counter, temp, maxTokens ≤4000, checkbox stream, tombol Kirim, batal via AbortController); seksi Hasil (teks, metrik latency/tok-s/usage, `<details>` raw JSON, auto-save sukses via `saveEndpointTryRun` TANPA key, error jujur bila gagal); seksi Riwayat (10 terakhir via `listEndpointTryRuns`, tombol hapus + konfirmasi). State: `apiKey` hanya `useState` memori (JANGAN `localStorage`; `baseUrl/kind/model` boleh di-`localStorage` dengan key `endpoint-try:*`); unmount → tidak ada persist key (cukup tidak menulis; tanpa cleanup khusus).
  5. i18n: tambah `lab.try` id+en (connection/kind/baseUrl/apiKey/apiKeyHint/test/list/model/manual/chat/system/user/temp/maxTokens/stream/send/stop/result/history/delete/dll.); JANGAN ubah string `lab.*` lama.
- Urutan: routing → page → komponen → tab LabPageClient → messages → test.
- Behavior dipertahankan: halaman `/lab` lama identik kecuali tambahan nav tab; tidak ada item sidebar baru (`src/config/navigation.ts` JANGAN diubah); middleware tidak diubah.
- Error/edge: list kosong → tampilkan "list kosong, isi model manual"; upstream error → notice + simpan sebagai run error (via action, tanpa key); stream abort → hentikan render + simpan parsial sebagai sukses bila ada teks (atau error bila kosong); apiKey kosong → blokir di klien sebelum fetch; halaman tanpa login → redirect `/masuk` (server).
- Test (`EndpointTryClient.test.tsx`, mock `fetch` + action): (a) render 4 seksi; (b) klik Kirim tanpa key → fetch tidak dipanggil + notice; (c) setelah ketik key, `localStorage.getItem` untuk kunci berisi `key`/`apiKey` tetap null (assert tidak ada persist key); (d) mock `/models` → opsi model muncul.
- Input/expected: ketik baseUrl `https://api.x.com/v1`, key `sk-ABC`, mock `{ok:true,models:[{id:'m1'}]}` → dropdown berisi `m1`; `localStorage` tidak mengandung `sk-ABC`.
- Command verifikasi: `npx vitest run src/components/lab/EndpointTryClient.test.tsx`, `npm run typecheck`, `npm run lint`.
- Hasil diharapkan: lolos; 0 error.
- Completion criteria: alur manual end-to-end (isi → list → chat non-stream → chat stream → riwayat muncul → hapus) bisa didemo; key tidak tertulis di storage/DB.
- Tidak boleh diubah: `src/config/navigation.ts`, `src/middleware.ts`, `src/lib/llm/**`, `src/lib/lab/**`, migrasi, route API Langkah 5–6.

### Langkah 9 — Cleanup expired

- Tujuan: baris `endpoint_try_runs` kedaluwarsa terhapus otomatis memakai cron yang sudah ada.
- Finding/requirement: retensi 30 hari konsisten dengan Lab (`chat_lab_config.retention_days`).
- Dependency: Langkah 1 + 7.
- File yang harus dibaca: `src/app/api/lab/cleanup/route.ts`, `src/lib/lab/actions.ts` (`cleanupExpiredLabBatches:418-426`).
- File yang harus diubah: `src/lib/endpoint-try/actions.ts` sudah berisi `cleanupExpiredEndpointTryRuns` (Langkah 7 — jangan duplikat); ubah `src/app/api/lab/cleanup/route.ts` untuk memanggil keduanya dan menggabung hasil.
- Simbol: `cleanupExpiredEndpointTryRuns`, handler `handle()` route cleanup.
- Kondisi saat ini: route cleanup hanya menghapus `chat_lab_batches`.
- Perubahan konkret (minimal, di `handle()` setelah panggil lama): `const [lab, tried] = await Promise.all([cleanupExpiredLabBatches(), cleanupExpiredEndpointTryRuns()])` → return `{ok:true, ...lab, deletedEndpointTryRuns: tried.deletedRuns}`; pesan error tetap `slice(0,300)`; `maxDuration`/auth (`isCronAuthorized`) tidak berubah.
- Urutan: import fungsi baru → gabung panggilan → gabung respons.
- Behavior dipertahankan: respons lama (`{ok:true, deletedBatches}`) tetap ada (tambah field baru saja); auth cron sama; tidak ada cron job baru di DB.
- Error/edge: salah satu cleanup gagal → `500 {ok:false}` seperti sekarang (jangan partial-ok diam-diam); tidak ada key yang disentuh.
- Test: tidak ada file test baru; verifikasi via typecheck + review diff 5 baris; cakupan delete-by-expiry dijamin `actions.test.ts` Langkah 7 (mock `.lt('expires_at', ...)`).
- Command verifikasi: `npm run typecheck`, `npm run lint`.
- Hasil diharapkan: hijau.
- Completion criteria: 1 file route berubah minimal; tidak ada migrasi cron baru.
- Tidak boleh diubah: jadwal cron di DB, `isCronAuthorized`, actions Lab, migrasi.

### Langkah 10 — Gate final + commit + push

- Tujuan: kunci hijau penuh lalu commit sesuai aturan repo (submodule dulu).
- Finding/requirement: AGENTS.md §1 (gate final; setiap edit setelah hijau membatalkan gate; Conventional Commits satu baris; scan secret; submodule dulu).
- Dependency: Langkah 1–9 selesai.
- File yang harus dibaca: `git status --short`, `git diff`, `git log --oneline -10` (parent + submodule) sebelum stage.
- File yang harus diubah: tidak ada perubahan kode di langkah ini.
- Kondisi saat ini: semua kode + 1 migrasi selesai.
- Perubahan konkret: (1) re-run PENUH `npm run typecheck` + `npm run lint` + `npm test` + `npm run build` setelah edit terakhir; (2) scan diff untuk secret (`apiKey` real, `sb_secret_*`, `sb_publishable_*`, `CRON_SECRET`, `.env*` — hanya placeholder yang boleh); (3) stage hanya file yang dimaksud; (4) commit + push SUBMODULE `supabase/` dulu (migrasi), lalu commit + push parent dengan pointer baru; (5) bila push ditolak (remote lebih baru): `git fetch`, cek `git log main..origin/main`, `git pull --no-rebase`, ulangi gate, push lagi.
- Behavior dipertahankan: tidak ada.
- Error/edge: JANGAN commit bila gate merah kecuali user eksplisit meminta; JANGAN sertakan `.env`/`.env.local`/key real; JANGAN commit bila grep menemukan secret di diff.
- Test: gate di atas adalah test.
- Command verifikasi: `npm run typecheck && npm run lint && npm test && npm run build`, `git status --short`, `git diff --stat`, `git log --oneline -10`.
- Hasil diharapkan: typecheck 0 error; lint 0 error; `vitest run` semua lolos; `next build` sukses; working tree bersih setelah push.
- Completion criteria: hash commit submodule + parent + daftar file kunci dilaporkan ke user.
- Tidak boleh diubah: tidak ada kode baru di langkah ini.

## Risks

- Key transit di memori server: mitigasi = tidak ada kolom key, tidak ada log body/header, `sanitizeErrorMessage` + test redaksi + grep pra-commit. Sisa risiko vs direct-browser didokumentasikan (lihat Notes OQ).
- SSRF: hostname-blocklist tanpa DNS resolve → domain yang resolve ke IP privat lolos. Mitigasi: blokir userinfo + IP literal + sufiks sensitif; dokumentasikan keterbatasan; tidak ada allowlist karena endpoint arbitrer adalah tujuannya.
- Streaming + limit Vercel: `maxDuration 60` + cap 4000 token; timeout upstream 55 detik; abort client-side.
- Anthropic tidak punya `/models` di semua gateway kompatibel → fallback input manual wajib ada (Langkah 8).
- Duplikasi timestamp migrasi (riwayat repo pernah dobel `20260918000001`): gunakan `20260924000001` dan cek `ls supabase/migrations | grep 20260924` sebelum tulis.

## Progress Log

- 2026-09-24 10:00:00 — Plan disusun dari analisis Chat Lab + Q&A user (tab /lab, proxy, streaming, simpan DB). Belum ada implementasi.

## Notes

- Referensi implementasi saat ini: Lab page `src/app/[locale]/(admin)/lab/page.tsx:30-79`; submit Lab `src/lib/lab/actions.ts:95-264`; guard login `src/lib/auth/require-user.ts:9-17`; rate `src/lib/content/rate-limit.ts:14-63`; provider OpenAI (JANGAN direuse mentah) `src/lib/llm/providers/openai-compatible.ts:4-32`; routing `/lab` `src/i18n/routing.ts:57-64`; nav union `src/config/navigation.ts:28-52` (jangan diubah); middleware matcher `/api` dikecualikan `src/middleware.ts:194-200` (route wajib guard sendiri); cleanup `src/app/api/lab/cleanup/route.ts:1-27`.
- OQ1 (blocker, butuh jawaban user sebelum/saat Langkah 1): `base_url` disimpan plaintext vs hash? Opsi A plaintext (rekomendasi: bukan secret, perlu ditampilkan di riwayat + debug; risiko rendah). Opsi B hash saja (riwayat tak menampilkan URL; sulit debug). Rekomendasi A. Key TIDAK PERNAH disimpan dalam opsi mana pun (non-negotiable).
- OQ2: `http://localhost` (Ollama) di production? Opsi A tolak selalu (rekomendasi: aman dari SSRF; konsekuensi Ollama lokal hanya bisa dicoba via dev). Opsi B izinkan via toggle admin (risiko SSRF ke metadata/internal). Rekomendasi A untuk v1.
- OQ3: kuota harian reuse `chat_lab_config.daily_limit` vs tabel config baru? Rekomendasi reuse (Langkah 7) — tanpa migrasi config tambahan.
- Handoff untuk model kecil: kerjakan langkah berurutan 0→10; jangan gabung langkah; setiap langkah selesai hanya bila Completion criteria terpenuhi; bila ragu antara dua desain, pilih yang tercantum di "Perubahan konkret" dan catat di Progress Log, jangan improvisasi.

---

## Handoff checklist (untuk pelaksana)

- [ ] Langkah 0 hijau dan tercatat (atau 1 fail pre-existing yang dinamai).
- [ ] Migrasi `20260924000001` ada di submodule; grep `api_key|secret` di file itu kosong.
- [ ] `validation.test.ts` ≥8 kasus hijau; `adapters.test.ts` ≥10 kasus hijau; `actions.test.ts` 4 kasus hijau; komponen test 4 kasus hijau.
- [ ] Kedua route proxy: guard 401, rate 429, validasi/SSRF 400, upstream 502, timeout 504; grep `response_format|console.|llm_call_logs|createSupabase` kosong di kedua file.
- [ ] UI: alur isi → list → chat → stream → riwayat → hapus terdemo; `localStorage` bebas key; i18n id+en lengkap.
- [ ] Cleanup menggabung kedua hasil tanpa mengubah auth cron.
- [ ] Gate final 4 command hijau; commit submodule dulu lalu parent; push; laporkan hash + file kunci.
