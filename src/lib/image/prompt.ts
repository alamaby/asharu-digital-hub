/** Prompt builder stage image_prompt — LLM memikirkan visualisasi dari post utama. */

export interface ImagePromptInput {
  /** Post utama bilingual (opener thread). */
  mainId: string;
  mainEn: string;
  /** Konteks topik (judul + fakta kunci, diringkas caller). */
  topic?: string;
  keyFacts?: string[];
  styleSuffix?: string;
}

export interface ImagePromptOutput {
  image_prompt: string;
  negative_prompt?: string;
}

export function buildImagePromptMessages(input: ImagePromptInput): {
  system: string;
  user: string;
} {
  const system = [
    'You are a senior visual designer for Asharu social content.',
    'Given the opening post of a thread, design ONE supporting illustration.',
    'Rules:',
    '- Output JSON ONLY: {"image_prompt": "...", "negative_prompt": "..."}.',
    '- image_prompt: single scene in English, ≤60 words, concrete objects/action/setting.',
    '- Derive the scene from the post (e.g. sticky pan with stuck food for a non-stick cookware post).',
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
  };
  if (typeof parsed.image_prompt !== 'string' || !parsed.image_prompt.trim()) {
    throw new Error('image_prompt: missing image_prompt string');
  }
  return {
    image_prompt: parsed.image_prompt.trim().slice(0, 500),
    negative_prompt:
      typeof parsed.negative_prompt === 'string' && parsed.negative_prompt.trim()
        ? parsed.negative_prompt.trim().slice(0, 300)
        : undefined
  };
}
