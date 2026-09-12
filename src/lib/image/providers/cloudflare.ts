import {
  IMG2IMG_ASPECT_DIMS,
  ImageHttpError,
  clampImg2ImgDimension,
  clampImg2ImgSteps,
  clampImg2ImgStrength,
  isImg2ImgModel,
  stripDataUrlPrefix
} from '../types';
import type { GenerateImageInput, ImageGenerationResult } from '../types';
import {
  base64ToBytes,
  readHeaderRequestId,
  requireHttpsBaseUrl,
  type ImageGenerationProvider
} from './base';

// Cloudflare Workers AI — FLUX.1 Schnell (text-to-image) + SD img2img fase 1.
// REST: POST {base}/accounts/{account_id}/ai/run/{model}
// Auth: Bearer CF API token. account_id dari kolom config provider (identifier, bukan secret).
// Flux response: { result: { image: "<base64 jpeg>" } }.
// SD img2img request: { prompt, negative_prompt?, image_b64, strength 0-1,
//   num_steps 1-20, guidance, width/height, seed? } — respons JSON berisi
//   base64 (seperti Flux) ATAU biner langsung (ReadableStream binding);
//   adapter toleran keduanya (lihat R1 plan img2img).
// Docs img2img: https://developers.cloudflare.com/workers-ai/models/stable-diffusion-v1-5-img2img/
// Docs SDXL-Lightning: https://developers.cloudflare.com/workers-ai/models/stable-diffusion-xl-lightning/

export interface CloudflareImageConfig {
  baseUrl: string;
  model: string;
  accountId: string;
  timeoutMs?: number;
}

function clampGuidance(value: unknown): number {
  const n = typeof value === 'number' && Number.isFinite(value) ? value : 7.5;
  return Math.min(30, Math.max(0, n));
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

  private buildUrl(): string {
    // Model id mengandung slash (@cf/...) — bagian dari path, jangan di-encode.
    return (
      `${this.baseUrl.replace('{account_id}', encodeURIComponent(this.accountId)).replace(/\/$/, '')}` +
      `/run/${this.model}`
    );
  }

  async generateImage(input: GenerateImageInput): Promise<ImageGenerationResult> {
    if (!input.prompt?.trim()) throw new Error('cloudflare prompt must be a non-empty string');
    if (input.prompt.length > 2048) throw new Error('cloudflare prompt max 2048 chars');
    const refB64 = stripDataUrlPrefix(input.referenceImageB64 ?? '');
    if (refB64) return this.generateImg2Img(input, refB64);

    const url = this.buildUrl();
    // Flux: steps 1–8 (perilaku lama dipertahankan). SD tanpa referensi:
    // text-to-image dengan num_steps 1–20.
    const steps = isImg2ImgModel(this.model)
      ? clampImg2ImgSteps(input.numSteps ?? input.parameters?.['num_steps'] ?? input.parameters?.['steps'])
      : Math.min(8, Math.max(1, (input.parameters?.['steps'] as number) ?? 4));
    const body: Record<string, unknown> = { prompt: input.prompt, steps };
    if (input.negativePrompt?.trim()) body['negative_prompt'] = input.negativePrompt.trim();
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
      return await this.parseResult(res, { model: this.model, steps });
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

  /**
   * Generate img2img: prompt + referensi (base64) + strength.
   * Hanya untuk model SD img2img — Flux menolak `image_b64` (tolak cepat
   * sebelum request agar tidak boros key/kuota).
   */
  private async generateImg2Img(input: GenerateImageInput, refB64: string): Promise<ImageGenerationResult> {
    if (!isImg2ImgModel(this.model)) {
      throw new Error(`model ${this.model} tidak mendukung image reference (pilih model SD img2img)`);
    }
    const url = this.buildUrl();
    const strength = clampImg2ImgStrength(input.strength ?? input.parameters?.['strength']);
    const numSteps = clampImg2ImgSteps(input.numSteps ?? input.parameters?.['num_steps'] ?? input.parameters?.['steps']);
    const dims = (input.aspectRatio && IMG2IMG_ASPECT_DIMS[input.aspectRatio]) ?? IMG2IMG_ASPECT_DIMS['1:1'];
    const width = clampImg2ImgDimension(input.width ?? input.parameters?.['width'], dims.width);
    const height = clampImg2ImgDimension(input.height ?? input.parameters?.['height'], dims.height);
    const guidance = clampGuidance(input.parameters?.['guidance']);
    const body: Record<string, unknown> = {
      prompt: input.prompt,
      image_b64: refB64,
      strength,
      num_steps: numSteps,
      guidance,
      width,
      height
    };
    if (input.negativePrompt?.trim()) body['negative_prompt'] = input.negativePrompt.trim();
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
      return await this.parseResult(res, { model: this.model, steps: numSteps, strength, width, height });
    } catch (e) {
      if (e instanceof ImageHttpError) throw e;
      if ((e as { name?: string })?.name === 'AbortError') {
        throw new ImageHttpError(504, 'cloudflare image request timed out');
      }
      if (e instanceof Error && /valid base64|image reference|non-empty/.test(e.message)) throw e;
      throw new ImageHttpError(500, `cloudflare image network error: ${String(e)}`);
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * Parse respons ganda: JSON `{ result: { image } }` (Flux + SD REST)
   * atau biner langsung `image/*` (ReadableStream binding, R1).
   */
  private async parseResult(res: Response, metadata: Record<string, unknown>): Promise<ImageGenerationResult> {
    const contentType = res.headers.get('content-type') ?? '';
    if (contentType.includes('image/')) {
      const buf = new Uint8Array(await res.arrayBuffer());
      if (buf.length === 0) throw new Error('cloudflare image response empty body');
      return {
        status: 'completed',
        imageBytes: buf,
        mimeType: contentType.split(';')[0]!.trim() || 'image/png',
        providerRequestId: readHeaderRequestId(res),
        metadata
      };
    }
    const json = (await res.json().catch(async () => null)) as { result?: { image?: string } } | null;
    const b64 = json?.result?.image;
    if (typeof b64 === 'string' && b64.length > 0) {
      return {
        status: 'completed',
        imageBytes: base64ToBytes(b64),
        mimeType: 'image/jpeg',
        providerRequestId: readHeaderRequestId(res),
        metadata
      };
    }
    // Fallback: body biner tanpa content-type image/* (defensif, R1).
    const buf = new Uint8Array(await res.arrayBuffer().catch(() => new ArrayBuffer(0)));
    if (buf.length > 0) {
      return {
        status: 'completed',
        imageBytes: buf,
        mimeType: 'image/png',
        providerRequestId: readHeaderRequestId(res),
        metadata
      };
    }
    throw new Error('cloudflare image response missing result.image base64');
  }
}
