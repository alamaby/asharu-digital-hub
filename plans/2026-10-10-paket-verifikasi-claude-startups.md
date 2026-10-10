# Paket Implementasi: Verifikasi Perusahaan + Homepage Product-First + Claude di Verifying + Repo

Created: 2026-10-10 09:00:00

## 0. Konteks dan baseline

- Reapply Claude Startups ditolak dengan template "couldn't verify" (`halo@asharu.id` sudah dipakai saat apply).
- Akar masalah terverifikasi: (a) tidak ada identitas perusahaan/tahun berdiri di website+repo, (b) kontak publik = Gmail, (c) nol usage Claude, (d) repo personal tanpa lisensi/org.
- Fakta T0 (final, dari owner): nama `Asharu.id`, bentuk usaha perorangan (BUKAN PT/CV — jangan pernah tulis sebagai badan hukum), pemilik `Alam Aby Bashit`, kota `Bandung, Indonesia`, berdiri `Maret 2023` (masuk window 5 tahun).
- Baseline kode (terverifikasi 2026-10-09, HEAD `fc48833`, working tree bersih): `typecheck` PASS, `lint` 0 warning PASS, `test` 135 files / 1344 tests PASS, `build` 127 pages 0 warning PASS, `validate:messages` PASS.
- Temuan O1–O3 sudah ditutup di `fc48833` — plan ini TIDAK mengulanginya.

## 1. Objective

Dalam satu paket berurutan: (A) website memuat identitas perusahaan terverifikasi, (H) homepage menunjukkan kemampuan Digital Hub sejak kesan pertama, (B) ada usage Claude nyata di fase `verifying`, (C) repo menjadi bukti perusahaan. Hasil akhir = materi reapply yang setiap klaimnya bisa diklik.

## 2. Scope

Masuk: WS-A (T1–T5), WS-H (H1–H4), WS-C (C1–C3), WS-B (B0–B6) di bawah.
Keluar (dilarang): klaim traction/pengguna/testimoni/partnership; auto-post IG/TikTok; perubahan perilaku worker/antrean/cron; migrasi selain B3; `ANTHROPIC_API_KEY` di `.env`/kode; refactor komponen di luar daftar; melemahkan test.

## 3. Peran: OWNER vs EXECUTOR

Langkah bertanda **[OWNER]** hanya boleh dikerjakan pemilik (butuh akses Vercel/mailbox/Console/GitHub-org). Executor (model kecil) DILARANG menebak hasilnya — jika langkah OWNER belum selesai dan langkah berikutnya bergantung padanya, BERHENTI dan catat di Progress Log.

## 4. Langkah implementasi

### S1 [OWNER] — Kontak domain live + mailbox terbukti aktif

- Tujuan: menutup temuan paling fatal (kontak publik Gmail).
- Finding: kontak footer live = `halo.asharu.id@gmail.com`, kontradiktif dengan email apply.
- Dependency: tidak ada.
- Baca: tidak ada (Dashboard Vercel).
- Ubah: tidak ada file. Di Vercel Dashboard → Project → Settings → Environment Variables → set `NEXT_PUBLIC_CONTACT_EMAIL=halo@asharu.id` untuk Production + Preview → redeploy.
- Pertahankan: `NEXT_PUBLIC_WHATSAPP_URL` dan variabel lain tidak tersentuh.
- Edge: bila CTA email hilang setelah deploy = env tidak terbaca → cek ejaan key + redeploy ulang (jangan edit kode sebagai jalan pintas).
- Verifikasi: buka view-source `https://asharu.id/id`, cari `gmail.com` → harus 0 hit; kirim 1 email test ke `halo@asharu.id` → harus diterima di mailbox.
- Completion: 0 hit gmail + email test diterima. Jika mailbox ternyata tidak ada/tidak aktif → BLOCKER (buat mailbox dulu, jangan lanjut S2 yang menampilkan alamat itu).

