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
  /** Pilihan picker hasil enhance (hanya stage enhance Studio) — null = biarkan Auto. */
  style_slug?: string | null;
  subject_slug?: string | null;
  camera_slug?: string | null;
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

/** Slug picker dari output LLM: hanya string non-kosong, selain itu null. */
function parseOptionalSlug(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, 120) : null;
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
    style_slug?: unknown;
    subject_slug?: unknown;
    camera_slug?: unknown;
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
    },
    // Hanya stage enhance Studio yang mengisi ini; stage lain mengabaikannya.
    style_slug: parseOptionalSlug(parsed.style_slug),
    subject_slug: parseOptionalSlug(parsed.subject_slug),
    camera_slug: parseOptionalSlug(parsed.camera_slug)
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
 *
 * `requireNegative` dipakai stage enhance Studio: negative prompt wajib
 * terisi (bukan sekadar valid bila ada). Default false agar worker konten
 * tidak berubah perilaku.
 */
export function validateImagePromptContradiction(
  output: ImagePromptOutput,
  _sourceText: string,
  opts?: { requireNegative?: boolean }
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
  if (opts?.requireNegative && negative.length < 10) {
    reasons.push('negative_prompt wajib terisi (minimal 10 karakter)');
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
  /** Konteks pilihan picker user (nama + teks EN) — jadikan input polish. */
  subjectName?: string | null;
  subjectEn?: string | null;
  cameraName?: string | null;
  cameraEn?: string | null;
  /** Daftar opsi aktif: LLM HANYA boleh memilih slug dari daftar ini. */
  styleOptions?: StudioOption[];
  subjectOptions?: StudioOption[];
  cameraOptions?: StudioOption[];
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
    '- Output JSON ONLY: {"visual_strategy": "after|bridge", "hook_keywords": ["..."], "contradiction_check": "...", "justification": "...", "image_prompt": "...", "negative_prompt": "...", "style_slug": "...|null", "subject_slug": "...|null", "camera_slug": "...|null"}.',
    '- image_prompt: polished English, ≤60 words (hard limit), concrete, no text/watermark/logo.',
    '- Negative: REQUIRED, never empty — always cover at least "no text, no watermark, no logo, blurry, low quality, distorted anatomy", plus anything the draft must avoid. Max 300 chars.',
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
    '- Do NOT write the style preset wording or the camera angle wording into image_prompt — the pipeline appends them automatically. Just make the scene fit them.',
    '- No violent, sexual, or political content.',
    'FIELD SELECTION (style_slug / subject_slug / camera_slug):',
    '- Choose ONLY from the OPTION LISTS below and return the exact slug string. NEVER invent a slug.',
    '- If the user already selected a field, treat it as an INPUT: keep the scene consistent with it. You MAY recommend a different slug when clearly better.',
    '- subject_slug MUST be null when the draft clearly has no person/subject; do not force a human subject.',
    '- camera_slug: pick the angle that best fits the draft scene and shot; null only if no angle in the list fits.'
  ].join('\n');
  const selected: string[] = [];
  if (input.subjectName) selected.push(`- Subject template selected: ${input.subjectName}`);
  if (input.subjectEn) selected.push(`  (subject template EN, will be prepended by the pipeline): ${input.subjectEn}`);
  if (input.cameraName) selected.push(`- Camera angle selected: ${input.cameraName}`);
  if (input.cameraEn) selected.push(`  (camera angle EN, will be appended by the pipeline): ${input.cameraEn}`);
  const user = [
    `Source post (ID): ${input.sourceId}`,
    `Source post (EN): ${input.sourceEn}`,
    `User draft prompt (PRESERVE all details, ID→EN translate): ${input.promptDraft}`,
    input.negativeDraft ? `User draft negative: ${input.negativeDraft}` : '',
    input.topic ? `Topic: ${input.topic}` : '',
    typeof input.postIndex === 'number' ? `Source post_index: ${input.postIndex} (0=cover, >=1=reply)` : '',
    input.styleSuffix ? `Style hint (will be appended by worker): ${input.styleSuffix}` : '',
    selected.length ? `Currently selected fields:\n${selected.join('\n')}` : 'Currently selected fields: none (all Auto) — pick the best option for each list.',
    input.styleOptions?.length ? `OPTION LIST style_slug: ${optionLines(input.styleOptions)}` : '',
    input.subjectOptions?.length ? `OPTION LIST subject_slug: ${optionLines(input.subjectOptions)}` : '',
    input.cameraOptions?.length ? `OPTION LIST camera_slug: ${optionLines(input.cameraOptions)}` : ''
  ]
    .filter(Boolean)
    .join('\n');
  return { system, user };
}

