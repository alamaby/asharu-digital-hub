import { ImageHttpError } from '../types';
import type { GenerateImageInput, ImageGenerationResult } from '../types';
import {
  base64ToBytes,
  readHeaderRequestId,
  requireHttpsBaseUrl,
  type ImageGenerationProvider
} from './base';

// Gemini Nano Banana 2 Lite — gemini-3.1-flash-lite-image via generateContent.
// POST {base}/models/{model}:generateContent, header x-goog-api-key (tiru providers/gemini.ts).
// Body: { contents: [{ parts: [{ text: prompt }] }],
//         generationConfig: { responseModalities: ["TEXT","IMAGE"] } }
// Response: candidates[0].content.parts[] → cari inlineData { mimeType, data (base64) }.
// Semua image output membawa watermark SynthID.
// Docs: https://ai.google.dev/gemini-api/docs/image-generation

export interface GeminiImageConfig {
  baseUrl: string;
  model: string;
  timeoutMs?: number;
}

interface GeminiPart {
  text?: string;
  inlineData?: { mimeType?: string; data?: string };
}

export class GeminiImageAdapter implements ImageGenerationProvider {
  readonly slug = 'gemini' as const;
  private readonly baseUrl: string;
  private readonly model: string;
  private readonly timeoutMs: number;

  constructor(
    config: GeminiImageConfig,
    private readonly apiKey: string
  ) {
    this.baseUrl = requireHttpsBaseUrl(config.baseUrl, 'gemini');
    if (!config.model?.trim()) throw new Error('gemini image provider model must be a non-empty string');
    if (!apiKey?.trim()) throw new Error('gemini image provider apiKey must be a non-empty string');
    this.model = config.model.trim().replace(/^gemini\//, '');
    this.timeoutMs = config.timeoutMs ?? 60000;
  }

  async generateImage(input: GenerateImageInput): Promise<ImageGenerationResult> {
    if (!input.prompt?.trim()) throw new Error('gemini prompt must be a non-empty string');
    const url = `${this.baseUrl}/models/${this.model}:generateContent`;
    const body = {
      contents: [{ parts: [{ text: input.prompt }] }],
      generationConfig: { responseModalities: ['TEXT', 'IMAGE'] }
    };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': this.apiKey },
        body: JSON.stringify(body),
        signal: controller.signal
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new ImageHttpError(res.status, `gemini image ${res.status}: ${text.slice(0, 200)}`);
      }
      const json = (await res.json()) as {
        candidates?: { content?: { parts?: GeminiPart[] } }[];
      };
      const parts = json.candidates?.[0]?.content?.parts ?? [];
      const imagePart = parts.find((p) => typeof p.inlineData?.data === 'string');
      if (!imagePart?.inlineData?.data) {
        throw new Error('gemini image response missing inlineData image part');
      }
      return {
        status: 'completed',
        imageBytes: base64ToBytes(imagePart.inlineData.data),
        mimeType: imagePart.inlineData.mimeType ?? 'image/png',
        providerRequestId: readHeaderRequestId(res),
        metadata: { model: this.model }
      };
    } catch (e) {
      if (e instanceof ImageHttpError) throw e;
      if ((e as { name?: string })?.name === 'AbortError') {
        throw new ImageHttpError(504, 'gemini image request timed out');
      }
      if (e instanceof Error && /valid base64|missing|non-empty/.test(e.message)) throw e;
      throw new ImageHttpError(500, `gemini image network error: ${String(e)}`);
    } finally {
      clearTimeout(timeout);
    }
  }
}
