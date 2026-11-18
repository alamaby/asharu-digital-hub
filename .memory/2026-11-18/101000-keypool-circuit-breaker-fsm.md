# Key Pool Circuit Breaker FSM & Self-Healing Auto-Recovery

Date: 2026-11-18 10:10 WIB
Commit: proposed (feat(circuit-breaker): implement explicit circuit state machine and auto-cooldown probe for key pools)
Plan: [2026-11-18-explicit-state-machines.md](file:///C:/Works/github.com/alamaby/asharu-digital-hub/plans/2026-11-18-explicit-state-machines.md)

## Task & Problem
1. **Permanent Deactivation Outage**:
   - Sebelumnya, RPC Postgres `increment_failure_counter` secara permanen menonaktifkan kunci (`is_active = false`) saat `failure_count > 5`.
   - Kegagalan transien (HTTP 429 rate limit atau transient auth issue) menyebabkan kapasitas pool berkurang perlahan hingga 0, memicu pemadaman total (*complete outage*) pada pipeline riset dan studio gambar sampai admin melakukan toggle manual di DB.
2. **False Tripping dari Akumulasi Kegagalan**:
   - Panggilan sukses tidak pernah mereset `failure_count`. Kunci yang mengalami kegagalan acak 1x per hari akan tetap mati setelah 6 hari berturut-turut meskipun menjalankan ribuan panggilan sukses di antaranya.
3. **Implicit Tripped State**:
   - Tidak ada pembedaan antara kunci yang sengaja dinonaktifkan manual oleh admin vs kunci yang sedang dalam masa pendinginan sirkuit (*circuit breaker tripped*).

## Key Files Created / Modified
- [src/lib/circuit-breaker/types.ts](file:///C:/Works/github.com/alamaby/asharu-digital-hub/src/lib/circuit-breaker/types.ts):
  - Tipe FSM `CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN'`, konstanta threshold (5) dan cooldown (15 menit), serta resolver `resolveCircuitState()`.
- [src/lib/circuit-breaker/manager.ts](file:///C:/Works/github.com/alamaby/asharu-digital-hub/src/lib/circuit-breaker/manager.ts):
  - `attemptHalfOpenProbeReactivation()`: Mereaktivasi kunci cooldown yang siap masuk fase `HALF_OPEN` untuk pengujian mandiri tanpa menyentuh kunci yang dinonaktifkan manual oleh admin (`failure_count < 5`).
  - `recordCircuitSuccess()`: Mereset counter saat eksekusi berhasil untuk menutup sirkuit ke `CLOSED`.
- [src/lib/supabase/counters.ts](file:///C:/Works/github.com/alamaby/asharu-digital-hub/src/lib/supabase/counters.ts):
  - `resetFailureCounter()`: Reset `failure_count = 0` secara langsung via Supabase service client.
- [src/lib/supabase/vault.ts](file:///C:/Works/github.com/alamaby/asharu-digital-hub/src/lib/supabase/vault.ts):
  - Mengintegrasikan probe reactivation pada `fetchOrderedKeys` dan `fetchOrderedModels`.
- [src/lib/llm/key-pool.ts](file:///C:/Works/github.com/alamaby/asharu-digital-hub/src/lib/llm/key-pool.ts) & [src/lib/image/key-pool.ts](file:///C:/Works/github.com/alamaby/asharu-digital-hub/src/lib/image/key-pool.ts):
  - Memanggil `recordCircuitSuccess` pada panggilan berhasil untuk pemulihan mandiri.
- [src/components/admin/llm/KeyBoard.tsx](file:///C:/Works/github.com/alamaby/asharu-digital-hub/src/components/admin/llm/KeyBoard.tsx) & [src/components/admin/visual/ImageBoards.tsx](file:///C:/Works/github.com/alamaby/asharu-digital-hub/src/components/admin/visual/ImageBoards.tsx):
  - Menampilkan badge visual sirkuit ("Sirkuit Normal", "Uji Coba (Half-Open)", "Terputus (Cooldown)").
- [src/lib/circuit-breaker/circuit.test.ts](file:///C:/Works/github.com/alamaby/asharu-digital-hub/src/lib/circuit-breaker/circuit.test.ts):
  - 7 unit test: pengujian transisi status sirkuit, seleksi kandidat probe half-open, dan reset saat sukses.

## Technical & Business Decisions
- **Non-Destructive Zero-DDL**: Tidak memerlukan perubahan skema tabel atau live migration di Postgres.
- **Priority Isolation**: Kunci yang direaktivasi ke `HALF_OPEN` tetap memiliki `failure_count >= 5`, sehingga otomatis ditempatkan di urutan terbawah oleh query sorting. Kunci sehat tidak pernah terganggu oleh probe trial.

## Verification
- `npm run typecheck` — 0 errors.
- `npm run lint` — 0 warnings/errors.
- `npm test` — 142 test files passed, 1405 tests passed.

## Proposed Conventional Commit
`feat(circuit-breaker): implement explicit circuit state machine and auto-cooldown probe for key pools`
