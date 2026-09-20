# Resend 403 alamaby.com + Developing Parse Failed — Email Fix & Observability

Created: 2026-09-20 10:40:00

## Objective

Memulihkan notifikasi email automation yang mati total akibat `resend 403: This API key is not authorized to send emails from alamaby.com`, sekaligus membuat akar kegagalan sesi riset (`91b668a0-0aa5-438a-95ae-cc7d0122b40d`, `developing: article parse failed`) bisa didiagnosis tanpa menebak. Email adalah satu-satunya sinyal async kegagalan run (`notify_on=both`), jadi selama 403 belum sembuh admin tidak tahu run gagal dan badge UI merah permanen.

Contoh bukti yang sudah terverifikasi (produksi, read-only):

```sql
-- sesi riset gagal (bukan gagal email, tapi gagal developing)
SELECT id, status, error_message FROM public.content_research_sessions
WHERE id = '91b668a0-0aa5-438a-95ae-cc7d0122b40d';
-- status=failed, error_message='developing: 1 pasangan gagal (lihat log warn per-pasangan)'

-- email failure yang menutupi akar masalah
SELECT moment, recipients, ok, error FROM public.automation_email_log
ORDER BY created_at DESC LIMIT 5;
-- moment=failure, ok=false,
-- error='resend 403: {"statusCode":403,"message":"This API key is not authorized to send emails from alamaby.com"}'

-- konfigurasi pengirim saat ini
SELECT email_from, notify_on, notify_emails FROM public.automation_configs WHERE id = 1;
-- email_from='Asharu <updates@alamaby.com>', notify_on='both', notify_emails=[]
```

## Scope

Masuk scope:

- Diagnosis luar repo: Resend Domains, API key scope, Vault `resend_api_key`, `automation_configs.email_from` (via UI admin, bukan SQL tulis).
- Kode: `src/lib/automation/email.ts`, `src/lib/automation/actions.ts` (test-email hardcoded `emailFrom`), `src/lib/automation/config.ts` (validasi simpan), `src/app/[locale]/(admin)/admin/automation/page.tsx` (badge `failure` + pesan 403 actionable), `src/lib/llm/prompt.ts` + `src/lib/research/development.ts` (alasan penolakan parser hanya untuk log, kriteria terima/tolak TETAP).
- Test: `email.test.ts`, `actions.test.ts`, `prompt-article.test.ts` (+ `runner.test.ts` bila tersentuh).
- Non-destruktif, Database as Code: TIDAK ada migrasi wajib. Migrasi opsional hanya bila keputusan domain berubah (Fase E).

Keluar scope (JANGAN dikerjakan di plan ini):

- Melonggarkan kriteria validasi artikel (`parseArticleLang`: jumlah section, kata, CJK, emoji) — hanya tambah alasan log.
- Mengubah prompt LLM developing / menaikkan `maxTokens` — investigasi dulu (Fase C), keputusan terpisah.
- Rotasi key / verifikasi DNS — dilakukan user di dashboard (Fase A), bukan oleh kode.
- Retry manual / re-run sesi produksi yang gagal — hanya bila diminta eksplisit.

## Milestones

1. Fase A — Diagnosis luar repo selesai: diketahui pasti domain verified apa + key boleh kirim dari domain apa (30 menit, tanpa sentuh kode).
2. Fase B — Hardening email + badge: test-email memakai `cfg.emailFrom`, error 403 terklasifikasi, badge menampilkan `failure` dengan pesan actionable (implementasi + unit test hijau).
3. Fase C — Parser debuggability: tiap `article/thread parse failed` mencatat field+aturan yang menolak (tanpa mengubah penerimaan), jadi sesi gagal berikutnya langsung jelas penyebabnya.
4. Fase D — Verifikasi end-to-end: gate hijau + test email terkirim + badge hijau di UI admin.

## Tasks

