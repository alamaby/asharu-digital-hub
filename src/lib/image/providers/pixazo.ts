import { ImageHttpError } from '../types';
import type { GenerateImageInput, ImageGenerationResult } from '../types';
import {
  isHttpsUrl,
  readBodyRequestId,
  readHeaderRequestId,
  requireHttpsBaseUrl,
  type ImageGenerationProvider
} from './base';

// Pixazo image generation — Flux 1 Schnell.
// Endpoint: POST https://gateway.pixazo.ai/flux-1-schnell/v1/getData
// Auth: header Ocp-Apim-Subscription-Key. Response: { output: "https://..." }.
// Di-port dari albot src/server/providers/image/pixazo.adapter.ts (responseKind flux).

export interface PixazoConfig {
  baseUrl: string;
  model: string;
  timeoutMs?: number;
}

const ASPECT_SIZE: Record<string, { width: number; height: number }> = {
  '1:1': { width: 1024, height: 1024 },
  '16:9': { width: 1344, height: 768 },
  '9:16': { width: 768, height: 1344 },
  '4:3': { width: 1152, height: 896 },
  '3:4': { width: 896, height: 1152 }
};

export class PixazoImageAdapter implements ImageGenerationProvider {
  readonly slug = 'pixazo' as const;
  private readonly baseUrl: string;
  private readonly model: string;
  private readonly timeoutMs: number;

  constructor(
    config: PixazoConfig,
    private readonly apiKey: string
  ) {
    this.baseUrl = requireHttpsBaseUrl(config.baseUrl, 'pixazo');
    this.model = config.model;
    this.timeoutMs = config.timeoutMs ?? 120000;
  }

  async generateImage(input: GenerateImageInput): Promise<ImageGenerationResult> {
    if (!input.prompt?.trim()) throw new Error('pixazo prompt must be a non-empty string');
    const body: Record<string, unknown> = { prompt: input.prompt };
    if (input.negativePrompt?.trim()) body['negative_prompt'] = input.negativePrompt.trim();
    const size = (input.aspectRatio && ASPECT_SIZE[input.aspectRatio]) ?? {
      width: 1024,
      height: 1024
    };
    body['width'] = size.width;
    body['height'] = size.height;
    body['num_steps'] = (input.parameters?.['num_steps'] as number) ?? 4;
    if (typeof input.parameters?.['seed'] === 'number') body['seed'] = input.parameters['seed'];
    if (typeof input.seed === 'number') body['seed'] = input.seed;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await fetch(this.baseUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache',
          'Ocp-Apim-Subscription-Key': this.apiKey
        },
        body: JSON.stringify(body),
        signal: controller.signal
      });
      if (!res.ok) {
        throw new ImageHttpError(res.status, `pixazo provider returned ${res.status}`);
      }
      const json = (await res.json()) as Record<string, unknown>;
      const output = json['output'] as string | undefined;
      if (!output || typeof output !== 'string' || !isHttpsUrl(output)) {
        throw new Error('pixazo flux response missing valid https output URL');
      }
      return {
        status: 'completed',
        imageUrl: output,
        mimeType: 'image/png',
        width: size.width,
        height: size.height,
        providerRequestId: readBodyRequestId(json, readHeaderRequestId(res)),
        metadata: { model: this.model }
      };
    } catch (e) {
      if (e instanceof ImageHttpError || e instanceof Error) {
        if ((e as { name?: string }).name === 'AbortError') {
          throw new ImageHttpError(504, 'pixazo request timed out');
        }
        throw e;
      }
      throw new ImageHttpError(500, `pixazo network error: ${String(e)}`);
    } finally {
      clearTimeout(timeout);
    }
  }
}
