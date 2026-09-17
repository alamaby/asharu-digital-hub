import {
  IMG2IMG_ASPECT_DIMS,
  ImageHttpError,
  clampGuidance,
  clampImg2ImgDimension,
  clampImg2ImgSteps,
  clampImg2ImgStrength,
  clampRequestDimension,
  clampTextSteps,
  isFlux2Model,
  isImg2ImgModel,
  isLeonardoModel,
  isLucidModel,
  modelDefaultParams,
  modelNegativeMode,
  stripDataUrlPrefix
} from '../types';
import type { GenerateImageInput, ImageGenerationResult } from '../types';
import {
  base64ToBytes,
  readHeaderRequestId,
  requireHttpsBaseUrl,
  type ImageGenerationProvider
} from './base';

// Cloudflare Workers AI — Flux-1 + SD img2img + FLUX.2 + Leonardo.
// REST: POST {base}/accounts/{account_id}/ai/run/{model}
// Auth: Bearer CF API token. account_id dari kolom config provider (identifier, bukan secret).
// - Flux-1: JSON { prompt, steps 1–8 } (negative dilipat "Avoid:", skema menolak properti tambahan).
// - SD img2img: JSON { prompt, negative_prompt?, image_b64, strength, num_steps 1–20,
//   guidance, width/height, seed? } — respons JSON base64 ATAU biner image/*.
// - Leonardo: Phoenix JSON native (negative_prompt + guidance 2–10 + num_steps 1–50 +
//   w/h ≤2048, output BINER image/jpeg); Lucid JSON { prompt, guidance 0–10,
//   num_steps+steps 1–40, w/h ≤2500 } TANPA negative_prompt (dilipat "Avoid:").
// - FLUX.2 (klein-4b/9b, dev): input docs opaque (`multipart{}` required, field tak
//   terekspos). Strategi: FormData primary (prompt + steps + seed + advanced
//   eksplisit + part file `image` bila referensi; JANGAN set Content-Type manual)
//   dengan fallback JSON minimal 1x KHUSUS HTTP 400 (validasi gagal = tak ada
//   gambar = tak tertagih). Override eksplisit via parameters.transport atau
//   config.transport (`multipart` = tanpa fallback, `json` = langsung JSON).
//   Single-reference dulu; multi-reference ditunda (skema DB/UI single-ref).
// Respons: { result: { image } } (Flux/SD/Lucid) ATAU { image } top-level ATAU
//   biner image/* (Phoenix/ReadableStream binding) — parseResult toleran ketiganya.
// Docs: flux-1-schnell, stable-diffusion-xl-lightning, phoenix-1.0, lucid-origin,
//   flux-2-klein-4b, flux-2-dev, flux-2-klein-9b (developers.cloudflare.com/workers-ai/models/).

export interface CloudflareImageConfig {
  baseUrl: string;
  model: string;
  accountId: string;
  timeoutMs?: number;
  /** Config per-model dari baris image_models (transport, image_field, negative_mode, defaults). */
  modelConfig?: Record<string, unknown> | null;
}

type Flux2Transport = 'auto' | 'multipart' | 'json';

export class CloudflareImageAdapter implements ImageGenerationProvider {
  readonly slug = 'cloudflare' as const;
  private readonly baseUrl: string;
  private readonly model: string;
  private readonly accountId: string;
  private readonly timeoutMs: number;
  private readonly modelConfig: Record<string, unknown> | null;

  constructor(
    config: CloudflareImageConfig,
    private readonly apiKey: string
  ) {
    this.baseUrl = requireHttpsBaseUrl(config.baseUrl, 'cloudflare');
    if (!config.accountId?.trim()) throw new Error('cloudflare image provider missing account_id config');
    this.model = config.model;
    this.accountId = config.accountId.trim();
    this.timeoutMs = config.timeoutMs ?? 60000;
    this.modelConfig = config.modelConfig ?? null;
  }

  private buildUrl(): string {
    // Model id mengandung slash (@cf/...) — bagian dari path, jangan di-encode.
    return (
      `${this.baseUrl.replace('{account_id}', encodeURIComponent(this.accountId)).replace(/\/$/, '')}` +
      `/run/${this.model}`
    );
  }

  private flux2Transport(input: GenerateImageInput): Flux2Transport {
    const raw =
      (input.parameters?.['transport'] as string | undefined) ??
      (this.modelConfig?.['transport'] as string | undefined) ??
      'auto';
    if (raw === 'json' || raw === 'multipart') return raw;
    return 'auto';
  }

  private flux2ImageField(): string {
    const raw = this.modelConfig?.['image_field'];
    return typeof raw === 'string' && raw.trim() ? raw.trim() : 'image';
  }

  private readSeed(input: GenerateImageInput): number | undefined {
    const raw = input.seed ?? input.parameters?.['seed'];
    return typeof raw === 'number' && Number.isInteger(raw) && raw >= 0 ? raw : undefined;
  }