- [ ] A1. Cek Resend Domains (dashboard, oleh user/operator). Buka Resend → Domains. Catat: domain apa yang `Verified` (exact match, termasuk subdomain). Bandingkan dengan `updates@alamaby.com`. Bila `alamaby.com` tidak ada / masih `Pending` → itulah penyebab 403 (dok: `resend.com/docs/knowledge-base/403-error-domain-mismatch`). Terima: nama domain verified tertulis di Progress Log.
- [ ] A2. Cek API key scope (dashboard). Buka Resend → API Keys → key yang dipakai. Catat: permission (`Full access` vs `Sending access`) dan batasan domain/pengirim bila ada. Terima: `Full access` + boleh kirim dari domain yang dipakai, atau key diganti.
- [ ] A3. Cek Vault + config tanpa membocorkan secret. Via UI/server context saja: pastikan `resend_api_key` ada di Vault (JANGAN `SELECT`/print nilainya ke chat/log), dan `automation_configs.email_from` (lihat via halaman admin Automation, bukan SQL tulis). Aturan Env Guard berlaku: tidak ada nilai `re_*`/`sb_secret_*` di chat, komentar kode, atau markdown. Terima: sumber key (Vault vs env fallback) diketahui tanpa secret terekspos.
- [ ] A4. Putuskan strategi domain (catat di Progress Log + Notes). Opsi 1 (cepat): ganti `email_from` ke domain yang SUDAH verified (via UI admin). Opsi 2 (benar, brand): verifikasi `alamaby.com` via DNS lalu pertahankan `updates@alamaby.com`. Counter-argument: Opsi 1 cepat tapi ganti identitas pengirim + reset reputasi; Opsi 2 benar tapi butuh akses DNS + propagasi. Rekomendasi: Opsi 2 bila akses DNS ada; Opsi 1 hanya sebagai darurat sementara. Jangan eksekusi keduanya diam-diam — satu saja, tercatat.
- [ ] B1. Perbaiki `sendAutomationTestEmail` memakai `cfg.emailFrom` (`src/lib/automation/actions.ts:246-284`). Saat ini hardcoded `emailFrom: 'Asharu <updates@alamaby.com>'` (baris ~276) sehingga test email tidak mencerminkan config admin dan akan tetap 403 walau config sudah diganti. Ubah menjadi `emailFrom: cfg?.emailFrom ?? 'Asharu <updates@alamaby.com>'` (fallback hanya bila cfg null). Contoh:
  ```ts
  const res = await sendDraftReadyEmail(supabase, {
    ...defaults,
    emailFrom: cfg?.emailFrom ?? 'Asharu <updates@alamaby.com>',
    emailReplyTo: cfg?.emailReplyTo ?? null,
  } as never, { recipients, ... });
  ```
  Terima: kirim test email setelah ganti `email_from` di UI memakai alamat baru (bukan hardcoded lama).
- [ ] B2. Klasifikasikan error 403 Resend (`src/lib/automation/email.ts:51-93`, fungsi `sendViaResend`). Jangan ubah kontrak `SendResult` secara breaking — tambah field opsional `code?: 'domain_not_verified' | 'unauthorized_sender' | 'invalid_api_key' | 'resend_error'`. Petakan substring pesan Resend (contoh: `not authorized to send emails from` → `unauthorized_sender`; `domain is not verified` → `domain_not_verified`; `API key is invalid` → `invalid_api_key`). Pertahankan: never-throw, `error` tetap berisi `resend <status>: <body slice 300>` agar log lama tetap greppable. Contoh:
  ```ts
  if (!res.ok) {
    return { ok: false, code: classifyResendError(res.status, text), error: `resend ${res.status}: ${text.slice(0, 300)}` };
  }
  ```
  Terima: unit test `email.test.ts` baru — mock fetch 403 dengan ketiga pesan di atas → `code` sesuai + `ok=false` + tidak throw.
