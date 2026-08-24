const ALLOWED_PROTOCOLS = new Set(['https:', 'mailto:', 'tel:']);

export function isSafeExternalUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return ALLOWED_PROTOCOLS.has(url.protocol);
  } catch {
    return false;
  }
}

export function assertSafeExternalUrl(value: string, context = 'external URL'): string {
  if (!isSafeExternalUrl(value)) {
    throw new Error(
      `Unsafe ${context}: "${value}". Only https, mailto and tel URLs are allowed.`
    );
  }
  return value;
}
