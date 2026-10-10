# Implementation Plan: Kartu Contoh Hasil Pipeline di Homepage (Opsi 1)

Created: 2026-10-10 23:00:00

## 0. Konteks dan baseline

- Permintaan: visualisasi homepage yang menjelaskan fungsi Digital Hub — diputuskan Opsi 1 (kartu "contoh hasil" dari fixtures sintetis). Opsi 2 (screenshot) dan Opsi 3 (gambar AI) DITUNDA, bukan open question.
- Keputusan final (dari diskusi — BUKAN open question): (a) data fixture ditampilkan VERBATIM di kedua locale (datanya berbahasa Indonesia; terjemahan = risiko drift) dengan chrome UI bilingual dan caption EN menyebut "sample in Indonesian"; (b) tidak ada file test baru (tidak ada test render homepage di repo — pola ini dilarang plan paket); (c) komponen server, bukan client (nol interaktivitas).
- Fakta kode terverifikasi: `ReviewSeverity = 'critical' | 'major' | 'minor'` (`src/lib/digital-hub/types.ts:84`); fixtures + `DEMO_IS_SYNTHETIC` di `src/lib/digital-hub/fixtures.ts:16-127`; key `home.sample.*` BELUM ada (grep nol hit); `SectionHeading` dipakai dengan props `id/title/description`; homepage server component dengan `getTranslations` + ISR 3600 + 1 H1.
- Baseline (HEAD `2f91a69`, working tree bersih saat plan ditulis): `typecheck` PASS, `lint` 0 warning PASS, `test` 135 files / 1345 tests PASS, `build` 130 pages 0 warning PASS, `validate:messages` PASS.

## 1. Objective

Satu kartu statis "Contoh alur" di seksi `#mesin-riset` yang merender brief → draf → review → siap terbit HANYA dari fixtures sintetis, dengan guard `DEMO_IS_SYNTHETIC` dan caption contoh yang selalu terlihat. Nol dependensi baru, nol klaim pelanggan nyata.

## 2. Scope

Masuk: W1 (key `home.sample.*`), W2 (`SampleFlowCard.tsx` baru), W3 (sisipan `page.tsx`), W4 (gate + commit + push).
Keluar (dilarang): client component/`'use client'`; ubah isi `fixtures.ts`/`types.ts`; key di luar `home.sample.*`; sentuh blok pipeline/artikel/B0/hero; file test baru; ubah `approveQueued`/worker/antrean; klaim "pelanggan"/angka/traction.

## 3. Langkah implementasi

### W0 — Verifikasi baseline (read-only)

- Tujuan: pastikan mulai dari keadaan yang diasumsikan plan.
- Dependency: tidak ada.
- Baca: tidak ada file; jalankan `git status --short` (harus kosong), `git log --oneline -2` (HEAD `2f91a69` atau lebih baru hanya bila berisi paket ini), `git ls-files --others --exclude-standard` (harus kosong), `grep -c "home.sample" src/messages/id.json` (harus `0`).
- Ubah: tidak ada.
- Completion: semua sesuai. Jika tidak → BERHENTI, catat di Progress Log.

### W1 — Key i18n `home.sample.*` (ID dulu, lalu EN)