export function mergeImageNegativePrompts(userNegative: string | null | undefined, styleNegative: string | null | undefined): string | undefined {
  const parts = [userNegative?.trim(), styleNegative?.trim()].filter((p): p is string => Boolean(p));
  return parts.length ? parts.join(', ') : undefined;
}

export interface StudioOption {
  slug: string;
  display_name: string;
}

export interface StudioEnhanceInput {
  promptDraft: string;
  negativeDraft?: string | null;
  styleSuffix?: string;
  /** Konteks pilihan picker user (nama + teks EN) — jadikan input polish. */
  styleName?: string | null;
  subjectName?: string | null;
  subjectEn?: string | null;
  cameraName?: string | null;
  cameraEn?: string | null;
  /** Daftar opsi aktif: LLM HANYA boleh memilih slug dari daftar ini. */
  styleOptions?: StudioOption[];
  subjectOptions?: StudioOption[];
  cameraOptions?: StudioOption[];
}

/** Baris daftar opsi: "slug — display name" (hemat token, slug tetap persis). */
function optionLines(options: StudioOption[] | undefined): string {
  if (!options?.length) return '';
  return options.map((o) => `${o.slug} — ${o.display_name}`).join('; ');
}

/**
 * Builder enhance untuk Studio (prompt bebas, TANPA konteks postingan).
 * Beda dari buildEnhancePromptMessages (review): tidak ada aturan
 * MISSED-DETAIL vs source post — LLM polish + perkaya detail visual dari
 * draf itu sendiri (pencahayaan, komposisi, mood, tekstur) tanpa membuang
 * detail eksplisit user.
 *
 * Sejak 16 Sep 2026 builder ini juga FIELD-AWARE: LLM memilih preset style,
 * template subjek, dan camera angle dari daftar opsi aktif (dikirim slug +
 * display_name), selalu mengisi negative prompt, dan tidak menyisipkan
 * wording style/angle ke image_prompt karena worker yang menempelkannya
 * (lihat `src/lib/studio/worker.ts`).
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
    '- Output JSON ONLY: {"visual_strategy": "after|bridge", "hook_keywords": ["..."], "contradiction_check": "...", "justification": "...", "image_prompt": "...", "negative_prompt": "...", "style_slug": "...|null", "subject_slug": "...|null", "camera_slug": "...|null"}.',
    '- image_prompt: polished English, ≤60 words (hard limit), concrete, no text/watermark/logo.',
    '- Negative: REQUIRED, never empty — always cover at least "no text, no watermark, no logo, blurry, low quality, distorted anatomy", plus anything the draft must avoid. Max 300 chars.',
    '- visual_strategy: AFTER = direct/aspirational illustration; BRIDGE = curiosity-gap object.',
    '- ENRICHMENT: add concrete visual detail the draft lacks (lighting, composition, mood, texture, atmosphere) so the image generator has enough to work with. NEVER drop explicit details already in the draft — only add.',
    '- CRITICAL PRESERVATION: User draft may be in Indonesian — translate to English FAITHFULLY and keep EVERY explicit detail (clothing, camera angle/shot, pose/expression, setting/location, accessories, atmosphere). When in doubt, keep the detail verbatim (translated).',
    '- Do NOT write the style preset wording or the camera angle wording into image_prompt — the pipeline appends them automatically. Just make the scene fit them.',
    '- No people faces close-up unless the draft demands it; prefer medium shot that shows subject + setting.',
    '- No violent, sexual, or political content.',
    'FIELD SELECTION (style_slug / subject_slug / camera_slug):',
    '- Choose ONLY from the OPTION LISTS below and return the exact slug string. NEVER invent a slug.',
    '- If the user already selected a field, treat it as an INPUT: keep the scene consistent with it. You MAY recommend a different slug when clearly better.',
    '- subject_slug MUST be null when the draft clearly has no person/subject; do not force a human subject.',
    '- camera_slug: pick the angle that best fits the draft scene and shot; null only if no angle in the list fits.'
  ].join('\n');
  const selected: string[] = [];
  if (input.styleName) selected.push(`- Style preset selected: ${input.styleName}`);
  if (input.subjectName) selected.push(`- Subject template selected: ${input.subjectName}`);
  if (input.subjectEn) selected.push(`  (subject template EN, will be prepended by the pipeline): ${input.subjectEn}`);
  if (input.cameraName) selected.push(`- Camera angle selected: ${input.cameraName}`);
  if (input.cameraEn) selected.push(`  (camera angle EN, will be appended by the pipeline): ${input.cameraEn}`);
  const user = [
    `User draft prompt (PRESERVE all details, ID→EN translate, then ENRICH): ${input.promptDraft}`,
    input.negativeDraft ? `User draft negative: ${input.negativeDraft}` : '',
    input.styleSuffix ? `Style hint (will be appended by worker): ${input.styleSuffix}` : '',
    selected.length ? `Currently selected fields:\n${selected.join('\n')}` : 'Currently selected fields: none (all Auto) — pick the best option for each list.',
    input.styleOptions?.length ? `OPTION LIST style_slug: ${optionLines(input.styleOptions)}` : '',
    input.subjectOptions?.length ? `OPTION LIST subject_slug: ${optionLines(input.subjectOptions)}` : '',
    input.cameraOptions?.length ? `OPTION LIST camera_slug: ${optionLines(input.cameraOptions)}` : ''
  ]
    .filter(Boolean)
    .join('\n');
  return { system, user };
}

/** Input untuk komposisi final-prompt Studio oleh LLM di worker. */
export interface ComposeStudioInput {
  imagePrompt: string;
  subjectEn?: string | null;
  angleEn?: string | null;
  styleSuffix?: string | null;
  aspect: string;
}