### S2 — Blok profil perusahaan di halaman Tentang

- Tujuan: reviewer bisa verifikasi nama/bentuk/pendiri/kota/tahun dalam 1 klik.
- Finding: `/tentang` tidak memuat identitas perusahaan apa pun.
- Dependency: S1 (alamat email yang ditampilkan harus yang sudah live).
- Baca: `src/app/[locale]/(public)/about/page.tsx` (struktur: h1 baris 36, lead 39, purpose 41, principles 44, contact 67), `src/messages/id.json` + `en.json` namespace `aboutPage`.
- Ubah: (1) `src/messages/id.json` namespace `aboutPage`, tambah 2 key setelah `lead`; (2) sama di `en.json`; (3) `about/page.tsx`, sisipkan SATU blok setelah `<p>...{t('lead')}</p>` (baris 39) dan sebelum `<h2>{t('purposeHeading')}</h2>` (baris 41): `<h2 className="mt-8 text-xl font-semibold text-ink">{t('companyHeading')}</h2>` + `<p className="mt-2 leading-relaxed text-ink-muted">{t('companyBody')}</p>`. Tidak ada elemen lain yang dipindah/diubah.
- String exact ID: `companyHeading` = `Tentang perusahaan`; `companyBody` = `Asharu.id adalah usaha perorangan yang didirikan oleh Alam Aby Bashit di Bandung, Indonesia, pada Maret 2023. Kami membangun Asharu Digital Hub — workspace operasi konten dan portofolio digital berbantuan AI untuk UMKM Indonesia. Kontak: halo@asharu.id.`
- String exact EN: `companyHeading` = `About the company`; `companyBody` = `Asharu.id is a sole proprietorship founded by Alam Aby Bashit in Bandung, Indonesia, in March 2023. We build Asharu Digital Hub — an AI-assisted content operations and digital portfolio workspace for Indonesian small businesses. Contact: halo@asharu.id.`
- Pertahankan: satu H1, urutan seksi lain, link `asharu.id` di contact, tidak ada kata PT/CV/testimoni/angka.
- Edge: email ditulis plain text (bukan mailto) agar tidak bergantung komponen link.
- Test: tidak ada file test baru; `npm run validate:messages` (parity + non-empty) + `src/messages/messages.test.ts` (jalan dalam `npm test`) adalah verifikasi.
- Verifikasi: `npm run validate:messages` → `message catalogs valid`; `/id/tentang` + `/en/tentang` render blok baru.
- Completion: blok tampil dua locale, parity PASS.
- Jangan ubah: `purposeBody` (mengandung kata `partnerships` EN yang SUDAH diperbaiki di `fc48833` menjadi `collaboration inquiries` — jangan sentuh lagi), prinsip, `meta.about`.

### S3 — JSON-LD Organization + test

- Tujuan: fakta perusahaan terbaca mesin verifier (crawler program startup).
- Finding: `organizationSchema` tanpa foundingDate/email/address.
- Dependency: S1 (email harus yang live).
- Baca: `src/lib/seo/jsonld.ts` fungsi `organizationSchema` (baris 24–33), `src/lib/seo/jsonld.test.ts` (7 test existing — baca dulu, catat pola `it(...)`).
- Ubah, urutan dalam file: (1) di return object `organizationSchema`, setelah key `logo`, tambah TIGA key: `foundingDate: '2023-03'`, `email: 'halo@asharu.id'`, `address: { '@type': 'PostalAddress', addressLocality: 'Bandung', addressRegion: 'Jawa Barat', addressCountry: 'ID' }`; (2) di `jsonld.test.ts`, tambah SATU blok `it('organization exposes foundingDate, email, and address', ...)` yang memanggil `organizationSchema()` dan assert tiga nilai exact di atas. Tidak ada test existing yang diubah.
- Input/expected test: input = tidak ada (fungsi tanpa argumen); expected = `schema.foundingDate === '2023-03'`, `schema.email === 'halo@asharu.id'`, `(schema.address as any).addressLocality === 'Bandung'`.
- Pertahankan: `@type Organization`, name/url/logo/sameAs tidak berubah.
- Edge: tidak ada.
- Verifikasi: `npm test -- src/lib/seo/jsonld.test.ts` → 8 tests PASS (7 lama + 1 baru); view-source homepage memuat ketiga field.
- Completion: test baru hijau + field tampil live.
- Jangan ubah: `digitalHubSoftwareSchema`, `simpleFaqSchema`, file SEO lain.