- [ ] B3. Tampilkan badge `failure` + pesan 403 yang actionable (`src/app/[locale]/(admin)/admin/automation/page.tsx:106-148`, fungsi `renderEmailBadge`). Masalah kini: `sorted` memilih `published ?? draftReady`; bila run gagal sebelum publish (kasus sesi ini), keduanya null → `return null`, badge hilang padahal `failure` yang gagal. Ubah: fallback ke log `failure` terbaru bila tidak ada published/draft_ready, dan petakan `code`/substring 403 ke bahasa Indonesia actionable, contoh: `domain pengirim belum terverifikasi di Resend / key tak berhak kirim dari domain ini — cek Resend Domains & API Keys`. Pertahankan styling warna (hijau/amber/merah) dan `slice(0,80)`. Terima: run gagal dengan email failure 403 menampilkan badge merah berisi arahan, bukan kosong.
- [ ] B4. Validasi `email_from` saat simpan (non-blocking). Lokasi: `src/lib/automation/actions.ts:121` (`email_from: str(formData,'email_from') ?? ...`) dan/atau `AutomationForms.tsx:301`. Tambah validasi format `Name <email@domain>` + cek domain berubah → kembalikan peringatan info (bukan `automationFail`, agar save tidak hard-fail). Jangan tolak save hanya karena domain belum verified (verifikasi butuh DNS async). Terima: save dengan format rusak ditolak dengan pesan jelas; save dengan domain baru lolos + ada hint "pastikan domain terverifikasi di Resend".
- [ ] B5. Komentar anti-secret di `resolveResendKey` (`src/lib/automation/email.ts:28-49`). Tambah komentar: JANGAN log/return nilai key ke error message; urutan Vault → env tetap. Tanpa perubahan perilaku. Terima: tidak ada nilai key yang mengalir ke `SendResult.error`/log.
- [ ] C1. Ambil full output LLM developing sesi gagal (read-only, investigasi). Langkah: (1) cek kolom dulu `SELECT column_name FROM information_schema.columns WHERE table_name='llm_call_logs'` (jangan asumsikan nama kolom output); (2) `SELECT ... FROM llm_call_logs WHERE session_id='91b668a0-...' AND stage='developing' ORDER BY created_at DESC LIMIT 5`; (3) jalankan `parseArticleDraft(fullText)` secara lokal terhadap output attempt-2 untuk memastikan validator mana yang menolak (catatan: log hanya menyimpan 2000 char pertama; raw yang terlihat punya kunci `id` duplikat + `en: null`, dan karena `JSON.parse` memenangkan kunci terakhir maka `parsed.id` = objek artikel — kegagalan berarti objek `id` itu sendiri gagal `parseArticleLang`, BUKAN sekadar `en` kosong). Terima: nama aturan penolak tertulis (mis. sections<3 / slug tak valid / meta hilang / excerpt<50 / CJK) di Progress Log.
- [ ] C2. Tambah helper alasan penolakan murni + pakai hanya di jalur log (`src/lib/llm/prompt.ts:378-425` `parseArticleLang`, `499-510` `parseArticleDraft`; pemanggil `src/lib/research/development.ts:928-954`). Buat fungsi pure mis. `debugArticleRejectReason(raw: unknown): string` yang mengembalikan alasan pertama yang gagal (`title/slug/excerpt/sections[N].h2|body/faq/meta_title/meta_desc/CJK`) tanpa mengubah `parseArticleLang`/`parseArticleDraft` (kriteria TETAP). Di `development.ts` blok `if (!parsed || missingLangs...)`, sebelum insert log `error`, hitung reason best-effort dan sertakan di message (tetap `slice(0,2000)` untuk raw + reason ≤200 char). Terima: test baru di `prompt-article.test.ts` — tiap aturan (slug buruk, sections=1, excerpt pendek, CJK) menghasilkan reason berbeda yang mengandung nama field.
- [ ] D1. Gate kode: `npm run typecheck`, `npm run lint` hijau. Bila menyentuh pola yang hanya ditangkap build (mis. konstanta di-assign ulang — insiden 2026-09-10), tambah `npm run build`. Aturan final: SETIAP edit setelah gate hijau membatalkan gate — re-run sebelum commit.
- [ ] D2. Test: `npm test -- src/lib/automation/email.test.ts src/lib/automation/actions.test.ts src/lib/llm/prompt-article.test.ts` hijau, lalu `npm test` penuh hijau. Perbarui `actions.test.ts` (test-email memakai `cfg.emailFrom`) dan `email.test.ts` (klasifikasi 403) yang ditambah di B1/B2.
- [ ] D3. Verifikasi manual di UI admin (operator, setelah Fase A besluit): (1) ubah `email_from` via UI bila diputuskan; (2) klik kirim test email → balasan `Terkirim ... (id ...)`; (3) `SELECT moment, ok, resend_id, error FROM automation_email_log ORDER BY created_at DESC LIMIT 3` menunjukkan `ok=true` + `resend_id` terisi; (4) badge run di `/admin/automation` hijau `terkirim`. JANGAN memaksa run produksi gagal hanya untuk menguji jalur failure — cukup unit test.
- [ ] E1. (Opsional, hanya bila strategi domain = ganti default permanen) Buat migrasi non-destruktif baru mengikuti pola `supabase/migrations/20260915000005_automation_email_from.sql`: `ALTER ... SET DEFAULT ...` + `UPDATE ... WHERE id=1 AND email_from='<nilai lama exact>'` (bersyarat, tidak menimpa kustom admin). Commit+push migrasi di submodule `supabase/` DULU, baru parent pointer. Bila strategi = verifikasi DNS `alamaby.com`, lewati task ini (tandai cancelled + alasan).