- Tujuan: seluruh chrome kartu bilingual dengan parity terjaga.
- Finding: key belum ada; fixtures ID-only sehingga chrome harus menutup kebutuhan EN.
- Dependency: W0.
- Baca: `src/messages/id.json` object `home.digitalHub` (akhir, kunci `repoCta`) sebagai pola sisip; mirror di `en.json`.
- Ubah, urutan dalam tiap file: tambah object `sample` SETELAH object `digitalHub` (sebelum penutup `home`), key exact + string exact:
  - ID: `heading`=`Contoh alur: brief → draf → review → siap terbit`; `description`=`Simulasi ujung-ke-ujung memakai data contoh sintetis — bukan data pelanggan nyata.`; `syntheticNote`=`Data contoh sintetis`; `stageBrief`=`Brief konten`; `stageDraft`=`Draf`; `stageReview`=`Review`; `stageReady`=`Siap terbit`; `briefFacts`=`Fakta pendukung`; `briefEvidence`=`Bukti yang dibutuhkan`; `draftStatus`=`Status draf`; `reviewFindings`=`Temuan`; `reviewRecommendation`=`Rekomendasi`; `readyMode`=`Mode terbit`; `readyApprover`=`Disetujui oleh`; `noFindings`=`Tidak ada temuan.`; `severityCritical`=`Kritis`; `severityMajor`=`Mayor`; `severityMinor`=`Minor`.
  - EN: `heading`=`Sample flow: brief → draft → review → ready`; `description`=`End-to-end simulation using synthetic sample data — not real customer data.`; `syntheticNote`=`Synthetic sample data (in Indonesian)`; `stageBrief`=`Content brief`; `stageDraft`=`Draft`; `stageReview`=`Review`; `stageReady`=`Ready to publish`; `briefFacts`=`Supporting facts`; `briefEvidence`=`Required evidence`; `draftStatus`=`Draft status`; `reviewFindings`=`Findings`; `reviewRecommendation`=`Recommendation`; `readyMode`=`Publish mode`; `readyApprover`=`Approved by`; `noFindings`=`No findings.`; `severityCritical`=`Critical`; `severityMajor`=`Major`; `severityMinor`=`Minor`.
- Simbol: tidak ada (data JSON).
- Kondisi kini: object `sample` tidak ada di kedua file.
- Pertahankan: key lain, urutan key lain, tidak ada nilai kosong.
- Edge: karakter `→`, `—`, `·` sudah dipakai di katalog (aman UTF-8); JANGAN tambah key di luar daftar di atas.
- Test: tidak ada file test baru. Mekanisme verifikasi = `npm run validate:messages` (parity + non-empty, mencakup key baru) + `src/messages/messages.test.ts` (berjalan dalam `npm test`).
- Verifikasi: `npm run validate:messages` → `message catalogs valid`.
- Completion: 18 key identik di kedua file, PASS.
- Jangan ubah: namespace selain `home`; `pipeline.*`, `output.*`, `articles.*`.

### W2 — Komponen `src/components/digital-hub/SampleFlowCard.tsx` (file baru)