### S4 — Footer + readiness doc

- Tujuan: nama legal terlihat di setiap halaman; apply-pack mengutip fakta T0.
- Dependency: S1.
- Baca: `src/components/layout/Footer.tsx` (blok rights baris 103–107), `src/messages/id.json` + `en.json` namespace `footer` (key `rights`, `tagline`), `docs/claude-startups-readiness.md` seksi C (target customers).
- Ubah, urutan: (1) tambah key `footer.company` ID = `Asharu.id · Usaha perorangan, Bandung, Indonesia · Didirikan Maret 2023`, EN = `Asharu.id · Sole proprietorship, Bandung, Indonesia · Founded March 2023`; (2) di `Footer.tsx` setelah `<p>...{t('rights', ...)}</p>` (baris 104–106) tambah `<p className="mx-auto mt-1 max-w-6xl px-4 text-xs text-ink-muted sm:px-6">{t('company')}</p>`; (3) di readiness doc seksi C tambah SATU paragraf fakta T0 + evidence `(/id/tentang, JSON-LD Organization)`. Tidak ada kolom/grid footer yang diubah.
- Pertahankan: grid 4 kolom, nav, legal, language switcher, `{year}` dinamis.
- Edge: tidak ada.
- Verifikasi: `npm run validate:messages` PASS; footer tampil dua locale.
- Completion: footer + doc selesai.
- Jangan ubah: `ContactCTA`, `header`/`nav` namespaces.

### S5 — Hero + meta homepage reframe (WS-H inti)

- Tujuan: kesan pertama = produk startup, bukan link hub personal.
- Finding: H1 `Semua yang Anda cari, dalam satu tempat.` + CTA ke afiliasi/properti.
- Dependency: S1–S2 (fakta + email final).
- Baca: `src/app/[locale]/(public)/page.tsx` baris 57–80 (hero), `src/messages/id.json` namespace `hero` (baris 112–118: title/tagline/description/primaryCta/secondaryCta), key mirror di `en.json`, namespace `meta.home`.
- Ubah, urutan: (1) rewrite 5 key `hero.*` di id.json LALU en.json (key sama, jangan tambah/hapus key); (2) di `page.tsx` hero: primary `<a href="#affiliate-products">` → `<Link href="/digital-hub">` (tetap `btn-primary`, ikon `ArrowDown` → `ArrowRight`); secondary `<Link href="/properties">` → `<a href="#mesin-riset">` (tetap `btn-secondary`); (3) rewrite `meta.home` title+description dua locale.
- String exact ID: tagline `Asharu Digital Hub · untuk UMKM Indonesia`; title `Ubah aktivitas usaha menjadi konten dan portofolio terpercaya.`; description `Asharu.id — usaha perorangan Bandung (2023) — membangun workspace AI untuk riset, draf, review, publikasi, dan portofolio UMKM. Plus toko, kurasi afiliasi, dan properti terverifikasi.`; primaryCta `Lihat Digital Hub`; secondaryCta `Cara Kerja Mesin`. Meta title `Asharu.id — Digital Hub & Workspace Konten untuk UMKM` (≤60 char); meta description = description hero dipotong maks 160 char di batas kata.
- String exact EN: tagline `Asharu Digital Hub · for Indonesian Small Businesses`; title `Turn daily business activity into trusted content and portfolio.`; description `Asharu.id — a Bandung sole proprietorship (2023) — building an AI workspace for research, drafting, review, publishing, and portfolios for small businesses. Plus stores, curated affiliates, and verified properties.`; primaryCta `Explore the Digital Hub`; secondaryCta `How the Engine Works`. Meta mirror.
- Pertahankan: SATU h1 per halaman, class/ikon lain, anchor `#affiliate-products` tetap ada sebagai target seksi C, `revalidate = 3600`.
- Edge: judul ≤60 char, deskripsi ≤160 char; bila EN melebihi, potong di batas kata tanpa mengubah makna (jangan tambah key baru).
- Test: parity otomatis; tambah SATU assert di test render homepage JIKA file test homepage sudah ada — jika tidak ada, JANGAN buat file test baru (cukup parity + build). Cek dulu dengan `glob src/**/page.test.*` di folder `(public)`; catat hasil di log.
- Verifikasi: `validate:messages` PASS; build render `/id` + `/en` tanpa error.
- Completion: hero+meta baru dua locale, homepage tetap 1 H1.
- Jangan ubah: target CTA além dua tombol itu, `generateMetadata` logic, JSON-LD homepage.

