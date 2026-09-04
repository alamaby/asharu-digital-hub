export interface ThreadPromptInput {
  topic: string;
  platform: { slug: string; maxChars: number | null };
  tone: string;
  audience: string;
  ctaStyle: string;
  purpose: string;
  constraints?: string | null;
  keywords?: string | null;
  language: string; // 'id' | 'en' | 'both'
  targetCategory?: string | null;
  targetReplyCount?: number | null;
  hooks?: string[] | null;
  keyFacts?: string[] | null;
  uniqueAngle?: string | null;
  isFallbackRandom?: boolean;
}

export interface AffiliateProductForPrompt {
  friendlyCode: string;
  name: string;
  url: string;
  category: string;
}

// Opener wajib sisipan afiliasi: natural interjection ID + padanan EN.
// LLM wajib pilih salah satu yang paling natural (jangan selalu "Btw").
export const AFFILIATE_OPENERS_ID = [
  'Btw,',
  'Intermezzo dulu ya,',
  'Ngomong-ngomong,',
  'Oiya,',
  'Eh iya,'
] as const;

export const AFFILIATE_OPENERS_EN = [
  'By the way,',
  'Quick intermezzo,',
  'Speaking of which,',
  'Oh, and'
] as const;

const AFFILIATE_OPENER_RULE =
  `- AFFILIATE OPENER: reply yang berisi {{PRODUCT_URL}} WAJIB diawali salah satu opener natural ID ${AFFILIATE_OPENERS_ID.map((o) => `"${o}"`).join(' / ')} (pilih yang paling natural, jangan selalu "Btw"). Untuk field EN padanannya: ${AFFILIATE_OPENERS_EN.map((o) => `"${o}"`).join(' / ')}. Contoh: "Btw, kalau setup kamu ... ${'{{PRODUCT_URL}}'}" / "Intermezzo dulu ya, ...".`;

// Target utilisasi panjang: tiap post ditulis MENDEKATI batas maksimum (±90%),
// bukan one-liner. URL afiliasi (±30 char) wajib dihitung dalam budget post afiliasi.
export const AFFILIATE_URL_RESERVE_CHARS = 30;

function lengthTargetRule(maxChars: number | null): string | null {
  if (!maxChars || maxChars < 100) return null;
  const target = Math.floor(maxChars * 0.9);
  return `- LENGTH: each post (id and en separately) MUST be long and substantive — target ≥ ${target} chars (±90% of max ${maxChars}), as close to the limit as possible WITHOUT exceeding it. Each reply 3-5 sentences. Never write one-liners.`;
}

const EMOJI_RULE =
  '- EMOJI: include 1-2 relevant emoji per post (in both id and en) so the post feels alive. Emoji must relate to the content; never replace words with emoji.';

function urlBudgetRule(maxChars: number | null): string {
  const cap = maxChars ?? 500;
  return `- URL BUDGET: the affiliate reply holds {{PRODUCT_URL}} which becomes a ±${AFFILIATE_URL_RESERVE_CHARS}-char real URL. Keep (reply text + ${AFFILIATE_URL_RESERVE_CHARS}) ≤ ${cap} AND (reply text + URL) ≥ 90% of ${cap}. Reserve room for the URL — shorten the lead-in sentence if needed, never drop the URL.`;
}

