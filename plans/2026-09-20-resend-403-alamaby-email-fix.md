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
- [x] A4. [KEPUTUSAN user 2026-09-20 16:35: Opsi 1 — ganti `email_from` ke domain verified `@updates.alamaby.com` via UI admin] Putuskan strategi domain (catat di Progress Log + Notes). Opsi 1 (cepat): ganti `email_from` ke domain yang SUDAH verified (via UI admin). Opsi 2 (benar, brand): verifikasi `alamaby.com` via DNS lalu pertahankan `updates@alamaby.com`. Counter-argument: Opsi 1 cepat tapi ganti identitas pengirim + reset reputasi; Opsi 2 benar tapi butuh akses DNS + propagasi. Rekomendasi: Opsi 2 bila akses DNS ada; Opsi 1 hanya sebagai darurat sementara. Jangan eksekusi keduanya diam-diam — satu saja, tercatat.
- [x] B1. Perbaiki `sendAutomationTestEmail` memakai `cfg.emailFrom` (`src/lib/automation/actions.ts:246-284`).
- [x] B2. Klasifikasikan error 403 Resend (`src/lib/automation/email.ts:51-93`, fungsi `sendViaResend`).
- [x] B3. Tampilkan badge `failure` + pesan 403 yang actionable (`src/app/[locale]/(admin)/admin/automation/page.tsx:106-148`, fungsi `renderEmailBadge`).
- [x] B4. Validasi `email_from` saat simpan (non-blocking). Lokasi: `AutomationForms.tsx`.
- [x] B5. Komentar anti-secret di `resolveResendKey` (`src/lib/automation/email.ts:28-49`).
- [x] C1. Ambil full output LLM developing sesi gagal (read-only, investigasi).
- [x] C2. Tambah helper alasan penolakan murni + pakai hanya di jalur log (`src/lib/llm/prompt.ts` + `src/lib/research/development.ts`).
- [ ] D1. Gate kode: `npm run typecheck`, `npm run lint` hijau. Bila menyentuh pola yang hanya ditangkap build (mis. konstanta di-assign ulang — insiden 2026-09-10), tambah `npm run build`. Aturan final: SETIAP edit setelah gate hijau membatalkan gate — re-run sebelum commit.
- [ ] D2. Test: `npm test -- src/lib/automation/email.test.ts src/lib/automation/actions.test.ts src/lib/llm/prompt-article.test.ts` hijau, lalu `npm test` penuh hijau. Perbarui `actions.test.ts` (test-email memakai `cfg.emailFrom`) dan `email.test.ts` (klasifikasi 403) yang ditambah di B1/B2.
- [ ] D3. Verifikasi manual di UI admin (operator, setelah Fase A besluit): (1) ubah `email_from` via UI bila diputuskan; (2) klik kirim test email → balasan `Terkirim ... (id ...)`; (3) `SELECT moment, ok, resend_id, error FROM automation_email_log ORDER BY created_at DESC LIMIT 3` menunjukkan `ok=true` + `resend_id` terisi; (4) badge run di `/admin/automation` hijau `terkirim`. JANGAN memaksa run produksi gagal hanya untuk menguji jalur failure — cukup unit test.
- [ ] E1. (CANCELLED 2026-09-20 — strategi Opsi 1 sementara, default migrasi tidak dibakukan; aktifkan lagi bila Opsi 1 diputuskan permanen) (Opsional, hanya bila strategi domain = ganti default permanen) Buat migrasi non-destruktif baru mengikuti pola `supabase/migrations/20260915000005_automation_email_from.sql`: `ALTER ... SET DEFAULT ...` + `UPDATE ... WHERE id=1 AND email_from='<nilai lama exact>'` (bersyarat, tidak menimpa kustom admin). Commit+push migrasi di submodule `supabase/` DULU, baru parent pointer. Bila strategi = verifikasi DNS `alamaby.com`, lewati task ini (tandai cancelled + alasan).

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
- 2026-09-20 14:10:00 — Fase B+C kode selesai diimplementasi. B1: test-email pakai `cfg.emailFrom`. B2: `classifyResendError` + field `code` pada `SendResult`. B3: badge fallback ke log `failure` terbaru + pesan Indonesia actionable. B4: validasi format email_from non-blocking di UI (hint amber). B5: komentar anti-secret di resolveResendKey. C2: `debugArticleRejectReason` helper + dipakai di development.ts error log. Gate typecheck ✓, lint ✓ (0 errors), build ✓, 968 tests ✓. [USER ACTION] Fase A (cek Resend Domains & API Keys di dashboard) tetap diperlukan sebelum test email live berhasil kirim.
- 2026-09-20 16:25:00 — C1 SELESAI via MCP production (read-only SELECT, boleh). Kolom output = `response_text` (bukan `output`). Attempt-2 (naraya agnes-2.5-flash, 7995 char, `{"id":null,"en":null,...,"id":{...}}` duplikat key) dijalankan lewat validator asli repo: `repairArticleJson` → null, `parseArticleDraft` → null → cocok dengan error produksi `article parse failed`. Akar: JSON TERPOTONG — berhenti di tengah FAQ ke-4 (`...lalu switch pakai`, tanpa `meta_title`/`meta_desc`/kurung tutup; `position(meta)=0` terverifikasi SQL). Bukan aturan field-level. Temuan laten: 5 sections valid tapi `sections[2].body` mengandung CJK `multit设备` (pos 4125) + `faq[3].a` mengandung `主打` — akan kena CJK gate walau JSON lengkap. Attempt-1 pakai key salah `"article"` bukan `"id"`. Sesi `language=id`/`mechanism=dua`, jadi `en:null` bukan penyebab.
- 2026-09-20 16:35:00 — A4 DIPUTUSKAN user: Opsi 1 (ganti `email_from` ke `@updates.alamaby.com` via UI admin, tanpa SQL tulis; tanpa migrasi E1). Nilai yang disarankan: `Asharu <noreply@updates.alamaby.com>` (local-part bebas — domain yang dinilai). Langkah operator (D3): (1) `/id/admin/automation` → From = nilai baru → Simpan; (2) klik `Kirim email test` → harapkan `Terkirim ... (id ...)`; (3) badge run hijau `terkirim`. Bila test masih 403 → lanjut A2 (cek Resend API Keys: permission + batasan domain). Counter-argument tercatat: identitas pengirim berubah + reputasi dari nol; bila nanti ingin kembali ke brand root, jalankan Opsi 2 (verifikasi `alamaby.com` via DNS) sebagai plan lanjutan.