### S6 — Seksi pipeline statis + keluaran artikel nyata (WS-H bukti)

- Tujuan: menunjukkan kemampuan mesin + bukti keluaran jujur.
- Dependency: S5 (posisi jangkar `#mesin-riset` harus ada).
- Baca: `page.tsx` (pola `SectionHeading` + seksi B0 baris 82–109 sebagai template), `src/components/articles/ArticleCard.tsx` (salin PERSIS pola link detailnya — jangan karang pola Link dinamis sendiri), `src/lib/articles/public.ts` fungsi `getPublishedArticles(locale, limit)` (baris 27–38, return `[]` bila Supabase tak terkonfigurasi — andalkan ini), key `articles.empty` + `articles.readMore` existing.
- Ubah, urutan: (1) tambah key `home.pipeline` (heading/description/step1..step6/label) + `home.output` (heading/description/viewAll) di id.json LALU en.json — 6 step = Riset multi-sumber → Verifikasi → Skor → Draf bilingual → Review manusia → Terbit, masing-masing 1 kalimat, tanpa kata auto-post; (2) di `page.tsx` sisipkan seksi `<section id="mesin-riset">` SETELAH seksi B0 (baris 109) dan SEBELUM seksi C (baris 111): blok pipeline (daftar 6 `<li>` + label `Cara kerja internal`) + blok keluaran (`const latestArticles = await getPublishedArticles(locale, 3)` di atas, sejajar baris 52–53; render `<ul>` judul+excerpt+tanggal, link ikut pola ArticleCard, link `Lihat semua` → `/artikel`); (3) B0 `home.digitalHub.*` TIDAK diubah.
- String tidak di-lock kata-per-kata kecuali label: ID `Cara kerja internal`, EN `How our internal engine works`; contoh keluaran dilabeli ID `Contoh keluaran nyata dari pipeline`, EN `Real pipeline output`.
- Pertahankan: tidak ada H1 baru (pakai `SectionHeading` = H2), tidak ada fetch client-side, ISR 3600, `min-h-touch` untuk semua link/tombol baru.
- Edge WAJIB: jika `latestArticles` kosong → JANGAN render blok keluaran sama sekali (tanpa empty-state di homepage; key `articles.empty` tetap milik halaman `/artikel`). Jika Supabase tak terkonfigurasi → fungsi return `[]` → seksi hilang otomatis (bukan error).
- Test: parity otomatis; tidak ada test logika baru (aturan: tidak ada file test homepage bila belum ada).
- Verifikasi: `validate:messages` PASS; `npm run build` halaman `/id`, `/en` sukses; dengan DB ada artikel → blok tampil 3 item; simulasi kosong (unit tidak perlu — cukup review kode: tidak ada `.map` di atas `null`, karena fungsi selalu return array).
- Completion: dua seksi tampil dua locale; B0 utuh.
- Jangan ubah: carousel afiliasi, PropertyBrowser, stores/socials/math/about/contact, `productListSchema`.

