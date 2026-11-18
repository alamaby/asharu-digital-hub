# Transformasi Mesin Status Implisit ke Eksplisit (UX + DX + AX)

Created: 2026-11-18 08:55:00

## Objective
Mengidentifikasi seluruh mesin status implisit (*implicit state machines*) di aplikasi Asharu Digital Hub, memetakan risiko dan celah arsitekturnya, serta merumuskan perubahan arsitektur yang meningkatkan pengalaman pengguna (*User Experience* / UX), pengalaman pengembang (*Developer Experience* / DX), dan pengalaman agen AI (*Agent Experience* / AX) secara bersamaan tanpa merusak perilaku sistem yang sudah ada (*backward-compatible* & *non-destructive*).

## Scope
1. Analisis menyeluruh seluruh komponen backend, pipeline background worker, basis data, dan UI form di repositori.
2. Identifikasi seluruh entitas dengan lifecycle implisit:
   - User Image Studio Pipeline (`user_image_generations`)
   - Content Factory Draft Images (`content_draft_images`)
   - Social Media Multi-Post Thread Publisher (`social_post_queue` + `social_post_logs`)
   - Content Research Pipeline & Chunked Development (`content_research_sessions` + `content_research_topics`)
   - Content Draft & Published Article Dual-Lifecycle (`content_drafts` vs `articles`)
   - Daily Automation Multiplexed Runner (`automation_runs` + `automation_schedules`)
   - LLM & Image KeyPool Circuit Breaker (`llm_provider_keys`, `image_provider_keys`)
   - Fixed-Window Rate Limiter (`rate_limits` + `consume_rate_limit`)
   - Client-Side Form & Wizard State Machines (`ContentRequestForm`, `EndpointTryClient`, `LoginForm`/`ExchangePage`)
3. Pemetaan state implisit, akar masalah, usulan transisi eksplisit, dan analisis dampak UX/DX/AX.
4. Mitigasi risiko dan kontra-argumen per proposal perubahan.

## Milestones
1. Fase Analisis & Inventarisasi: Audit kode dan tabel untuk membongkar setiap state implisit.
2. Fase Desain Arsitektur: Spesifikasi discriminated unions, status diskrit DB, dan transisi FSM murni.
3. Fase Implementasi Bertahap (Non-Destruktif): Migrasi kolom, adaptasi worker, dan refactor UI klien.

## Tasks
- [x] Inventarisasi seluruh mesin status implisit di codebase (`src/` dan `supabase/migrations/`).
- [x] Analisis celah arsitektur dan failure modes untuk setiap mesin status.
- [ ] Implementasi Fase 1: Transisi eksplisit worker image & studio (`processing` status + `claimed_at`).
- [ ] Implementasi Fase 2: Sinkronisasi siklus draf artikel vs penerbitan publik (`articles`).
- [ ] Implementasi Fase 3: State tracker chunked development pada sesi riset.
- [ ] Implementasi Fase 4: Circuit breaker dengan status `HALF-OPEN` dan auto-cooldown.
- [x] Implementasi Gelombang 1 (Fase 5): Reducer state machine pada form klien (`ContentRequestForm`, `EndpointTryClient`).

## Risks
1. **Risiko Migrasi Skema DB (CHECK constraint)**: Penambahan nilai status baru pada kolom yang dilindungi `CHECK (status IN (...))` dapat memicu kegagalan insert bila worker lama masih berjalan saat deployment berlangsung.
2. **Risiko Re-entrancy & Polling Klien**: Klien lama yang melakukan polling dengan filter `status = 'pending'` akan kehilangan item yang sedang berada di status `processing` jika tidak dibuatkan view atau backward-compatible alias.
3. **Risiko Over-Engineering pada UI Sederhana**: Pengenalan library state machine berat (seperti XState) pada form input dapat menambah bundle size yang tidak perlu; disarankan menggunakan React native `useReducer` dengan discriminated union types.

## Progress Log
- 2026-11-18 08:55:00 — Plan diinisiasi. Audit mendalam menemukan 10 mesin status implisit utama di backend, worker background, dan frontend.
- 2026-11-18 09:22:00 — Selesai Gelombang 1 (Frontend State Hygiene):
  - Refaktor `ContentRequestForm.tsx` ke discriminated union FSM `FormInteractionState` (`idle` | `generating_idea` | `submitting` | `success` | `error`) via `formReducer` dan guard transisi anti-konflik.
  - Refaktor `EndpointTryClient.tsx` memecah `isPending` tunggal menjadi dua FSM independen: `ModelCatalogPhase` dan `ChatSessionPhase`, memisahkan tombol uji koneksi dan chat streaming/sending.
  - Unit tests komprehensif di `ContentRequestForm.test.tsx` (11 tests pass) dan `EndpointTryClient.test.tsx` (4 tests pass).
  - Lolos seluruh gates: typecheck (0 error), lint (0 warning), full test suite (141 files, 1376 tests pass).

## Notes
- Mengacu pada standar TOGAF proporsional dan arsitektur *Non-Destructive Migrations*.
- Mempertahankan aturan komentar bisnis dan pemisahan fakta terverifikasi dari commentary (Rule 6).
