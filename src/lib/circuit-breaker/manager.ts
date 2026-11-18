import { getServiceClient } from '@/lib/supabase/service';
import type { CounterTable } from '@/lib/supabase/counters';
import { resetFailureCounter } from '@/lib/supabase/counters';
import { CIRCUIT_COOLDOWN_MS, CIRCUIT_FAILURE_THRESHOLD } from './types';

/**
 * Memeriksa dan mereaktivasi kunci/model penyedia yang masa pendinginannya (cooldown) telah habis
 * ke status HALF_OPEN (`is_active = true`), sehingga dapat diuji coba secara mandiri oleh pool.
 *
 * Alasan Bisnis:
 * Mengizinkan 'self-healing' otomatis ketika kuota per-menit atau gangguan sementara upstream berakhir,
 * tanpa memerlukan intervensi manual dari operator admin di basis data.
 * Kunci yang sengaja dinonaktifkan manual oleh admin (failure_count < threshold) tidak disentuh.
 */
export async function attemptHalfOpenProbeReactivation(
  table: CounterTable,
  providerId: string,
  cooldownMs = CIRCUIT_COOLDOWN_MS,
  threshold = CIRCUIT_FAILURE_THRESHOLD
): Promise<string[]> {
  try {
    const supabase = getServiceClient();
    const cutoffDate = new Date(Date.now() - cooldownMs).toISOString();

    const { data: candidates, error } = await supabase
      .from(table)
      .select('id, last_used_at')
      .eq('provider_id', providerId)
      .eq('is_active', false)
      .gte('failure_count', threshold);

    if (error || !candidates || candidates.length === 0) return [];

    const eligible = (candidates as { id: string; last_used_at: string | null }[])
      .filter((c) => !c.last_used_at || c.last_used_at <= cutoffDate)
      .map((c) => c.id);

    if (eligible.length === 0) return [];

    const { error: updateErr } = await supabase
      .from(table)
      .update({ is_active: true })
      .in('id', eligible);

    if (updateErr) {
      console.error(`attemptHalfOpenProbeReactivation(${table}): ${updateErr.message}`);
      return [];
    }

    return eligible;
  } catch (e) {
    console.error(`attemptHalfOpenProbeReactivation error:`, e);
    return [];
  }
}

/**
 * Mencatat keberhasilan eksekusi kunci/model.
 * Bila baris memiliki catatan kegagalan (failure_count > 0), reset ke 0 untuk menutup sirkuit kembali ke CLOSED.
 */
export async function recordCircuitSuccess(
  table: CounterTable,
  id: string,
  currentFailureCount = 0
): Promise<void> {
  if (currentFailureCount > 0) {
    await resetFailureCounter(table, id);
  }
}
