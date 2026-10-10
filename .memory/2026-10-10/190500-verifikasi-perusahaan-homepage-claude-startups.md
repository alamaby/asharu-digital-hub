# Verifikasi Perusahaan + Homepage Product-First + Repo Cleanup (Claude Startups Paket A+H+C)

Tanggal: 2026-10-10 19:05 WIB
Status: Selesai (WS-A, WS-H, WS-C) · Menunggu tindakan OWNER untuk WS-B (S1, S8, S9)

## Task / Masalah
Implementasi fase awal dari plan `plans/2026-10-10-paket-verifikasi-claude-startups.md`:
1. WS-A: Memasukkan fakta identitas legal perusahaan perorangan Asharu.id (Bandung, Maret 2023, Alam Aby Bashit, halo@asharu.id) ke halaman Tentang, JSON-LD Organization, dan footer.
2. WS-H: Mereframe homepage menjadi product-first (H1 dan metadata Digital Hub, CTA ke Digital Hub dan mesin riset, seksi 6-langkah pipeline internal, serta blok keluaran artikel nyata dari database publik).
3. WS-C: Menambahkan lisensi MIT pada repo publik dan identitas perusahaan pada README.

## Berkas Penting yang Diubah
- `src/app/[locale]/(public)/about/page.tsx` — Menambahkan blok profil perusahaan di bawah lead.
- `src/lib/seo/jsonld.ts` — Memperkaya `organizationSchema` dengan `foundingDate`, `email`, dan `address`.
- `src/lib/seo/jsonld.test.ts` — Menambahkan assertion pengujian untuk field baru schema Organization.
- `src/components/layout/Footer.tsx` — Menambahkan baris info perusahaan di bawah rights text.
- `src/app/[locale]/(public)/page.tsx` — Mengubah hero CTA, metadata, dan menyisipkan seksi `#mesin-riset` (pipeline + latest articles).
- `src/messages/id.json` & `src/messages/en.json` — Menambahkan key i18n untuk company, hero, pipeline, dan output.
- `src/messages/messages.test.ts` — Menyesuaikan expected metadata title homepage.
- `docs/claude-startups-readiness.md` — Menambahkan entri legal identity di Section C.
- `LICENSE` — File lisensi MIT baru.
- `README.md` — Menambahkan ringkasan profil legal entitas dan tautan live.
- `plans/2026-10-10-paket-verifikasi-claude-startups.md` — Pembaruan progress log dan checklist.

## Keputusan Teknis & Bisnis
- Bentuk usaha dicantumkan sebagai usaha perorangan (bukan PT/CV).
- Email kontak menggunakan `halo@asharu.id` plain text untuk kejelasan.
- Seksi artikel keluaran di homepage hanya dirender jika `latestArticles` memiliki data (fail-safe tanpa empty state).
- WS-B (S10–S12 terkait adapter Anthropic, migrasi provider/model, dan pin verifying) ditahan hingga OWNER menyelesaikan gerbang S9 (penyemaian Anthropic API key ke Supabase Vault dan penentuan exact model ID).

## Asumsi & Risiko
- Asumsi: Mailbox `halo@asharu.id` aktif menerima email dan env `NEXT_PUBLIC_CONTACT_EMAIL` diset oleh owner di Vercel Dashboard (S1).
- Risiko: Tanpa penyemaian Anthropic key di Vault oleh owner, integrasi model Claude pada stage verifying belum dapat diuji di production.

## Blocker / Open Item (Tindakan OWNER)
1. **S1 [OWNER]:** Set `NEXT_PUBLIC_CONTACT_EMAIL=halo@asharu.id` di Vercel Dashboard & verifikasi mailbox `halo@asharu.id`.
2. **S8 [OWNER]:** Transfer repo GitHub ke organisasi atau fallback profil personal.
3. **S9 [OWNER]:** Buat Anthropic API key, simpan ke Supabase Vault, dan catat exact model ID Haiku di Progress Log untuk membuka eksekusi S10–S12.

## Verifikasi yang Dilakukan
- `npm run validate:messages` → PASS (id/en parity, no empty/duplicate keys).
- `npm run typecheck` → PASS (tsc --noEmit bersih).
- `npm run lint` → PASS (0 errors, 0 warnings dengan `--max-warnings=0`).
- `npm test` → PASS (135 test files / 1345 tests passed, +1 test baru).
- `npm run build` → PASS (127+ pages SSG/ISR generated tanpa warning).
- Scan secret diff → 0 leak.

## Proposed Conventional Commit
`feat(web): update company verification identity, homepage hero, and repo license`

## Link Terkait
- Plan: `plans/2026-10-10-paket-verifikasi-claude-startups.md`
- Readiness doc: `docs/claude-startups-readiness.md`
