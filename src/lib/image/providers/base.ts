import type {
  GenerateImageInput,
  ImageGenerationResult
} from '../types';

/** Kontrak adapter image — port pola albot ImageGenerationProvider. */
export interface ImageGenerationProvider {
  readonly slug: string;
  generateImage(input: GenerateImageInput): Promise<ImageGenerationResult>;
}

export function isHttpsUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

export function requireHttpsBaseUrl(baseUrl: string, provider: string): string {
  if (!/^https:\/\//i.test(baseUrl)) {
    throw new Error(`${provider} provider base url must use https`);
  }
  return baseUrl.replace(/\/+$/, '');
}

/** Baca request id provider dari body (request_id/id/requestId) atau header. */
export function readBodyRequestId(
  json: Record<string, unknown>,
  headerId?: string
): string | undefined {
  const bodyId =
    (json['request_id'] as string | undefined) ??
    (json['id'] as string | undefined) ??
    (json['requestId'] as string | undefined);
  return bodyId ?? headerId;
}

export function readHeaderRequestId(res: Response): string | undefined {
  return (
    res.headers.get('x-request-id') ??
    res.headers.get('x-requestid') ??
    undefined
  );
}

/** Decode base64 → bytes (Node + edge-safe). */
export function base64ToBytes(b64: string): Uint8Array {
  const norm = b64.replace(/\s/g, '');
  if (!/^[A-Za-z0-9+/=_-]+$/.test(norm) || norm.length % 4 !== 0) {
    throw new Error('b64 payload is not valid base64');
  }
  if (typeof Buffer !== 'undefined') {
    const buf = Buffer.from(norm, 'base64');
    return new Uint8Array(buf);
  }
  const bin = atob(norm);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export type { GenerateImageInput, ImageGenerationResult };
