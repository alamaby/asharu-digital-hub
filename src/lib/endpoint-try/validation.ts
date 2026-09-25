import { z } from 'zod';

/** Range OK untuk OpenAI-compatible; Anthropic kadang lebih luas tapi cukup aman di proxy. */
const MAX_BODY = 4000 as const;

export const endpointKindSchema = z.enum(['openai', 'anthropic']);

export const baseUrlSchema = z
  .string()
  .trim()
  .url('Base URL harus URL valid.')
  .max(500, 'Base URL maksimal 500 karakter.')
  .transform((s) => s.replace(/\/+$/, ''))
  .refine(
    (s) => {
      if (process.env.NODE_ENV === 'production') {
        return s.startsWith('https://');
      }
      return true;
    },
    { message: 'Hanya https:// yang diizinkan pada mode produksi.' }
  );

export const apiKeySchema = z
  .string()
  .min(8, 'API key terlalu pendek (min. 8 karakter).')
  .max(500, 'API key maksimal 500 karakter.');

export const modelsRequestSchema = z.object({
  kind: endpointKindSchema,
  baseUrl: baseUrlSchema,
  apiKey: apiKeySchema
});

export const chatRequestSchema = z.object({
  kind: endpointKindSchema,
  baseUrl: baseUrlSchema,
  apiKey: apiKeySchema,
  model: z
    .string()
    .trim()
    .min(1, 'Model wajib diisi.')
    .max(200, 'Model maksimal 200 karakter.'),
  system: z
    .string()
    .trim()
    .max(2000, 'System prompt maksimal 2000 karakter.')
    .nullable()
    .default(null),
  user: z
    .string()
    .trim()
    .min(10, 'Prompt minimal 10 karakter.')
    .max(4000, 'Prompt maksimal 4000 karakter.'),
  temperature: z
    .number({ invalid_type_error: 'Temperature harus angka 0–2.' })
    .min(0, 'Temperature minimal 0.')
    .max(2, 'Temperature maksimal 2.')
    .nullable()
    .default(null),
  maxTokens: z
    .number({ invalid_type_error: 'Max tokens harus angka.' })
    .int('Max tokens harus bilangan bulat.')
    .min(1, 'Max tokens minimal 1.')
    .max(MAX_BODY, `Max tokens maksimal ${MAX_BODY}.`)
    .nullable()
    .default(null),
  stream: z.boolean().default(false)
});

export type ModelsRequest = z.infer<typeof modelsRequestSchema>;
export type ChatRequest = z.infer<typeof chatRequestSchema>;

/** CEGAH hostname sensitif (tanpa DNS resolve — keterbatasan sengaja). */
export function isBlockedHostname(hostname: string): boolean {
  const h = hostname.toLowerCase();
  if (h === 'localhost' || h === '0.0.0.0' || h === '::1') return true;
  if (
    h.endsWith('.localhost') ||
    h.endsWith('.local') ||
    h.endsWith('.internal')
  )
    return true;
  // Blok literal IPv4 pada rentang privat/link-local.
  const parts = h.split('.');
  if (parts.length !== 4) return false;
  const nums = parts.map((p) => Number(p));
  if (nums.some(isNaN)) return false;
  // 127/8
  if (nums[0] === 127) return true;
  // 10/8
  if (nums[0] === 10) return true;
  // 172.16–31/12
  const n0 = nums[0];
  const n1 = nums[1];
  if (n0 === 172 && n1 != null && n1 >= 16 && n1 <= 31) return true;
  // 192.168/16
  if (n0 === 192 && n1 === 168) return true;
  // 169.254/16 (link-local)
  if (nums[0] === 169 && nums[1] === 254) return true;
  return false;
}

/** Validasi kuat baseUrl: bentuk + protokol + tidak mengarah ke host lokal. */
export function assertAllowedBaseUrl(baseUrl: string): {
  origin: string;
  base: string;
} {
  // Strip trailing slash(es) before parsing so we match the normalization
  // behaviour of baseUrlSchema.transform().
  const cleaned = baseUrl.replace(/\/+$/, '');
  let url: URL;
  try {
    url = new URL(cleaned);
  } catch {
    throw new Error('Base URL tidak valid.');
  }
  if (url.username || url.password) {
    throw new Error('Base URL tidak boleh mengandung userinfo (user:pass@).');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('Hanya http dan https yang diizinkan.');
  }
  if (isBlockedHostname(url.hostname)) {
    throw new Error(
      `Base URL tidak diizinkan mengarah ke host lokal (ditolak: ${url.hostname}).`
    );
  }
  return {
    origin: `${url.protocol}//${url.hostname}${url.port ? `:${url.port}` : ''}`,
    base: cleaned
  };
}

/** Gabung base URL (prefix path dipertahankan) dengan suffix endpoint.
 * Contoh: base `https://api.blazeapi.org/paid/v1` + `/chat/completions`
 * → `https://api.blazeapi.org/paid/v1/chat/completions`.
 * Bila base sudah diakhiri suffix yang sama, tidak digandakan. */
export function joinUpstreamPath(base: string, suffix: string): string {
  const withoutQuery = base.split(/[?#]/, 1)[0] ?? base;
  const b = withoutQuery.replace(/\/+$/, '');
  if (b.toLowerCase().endsWith(suffix.toLowerCase())) return b;
  return `${b}${suffix}`;
}

/** Redaksi substring sensitif dari pesan error agar tidak bocor ke respon/client. */
export function sanitizeErrorMessage(
  msg: string,
  secrets: string[]
): string {
  let out = msg;
  for (const s of secrets) {
    if (!s) continue;
    out = out.split(s).join('[REDACTED]');
  }
  return out.slice(0, 300);
}