### S7 — LICENSE + README perusahaan (WS-C tanpa transfer)

- Tujuan: repo terbaca sebagai milik perusahaan.
- Dependency: tidak ada (paralel dengan S1–S6).
- Baca: `README.md` paragraf produk (baris 7–11) untuk titik sisip.
- Ubah, urutan: (1) buat file baru `LICENSE` isi MIT exact: `MIT License` + `Copyright (c) 2026 Asharu.id (Alam Aby Bashit)` + badan MIT standar (permission notice verbatim dari opensource.org — salin, jangan parafrase); (2) di `README.md` setelah paragraf produk tambah 3 baris exact: `Asharu.id — usaha perorangan, Bandung, Indonesia · didirikan Maret 2023 oleh Alam Aby Bashit · kontak halo@asharu.id · live https://asharu.id/id/digital-hub.`
- Pertahankan: 나머지 README, lisensi konten milik Asharu (catatan di README checklist) tidak dihapus.
- Edge: file `LICENSE` UPPERCASE tanpa ekstensi di root.
- Verifikasi: `npm run lint` PASS (md tidak di-lint, tapi gate tetap jalan); halaman GitHub menampilkan badge lisensi setelah push.
- Completion: LICENSE + README ter-push.
- Jangan ubah: kode sumber, workflow CI, `.env.example`.

### S8 [OWNER] — Organisasi GitHub (boleh paralel, di luar kode)

- Tujuan: repo dimiliki entitas perusahaan, bukan akun personal.
- Dependency: tidak ada. Murni aksi owner di github.com: buat org `asharu-id` → transfer repo → update remote lokal (`git remote set-url origin https://github.com/asharu-id/asharu-digital-hub.git`) → verifikasi CI Quality jalan di repo baru.
- Jika owner MENOLAK transfer: fallback deterministik = tidak ada perubahan kode; cukup pastikan profil `alamaby` + README (S7) menautkan perusahaan. Catat pilihan di Progress Log lalu lanjut.
- Completion: `gh repo view` menampilkan org ATAU keputusan fallback tercatat.

### S9 [OWNER] — Kunci Anthropic + budget + exact model ID (gate WS-B)

- Tujuan: WS-B tidak bisa mulai tanpa ini; executor dilarang menebak.
- Aksi owner: (1) buat API key di Console (billing aktif, limit kecil, mis. $10–25/bulan untuk tahap eval); (2) catat EXACT model ID Haiku dari docs Console (contoh format `claude-haiku-4-5-20251001` — JANGAN pakai contoh ini tanpa konfirmasi, catat yang aktual); (3) simpan key ke Supabase Vault via Dashboard (nama mengikuti pola existing `llm_provider_keys`; JANGAN tempel key ke chat/file/env).
- Completion: owner menulis di Progress Log: `key seeded (Vault)`, `model_id exact = ...`, `budget = ...`. Tanpa baris ini, S10–S13 DILARANG mulai.

### S10 — Adapter provider Anthropic + unit test