/** Output JSON dari LLM komposisi Studio (validasi via parseComposeStudio). */
export interface ComposeStudioOutput {
  final_prompt: string;
  final_negative?: string | null;
  dropped: string[];
  conflict_note?: string | null;
}

/** Audit komposisi: mode + jejak drop/konflik (ditulis ke llm_meta worker). */
export interface ComposeAudit {
  mode: 'llm' | 'deterministic';
  /** Frasa yang dibuang saat komposisi (dari segmen manapun). */
  dropped: string[];
  /** Catatan konflik yang diselesaikan (null bila none). */
  conflict_note?: string | null;
}

/**
 * Builder pesan LLM untuk konsolidasi final prompt Studio.
 * LLM menggabungkan subject_en + image_prompt + angle_en + style_suffix
 * menjadi satu scene koheren — menghilangkan duplikat dan konflik eksplisit.
 */
export function buildComposeStudioMessages(input: ComposeStudioInput): { system: string; user: string } {
  const segments: string[] = [];
  if (input.imagePrompt?.trim()) segments.push(`Image prompt (user): ${input.imagePrompt.trim()}`);
  if (input.subjectEn?.trim()) segments.push(`Subject template: ${input.subjectEn.trim()}`);
  if (input.angleEn?.trim()) segments.push(`Camera angle: ${input.angleEn.trim()}`);
  if (input.styleSuffix?.trim()) segments.push(`Style preset: ${input.styleSuffix.trim()}`);
  const segmentText = segments.join('\n');
  const system = [
    'You are a prompt composer for FLUX and similar text-to-image models.',
    'Your job: MERGE 4 text segments into ONE cohesive image-prompt scene — NO new objects/settings.',
    'SEGMENTS PROVIDED (each is a separate visual instruction):',
    segmentText || '(none provided)',
    '',
    'RULES (in priority order):',
    '1. USER IMAGE PROMPT WINS: user-written scene (subject/action/setting) takes highest priority.',
    '2. MERGE WITHOUT DUPLICATES: if multiple segments describe the same subject (e.g., "young woman" in both), merge into one description.',
    '3. RESOLVE CONFLICTS — USER WINS:',
    '   - "clean background" in subject vs "crowded park/beach/street" in user prompt → DROP "clean background".',
    '   - "full-body editorial" framing in subject vs "three-quarter / side-profile" angle → use angle framing.',
    '   - "vertical format" in style vs aspect "1:1" or "16:9" → DROP "vertical".',
    '   - When in doubt, follow user prompt over template text.',
    '4. STRIP IRRELEVANT CLAUSES:',
    '   - Remove product-focused phrases ("featured product", "packaging", "product proportions", "product clearly visible") when the scene features a person, not a product shot.',
    '   - Remove "no text, no watermark, no logo" from POSITIVE prompt — these belong ONLY in negative prompt.',
    '5. OUTPUT STRUCTURE:',
    '   - final_prompt: single descriptive scene ≤90 words, concrete, in English, NO instruction phrases like "must show".',
    '   - final_negative: required — at least "no text, no watermark, no logo, blurry, low quality, distorted anatomy". Add style-relevant exclusions.',
    '   - dropped: list of phrases/items you dropped from any segment and why (e.g., "clean background — conflicts with crowded park").',
    '   - conflict_note: brief note explaining resolved conflicts (or null if none).',
    '6. DO NOT invent new settings, objects, people, or actions not present in any segment.',
    '',
    'OUTPUT JSON ONLY. No markdown fences. Keys: "final_prompt", "final_negative", "dropped" (array), "conflict_note".'
  ].join('\n');
  const user = `Segments to merge:\n${segmentText}\n\nAspect ratio: ${input.aspect}`;
  return { system, user };
}

