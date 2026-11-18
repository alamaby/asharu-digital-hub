# Frontend State Hygiene: Explicit State Machine Reducers on Request & Lab Forms

Date: 2026-11-18 09:25:00 WIB
Plan: [plans/2026-11-18-explicit-state-machines.md](file:///C:/Works/github.com/alamaby/asharu-digital-hub/plans/2026-11-18-explicit-state-machines.md)

## Task & Masalah
- Mengatasi status implisit dan *impossible states* pada formulir klien utama frontend (Gelombang 1 dari plan transformasi FSM).
- Pada `ContentRequestForm.tsx`, boolean state `pending` (dari action submission), `status`, `ideaGenerating`, `ideaApplied`, `ideaCoverage`, `ideaError`, dan `fieldErrors` tersebar secara independen melalui `useState`, memungkinkan terjadinya race condition (misalnya menekan tombol generate idea bersamaan dengan submit). Sebanyak 30+ input form menonaktifkan kontrol menggunakan kondisi boolean parsial yang rawan *drift*.
- Pada `EndpointTryClient.tsx`, `useTransition` tunggal digunakan secara bersamaan oleh aksi pengujian katalog model (`loadModels`) dan eksekusi chat (`sendChat`). Hal ini menyebabkan *cross-contamination* di mana pengujian model membuat tombol kirim chat menampilkan label disabled/pending yang salah, dan sebaliknya.

## Berkas Penting yang Diubah
- `src/components/content/ContentRequestForm.tsx`: Refaktor lifecycle form menjadi discriminated union state machine `FormInteractionState` (`idle` | `generating_idea` | `submitting` | `success` | `error`) yang dikelola oleh `formReducer` dengan aksi `START_IDEA_GENERATION`, `IDEA_SUCCESS`, `IDEA_ERROR`, `START_SUBMISSION`, `SUBMIT_SUCCESS`, `SUBMIT_ERROR`, `CLEAR_FIELD_ERROR`, dan `RESET_FORM`. Menyatukan disabled guard seluruh input ke `isFormBusy`.
- `src/components/content/ContentRequestForm.test.tsx`: Penambahan unit test untuk seluruh transisi FSM `formReducer` dan guard pencegahan *impossible state*.
- `src/components/lab/EndpointTryClient.tsx`: Pemisahan phase state menjadi dua mesin status diskrit: `ModelCatalogPhase` (`idle` | `loading` | `success` | `error`) dan `ChatSessionPhase` (`idle` | `sending` | `streaming` | `success` | `aborted` | `error`). Tombol Stop dan Uji Koneksi kini memiliki binding status yang terisolasi sepenuhnya.
- `src/components/lab/EndpointTryClient.test.tsx`: File unit test baru yang menguji isolasi state antara pengambilan daftar model dan pengiriman pesan chat.
- `plans/2026-11-18-explicit-state-machines.md`: Update task dan progress log implementasi Gelombang 1.

## Keputusan Teknis & Bisnis
- Menggunakan pendekatan *native* React `useReducer` dan discriminated unions TypeScript tanpa menambah library pihak ketiga (seperti XState) untuk menjaga *zero bundle size overhead* dan memastikan kepatuhan penuh terhadap standar arsitektur clean code.
- Kontrak API backend, Server Actions, dan skema database tidak diubah sedikit pun (*zero DB impact*, 100% *backward-compatible*).
- Menjaga persistensi context form (`ideaApplied`, `ideaCoverage`) di seluruh cabang union state agar UX tidak kehilangan informasi saat terjadi error validasi atau perbaikan input.

## Asumsi & Risiko
- Asumsi: Pengguna berinteraksi dengan satu formulir dalam satu waktu per tab peramban.
- Risiko: Minimal, karena perubahan bersifat murni lokal di komponen client tanpa mutasi payload API.

## Blocker & Open Item
- Tidak ada blocker. Gelombang 1 selesai.
- Gelombang berikutnya (Gelombang 2: Worker Image & Studio Processing States, Gelombang 3: Research Session Multi-Chunk Tracker, dsb.) dapat dilanjutkan sesuai prioritas roadmap.

## Verifikasi yang Dilakukan
- Unit tests:
  - `npx vitest run src/components/content/ContentRequestForm.test.tsx` (11 tests passed).
  - `npx vitest run src/components/lab/EndpointTryClient.test.tsx` (4 tests passed).
- Repo verification gates:
  - `npm run typecheck` — 0 errors (sukses).
  - `npm run lint` — 0 warnings dengan `--max-warnings=0` (sukses).
  - `npm test` — 141 test files passed, 1376 tests passed (sukses).

## Proposed Conventional Commit
`feat(ui): refactor explicit state machine reducers on request and lab forms`
