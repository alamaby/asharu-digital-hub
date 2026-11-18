# LoginForm State Machine & Harmonisasi Akses /konten/baru Login-Only

Date: 2026-11-18 11:12 WIB
Commit: proposed (feat(auth): refactor login form to fsm reducer and enforce authenticated research sessions)
Plan: [2026-11-18-explicit-state-machines.md](file:///C:/Works/github.com/alamaby/asharu-digital-hub/plans/2026-11-18-explicit-state-machines.md)

## Task & Problem
1. **LoginForm State Hygiene**:
   - `LoginForm.tsx` sebelumnya mengelola state interaksi dengan `useState` boolean terpisah (`pending`, `status`, `message`).
   - Ketika magic link berhasil dikirim (`status === 'success'`), input email tetap terbuka dan tombol submit tetap bisa diklik berulang kali, membingungkan pengguna dan berpotensi memicu duplicate request ke provider email (GoTrue/Resend).
   - `LoginForm` belum memiliki unit test coverage.
2. **Kebijakan Akses `/konten/baru` (Login-Only)**:
   - Terdapat inkonsistensi antara middleware (`LOGIN_ONLY_INTERNAL_PATHS`), komentar layout `(admin)/layout.tsx` (yang masih menyebut "tetap publik"), dan backend action `createResearchSession` yang sebelumnya membaca `auth.getUser()` dari service client (sehingga selalu bernilai null).
   - Pengguna telah mengonfirmasi dan menetapkan bahwa `/konten/baru` adalah rute **wajib login**.

## Key Files Modified / Created
- [src/components/auth/LoginForm.tsx](file:///C:/Works/github.com/alamaby/asharu-digital-hub/src/components/auth/LoginForm.tsx):
  - Refaktor ke FSM state reducer: `loginFormReducer` dengan fase `idle` | `submitting` | `success` | `error`.
  - Guard anti-reentrancy pada aksi `SUBMIT_START`.
  - Panel sukses dengan konfirmasi email yang dituju dan tombol "Gunakan email lain" (`RESET_FORM`).
  - Disable input dan tombol submit saat sedang submitting.
- [src/components/auth/LoginForm.test.tsx](file:///C:/Works/github.com/alamaby/asharu-digital-hub/src/components/auth/LoginForm.test.tsx):
  - 9 unit test komprehensif menguji seluruh transisi aksi reducer dan interaksi komponen.
- [src/messages/id.json](file:///C:/Works/github.com/alamaby/asharu-digital-hub/src/messages/id.json) & [src/messages/en.json](file:///C:/Works/github.com/alamaby/asharu-digital-hub/src/messages/en.json):
  - Penambahan translation key `useDifferentEmail` ("Gunakan email lain" / "Use a different email").
- [src/lib/content/actions.ts](file:///C:/Works/github.com/alamaby/asharu-digital-hub/src/lib/content/actions.ts):
  - `createResearchSession` kini memverifikasi user terautentikasi melalui `createSupabaseServer()`. Jika tidak login, mengembalikan error `Login diperlukan untuk membuat riset baru`.
  - Menyimpan `created_by: user.id` secara persisten pada baris `content_research_sessions`.
- [src/app/[locale]/(admin)/layout.tsx](file:///C:/Works/github.com/alamaby/asharu-digital-hub/src/app/[locale]/(admin)/layout.tsx):
  - Koreksi dokumentasi layout bahwa `/konten/baru` adalah `LOGIN_ONLY_INTERNAL_PATHS`.
- [.memory/README.md](file:///C:/Works/github.com/alamaby/asharu-digital-hub/.memory/README.md):
  - Menandai blocker legacy `[KEPUTUSAN USER] /konten/baru login-only vs anon` sebagai selesai (resolved).

## Verification
- `npm run typecheck` — 0 errors.
- `npm run lint` — 0 warnings/errors.
- `npm test` — 143 test files passed, 1414 tests passed.

## Proposed Conventional Commit
`feat(auth): refactor login form to fsm reducer and enforce authenticated research sessions`