- Tujuan: runtime bisa memanggil Anthropic Messages API lewat antarmuka existing.
- Dependency: S9 (butuh exact model ID hanya untuk S11; kode adapter TIDAK butuh key — key dibaca dari Vault saat runtime seperti provider lain).
- Baca: `src/lib/llm/providers/openai-compatible.ts` (pola class), `src/lib/llm/providers/ciora.ts` + `ciora.test.ts` (pola adapter+test terkecil), `src/lib/llm/types.ts` (`ProviderSlug` baris 1, `LLM_STAGES` 5–15, `ChatInput` 37–48, `ChatOutput` 50–63, `LLMProvider` 65–67), `src/lib/llm/completion.ts` fungsi `providerFromRow` (baris 34–37), `src/lib/llm/types.ts` class `LLMHttpError` (22–30).
- Ubah, urutan: (1) buat `src/lib/llm/providers/anthropic.ts` class `AnthropicProvider implements LLMProvider`, constructor `(baseUrl: string)` default `https://api.anthropic.com`; method `chat(input, apiKey)`: system = gabung semua `messages` role `system` dengan `\n\n`, body `{ model: input.model, max_tokens: input.maxTokens ?? 2000, system (HANYA bila non-empty), messages: non-system [{role, content}], temperature (bila defined) }`, POST `{baseUrl}/v1/messages`, headers `x-api-key: apiKey`, `anthropic-version: 2023-06-01`, `content-type: application/json`; response: `text = (data.content ?? []).filter(b => b.type === 'text').map(b => b.text ?? '').join('')`, usage `{ promptTokens: data.usage.input_tokens ?? 0, completionTokens: data.usage.output_tokens ?? 0 }`, `finishReason: data.stop_reason ?? null`; non-2xx → `throw new LLMHttpError(status, ...)`; `reasoningEffort/thinkingBudget` DIABAIKAN dengan komentar `// Anthropic thinking: out of Haiku-verifying scope`; (2) `types.ts` baris 1: tambah `'anthropic'` ke union `ProviderSlug`; (3) `completion.ts` di `providerFromRow` setelah baris cloudflare (37), tambah `if (row.slug === 'anthropic') return new AnthropicProvider(row.base_url);` — fallback OpenAICompatible TIDAK boleh menelan slug ini; (4) buat `src/lib/llm/providers/anthropic.test.ts` meniru `ciora.test.ts` (mock global fetch).
- Input/expected test (3 kasus, exact): (a) respons `{content:[{type:'text',text:'{"results":[]}'}], usage:{input_tokens:10,output_tokens:5}, stop_reason:'end_turn'}` + ChatInput `{model:'M', messages:[{role:'system',content:'S'},{role:'user',content:'U'}], temperature:0.2, maxTokens:2000}` → expect fetch URL `.../v1/messages`, header `x-api-key`, body.system `S`, body.messages `[{role:'user',content:'U'}]`, output.text exact, usage `{promptTokens:10,completionTokens:5}`; (b) content kosong `[]` → text `''` (waterfall existing menganggap empty = gagal → JANGAN tambah logika retry di adapter); (c) status 401 → `rejects.toThrow(LLMHttpError)` dengan `.status === 401`.
- Pertahankan: timeout 90s (`fetch-timeout`), deadline waterfall 240s, circuit breaker (`failure_count > 5`), log `llm_call_logs` — semua di luar adapter, tidak disentuh.
- Edge: multi-block text digabung; block non-text diabaikan; `system` kosong → key `system` TIDAK dikirim (API menolak string kosong).
- Verifikasi: `npm test -- src/lib/llm/providers/anthropic.test.ts` → PASS; `npm run typecheck` PASS.
- Completion: adapter + 3 test hijau.
- Jangan ubah: adapter gemini/cloudflare/openai-compatible/naraya/ciora, `key-pool.ts`, `model-config.ts`, prompt riset.

### S11 — Migrasi provider+model+pin verifying (submodule DULU)