## Notes

- Arsitektur: repo ini bukan sistem rating/billing telekomunikasi, jadi standar Oracle C2M / TM Forum ODA tidak berlaku; TOGAF diterapkan proporsional (fix operasional kecil — cukup catat keputusan di Notes ini, tanpa seremoni ADM penuh). Penyimpangan: tidak ada.
- Prinsip yang dijaga: SOLID (helper reason murni, terpisah dari parser), Database as Code + Non-Destructive Migrations (E1 bersyarat), End-to-End Type Safety (`code` opsional ber-tipe, tidak `any`), Strict RLS (tidak diubah), RSC (badge server component tetap serializable — hanya string), Env Validation (B4 + zod `re_` existing), Clean Code + i18n (pesan badge Indonesia), State Feedback (badge merah/amber/hijau + tooltip).
- File kunci: `src/lib/automation/email.ts:28-93,120-142`, `src/lib/automation/actions.ts:121,228-293`, `src/lib/automation/config.ts:157-172`, `src/lib/automation/runner.ts:830-869`, `src/app/[locale]/(admin)/admin/automation/page.tsx:106-148`, `src/lib/llm/prompt.ts:378-510`, `src/lib/research/development.ts:926-963`, migrasi `supabase/migrations/20260915000005_automation_email_from.sql` (pola), test `email.test.ts`, `actions.test.ts`, `prompt-article.test.ts`.
- Instruksi untuk model pelaksana (less capable): kerjakan task berurutan A1→E1; JANGAN loncat ke kode sebelum A1-A4 tercatat; JANGAN print secret; JANGAN ubah threshold validasi; setiap selesai satu task, update checkbox + Progress Log ber-tanggal di file ini; gate D1+D2 hijau sebelum klaim selesai.
