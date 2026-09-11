/** Prompt builder stage image_prompt — LLM memikirkan visualisasi dari post utama. */

/** Strategi visual: after = ilustrasi langsung/aspirasional; bridge = objek curiosity-gap. */
export type VisualStrategy = 'after' | 'bridge';

export interface ImagePromptInput {
  /** Post utama bilingual (opener thread). */
  mainId: string;
  mainEn: string;
  /** Konteks topik (judul + fakta kunci, diringkas caller). */
  topic?: string;
  keyFacts?: string[];
  uniqueAngle?: string;
  styleSuffix?: string;
  /** Index post sumber (0 = main/cover, 1..n = replies). */
  postIndex?: number;
  /** Cuplikan thread (reply lanjutan, diringkas caller) agar LLM paham arah solusi. */
  threadSnippet?: string;
}

export interface ImageReasoning {
  visual_strategy: VisualStrategy;
  hook_keywords: string[];
  contradiction_check: string;
  justification: string;
}

export interface ImagePromptOutput {
  image_prompt: string;
  negative_prompt?: string;
  reasoning: ImageReasoning;
}

export function buildImagePromptMessages(input: ImagePromptInput): {
  system: string;
  user: string;
} {
  const system = [
    'You are a senior visual designer for Asharu social content.',
    'Given the opening post of a thread, design ONE supporting illustration.',
    'First REASON explicitly about the post vs visual, then output the visual.',
    'Rules:',
    '- Output JSON ONLY: {"visual_strategy": "after|bridge", "hook_keywords": ["..."], "contradiction_check": "...", "justification": "...", "image_prompt": "...", "negative_prompt": "..."}.',
    '- image_prompt: single scene in English, ≤60 words, concrete objects/action/setting.',
    '- Derive the scene from the post (e.g. sticky pan with stuck food for a non-stick cookware post).',
    '- visual_strategy: AFTER = direct/aspirational illustration of the post; BRIDGE = curiosity-gap object (tape measure, empty dead corner).',
    '- DETAIL COMPLETENESS: every concrete detail in the source post (setting/location, objects, clothing, people, weather/atmosphere, time of day) MUST appear in image_prompt in some form. If you omit any explicit detail, the output is WRONG.',
    '- hook_keywords: key visual nouns from the source post (max 10, [] if none).',
    '- contradiction_check: one sentence stating what the prompt shows vs forbids.',
    '- justification: one sentence why this visual fits the post.',
    '- No people faces in close-up unless the post demands it; prefer objects/scenes.',
    '- No text, no watermark, no logo in the image (negative_prompt must repeat this).',
    '- No violent, sexual, or political content.'
  ].join('\n');
  const facts = (input.keyFacts ?? []).slice(0, 5).join(' | ');
  const user = [
    `Opening post (ID): ${input.mainId}`,
    `Opening post (EN): ${input.mainEn}`,
    input.topic ? `Topic: ${input.topic}` : '',
    facts ? `Key facts: ${facts}` : '',
    input.uniqueAngle ? `Unique angle: ${input.uniqueAngle}` : '',
    input.threadSnippet ? `Thread direction (replies summary): ${input.threadSnippet}` : '',
    typeof input.postIndex === 'number' ? `Source post_index: ${input.postIndex} (0 = main cover hook, >=1 = reply)` : '',
    input.styleSuffix ? `Style hint: ${input.styleSuffix}` : ''
  ]
    .filter(Boolean)
    .join('\n');
  return { system, user };
}

