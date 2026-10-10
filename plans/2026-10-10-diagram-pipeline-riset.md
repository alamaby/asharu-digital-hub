# Implementation Plan: Diagram Pipeline Riset (README Mermaid + Konektor Homepage)

Created: 2026-10-10 15:00:00

## 0. Konteks dan baseline

- Permintaan: tampilkan gambaran pipeline riset di (a) seksi homepage `#mesin-riset` dan (b) README repo.
- Keputusan desain (final, dari diskusi 2026-10-10 — BUKAN open question): README memakai blok fenced ` ```mermaid ` (GitHub render native, nol dependensi); homepage TIDAK memakai library Mermaid (melawan arsitektur static-first + menambah First Load JS) melainkan konektor panah CSS `aria-hidden` di atas list `<ol>` 6 langkah yang sudah ada (struktur list = diagram aksesibel, nomor 01–06 menyampaikan urutan ke screen reader).
- Baseline (HEAD `12cfa06`, working tree bersih saat plan ditulis): `typecheck` PASS, `lint` 0 warning PASS, `test` 135 files / 1345 tests PASS, `build` 130 pages 0 warning PASS, `validate:messages` PASS.
- Aturan diagram repo (AGENTS.md §2.3): tema default tool, tanpa custom skin — Mermaid dibiarkan default; konektor memakai token warna existing (`text-primary/50`).

## 1. Objective

Dua artefak, nol dependensi baru, nol klaim baru: (1) flowchart Mermaid 6 tahap pipeline asli di README; (2) panah konektor dekoratif antar kartu pipeline homepage yang benar di semua breakpoint untuk makna (urutan tetap dari nomor + semantik list) dan rapi secara visual.

## 2. Scope

Masuk: D1 (blok Mermaid README), D2 (konektor `page.tsx`), D3 (gate + commit + push).
Keluar (dilarang): library Mermaid/`mermaid` npm di homepage; SVG/PNG diagram; string copy baru selain yang disebut (tidak ada key i18n baru — teks node Mermaid statis ID karena README berbahasa Indonesia); perubahan worker/prompt/stage; test yang dilemahkan.

## 3. Langkah implementasi

### D0 — Verifikasi baseline (read-only, tanpa ubah apa pun)

- Tujuan: pastikan mulai dari keadaan yang diasumsikan plan.
- Dependency: tidak ada.
- Baca: tidak ada file; jalankan `git status --short` (harus kosong), `git log --oneline -2` (HEAD harus `12cfa06` atau lebih baru hanya bila berisi paket ini), `git ls-files --others --exclude-standard` (harus kosong).
- Ubah: tidak ada.
- Completion: ketiga command sesuai harapan. Jika tidak → BERHENTI, catat di Progress Log, jangan lanjut.

### D1 — Blok Mermaid di README

- Tujuan: gambaran pipeline terbaca di halaman repo GitHub.
- Finding: README tidak punya representasi visual pipeline (hanya teks `Riset → Susun → ...`).
- Dependency: D0.
- Baca: `README.md` baris 1–17 (titik sisip: setelah baris 13 profil perusahaan, sebelum `---` baris 15).
- Ubah: `README.md` SATU sisipan blok exact berikut (fence `mermaid`, tema default, label ID singkat, fakta sesuai kode: Tavily di `search.ts`, temp 0.2 di `verification.ts:62`, 8 kriteria di `scoring.ts:6-17`, bilingual di `development.ts`, approve/reject di review, ekspor+jadwal):
  ````markdown
  ```mermaid
  flowchart LR
      A[Riset multi-sumber<br/>Tavily] --> B[Verifikasi<br/>temp 0,2 · JSON]
      B --> C[Skor<br/>8 kriteria bobot]
      C --> D[Draf bilingual<br/>ID + EN]
      D --> E[Review manusia<br/>approve / reject]
      E --> F[Terbit<br/>ekspor + jadwal]
  ```
  ````
- Urutan dalam file: sisip setelah baris 13, baris kosong sebelum dan sesudah blok, `---` tetap baris berikutnya.
- Simbol terkait: tidak ada (markdown only).
- Kondisi kini: tidak ada blok mermaid di README.
- Pertahankan: seluruh teks README lain, heading, Daftar Isi (tidak ada heading baru → anchor tidak berubah).
- Edge: `<br/>` didukung Mermaid GitHub; koma `0,2` aman di dalam `[...]`; bila GitHub gagal render (fallback teks) konten tetap terbaca sebagai teks panah.
- Test: tidak ada (tidak ada runner untuk render Mermaid; `npm test` tidak menyentuh `*.md`).
- Verifikasi: `grep -c '```mermaid' README.md` → `1`; manual di github.com setelah push: diagram tampil 6 node berurutan A→F.
- Completion: blok ada + render manual OK (dicatat di log setelah push).
- Jangan ubah: file selain `README.md`; copy produk; checklist launch.

### D2 — Konektor panah antar kartu pipeline homepage

- Tujuan: kartu 01–06 terbaca sebagai alur, bukan grid lepas.
- Finding: seksi `#mesin-riset` (`src/app/[locale]/(public)/page.tsx` baris 115–154) tidak punya penanda arah alur.
- Dependency: D1 (urutan risiko: docs dulu).
- Baca: `page.tsx` baris 1–30 (pastikan import `ArrowDown`, `ArrowRight` dari `lucide-react` masih ada — dipakai CTA baris 69–79), baris 130–153 (blok `<ol>`).
- Ubah: SATU edit di callback `.map`, urutan: (1) ubah `.map(({ num, key }) => (` menjadi `.map(({ num, key }, index, steps) => (`; (2) setelah blok `<p className="mt-3 ...">{tHome(key)}</p>` dan sebelum `</li>`, sisipkan blok exact:
  ```tsx
  {index < steps.length - 1 ? (
    <span aria-hidden="true" className="mt-3 flex justify-center text-primary/50 lg:hidden">
      <ArrowDown className="size-5" aria-hidden />
    </span>
  ) : null}
  {index < steps.length - 1 ? (
    <span aria-hidden="true" className="mt-3 hidden justify-end pr-1 text-primary/50 lg:flex">
      <ArrowRight className="size-5" aria-hidden />
    </span>
  ) : null}
  ```