- Tujuan: data Anthropic masuk DB tanpa merusak histori.
- Dependency: S9 (exact model ID) + S10 (slug `anthropic` dikenali runtime).
- Baca: `supabase/migrations/20260917000001_llm_models_ciora.sql` (pola upsert provider baris 10–16 + models 19–30), `20260927000001_llm_models_bynara_reasoning_4.sql` (pola additive + ON CONFLICT).
- Ubah (SATU file baru, di dalam submodule `supabase/`): `supabase/migrations/20261010000001_llm_anthropic_verifying.sql`, urutan statement: (1) upsert provider `(slug,display_name,base_url,priority)` = `('anthropic','Anthropic','https://api.anthropic.com',45)` dengan `ON CONFLICT (slug) DO UPDATE ... is_active=true` (priority 45 = PALING AKHIR agar Claude tidak pernah mencuri traffic stage lain — hanya dipakai bila di-pin); (2) upsert SATU model `(provider anthropic, model_id = EXACT ID dari S9, display 'Claude Haiku (verifying)', priority 10, is_active true, config '{}')` dengan `ON CONFLICT (provider_id, model_id) DO UPDATE`; (3) `UPDATE public.llm_stage_defaults SET provider_id=(select id ... slug anthropic), model_id=(select id ... model exact), updated_at=now() WHERE stage='verifying'` + `INSERT ... ON CONFLICT (stage) DO UPDATE` sebagai pengaman bila baris belum ada. Tanpa DELETE/DISABLE baris mana pun.
- Pertahankan: histori `llm_call_logs`, FK stage defaults, prioritas provider lain.
- Edge: nama file harus leksikografis SETELAH `20261007000003` (atur tanggal sesuai hari eksekusi, format `YYYYMMDDHHMMSS_...`); migrasi non-destruktif agar re-run aman.
- Verifikasi: apply ikut preseden repo (MCP apply ke prod + verifikasi `llm_providers` ada slug anthropic, `llm_models` 1 baris aktif, `llm_stage_defaults` stage verifying menunjuk model itu). Jika MCP tidak tersedia bagi executor → SERAHKAN file SQL ke owner sebagai [OWNER] dengan query verifikasi exact di atas, catat di log, JANGAN lanjut S12.
- Completion: tiga verifikasi DB hijau. Commit+push SUBMODULE dulu, baru parent pointer (aturan AGENTS.md).
- Jangan ubah: stage defaults selain `verifying`; model/provider lain; RLS.

### S12 — Eval Lab + label jujur + readiness evidence

- Tujuan: bukti usage nyata + klaim publik yang benar.
- Dependency: S11 (pin aktif) + S6 (seksi pipeline tempat label menempel).
- Baca: halaman `/lab/try` (cara submit target), `content_research_logs`/`llm_call_logs` (kolom provider/model/tokens — baca skema via satu query read-only dulu).
- Ubah, urutan: (1) buat 1 sesi riset via `/konten/baru`, majukan ke `verifying` (pin Haiku dari S11), bandingkan dengan 1 sesi kontrol (default lama): metrik = precision verifikasi (cek manual 5 topik/sesi: verified harus didukung sumber) + tokens/latency dari `llm_call_logs`; (2) HANYA bila Haiku ≥ setara: tambah label di seksi pipeline (key `home.pipeline.claudeNote` ID = `Tahap verifikasi didukung oleh Claude (Anthropic).`, EN = `The verification step is powered by Claude (Anthropic).`) + 1 kalimat evidence di readiness doc (jumlah call + rentang tanggal, TANPA isi prompt/PII); (3) bila Haiku LEBIH BURUK: JANGAN label, catat hasil, kembalikan pin `verifying` ke default lama via Dashboard (tanpa migrasi baru), WS-B selesai sebagai eksperimen terdokumentasi.
- Pertahankan: review manusia, fail-safe unverified, tidak ada klaim di `/digital-hub` sebelum label dipasang.
- Edge: kuota/budget habis tengah eval → hentikan, catat, pin dikembalikan.
- Verifikasi: baris `llm_call_logs` ber-provider anthropic ada; parity messages PASS.
- Completion: label tampil + evidence tercatat, ATAU keputusan revert tercatat. Keduanya sah.
- Jangan ubah: prompt verification/scoring, threshold, state machine.

### S13 — Gate penuh + reapply pack (penutup paket)