  async generateImage(input: GenerateImageInput): Promise<ImageGenerationResult> {
    if (!input.prompt?.trim()) throw new Error('cloudflare prompt must be a non-empty string');
    if (input.prompt.length > 2048) throw new Error('cloudflare prompt max 2048 chars');
    const refB64 = stripDataUrlPrefix(input.referenceImageB64 ?? '');
    if (refB64) {
      if (isFlux2Model(this.model)) return this.generateFlux2(input, refB64);
      if (isImg2ImgModel(this.model)) return this.generateImg2Img(input, refB64);
      throw new Error(`model ${this.model} tidak mendukung image reference (pilih model reference (SD img2img / FLUX.2) atau Auto)`);
    }
    if (isFlux2Model(this.model)) return this.generateFlux2(input, null);
    if (isLeonardoModel(this.model)) return this.generateLeonardo(input);

    const url = this.buildUrl();
    // Flux: steps 1–8 (perilaku lama dipertahankan), TANPA field
    // `negative_prompt` (skema Flux menolak properti tambahan → HTTP 400).
    // Negative dilipat jadi klausa "Avoid: ..." seperti adapter
    // gemini/bynara/pollinations. SD tanpa referensi: text-to-image dengan
    // `num_steps` 1–20 + `negative_prompt` native.
    const isSD = isImg2ImgModel(this.model);
    const steps = isSD
      ? clampImg2ImgSteps(input.numSteps ?? input.parameters?.['num_steps'] ?? input.parameters?.['steps'])
      : Math.min(8, Math.max(1, (input.parameters?.['steps'] as number) ?? 4));
    const avoid = input.negativePrompt?.trim() || '';
    const prompt = !avoid || isSD ? input.prompt : `${input.prompt} Avoid: ${avoid}`.slice(0, 2048);
    const body: Record<string, unknown> = isSD ? { prompt, num_steps: steps } : { prompt, steps };
    if (avoid && isSD) body['negative_prompt'] = avoid;
    const seed = this.readSeed(input);
    if (seed !== undefined) body['seed'] = seed;

    return this.postJson(url, body, { model: this.model, steps });
  }

  /**
   * Leonardo text-to-image: Phoenix (negative native, output biner) vs Lucid
   * (tanpa negative_prompt → lipat Avoid:, kirim num_steps + steps).
   */
  private async generateLeonardo(input: GenerateImageInput): Promise<ImageGenerationResult> {
    const url = this.buildUrl();
    const defaults = modelDefaultParams(this.model, this.modelConfig);
    const guidance = clampGuidance(
      input.guidance ?? input.parameters?.['guidance'],
      defaults.guidance
    );
    const steps = clampTextSteps(
      input.numSteps ?? input.parameters?.['num_steps'] ?? input.parameters?.['steps'],
      defaults.steps,
      1,
      defaults.maxSteps
    );
    const dims = IMG2IMG_ASPECT_DIMS[input.aspectRatio ?? '1:1'] ?? IMG2IMG_ASPECT_DIMS['1:1']!;
    const width = clampRequestDimension(input.width ?? input.parameters?.['width'], dims.width, defaults.maxDim);
    const height = clampRequestDimension(input.height ?? input.parameters?.['height'], dims.height, defaults.maxDim);
    const seed = this.readSeed(input);
    const avoid = input.negativePrompt?.trim() || '';
    const negativeMode = modelNegativeMode(this.model, this.modelConfig);
    const prompt =
      avoid && negativeMode === 'fold' ? `${input.prompt} Avoid: ${avoid}`.slice(0, 2048) : input.prompt;
    const body: Record<string, unknown> = { prompt, guidance, num_steps: steps, width, height };
    // Lucid mengekspos num_steps + steps (kembar di skema) — kirim keduanya.
    if (isLucidModel(this.model)) body['steps'] = steps;
    if (avoid && negativeMode === 'native') body['negative_prompt'] = avoid;
    if (seed !== undefined) body['seed'] = seed;

    return this.postJson(url, body, {
      model: this.model,
      guidance,
      steps,
      width,
      height,
      ...(seed !== undefined ? { seed } : {})
    });
  }