/** Parse output JSON stage image_prompt (toleran code fence). */
export function parseImagePrompt(text: string): ImagePromptOutput {
  const cleaned = text
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('image_prompt: no JSON object found');
  const parsed = JSON.parse(cleaned.slice(start, end + 1)) as {
    image_prompt?: unknown;
    negative_prompt?: unknown;
    visual_strategy?: unknown;
    hook_keywords?: unknown;
    contradiction_check?: unknown;
    justification?: unknown;
  };
  if (typeof parsed.image_prompt !== 'string' || !parsed.image_prompt.trim()) {
    throw new Error('image_prompt: missing image_prompt string');
  }
  // 'before' hanya legacy (data lama) → dinormalisasi ke 'after'.
  const strategy =
    parsed.visual_strategy === 'after' || parsed.visual_strategy === 'bridge'
      ? parsed.visual_strategy
      : 'after';
  const hookKeywords = Array.isArray(parsed.hook_keywords)
    ? parsed.hook_keywords.filter((w): w is string => typeof w === 'string').slice(0, 10)
    : [];
  return {
    image_prompt: parsed.image_prompt.trim().slice(0, 500),
    negative_prompt:
      typeof parsed.negative_prompt === 'string' && parsed.negative_prompt.trim()
        ? parsed.negative_prompt.trim().slice(0, 300)
        : undefined,
    reasoning: {
      visual_strategy: strategy,
      hook_keywords: hookKeywords,
      contradiction_check:
        typeof parsed.contradiction_check === 'string' ? parsed.contradiction_check.slice(0, 500) : '',
      justification: typeof parsed.justification === 'string' ? parsed.justification.slice(0, 500) : ''
    }
  };
}

export interface ImagePromptGateResult {
  ok: boolean;
  reasons: string[];
}

/**
 * Gate ringan sebelum prompt dikirim ke provider image.
 * Strategi 'before' dihapus (user bisa edit prompt manual) — gate hanya
 * memastikan prompt/negative terisi wajar dan strategi valid
 * (after/bridge/custom). Legacy 'before' dari data lama tetap lolos.
 */
export function validateImagePromptContradiction(
  output: ImagePromptOutput,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _sourceText: string
): ImagePromptGateResult {
  const reasons: string[] = [];
  const prompt = output.image_prompt?.trim() ?? '';
  const negative = output.negative_prompt?.trim() ?? '';
  const strategy = output.reasoning.visual_strategy;
  if (prompt.length < 10) {
    reasons.push('image_prompt minimal 10 karakter');
  }
  if (prompt.length > 500) {
    reasons.push('image_prompt maksimal 500 karakter');
  }
  if (negative.length > 300) {
    reasons.push('negative_prompt maksimal 300 karakter');
  }
  if (!['after', 'bridge', 'custom', 'before'].includes(strategy)) {
    reasons.push(`visual_strategy tidak dikenal: ${strategy}`);
  }
  return { ok: reasons.length === 0, reasons };
}

export interface EnhancePromptInput {
  sourceId: string;
  sourceEn: string;
  promptDraft: string;
  negativeDraft?: string | null;
  topic?: string;
  styleSuffix?: string;
  postIndex?: number;
}

export function buildEnhancePromptMessages(input: EnhancePromptInput): {
  system: string;
  user: string;
} {
  const system = [
    'You are a senior visual designer for Asharu social content — POLISH mode.',
    'The user already drafted an image_prompt (and maybe negative_prompt) for supporting illustration. Your job: POLISH it into a better prompt — NOT rewrite to a generic scene.',
    'Preserve intent, correct English, make it single scene, concrete objects/action/setting, ≤60 words.',
    'First REASON about the post vs visual, then output the polished visual.',
    'Rules:',
    '- Output JSON ONLY: {"visual_strategy": "after|bridge", "hook_keywords": ["..."], "contradiction_check": "...", "justification": "...", "image_prompt": "...", "negative_prompt": "..."}.',
    '- image_prompt: polished English, ≤60 words (hard limit), concrete, no text/watermark/logo.',
    '- Negative: polish too (no text, no watermark, no logo), ≤300 chars.',
    '- visual_strategy: AFTER = direct/aspirational illustration of the post; BRIDGE = curiosity-gap object.',
    '- MISSED-DETAIL COMPLETION: compare the user draft against the source post. ADD every concrete visual detail from the source post that the draft missed (setting/location, objects, clothing, people, weather/atmosphere, time of day). NEVER drop details already in the draft — only add the missing ones. If the draft already covers everything, polish wording only.',
    '- CRITICAL PRESERVATION: User draft may be in Indonesian — translate to English FAITHFULLY and keep EVERY explicit detail. Do NOT drop or generalize:',
    '  * clothing (e.g. "pakaian fitted" → "fitted clothing/outfit"),',
    '  * camera angle/shot (e.g. "angle agak menyamping bawah" → "slightly low three-quarter side angle, eye-level from below"),',
    '  * pose/expression (e.g. "menatap khawatir" → "looking worried/anxiously"),',
    '  * setting/location (e.g. "di luar rumah sederhana di Bandung" → "outside a simple house in Bandung" — do NOT change to "crowded street" if user said "outside house"),',
    '  * accessories (mask, etc.) and atmosphere (hazy, volcanic ash).',
    '- If you omit any of these, the output is WRONG. When in doubt, keep the detail verbatim (translated).',
    '- Do not invent new setting (street/alley) if user specified house exterior; do not drop "fitted".',
    '- No people faces close-up unless source demands it; prefer medium shot that shows outfit + setting.',
    '- No violent, sexual, or political content.'
  ].join('\n');
  const user = [
    `Source post (ID): ${input.sourceId}`,
    `Source post (EN): ${input.sourceEn}`,
    `User draft prompt (PRESERVE all details, ID→EN translate): ${input.promptDraft}`,
    input.negativeDraft ? `User draft negative: ${input.negativeDraft}` : '',
    input.topic ? `Topic: ${input.topic}` : '',
    typeof input.postIndex === 'number' ? `Source post_index: ${input.postIndex} (0=cover, >=1=reply)` : '',
    input.styleSuffix ? `Style hint (will be appended by worker): ${input.styleSuffix}` : ''
  ]
    .filter(Boolean)
    .join('\n');
  return { system, user };
}

