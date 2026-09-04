/**
 * URL helpers for user-pasted links (topic/keywords/purpose).
 * - extractUrls: pull http(s) URLs out of free text.
 * - isAllowedFetchUrl: SSRF guard — only http/https, rejects localhost,
 *   private/link-local/reserved IPs and non-default-risky ports.
 */

const URL_PATTERN = /https?:\/\/[^\s"'<>]+/gi;

export function extractUrls(text: string): string[] {
  if (!text) return [];
  const found = text.match(URL_PATTERN) ?? [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (let u of found) {
    // Trim trailing punctuation that is rarely part of the URL.
    u = u.replace(/[.,;:!?)\]}>]+$/, '');
    try {
      const parsed = new URL(u);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') continue;
      if (!isAllowedFetchUrl(u)) continue;
      const normalized = parsed.toString();
      if (!seen.has(normalized)) {
        seen.add(normalized);
        out.push(normalized);
      }
    } catch {
      // Ignore malformed URLs.
    }
  }
  return out;
}

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  let n = 0;
  for (const p of parts) {
    if (!/^\d+$/.test(p)) return null;
    const v = Number(p);
    if (v < 0 || v > 255) return null;
    n = n * 256 + v;
  }
  return n >>> 0;
}

function isPrivateIp(host: string): boolean {
  const lower = host.toLowerCase();
  if (lower === 'localhost') return true;
  if (lower.endsWith('.localhost')) return true;
  const ip = ipv4ToInt(lower);
  if (ip === null) return false; // public hostname (DNS) — allowed at this layer
  const inRange = (base: string, bits: number): boolean => {
    const b = ipv4ToInt(base);
    if (b === null) return false;
    const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
    return (ip & mask) === (b & mask);
  };
  return (
    inRange('10.0.0.0', 8) ||
    inRange('172.16.0.0', 12) ||
    inRange('192.168.0.0', 16) ||
    inRange('127.0.0.0', 8) ||
    inRange('169.254.0.0', 16) ||
    inRange('0.0.0.0', 8) ||
    inRange('100.64.0.0', 10) ||
    inRange('192.0.2.0', 24) ||
    inRange('198.51.100.0', 24) ||
    inRange('203.0.113.0', 24) ||
    inRange('224.0.0.0', 4)
  );
}

export function isAllowedFetchUrl(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
  if (parsed.username || parsed.password) return false;
  if (isPrivateIp(parsed.hostname)) return false;
  return true;
}