  /**
   * FLUX.2 text + single-reference: FormData primary, fallback JSON minimal 1x
   * khusus HTTP 400. Advanced (guidance/dimensi) hanya dikirim bila user
   * mengisi eksplisit agar panggilan default tetap dekat bentuk Flux-1
   * yang terbukti (prompt + steps + seed).
   */
  private async generateFlux2(input: GenerateImageInput, refB64: string | null): Promise<ImageGenerationResult> {
    const url = this.buildUrl();
    const transport = this.flux2Transport(input);
    const defaults = modelDefaultParams(this.model, this.modelConfig);
    const steps = clampTextSteps(
      input.numSteps ?? input.parameters?.['num_steps'] ?? input.parameters?.['steps'],
      defaults.steps,
      1,
      defaults.maxSteps
    );
    const seed = this.readSeed(input);
    const avoid = input.negativePrompt?.trim() || '';
    const prompt = avoid ? `${input.prompt} Avoid: ${avoid}`.slice(0, 2048) : input.prompt;
    const metadata: Record<string, unknown> = {
      model: this.model,
      steps,
      reference: Boolean(refB64),
      ...(seed !== undefined ? { seed } : {})
    };

    const jsonFallbackBody: Record<string, unknown> = { prompt, steps };
    if (seed !== undefined) jsonFallbackBody['seed'] = seed;
    if (refB64) jsonFallbackBody['image_b64'] = refB64;

    if (transport === 'json') {
      return this.postJson(url, jsonFallbackBody, { ...metadata, transport: 'json' });
    }

    const form = new FormData();
    form.append('prompt', prompt);
    form.append('steps', String(steps));
    if (seed !== undefined) form.append('seed', String(seed));
    // Advanced eksplisit saja (default minimal): guidance + dimensi.
    const guidanceRaw = input.guidance ?? input.parameters?.['guidance'];
    if (typeof guidanceRaw === 'number' && Number.isFinite(guidanceRaw)) {
      form.append('guidance', String(clampGuidance(guidanceRaw, defaults.guidance)));
    }
    const dims = IMG2IMG_ASPECT_DIMS[input.aspectRatio ?? '1:1'] ?? IMG2IMG_ASPECT_DIMS['1:1']!;
    const widthRaw = input.width ?? input.parameters?.['width'];
    const heightRaw = input.height ?? input.parameters?.['height'];
    if (widthRaw !== undefined || heightRaw !== undefined) {
      form.append('width', String(clampRequestDimension(widthRaw, dims.width, defaults.maxDim)));
      form.append('height', String(clampRequestDimension(heightRaw, dims.height, defaults.maxDim)));
    }
    if (refB64) {
      const bytes = base64ToBytes(refB64);
      const copy = new Uint8Array(bytes.length);
      copy.set(bytes);
      form.append(this.flux2ImageField(), new Blob([copy.buffer as ArrayBuffer], { type: 'image/png' }), 'reference.png');
    }

    try {
      return await this.postForm(url, form, { ...metadata, transport: 'multipart' });
    } catch (e) {
      // Fallback hemat: hanya HTTP 400 (validasi/skema). 401/403/429/5xx +
      // timeout diteruskan agar key-pool + circuit breaker bekerja normal.
      if (transport === 'auto' && e instanceof ImageHttpError && e.status === 400) {
        return this.postJson(url, jsonFallbackBody, { ...metadata, transport: 'json-fallback' });
      }
      throw e;
    }
  }

  private async postJson(url: string, body: Record<string, unknown>, metadata: Record<string, unknown>): Promise<ImageGenerationResult> {
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
      return await this.parseResult(res, metadata);
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

  private async postForm(url: string, form: FormData, metadata: Record<string, unknown>): Promise<ImageGenerationResult> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await fetch(url, {
        method: 'POST',
        // JANGAN set Content-Type manual — fetch mengisi boundary multipart otomatis.
        headers: { Authorization: `Bearer ${this.apiKey}` },
        body: form,
        signal: controller.signal
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new ImageHttpError(res.status, `cloudflare image ${res.status}: ${text.slice(0, 200)}`);
      }
      return await this.parseResult(res, metadata);
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
   * Generate img2img: prompt + referensi (base64) + strength.
   * Hanya untuk model SD img2img — Flux-1/Leonardo menolak `image_b64`
   * (tolak cepat sebelum request agar tidak boros key/kuota; FLUX.2 lewat
   * jalur multipart sendiri).
   */
  private async generateImg2Img(input: GenerateImageInput, refB64: string): Promise<ImageGenerationResult> {
    if (!isImg2ImgModel(this.model)) {
      throw new Error(`model ${this.model} tidak mendukung image reference (pilih model reference (SD img2img / FLUX.2) atau Auto)`);
    }
    const url = this.buildUrl();
    const strength = clampImg2ImgStrength(input.strength ?? input.parameters?.['strength']);
    const numSteps = clampImg2ImgSteps(input.numSteps ?? input.parameters?.['num_steps'] ?? input.parameters?.['steps']);
    const dims = (input.aspectRatio && IMG2IMG_ASPECT_DIMS[input.aspectRatio]) ?? IMG2IMG_ASPECT_DIMS['1:1'];
    const width = clampImg2ImgDimension(input.width ?? input.parameters?.['width'], dims.width);
    const height = clampImg2ImgDimension(input.height ?? input.parameters?.['height'], dims.height);
    const guidance = clampGuidance(input.guidance ?? input.parameters?.['guidance']);
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
    const seed = this.readSeed(input);
    if (seed !== undefined) body['seed'] = seed;

    return this.postJson(url, body, { model: this.model, steps: numSteps, strength, width, height });
  }

  /**
   * Parse respons tiga bentuk: JSON `{ result: { image } }` (Flux/SD/Lucid),
   * JSON `{ image }` top-level (varian wrapper), atau biner langsung `image/*`
   * (Phoenix/ReadableStream binding).
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
    const json = (await res.json().catch(async () => null)) as {
      result?: { image?: string } | string;
      image?: string;
    } | null;
    const b64 =
      (typeof json?.result === 'object' ? json.result?.image : undefined) ??
      (typeof json?.result === 'string' ? json.result : undefined) ??
      json?.image;
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
