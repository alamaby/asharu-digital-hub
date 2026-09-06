import { ImageHttpError } from '../types';
import type { GenerateImageInput, ImageGenerationResult } from '../types';
import {
  base64ToBytes,
  readHeaderRequestId,
  requireHttpsBaseUrl,
  type ImageGenerationProvider
} from './base';

// Cloudflare Workers AI — FLUX.1 Schnell (@cf/black-forest-labs/flux-1-schnell).
// REST: POST {base}/accounts/{account_id}/ai/run/@cf/black-forest-labs/flux-1-schnell
// Auth: Bearer CF API token. account_id dari kolom config provider (identifier, bukan secret).
// Response: { result: { image: "<base64 jpeg>" } }.
// Docs: https://developers.cloudflare.com/workers-ai/models/flux-1-schnell/

export interface CloudflareImageConfig {
  baseUrl: string;
  model: string;
  accountId: string;
  timeoutMs?: number;
}

export class CloudflareImageAdapter implements ImageGenerationProvider {
  readonly slug = 'cloudflare' as const;
  private readonly baseUrl: string;
  private readonly model: string;
  private readonly accountId: string;
  private readonly timeoutMs: number;

  constructor(
    config: CloudflareImageConfig,
    private readonly apiKey: string
  ) {
    this.baseUrl = requireHttpsBaseUrl(config.baseUrl, 'cloudflare');
    if (!config.accountId?.trim()) throw new Error('cloudflare image provider missing account_id config');
    this.model = config.model;
    this.accountId = config.accountId.trim();
    this.timeoutMs = config.timeoutMs ?? 60000;
  }

  async generateImage(input: GenerateImageInput): Promise<ImageGenerationResult> {
    if (!input.prompt?.trim()) throw new Error('cloudflare prompt must be a non-empty string');
    if (input.prompt.length > 2048) throw new Error('cloudflare prompt max 2048 chars');
    // Model id mengandung slash (@cf/...) — bagian dari path, jangan di-encode.
    const url =
      `${this.baseUrl.replace('{account_id}', encodeURIComponent(this.accountId)).replace(/\/$/, '')}` +
      `/run/${this.model}`;
    const steps = Math.min(
      8,
      Math.max(1, (input.parameters?.['steps'] as number) ?? 4)
    );
    const body: Record<string, unknown> = { prompt: input.prompt, steps };
    if (typeof input.parameters?.['seed'] === 'number') body['seed'] = input.parameters['seed'];
    if (typeof input.seed === 'number') body['seed'] = input.seed;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.apiKey}` },
        body: JSON.stringify(body),
        signal: controller.signal
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new ImageHttpError(res.status, `cloudflare image ${res.status}: ${text.slice(0, 200)}`);
      }
      const json = (await res.json()) as { result?: { image?: string } };
      const b64 = json.result?.image;
      if (!b64 || typeof b64 !== 'string') {
        throw new Error('cloudflare image response missing result.image base64');
      }
      return {
        status: 'completed',
        imageBytes: base64ToBytes(b64),
        mimeType: 'image/jpeg',
        providerRequestId: readHeaderRequestId(res),
        metadata: { model: this.model, steps }
      };
    } catch (e) {
      if (e instanceof ImageHttpError) throw e;
      if ((e as { name?: string })?.name === 'AbortError') {
        throw new ImageHttpError(504, 'cloudflare image request timed out');
      }
      if (e instanceof Error && /valid base64/.test(e.message)) throw e;
      throw new ImageHttpError(500, `cloudflare image network error: ${String(e)}`);
    } finally {
      clearTimeout(timeout);
    }
  }
}