export function buildThreadPrompt(
  input: ThreadPromptInput,
  product: AffiliateProductForPrompt
): { system: string; user: string } {
  const n = input.targetReplyCount ?? 0;
  const replyRule =
    n >= 3
      ? `- Produce EXACTLY ${n} replies total: ${n - 1} CONTENT replies (each adds NEW information — fact, tip, sub-angle, jangan repetisi) + 1 AFFILIATE reply (the {{PRODUCT_URL}} reply in the middle). The affiliate reply is EXTRA, not one of the content replies.`
      : n > 0
        ? `- Produce EXACTLY ${n} replies. Spread the topic detail/angle across all ${n} replies — each reply must add NEW information (a fact, a tip, a sub-angle), jangan repetisi.`
        : '- Replies: 0-2 for twitter, 0-3 for threads, 0-1 for others. Empty replies array if not needed.';

  const fallbackBridge = input.isFallbackRandom
    ? '- FALLBACK RANDOM: produk dipilih random dari 20 terbaru, mungkin tidak 1:1 dengan topik. Reply yang berisi {{PRODUCT_URL}} WAJIB diawali 1-2 kalimat jembatan natural yang menghubungkan topik ke produk (analogi, use-case WFH/lifestyle, transisi kebutuhan). Jangan hard-sell, jangan klaim fitur yang tidak ada di nama produk. Natural soft-sell.'
    : null;

  const lengthRule = lengthTargetRule(input.platform.maxChars);

  const system = [
    'You are a senior copywriter for Asharu (asharu.id), bilingual ID+EN, helpful and authentic.',
    'You write short-form content for Threads/Twitter/Instagram/TikTok/LinkedIn/Facebook.',
    'Rules:',
    '- Output JSON ONLY with shape: {"main":{"id":"...","en":"..."},"replies":[{"id":"...","en":"..."}]}',
    '- Text murni tanpa markdown, tanpa bullet, tanpa formatting berlebihan.',
    '- MAIN POST: 2-3 kalimat yang padat dan mendekati batas karakter. Buka dengan hook KUAT (angka mengejutkan, pertanyaan provokatif, atau klaim kontra-intuitif) yang memaksa reader berhenti scroll dan membuka thread. Jangan taruh seluruh detail/fakta di main — main hanya pengantar yang bikin penasaran.',
    `- DISTRIBUSI KONTEN: detail, fakta, tips, dan sub-angle HARUS didistribusikan ke reply-reply secara bertahap (satu poin per reply). Jangan ringkas semua di main.`,
    replyRule,
    '- Each post must respect max_chars for the platform (HARD LIMIT — never exceed).',
    ...(lengthRule ? [lengthRule] : []),
    EMOJI_RULE,
    urlBudgetRule(input.platform.maxChars),
    '- Tone, audience, CTA style, purpose, and constraints must be respected.',
    '- AFFILIATE PLACEMENT: tempatkan {{PRODUCT_URL}} di reply TENGAH (atau kedua terakhir jika genap). DILARANG menempatkan {{PRODUCT_URL}} di main post.',
    '- AFFILIATE STYLE: reply yang berisi {{PRODUCT_URL}} wajib dibungkus 1-2 kalimat basa-basi konversasional yang menjelaskan kenapa produk ini relevan dengan topik (natural soft-sell). DILARANG menaruh bare link tanpa konteks/kalimat pengantar.',
    AFFILIATE_OPENER_RULE,
    ...(fallbackBridge ? [fallbackBridge] : []),
    '- Inject EXACTLY 1 occurrence of {{PRODUCT_URL}}.',
    '- BAHASA: Output HANYA huruf Latin, angka, tanda baca standar, dan emoji relevan. DILARANG karakter CJK/Chinese/Kanji/Hangul/Katakana/Hiragana. Tulis ID & EN dalam bahasa yang benar.',
    '- Jangan tinggalkan slot kata/nama kosong di kalimat (mis. "produk dari ___"). Nama produk diwakili link {{PRODUCT_URL}}; jangan buat kalimat dengan placeholder kosong.'
  ].join('\n');

  const maxCharsNote = input.platform.maxChars
    ? `Max chars per post for ${input.platform.slug}: ${input.platform.maxChars}.`
    : 'No strict char limit, keep concise.';

  const user = [
    `Topic/angle: ${input.topic}`,
    `Platform: ${input.platform.slug} — ${maxCharsNote}`,
    `Tone: ${input.tone}`,
    `Audience: ${input.audience}`,
    `CTA style: ${input.ctaStyle}`,
    `Purpose: ${input.purpose}`,
    input.targetCategory ? `Target category hint: ${input.targetCategory}` : null,
    input.constraints ? `Constraints: ${input.constraints}` : null,
    input.keywords ? `Keywords: ${input.keywords}` : null,
    input.hooks && input.hooks.length > 0 ? `Hooks (pilih satu sebagai pembuka main post): ${input.hooks.join(' | ')}` : null,
    input.keyFacts && input.keyFacts.length > 0 ? `Key facts (distribusikan ke reply-reply): ${input.keyFacts.join(' | ')}` : null,
    input.uniqueAngle ? `Unique angle: ${input.uniqueAngle}` : null,
    `Language: ${input.language} (if both, fill id and en for every post)`,
    '',
    `Available affiliate product (MUST use exactly once, in a middle/second-to-last reply):`,
    `- ${product.friendlyCode}: ${product.name} — {{PRODUCT_URL}} — category ${product.category}`,
    `- URL to inject: {{PRODUCT_URL}} (verbatim, will be replaced with ${product.url})`,
    '',
    'Generate now.'
  ]
    .filter(Boolean)
    .join('\n');

  return { system, user };
}