- Simbol: `ArrowDown`, `ArrowRight` (sudah diimpor, TANPA import baru), `tHome` (existing).
- Kondisi kini: `<li>` berisi badge nomor + `<p>` saja; tidak ada konektor.
- Pertahankan: grid `sm:grid-cols-2 lg:grid-cols-3`, semua class kartu, `SectionHeading`, blok keluaran artikel (baris 156+), B0, CTA hero `#mesin-riset`, ISR 3600, SATU H1 halaman.
- Makna arah yang dipilih (final, bukan untuk diperdebatkan ulang): mobile 1 kolom → panah bawah; `lg:` → panah kanan. Pada baris yang wrap (`sm:` 2 kolom, item 2→3 dan `lg:` item 3→4) arah kanan tidak sempurna — DITERIMA sebagai keterbatasan kosmetik karena span `aria-hidden` (urutan sebenarnya disampaikan nomor + semantik `<ol>`). Jangan "memperbaiki" dengan logika posisi per breakpoint.
- Edge: item terakhir (06) tanpa panah (kondisi `index < steps.length - 1`); `size-5`, `text-primary/50`, `pr-1` adalah utilitas Tailwind existing di repo; tidak ada animasi (hormati `prefers-reduced-motion` secara inheren); target sentuh tidak berubah (span non-interaktif).
- Test: tidak ada file test baru (tidak ada test render homepage di repo — JANGAN buat; pola ini dilarang plan paket). Parity i18n tidak tersentuh (nol key baru) — `validate:messages` sebagai verifikasi.
- Input/expected: tidak ada unit test; verifikasi = build + inspeksi visual.
- Verifikasi: `npm run typecheck` PASS; `npm run lint` 0 warning PASS; `npm run build` PASS (halaman `/id`, `/en` sukses); manual 360/768/1280px: 6 kartu + panah tampil, tidak overflow, keyboard-only utuh.
- Completion: konektor tampil dua locale di semua breakpoint.
- Jangan ubah: copy `pipeline.*`, struktur grid, blok artikel, file lain.

### D3 — Gate penuh + commit + push

- Tujuan: paket terkirim tanpa regresi.
- Dependency: D1–D2.
- Baca: tidak ada.
- Ubah: tidak ada (hanya git).
- Verifikasi berurutan (hasil harapan): `npm run typecheck` PASS (silent); `npm run lint` PASS (`--max-warnings=0`); `npm test` PASS (≥135 files / ≥1345 tests, NOL test dilemahkan/dihapus); `npm run build` PASS (≥130 pages, 0 warning `metadataBase`); `npm run validate:messages` PASS (`message catalogs valid`); scan `sb_secret_|sb_publishable_|sk-ant-|CRON_SECRET=.+` → hanya placeholder/dokumen/test; `git status` hanya 2 file (`README.md`, `page.tsx`).
- Setiap edit setelah satu gate hijau MEMBATALKAN gate itu (insiden `c3afbc5`) — re-run dari gate yang batal.
- Commit SATU: `git add README.md 'src/app/[locale]/(public)/page.tsx'` lalu `feat(web): add research pipeline diagram and flow connectors` (satu baris, tanpa trailer). Dilarang `--no-verify`/force/amend. Push; bila ditolak: `git fetch`, cek `main..origin/main`, `git pull --no-rebase`, re-run gate, push lagi.
- Completion: push sukses + render Mermaid manual di GitHub dicatat OK.

## 4. Open questions / blocker

Tidak ada blocker terbuka. Dua hal yang dipertimbangkan dan DIPUTUSKAN eksplisit (bukan diam-diam): (a) label node Mermaid Bahasa Indonesia — karena README berbahasa Indonesia dan EN sudah terwakili di situs; (b) ketidak-sempurnaan arah panah pada baris wrap — diterima karena dekoratif `aria-hidden`, didokumentasikan di D2.

## 5. Handoff checklist (executor baca dulu)

- [x] D0 hijau sebelum menyentuh apa pun.
- [x] Hanya 2 file diubah; jangan sentuh `.env*`, secret, key ke chat/file; jangan tambah dependensi.
- [x] Nol key i18n baru — bila tergoda menambah copy, BERHENTI (di luar scope).
- [x] Update `## Progress Log` di file ini per langkah; tasks `- [x]`.
- [x] Gate-final AGENTS.md berlaku penuh; verlassen satu commit + push (D3).

## Progress Log

- 2026-10-10 22:08:00 — D0, D1, D2, D3 selesai:
  - D0: Baseline verified bersih di HEAD `00a9d5b`.
  - D1: Blok diagram flowchart Mermaid 6 tahap riset ditambahkan ke `README.md`.
  - D2: Panah konektor flow dekoratif (`ArrowDown` untuk mobile, `ArrowRight` untuk desktop lg) ditambahkan di antara kartu pipeline pada `src/app/[locale]/(public)/page.tsx`.
  - D3: Full gate lolos (`validate:messages`, `typecheck`, `lint` 0 warning, `test` 135 files / 1345 tests, `build` 100%, scan secret bersih). Siap commit & push.