- Tujuan: render 4 tahap dari fixtures dengan guard sintetis.
- Dependency: W1 (key harus ada dulu agar tidak ada key mentah).
- Baca: `src/lib/digital-hub/fixtures.ts` (nama export exact: `DEMO_IS_SYNTHETIC`, `demoBrief`, `demoDraft`, `demoReview`, `demoPublication`; field: `keyMessage`, `supportingFacts: string[]`, `requiredEvidence: string[]`, `content`, `reviewStatus`, `unsupportedClaims: {severity, message}[]`, `missingContext: string[]`, `recommendations: string[]`, `publicationMode`, `approvedBy`), `src/lib/digital-hub/types.ts:84` (`ReviewSeverity`), `src/components/digital-hub/WaitlistForm.tsx` baris 1–10 (pola import + `'use client'` — komponen baru TANPA `'use client'`, server murni), pemakaian `SectionHeading` di `page.tsx` (props `id/title/description`).
- Ubah: buat file baru exact sebagai berikut (tanpa tambahan apa pun):
  ```tsx
  import { useTranslations } from 'next-intl';
  import { SectionHeading } from '@/components/ui/SectionHeading';
  import {
    DEMO_IS_SYNTHETIC,
    demoBrief,
    demoDraft,
    demoPublication,
    demoReview,
  } from '@/lib/digital-hub/fixtures';
  import type { ReviewSeverity } from '@/lib/digital-hub/types';

  /**
   * Static sample-flow card: brief → draft → review → ready.
   * Synthetic fixtures only — never real customer data (see DEMO_IS_SYNTHETIC).
   */
  export function SampleFlowCard() {
    const t = useTranslations('home');
    if (!DEMO_IS_SYNTHETIC) return null;
    const severityLabel: Record<ReviewSeverity, string> = {
      critical: t('sample.severityCritical'),
      major: t('sample.severityMajor'),
      minor: t('sample.severityMinor'),
    };
    const findingRows = [
      ...demoReview.unsupportedClaims.map((f) => `${severityLabel[f.severity]}: ${f.message}`),
      ...demoReview.missingContext,
    ];
    return (
      <div className="mt-8 rounded-2xl border border-line bg-surface p-6 shadow-card sm:p-8">
        <div className="mb-3 inline-block rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
          {t('sample.syntheticNote')}
        </div>
        <SectionHeading
          id="contoh-alur-heading"
          title={t('sample.heading')}
          description={t('sample.description')}
        />
        <ol className="mt-6 grid gap-4 sm:grid-cols-2">
          <li className="rounded-xl border border-line bg-surface/50 p-4">
            <h3 className="text-base font-semibold text-primary">{t('sample.stageBrief')}</h3>
            <p className="mt-1 text-sm leading-relaxed text-ink-muted">{demoBrief.keyMessage}</p>
            <p className="mt-2 text-sm text-ink-muted">{t('sample.briefFacts')}: {demoBrief.supportingFacts.join(', ')}</p>
            <p className="mt-1 text-sm text-ink-muted">{t('sample.briefEvidence')}: {demoBrief.requiredEvidence.join(', ')}</p>
          </li>
          <li className="rounded-xl border border-line bg-surface/50 p-4">
            <h3 className="text-base font-semibold text-primary">{t('sample.stageDraft')}</h3>
            <p className="mt-1 line-clamp-3 text-sm leading-relaxed text-ink-muted">{demoDraft.content}</p>
            <p className="mt-2 text-sm text-ink-muted">{t('sample.draftStatus')}: {demoDraft.reviewStatus}</p>
          </li>
          <li className="rounded-xl border border-line bg-surface/50 p-4">
            <h3 className="text-base font-semibold text-primary">{t('sample.stageReview')}</h3>
            {findingRows.length > 0 ? (
              <ul className="mt-1 space-y-1">
                {findingRows.map((row) => (
                  <li key={row} className="text-sm leading-relaxed text-ink-muted">• {row}</li>
                ))}
              </ul>
            ) : (
              <p className="mt-1 text-sm text-ink-muted">{t('sample.noFindings')}</p>
            )}
            <p className="mt-2 text-sm text-ink-muted">{t('sample.reviewRecommendation')}: {demoReview.recommendations.join(', ')}</p>
          </li>
          <li className="rounded-xl border border-line bg-surface/50 p-4">
            <h3 className="text-base font-semibold text-primary">{t('sample.stageReady')}</h3>
            <p className="mt-1 text-sm text-ink-muted">{t('sample.readyMode')}: {demoPublication.publicationMode}</p>
            <p className="mt-1 text-sm text-ink-muted">{t('sample.readyApprover')}: {demoPublication.approvedBy}</p>
          </li>
        </ol>
      </div>
    );
  }
  ```
- Urutan: tulis file lengkap sekaligus (file baru, tidak ada urutan parsial).
- Kondisi kini: file belum ada; folder hanya berisi `WaitlistForm.tsx`.
- Pertahankan: tidak ada fetch, tidak ada state/event handler, tidak ada `<h1>` (h3 di dalam section ber-H2 milik `SectionHeading`), kelas hanya dari utilitas existing (`line-clamp-3` dipakai `ArticleCard`), nilai enum mentah (`needs_revision`, `export`) ditampilkan apa adanya — JANGAN buat mapping label baru.
- Edge: `DEMO_IS_SYNTHETIC` literal `true` hari ini — guard tetap ditulis (kontrak fixtures); array kosong → fallback `noFindings` (struktur `<ol>` 4 item SELALU utuh); `key={row}` stabil karena string unik fixture.
- Test: tidak ada file test baru (aturan paket). Verifikasi = `typecheck` (Record<ReviewSeverity> menolak typo severity) + build render.
- Input/expected: tidak ada unit test; expected = komponen render 4 `<li>` dengan teks fixture verbatim.
- Verifikasi: `npm run typecheck` PASS (silent).
- Completion: file ada, typecheck hijau.
- Jangan ubah/tambah: file lain; helper/hook baru; `'use client'`.

### W3 — Sisipan di homepage (dua edit kecil)

