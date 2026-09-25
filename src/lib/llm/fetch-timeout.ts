/**
 * Timeout per panggilan LLM.
 *
 * Kasus 2d2a5b31: router naraya menggantung 138–300 detik (empty response /
 * 520) sehingga SATU panggilan menghabiskan seluruh budget tick worker
 * (`maxDuration` 300s di /api/image/generate). Invocation dibunuh Vercel di
 * tengah proses — baris antrean tetap `pending` dengan attempts bertambah
 * tanpa hasil, dan akhirnya macet permanen.
 *
 * Dengan abort di sini, provider lambat gagal cepat → waterfall lanjut ke
 * provider berikutnya (mis. cloudflare 3–20s) dan tick tetap selesai.
 */
export const LLM_CALL_TIMEOUT_MS = 90_000;

/**
 * `fetch` dengan AbortController + pesan error yang menyebut timeout
 * (bukan "This operation was aborted") agar log mudah dibaca.
 */
export async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number = LLM_CALL_TIMEOUT_MS
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (e) {
    if (controller.signal.aborted) {
      throw new Error(`LLM request timeout setelah ${Math.round(timeoutMs / 1000)}s (dibatalkan)`);
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}