export function countProductPlaceholders(text: string): number {
  const m = text.match(/\{\{PRODUCT_URL\}\}/g);
  return m ? m.length : 0;
}

export function countPlaceholdersInThread(thread: { main: { id: string; en: string }; replies: { id: string; en: string }[] }): number {
  const all = [thread.main.id, thread.main.en, ...thread.replies.flatMap((r) => [r.id, r.en])].join(' ');
  return countProductPlaceholders(all);
}

export interface SingleReplyRewriteInput {
  topic: string;
  language: string;
  tone?: string | null;
  targetIndex: number; // 0=main, 1..n = reply[targetIndex-1]
  threadJson: { main: { id: string; en: string }; replies: { id: string; en: string }[] };
  maxChars?: number | null;
}

export function buildSingleReplyRewritePrompt(
  input: SingleReplyRewriteInput,
  product: AffiliateProductForPrompt
): { system: string; user: string } {
  const targetLabel = input.targetIndex === 0 ? 'MAIN POST' : `REPLY ${input.targetIndex}`;
  const currentTarget = input.targetIndex === 0
    ? input.threadJson.main
    : input.threadJson.replies[input.targetIndex - 1] ?? { id: '', en: '' };
  const system = [
    'You are a senior copywriter for Asharu (asharu.id), bilingual ID+EN, helpful and authentic.',
    'TASK: Rewrite ONLY ONE reply in an existing thread to insert a new affiliate product naturally.',
    `Target: ${targetLabel} (keep all other posts IDENTICAL — do not change them).`,
    'Rules:',
    '- Output JSON ONLY with shape: {"id":"...","en":"..."} — just the rewritten single post, no wrapper, no thread.',
    '- Text murni tanpa markdown, tanpa bullet.',
    '- WAJIB sisipkan {{PRODUCT_URL}} tepat 1 kali di dalam reply ini.',
    '- WAJIB 1-2 kalimat jembatan natural yang menghubungkan topik ke produk (analogi, use-case WFH/lifestyle, transisi kebutuhan). Jangan bare link tanpa konteks.',
    AFFILIATE_OPENER_RULE,
    '- Jika produk tampak tidak 1:1 dengan topik (random fallback), tetap buat jembatan soft-sell yang natural — jangan klaim fitur tidak ada di nama produk, jangan hard-sell.',
    '- BAHASA: HANYA huruf Latin, angka, tanda baca standar, emoji relevan. DILARANG CJK.',
    '- Language: follow input language (id/en/both — fill id and en accordingly).',
    ...(input.tone ? [`- Tone: ${input.tone}`] : []),
    ...(input.maxChars ? [`- Max chars per post for rewrite: ${input.maxChars} (HARUS patuh — HARD LIMIT, never exceed).`] : []),
    ...(lengthTargetRule(input.maxChars ?? null) ? [lengthTargetRule(input.maxChars ?? null)!] : []),
    EMOJI_RULE,
    urlBudgetRule(input.maxChars ?? null),
    '- Jangan tinggalkan placeholder kosong (mis. "produk dari ___"). Link diwakili {{PRODUCT_URL}}.'
  ].join('\n');

  const threadPretty = JSON.stringify(input.threadJson, null, 2);
  const user = [
    `Topic: ${input.topic}`,
    `Language: ${input.language}`,
    `Target to rewrite: ${targetLabel}`,
    `Current text at target (for rewrite reference): id="${currentTarget.id}" | en="${currentTarget.en}"`,
    '',
    `Full thread context (DO NOT rewrite these other posts — hanya untuk konteks):`,
    threadPretty,
    '',
    `New affiliate product (MUST use exactly once via {{PRODUCT_URL}}):`,
    `- ${product.friendlyCode}: ${product.name} — {{PRODUCT_URL}} — category ${product.category}`,
    `- URL placeholder: {{PRODUCT_URL}} (verbatim, will be replaced with ${product.url})`,
    '',
    'Rewrite now — output only {"id":"...","en":"..."} for the target.'
  ].join('\n');

  return { system, user };
}