/**
 * Parse LLM JSON output for compose studio. Tolerant of markdown code fences.
 * Returns parsed output with sanitization (length caps).
 */
export function parseComposeStudio(text: string): ComposeStudioOutput {
  const cleaned = text
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('compose_studio: no JSON object found');
  const parsed = JSON.parse(cleaned.slice(start, end + 1)) as {
    final_prompt?: unknown;
    final_negative?: unknown;
    dropped?: unknown;
    conflict_note?: unknown;
  };
  const prompt = typeof parsed.final_prompt === 'string' ? parsed.final_prompt.trim() : '';
  if (prompt.length < 10) throw new Error(`compose_studio: final_prompt terlalu pendek (${prompt.length} char)`);
  const negative = typeof parsed.final_negative === 'string' && parsed.final_negative.trim()
    ? parsed.final_negative.trim().slice(0, 1000)
    : undefined;
  const dropped = (Array.isArray(parsed.dropped) ? parsed.dropped.filter((d): d is string => typeof d === 'string' && !!d.trim()).slice(0, 20) : []);
  const conflictNote = typeof parsed.conflict_note === 'string' && parsed.conflict_note.trim()
    ? parsed.conflict_note.trim().slice(0, 500)
    : null;
  return { final_prompt: prompt.slice(0, 2000), final_negative: negative, dropped, conflict_note: conflictNote };
}

/** Input komposisi final-prompt review konten oleh LLM di worker. */
export interface ComposeReviewInput {
  imagePrompt: string;
  angleEn?: string | null;
  styleSuffix?: string | null;
  aspect: string;
}

/** Output JSON dari LLM komposisi review (validasi via parseComposeReview). */
export interface ComposeReviewOutput {
  final_prompt: string;
  final_negative?: string | null;
  dropped: string[];
  conflict_note?: string | null;
}

/**
 * Builder pesan LLM untuk konsolidasi final prompt review konten.
 * Mirip compose Studio tapi tanpa subject_en (subjek sudah tertanam di image_prompt).
 * Fokus pada penggabungan user prompt + angle + style suffix menjadi scene koheren.
 */
