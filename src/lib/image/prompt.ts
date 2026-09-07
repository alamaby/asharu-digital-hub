/** Prompt builder stage image_prompt — LLM memikirkan visualisasi dari post utama. */

export type VisualStrategy = 'before' | 'after' | 'bridge';

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

/** Kata pain ID/EN — bila muncul di source post, strategi default = before. */
export const PAIN_KEYWORDS = [
  'sempit',
  'berantakan',
  'sumpek',
  'sesak',
  'cramped',
  'messy',
  'mess',
  'cluttered',
  'clutter'
] as const;

/** Kata After yang DILARANG di image_prompt saat strategy=before. */
export const AFTER_WORDS_BANNED_UNDER_BEFORE = [
  'neat',
  'organized',
  'organised',
  'tidy',
  'spacious',
  'beautifully styled'
] as const;

/** Kata pain EN yang wajib tercermin minimal satu di image_prompt saat before. */
export const PAIN_REFLECTION_EN = [
  'cramped',
  'messy',
  'mess',
  'clutter',
  'narrow',
  'crowded',
  'piled',
  'disorganized',
  'untidy',
  'small'
] as const;

function includesWord(haystack: string, word: string): boolean {
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`\\b${escaped}\\b`, 'i').test(haystack);
}

/** Deteksi kata pain di teks sumber (ID/EN, case-insensitive, word-boundary). */
export function detectPainKeywords(text: string): string[] {
  const src = text ?? '';
  return (PAIN_KEYWORDS as readonly string[]).filter((w) => includesWord(src, w));
}

export function buildImagePromptMessages(input: ImagePromptInput): {
  system: string;
  user: string;
} {
  const system = [
    'You are a senior visual designer for Asharu social content.',
    'Given the opening post of a thread, design ONE supporting illustration.',
    'First REASON explicitly about hook-type vs visual, then output the visual.',
    'Rules:',
    '- Output JSON ONLY: {"visual_strategy": "before|after|bridge", "hook_keywords": ["..."], "contradiction_check": "...", "justification": "...", "image_prompt": "...", "negative_prompt": "..."}.',
    '- image_prompt: single scene in English, ≤60 words, concrete objects/action/setting.',
    '- Derive the scene from the post (e.g. sticky pan with stuck food for a non-stick cookware post).',
    '- visual_strategy: BEFORE = depict the pain/problem stated in the hook (cramped, messy); AFTER = depict the solved/aspirational state; BRIDGE = curiosity-gap object (tape measure, empty dead corner).',
    '- DEFAULT: if the source post contains pain keywords (sempit/berantakan/cramped/messy/cluttered), visual_strategy MUST be "before". NEVER answer a pain hook with an After visual.',
    '- BEFORE rules: image_prompt MUST show a relatable cramped/messy corner (relatable messy, NOT filthy/disgusting) and MUST contain at least one pain-reflection word (cramped, messy, clutter, narrow, crowded, piled, disorganized, untidy, small). MUST NOT contain neat/organized/tidy/spacious/beautifully styled. negative_prompt MUST NOT ban cramped/messy/mess/clutter/sempit/berantakan.',
    '- AFTER rules: only when the source post is aspirational/solution with NO pain hook.',
    '- hook_keywords: pain words found in the source post (ID/EN verbatim, [] if none).',
    '- contradiction_check: one sentence stating what the prompt shows vs forbids (e.g. "prompt shows cramped/messy, forbids neat/organized/spacious").',
    '- justification: one sentence why this strategy fits the hook.',
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
  const strategy =
    parsed.visual_strategy === 'before' ||
    parsed.visual_strategy === 'after' ||
    parsed.visual_strategy === 'bridge'
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
 * Gate deterministik sebelum prompt dikirim ke provider image.
 * - Pain hook (sempit/berantakan/...) wajib strategy=before.
 * - strategy=before: image_prompt dilarang memuat kata After, wajib memuat
 *   minimal satu kata refleksi pain, negative dilarang mem-ban kata pain.
 */
export function validateImagePromptContradiction(
  output: ImagePromptOutput,
  sourceText: string
): ImagePromptGateResult {
  const reasons: string[] = [];
  const pains = detectPainKeywords(sourceText);
  const prompt = output.image_prompt ?? '';
  const negative = output.negative_prompt ?? '';
  const strategy = output.reasoning.visual_strategy;

  if (pains.length > 0 && strategy !== 'before') {
    reasons.push(`pain hook (${pains.join('/')}) requires visual_strategy=before, got ${strategy}`);
  }
  if (strategy === 'before') {
    const banned = (AFTER_WORDS_BANNED_UNDER_BEFORE as readonly string[]).filter((w) =>
      includesWord(prompt, w)
    );
    if (banned.length > 0) {
      reasons.push(`before visual must not contain After words: ${banned.join(', ')}`);
    }
    const reflected = (PAIN_REFLECTION_EN as readonly string[]).some((w) => includesWord(prompt, w));
    if (!reflected) {
      reasons.push('before visual must reflect pain with one of: cramped/messy/clutter/narrow/crowded/piled/disorganized/untidy/small');
    }
    const bannedPainInNegative = [
      'cramped',
      'messy',
      'mess',
      'clutter',
      'sempit',
      'berantakan'
    ].filter((w) => includesWord(negative, w));
    if (bannedPainInNegative.length > 0) {
      reasons.push(`before negative_prompt must not ban pain words: ${bannedPainInNegative.join(', ')}`);
    }
  }
  return { ok: reasons.length === 0, reasons };
}
