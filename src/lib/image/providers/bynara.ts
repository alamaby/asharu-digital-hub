import { ImageHttpError } from '../types';
import type { GenerateImageInput, ImageGenerationResult } from '../types';
import {
  base64ToBytes,
  isHttpsUrl,
  readBodyRequestId,
  readHeaderRequestId,
  requireHttpsBaseUrl,
  type ImageGenerationProvider
} from './base';

// Bynara image — endpoint OpenAI-compatible.
// POST {base}/images/generations, Bearer + HTTP-Referer/X-Title.
// Body: { prompt (+" Avoid: "+negative), model, n:1, size, response_format:"b64_json", seed? }
// → { created, data: [{ b64_json | url (relatif /v1/images/<id>/download), revised_prompt? }] }.
// Di-port dari albot src/server/providers/image/bynara.adapter.ts.

export interface BynaraImageConfig {
  baseUrl: string;
  model: string;
  timeoutMs?: number;
}

const ASPECT_SIZE: Record<string, string> = {
  '1:1': '1024x1024',
  '16:9': '1792x1024',
  '9:16': '1024x1792',
  '4:3': '1152x896',
  '3:4': '896x1152'
};

export class BynaraImageAdapter implements ImageGenerationProvider {
  readonly slug = 'bynara' as const;
  private readonly baseUrl: string;
  private readonly model: string;
  private readonly timeoutMs: number;

  constructor(
    config: BynaraImageConfig,
    private readonly apiKey: string
  ) {
    this.baseUrl = requireHttpsBaseUrl(config.baseUrl, 'bynara');
    if (!config.model?.trim()) throw new Error('bynara provider model must be a non-empty string');
    if (!apiKey?.trim()) throw new Error('bynara provider apiKey must be a non-empty string');
    this.model = config.model.trim();
    this.timeoutMs = config.timeoutMs ?? 40000;
  }

  async generateImage(input: GenerateImageInput): Promise<ImageGenerationResult> {
    if (!input.prompt?.trim()) throw new Error('bynara prompt must be a non-empty string');
    let prompt = input.prompt;
    if (input.negativePrompt?.trim()) prompt = `${prompt} Avoid: ${input.negativePrompt.trim()}`;
    const body: Record<string, unknown> = {
      prompt,
      model: this.model,
      n: 1,
      size: (input.aspectRatio && ASPECT_SIZE[input.aspectRatio]) ?? '1024x1024',
      response_format: 'b64_json'
    };
    const seed = input.seed ?? (input.parameters?.['seed'] as number | undefined);
    if (seed !== undefined) {
      if (!Number.isInteger(seed)) throw new Error('bynara seed must be an integer');
      body['seed'] = seed;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await fetch(`${this.baseUrl}/images/generations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.apiKey}` },
        body: JSON.stringify(body),
        signal: controller.signal
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new ImageHttpError(res.status, `bynara provider returned ${res.status}: ${text.slice(0, 200)}`);
      }
      const json = (await res.json()) as Record<string, unknown>;
      const data = json['data'] as Array<Record<string, unknown>> | undefined;
      const first = Array.isArray(data) ? data[0] : undefined;
      if (!first) throw new Error('bynara response missing data array');
      const b64 = first['b64_json'] as string | undefined;
      if (typeof b64 === 'string' && b64.length > 0) {
        return {
          status: 'completed',
          imageBytes: base64ToBytes(b64),
          mimeType: 'image/png',
          providerRequestId: readBodyRequestId(json, readHeaderRequestId(res)),
          metadata: {
            model: this.model,
            ...(typeof first['revised_prompt'] === 'string' ? { revisedPrompt: first['revised_prompt'] } : {})
          }
        };
      }
      const url = first['url'] as string | undefined;
      if (typeof url === 'string' && url.length > 0) {
        const candidate = url.startsWith('/') ? `${this.baseUrl}${url}` : url;
        if (isHttpsUrl(candidate)) {
          return {
            status: 'completed',
            imageUrl: candidate,
            mimeType: 'image/png',
            providerRequestId: readBodyRequestId(json, readHeaderRequestId(res)),
            metadata: { model: this.model }
          };
        }
      }
      throw new Error('bynara response missing valid https url or b64_json in data[0]');
    } catch (e) {
      if (e instanceof ImageHttpError) throw e;
      if ((e as { name?: string })?.name === 'AbortError') {
        throw new ImageHttpError(504, 'bynara request timed out');
      }
      if (e instanceof Error && /valid base64|missing|non-empty|integer/.test(e.message)) throw e;
      throw new ImageHttpError(500, `bynara network error: ${String(e)}`);
    } finally {
      clearTimeout(timeout);
    }
  }
}