export function mergeImageNegativePrompts(userNegative: string | null | undefined, styleNegative: string | null | undefined): string | undefined {
  const parts = [userNegative?.trim(), styleNegative?.trim()].filter((p): p is string => Boolean(p));
  return parts.length ? parts.join(', ') : undefined;
}

export interface StudioEnhanceInput {
  promptDraft: string;
  negativeDraft?: string | null;
  styleSuffix?: string;
}

/**
 * Builder enhance untuk Studio (prompt bebas, TANPA konteks postingan).
 * Beda dari buildEnhancePromptMessages (review): tidak ada aturan
 * MISSED-DETAIL vs source post — LLM polish + perkaya detail visual dari
 * draf itu sendiri (pencahayaan, komposisi, mood, tekstur) tanpa membuang
 * detail eksplisit user.
 */
export function buildStudioEnhanceMessages(input: StudioEnhanceInput): {
  system: string;
  user: string;
} {
  const system = [
    'You are a senior visual designer for Asharu Studio — POLISH mode.',
    'The user drafted an image_prompt (and maybe negative_prompt) for a standalone illustration. There is NO source post — polish and ENRICH the draft itself.',
    'Preserve intent, correct English, make it single scene, concrete objects/action/setting, ≤60 words.',
    'Rules:',
    '- Output JSON ONLY: {"visual_strategy": "after|bridge", "hook_keywords": ["..."], "contradiction_check": "...", "justification": "...", "image_prompt": "...", "negative_prompt": "..."}.',
    '- image_prompt: polished English, ≤60 words (hard limit), concrete, no text/watermark/logo.',
    '- Negative: polish too (no text, no watermark, no logo), ≤300 chars.',
    '- visual_strategy: AFTER = direct/aspirational illustration; BRIDGE = curiosity-gap object.',
    '- ENRICHMENT: add concrete visual detail the draft lacks (lighting, composition, mood, texture, atmosphere) so the image generator has enough to work with. NEVER drop explicit details already in the draft — only add.',
    '- CRITICAL PRESERVATION: User draft may be in Indonesian — translate to English FAITHFULLY and keep EVERY explicit detail (clothing, camera angle/shot, pose/expression, setting/location, accessories, atmosphere). When in doubt, keep the detail verbatim (translated).',
    '- No people faces close-up unless the draft demands it; prefer medium shot that shows subject + setting.',
    '- No violent, sexual, or political content.'
  ].join('\n');
  const user = [
    `User draft prompt (PRESERVE all details, ID→EN translate, then ENRICH): ${input.promptDraft}`,
    input.negativeDraft ? `User draft negative: ${input.negativeDraft}` : '',
    input.styleSuffix ? `Style hint (will be appended by worker): ${input.styleSuffix}` : ''
  ]
    .filter(Boolean)
    .join('\n');
  return { system, user };
}
