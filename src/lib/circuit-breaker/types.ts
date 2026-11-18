/**
 * FSM Status Sirkuit untuk Key dan Model Provider (LLM & Image).
 *
 * Alasan Bisnis:
 * Mencegah pemadaman total (complete outage) pada sistem riset konten dan studio gambar
 * ketika penyedia pihak ketiga mengalami rate-limit transien (HTTP 429) atau gangguan sementara.
 * Alih-alih mematikan kunci selamanya saat failure_count melewati ambang batas, sirkuit menyediakan
 * siklus pendinginan (OPEN) dan uji coba otomatis (HALF_OPEN) untuk pemulihan mandiri (self-healing).
 */
export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export const CIRCUIT_FAILURE_THRESHOLD = 5;
export const CIRCUIT_COOLDOWN_MS = 15 * 60 * 1000; // 15 menit

export interface CircuitEntity {
  is_active: boolean;
  failure_count: number;
  last_used_at: string | null;
}

/**
 * Menghitung status FSM sirkuit saat ini.
 *
 * Transisi:
 * - CLOSED: Kunci aktif dan failure_count < threshold.
 * - OPEN: failure_count >= threshold dan masa pendinginan (< 15 menit) masih berjalan.
 * - HALF_OPEN: failure_count >= threshold dan masa pendinginan (>= 15 menit) telah berakhir,
 *              siap menerima 1 permintaan uji coba (probe).
 */
export function resolveCircuitState(
  entity: CircuitEntity,
  nowMs = Date.now(),
  cooldownMs = CIRCUIT_COOLDOWN_MS,
  threshold = CIRCUIT_FAILURE_THRESHOLD
): CircuitState {
  if (entity.failure_count < threshold) {
    return 'CLOSED';
  }

  // Jika failure_count >= threshold:
  // Kunci tanpa riwayat last_used_at langsung siap dilakukan uji coba (HALF_OPEN)
  if (!entity.last_used_at) {
    return 'HALF_OPEN';
  }

  const lastUsedMs = new Date(entity.last_used_at).getTime();
  const elapsed = nowMs - lastUsedMs;

  if (elapsed >= cooldownMs) {
    return 'HALF_OPEN';
  }

  return 'OPEN';
}
