import { getServiceClient } from './service';

/**
 * Pembaruan counter pool key/model — SATU round-trip ke RPC atomik.
 *
 * Pengganti pola SELECT lalu UPDATE yang kehilangan kenaikan saat dua proses
 * paralel (worker image + cron riset) membaca nilai yang sama. Lihat migrasi
 * `20261007000003_atomic_counters.sql`.
 */
export type CounterTable =
  | 'llm_provider_keys'
  | 'llm_models'
  | 'image_provider_keys'
  | 'image_models';

export const DEFAULT_FAILURE_THRESHOLD = 5;

/** Naikkan `usage_count` + `last_used_at`. Melempar bila RPC gagal. */
export async function incrementUsageCounter(table: CounterTable, id: string): Promise<void> {
  const supabase = getServiceClient();
  const { error } = await supabase.rpc('increment_usage_counter', {
    p_table: table,
    p_id: id
  });
  if (error) throw new Error(`incrementUsageCounter(${table}): ${error.message}`);
}

/**
 * Naikkan `failure_count`; RPC menonaktifkan baris (`is_active = false`) saat
 * hasilnya melewati `threshold`. Mengembalikan nilai baru agar pemanggil bisa
 * melaporkan kejadian penonaktifan.
 */
export async function incrementFailureCounter(
  table: CounterTable,
  id: string,
  threshold = DEFAULT_FAILURE_THRESHOLD
): Promise<number> {
  const supabase = getServiceClient();
  const { data, error } = await supabase.rpc('increment_failure_counter', {
    p_table: table,
    p_id: id,
    p_threshold: threshold
  });
  if (error) throw new Error(`incrementFailureCounter(${table}): ${error.message}`);
  if (typeof data !== 'number') {
    console.error(`incrementFailureCounter(${table}): RPC tidak mengembalikan angka (${String(data)})`);
    return 0;
  }
  return data;
}