- Tujuan: kartu tampil di bawah pipeline, di atas keluaran artikel.
- Dependency: W2 (komponen harus ada).
- Baca: `page.tsx` baris 1–30 (blok import; `TrackedExternalLink` baris 23 pola referensi) dan baris 150–158 (penutup kartu pipeline `</div>` + awal `{latestArticles.length > 0 ? (`).
- Ubah, urutan: (1) tambah SATU baris import setelah baris import `TrackedExternalLink`: `import { SampleFlowCard } from '@/components/digital-hub/SampleFlowCard';` (2) sisipkan SATU baris `<SampleFlowCard />` di antara penutup `</div>` kartu pipeline dan baris `{latestArticles.length > 0 ? (` — tanpa wrapper tambahan (margin sudah di root komponen), tanpa kondisional (guard ada di dalam komponen).
- Pertahankan: `id="mesin-riset"`, 1 H1, grid pipeline, blok artikel, B0, CTA, ISR 3600, urutan seksi lain.
- Edge: tidak ada (render unconditional; komponen mengatur guard + datanya statis).
- Test: tidak ada file test baru.
- Verifikasi: `npm run build` → `/id` + `/en` sukses; manual: kartu tampil di kedua locale di bawah pipeline.
- Completion: kartu tampil dua locale.
- Jangan ubah: selain dua titik di atas; copy `pipeline.*`/`output.*`.

### W4 — Gate penuh + commit + push

- Tujuan: paket terkirim tanpa regresi.
- Dependency: W1–W3.
- Baca: tidak ada. Ubah: tidak ada (hanya git).
- Verifikasi berurutan (hasil harapan): `npm run typecheck` PASS; `npm run lint` PASS (`--max-warnings=0`); `npm test` PASS (≥135 files / ≥1345 tests, NOL test dilemahkan/dihapus); `npm run build` PASS (≥130 pages, 0 warning `metadataBase`); `npm run validate:messages` PASS; scan `sb_secret_|sb_publishable_|sk-ant-|CRON_SECRET=.+` → hanya placeholder/dokumen/test; `git status` hanya 4 file (`id.json`, `en.json`, `SampleFlowCard.tsx`, `page.tsx`).
- Setiap edit setelah satu gate hijau MEMBATALKAN gate itu (insiden `c3afbc5`) — re-run dari gate yang batal.
- Commit SATU: stage tepat 4 file di atas lalu `feat(web): add synthetic sample flow card to homepage pipeline section` (satu baris, tanpa trailer). Dilarang `--no-verify`/force/amend. Push; bila ditolak: `git fetch`, cek `main..origin/main`, `git pull --no-rebase`, re-run gate, push lagi.
- Completion: push sukses.

## 4. Open questions / blocker

Tidak ada blocker terbuka. Satu hal dipertimbangkan dan DIPUTUSKAN eksplisit: data fixture verbatim dua locale (bukan diterjemahkan) — karena terjemahan duplikat berisiko drift dari `fixtures.ts` sebagai sumber kebenaran, dan caption EN menyatakan bahasanya.

## 5. Handoff checklist (executor baca dulu)

- [x] W0 hijau sebelum menyentuh apa pun.
- [x] Hanya 4 file pada W4; jangan sentuh `.env*`, secret, key ke chat/file; jangan tambah dependensi; jangan buat file test.
- [x] 18 key exact W1 — bila tergoda menambah/mengubah copy, BERHENTI (di luar scope).
- [x] Kode W2 ditempel verbatim — bila `typecheck` menolak field fixture, artinya fixture berubah: BERHENTI dan laporkan (jangan adaptasi diam-diam).
- [x] Update `## Progress Log` di file ini per langkah; tasks `- [x]`.
- [x] Gate-final AGENTS.md berlaku penuh; satu commit + push (W4).

## Progress Log
- 2026-10-10 22:42:00 — W0 verifikasi baseline git & grep selesai, tree bersih.
- 2026-10-10 22:42:16 — W1 18 key i18n ditambahkan ke id.json dan en.json, validate:messages PASS.
- 2026-10-10 22:42:52 — W2 SampleFlowCard.tsx dibuat, typecheck PASS.
- 2026-10-10 22:43:09 — W3 import & sisipan komponen di page.tsx selesai.
- 2026-10-10 22:44:00 — W4 persiapan eksekusi gate penuh & commit/push.
