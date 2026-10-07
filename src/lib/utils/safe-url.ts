const ALLOWED_PROTOCOLS = new Set(['https:', 'mailto:', 'tel:']);

export function isSafeExternalUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return ALLOWED_PROTOCOLS.has(url.protocol);
  } catch {
    return false;
  }
}

/**
 * Batasi target redirect ke path internal (origin yang sama).
 *
 * Pola berbahaya yang ditolak:
 * - absolut: `https://evil.com`
 * - protocol-relative: `//evil.com`
 * - trik backslash: `/\evil.com` (browser memperlakukannya sebagai `//evil.com`)
 * - karakter kontrol/whitespace yang bisa membingungkan parser URL
 *
 * Dipakai untuk parameter `next` (post-login/OAuth) — tanpa ini, endpoint
 * redirect menjadi open redirect untuk phishing.
 */
export function safeInternalPath(value: string | null | undefined, fallback: string): string {
  if (!value) return fallback;
  const candidate = value.trim();
  if (!candidate.startsWith('/')) return fallback;
  if (candidate.startsWith('//') || candidate.startsWith('/\\')) return fallback;
  if (/[\s\u0000-\u001f]/.test(candidate)) return fallback;
  return candidate;
}

export function assertSafeExternalUrl(value: string, context = 'external URL'): string {
  if (!isSafeExternalUrl(value)) {
    throw new Error(
      `Unsafe ${context}: "${value}". Only https, mailto and tel URLs are allowed.`
    );
  }
  return value;
}