## Risks

- Salah diagnosis domain-vs-key: ganti `email_from` tanpa perbaiki key (atau sebaliknya) → 403 tetap. Mitigasi: Fase A wajib selesai + tercatat sebelum sentuh kode; test email adalah gerbang Fase D.
- Test-email hardcoded (B1) membuat operator tertipu "config sudah benar tapi test tetap gagal" — ini bug yang diperbaiki, bukan fitur.
- Helper reason (C2) tergoda dipakai untuk melonggarkan validasi ("terima saja draf cacat") → kualitas artikel jatuh + publish gagal 23514 di hilir. Mitigasi: helper HANYA untuk message log; kriteria `parseArticleLang` disentuh nol baris logika.
- Secret terekspos saat debug Vault/Resend (Env Guard): JANGAN print `re_*`, `sb_secret_*`, isi `.env*` ke chat/log/komentar/markdown; `.env.example` hanya placeholder.
- Migrasi email_from destruktif menimpa kustom admin produksi. Mitigasi: pola UPDATE-bersyarat + non-destructive; submodule dulu baru parent.
- Badge `failure` (B3) bisa membingungkan bila run punya published sukses + failure lama — mitigasi: prioritas `published > draft_ready > failure terbaru`, dan tooltip memuat moment + timestamp.
- Plan ini tidak memperbaiki kualitas output LLM developing (duplikat key `id`, `en: null`) — ituproblems hulu (prompt/model/repair). C1/C2 hanya membuatnya terlihat; perbaikan prompt adalah plan terpisah.

## Progress Log

- 2026-09-20 10:40:00 — Plan dibuat dari RCA sesi `91b668a0` (developing `article parse failed` → run failed → `notifyFailure` 403 dari `updates@alamaby.com`). Belum ada implementasi; menunggu eksekusi Fase A→D.

## Notes

- Arsitektur: repo ini bukan sistem rating/billing telekomunikasi, jadi standar Oracle C2M / TM Forum ODA tidak berlaku; TOGAF diterapkan proporsional (fix operasional kecil — cukup catat keputusan di Notes ini, tanpa seremoni ADM penuh). Penyimpangan: tidak ada.
- Prinsip yang dijaga: SOLID (helper reason murni, terpisah dari parser), Database as Code + Non-Destructive Migrations (E1 bersyarat), End-to-End Type Safety (`code` opsional ber-tipe, tidak `any`), Strict RLS (tidak diubah), RSC (badge server component tetap serializable — hanya string), Env Validation (B4 + zod `re_` existing), Clean Code + i18n (pesan badge Indonesia), State Feedback (badge merah/amber/hijau + tooltip).
- File kunci: `src/lib/automation/email.ts:28-93,120-142`, `src/lib/automation/actions.ts:121,228-293`, `src/lib/automation/config.ts:157-172`, `src/lib/automation/runner.ts:830-869`, `src/app/[locale]/(admin)/admin/automation/page.tsx:106-148`, `src/lib/llm/prompt.ts:378-510`, `src/lib/research/development.ts:926-963`, migrasi `supabase/migrations/20260915000005_automation_email_from.sql` (pola), test `email.test.ts`, `actions.test.ts`, `prompt-article.test.ts`.
- Instruksi untuk model pelaksana (less capable): kerjakan task berurutan A1→E1; JANGAN loncat ke kode sebelum A1-A4 tercatat; JANGAN print secret; JANGAN ubah threshold validasi; setiap selesai satu task, update checkbox + Progress Log ber-tanggal di file ini; gate D1+D2 hijau sebelum klaim selesai.