export function buildComposeReviewMessages(input: ComposeReviewInput): { system: string; user: string } {
  const segments: string[] = [];
  if (input.imagePrompt?.trim()) segments.push(`Image prompt (user/enhanced): ${input.imagePrompt.trim()}`);
  if (input.angleEn?.trim()) segments.push(`Camera angle: ${input.angleEn.trim()}`);
  if (input.styleSuffix?.trim()) segments.push(`Style preset: ${input.styleSuffix.trim()}`);
  const segmentText = segments.join('\n');
  const system = [
    'You are a prompt composer for FLUX and similar text-to-image models.',
    'Your job: MERGE 2–3 text segments into ONE cohesive image-prompt scene — NO new objects/settings.',
    'SEGMENTS PROVIDED (each is a separate visual instruction):',
    segmentText || '(none provided)',
    '',
    'RULES (in priority order):',
    '1. USER IMAGE PROMPT WINS: user-written or enhanced scene (subject/action/setting) takes highest priority.',
    '2. MERGE WITHOUT DUPLICATES: if multiple segments describe the same subject (e.g., "young woman" in both), merge into one description.',
    '3. RESOLVE CONFLICTS — USER WINS:',
    '   - Camera framing in angle vs framing in prompt → use prompt framing unless angle clearly specifies.',
    '   - Style cues that contradict the scene → DROP style cue.',
    '   - "vertical format" in style vs aspect "1:1" or "16:9" → DROP "vertical".',
    '4. STRIP IRRELEVANT CLAUSES:',
    '   - Remove "no text, no watermark, no logo" from POSITIVE prompt — these belong ONLY in negative prompt.',
    '5. OUTPUT STRUCTURE:',
    '   - final_prompt: single descriptive scene ≤90 words, concrete, in English, NO instruction phrases like "must show".',
    '   - final_negative: required — at least "no text, no watermark, no logo, blurry, low quality, distorted anatomy". Add style-relevant exclusions.',
    '   - dropped: list of phrases/items you dropped from any segment and why (e.g., "clean background — conflicts with crowded park").',
    '   - conflict_note: brief note explaining resolved conflicts (or null if none).',
    '6. DO NOT invent new settings, objects, people, or actions not present in any segment.',
    '',
    'OUTPUT JSON ONLY. No markdown fences. Keys: "final_prompt", "final_negative", "dropped" (array), "conflict_note".'
  ].join('\n');
  const user = `Segments to merge:\n${segmentText}\n\nAspect ratio: ${input.aspect}`;
  return { system, user };
}

/**
 * Parse LLM JSON output for compose review. Tolerant of markdown code fences.
 * Returns parsed output with sanitization (length caps).
 */
export function parseComposeReview(text: string): ComposeReviewOutput {
  const cleaned = text
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('compose_review: no JSON object found');
  const parsed = JSON.parse(cleaned.slice(start, end + 1)) as {
    final_prompt?: unknown;
    final_negative?: unknown;
    dropped?: unknown;
    conflict_note?: unknown;
  };
  const prompt = typeof parsed.final_prompt === 'string' ? parsed.final_prompt.trim() : '';
  if (prompt.length < 10) throw new Error(`compose_review: final_prompt terlalu pendek (${prompt.length} char)`);
  const negative = typeof parsed.final_negative === 'string' && parsed.final_negative.trim()
    ? parsed.final_negative.trim().slice(0, 1000)
    : undefined;
  const dropped = (Array.isArray(parsed.dropped) ? parsed.dropped.filter((d): d is string => typeof d === 'string' && !!d.trim()).slice(0, 20) : []);
  const conflictNote = typeof parsed.conflict_note === 'string' && parsed.conflict_note.trim()
    ? parsed.conflict_note.trim().slice(0, 500)
    : null;
  return { final_prompt: prompt.slice(0, 2000), final_negative: negative, dropped, conflict_note: conflictNote };
}

/**
 * Fallback deterministik: tempel angle + style suffix ke image prompt tanpa LLM.
 * Mengembalikan { final_prompt, dropped: [], conflict_note: null }.
 */
export function composeReviewDeterministic(input: ComposeReviewInput): { final_prompt: string; audit: ComposeAudit } {
  const parts: string[] = [];
  if (input.imagePrompt?.trim()) parts.push(input.imagePrompt.trim());
  if (input.angleEn?.trim()) parts.push(input.angleEn!.trim());
  if (input.styleSuffix?.trim()) parts.push(input.styleSuffix!.trim());
  const finalPrompt = parts.join(', ');
  return { final_prompt: finalPrompt, audit: { mode: 'deterministic', dropped: [], conflict_note: null } };
}