- Tujuan: paket siap kirim tanpa regresi.
- Dependency: semua S1–S12 (atau yang Sah-diskip via fallback tercatat).
- Verifikasi berurutan: `npm run typecheck` → `npm run lint` (`--max-warnings=0`) → `npm test` (≥ baseline 1344, nol test dilemahkan) → `npm run build` (127+ halaman, 0 warning metadataBase) → `npm run validate:messages` → scan secret (`sb_secret_|sb_publishable_|sk-ant-|CRON_SECRET=.+` hanya boleh hit placeholder/dokumen/test) → cek live (email domain, Tentang, footer, hero, pipeline, keluaran, JSON-LD).
- Setiap edit setelah satu gate hijau MEMBATALKAN gate itu (insiden `c3afbc5`) — re-run dari gate yang batal.
- Commit per workstream (bukan satu commit raksasa): `docs: ...`, `feat(web): ...`, `feat(llm): ...`, masing-masing push setelah gate; submodule B3 selalu duluan.
- Completion paket: semua gate hijau + reapply dikirim dengan website + Console ber-usage.

## 5. Open questions / blocker

- OQ1 LICENSE MIT vs proprietary → REKOMENDASI MIT (repo sudah dipromosikan open-source di situs; tanpa lisensi = all-rights-reserved default). Jalan dengan MIT; owner bisa veto = ganti 1 file. Risiko proprietary: kontradiksi klaim open-source di mata reviewer.
- OQ2 Transfer org vs tetap → REKOMENDASI transfer (sinyal perusahaan terkuat), fallback tercatat di S8. Risiko transfer: remote/CI perlu update (tercantum di S8).
- OQ3 Mailbox `halo@asharu.id` → VERIFIKASI di S1; bila tidak ada = blocker sebelum S2.
- OQ4 Budget + exact Haiku ID → gate S9; Sonnet/`developing` DITUNDA keluar paket (fase 2).

## 6. Handoff checklist (executor baca dulu)

- [x] `git status --short` bersih, HEAD = `fc48833` (atau lebih baru hanya bila berisi paket ini).
- [x] Jangan edit file kecuali yang disebut di langkah aktif; jangan sentuh `.env*`, Vault secret, key apapun ke chat/file.
- [ ] S9 + S1 + S8 adalah gerbang OWNER — jangan ditebak, jangan dilewati.
- [x] Setiap langkah: update `## Progress Log` file ini (timestamp + hasil) SEBELUM lanjut; tasks `- [x]`.
- [x] Gate AGENTS.md final: tiap edit setelah hijau → re-run typecheck+lint (+build bila pola build-only).
- [ ] Satu milestone = satu commit + push (submodule dulu bila ada); tanpa `--no-verify`/force/amend.

## Progress Log

- 2026-10-10 19:05:00 — WS-A, WS-H, dan WS-C (S2, S3, S4, S5, S6, S7) selesai diimplementasikan:
  - S2: Profil perusahaan di halaman Tentang (id/en) + parity.
  - S3: JSON-LD Organization diperkaya dengan foundingDate, email, address + test baru di `jsonld.test.ts`.
  - S4: Footer diperbarui dengan satu baris profil perusahaan + update seksi C di `docs/claude-startups-readiness.md`.
  - S5: Hero homepage direframe (H1, tagline, description, CTA digital-hub & mesin-riset, meta.home id/en).
  - S6: Seksi pipeline riset internal (6 langkah) + keluaran artikel nyata dari DB publik disisipkan.
  - S7: File MIT `LICENSE` dibuat + README memuat identitas perusahaan.
  - Gate: `typecheck` PASS, `lint` 0 error/0 warning PASS, `test` 135 files / 1345 tests PASS, `build` 100% PASS, `validate:messages` PASS, scan secret PASS.
  - Menunggu gerbang [OWNER]: S1 (verifikasi mailbox/env live), S8 (organisasi GitHub), S9 (Anthropic key di Vault, exact model ID, dan budget). S10–S12 ditahan hingga S9 dipenuhi oleh OWNER sesuai aturan plan.
