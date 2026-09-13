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
  /** Struktur template riset pilihan user (opsional, dari research_templates). */
  templateStructure?: string | null;
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
  // Cap kecil (mis. twitter 280): 3-5 kalimat substantif hampir pasti
  // melebihi batas bila dipaksa ≥90%. Tier rendah: 2-3 kalimat pendek,
  // lebih baik pendek daripada melebihi (kasus 165c29c2: twitter over semua).
  if (maxChars <= 300) {
    const target = Math.floor(maxChars * 0.7);
    return `- LENGTH: each post (id and en separately) MUST be concise — 2-3 SHORT sentences, target ≥ ${target} chars (±70% of max ${maxChars}) and NEVER exceed ${maxChars}. Shorter is better than over-limit.`;
  }
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

  const templateRule = input.templateStructure
    ? `- TEMPLATE STRUKTUR (WAJIB diikuti — atur urutan main + reply-reply sesuai alur ini): ${input.templateStructure}`
    : null;

  const system = [
    'You are a senior copywriter for Asharu (asharu.id), bilingual ID+EN, helpful and authentic.',
    'You write short-form content for Threads/Twitter/Instagram/TikTok/LinkedIn/Facebook.',
    'Rules:',
    '- Output JSON ONLY with shape: {"main":{"id":"...","en":"..."},"replies":[{"id":"...","en":"..."}]}',
    '- Text murni tanpa markdown, tanpa bullet, tanpa formatting berlebihan.',
    '- MAIN POST: 2-3 kalimat yang padat dan mendekati batas karakter. Buka dengan hook KUAT (angka mengejutkan, pertanyaan provokatif, atau klaim kontra-intuitif) yang memaksa reader berhenti scroll dan membuka thread. Jangan taruh seluruh detail/fakta di main — main hanya pengantar yang bikin penasaran.',
    `- DISTRIBUSI KONTEN: detail, fakta, tips, dan sub-angle HARUS didistribusikan ke reply-reply secara bertahap (satu poin per reply). Jangan ringkas semua di main.`,
    replyRule,
    ...(templateRule ? [templateRule] : []),
    '- Each post must respect max_chars for the platform (HARD LIMIT — never exceed).',
    ...(lengthRule ? [lengthRule] : []),
    EMOJI_RULE,
    urlBudgetRule(input.platform.maxChars),
    '- Tone, audience, CTA style, purpose, and constraints must be respected.',
    '- AFFILIATE PLACEMENT: tempatkan {{PRODUCT_URL}} di BALASAN 4 dari 7 balasan (reply index 3, yaitu reply ke-4 setelah 3 reply konten; BUKAN main post). DILARANG menempatkan {{PRODUCT_URL}} di main post atau reply lain.',
    '- AFFILIATE STYLE: reply yang berisi {{PRODUCT_URL}} WAJIB memuat NAMA PRODUK (persis seperti di blok produk) + dibungkus 1-2 kalimat basa-basi konversasional yang menjelaskan kenapa produk ini relevan dengan topik (natural soft-sell). Nama produk dan link TIDAK BOLEH terpisah di reply berbeda. DILARANG menaruh bare link tanpa konteks/kalimat pengantar.',
    AFFILIATE_OPENER_RULE,
    ...(fallbackBridge ? [fallbackBridge] : []),
    '- Inject EXACTLY 1 occurrence of {{PRODUCT_URL}}, di reply yang sama dengan NAMA PRODUK.',
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

export function countProductPlaceholders(text: string): number {  const m = text.match(/\{\{PRODUCT_URL\}\}/g);
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

/* ------------------------------------------------------------------ */
/* Artikel long-form (platform `artikel`, tujuan SEO)                  */
/* ------------------------------------------------------------------ */

export interface ArticlePromptInput {
  topic: string;
  tone: string;
  audience: string;
  ctaStyle: string;
  purpose: string;
  constraints?: string | null;
  keywords?: string | null;
  /** 'id' | 'en' | 'both' — bahasa yang wajib diisi. */
  language: string;
  targetCategory?: string | null;
  hooks?: string[] | null;
  keyFacts?: string[] | null;
  uniqueAngle?: string | null;
  /** Struktur template riset pilihan user (opsional). */
  templateStructure?: string | null;
}

export interface ArticleSection {
  h2: string;
  body: string;
}

export interface ArticleFaq {
  q: string;
  a: string;
}

/** Satu artikel dalam satu bahasa. */
export interface ArticleLangDraft {
  title: string;
  slug: string;
  excerpt: string;
  sections: ArticleSection[];
  faq: ArticleFaq[];
  meta_title: string;
  meta_desc: string;
}

/** Hasil parse draf artikel: tiap bahasa terisi atau null. */
export interface ParsedArticleDraft {
  id: ArticleLangDraft | null;
  en: ArticleLangDraft | null;
}

/** Batas minimum kata agar layak publish (anti thin-content). */
export const ARTICLE_MIN_WORDS = 600;

function articleLangKeys(language: string): Array<'id' | 'en'> {
  if (language === 'en') return ['en'];
  if (language === 'id') return ['id'];
  return ['id', 'en'];
}

export function buildArticlePrompt(
  input: ArticlePromptInput,
  product: AffiliateProductForPrompt
): { system: string; user: string } {
  const langs = articleLangKeys(input.language);
  const langRule =
    langs.length === 2
      ? '- BAHASA: isi BOTH "id" dan "en" — keduanya artikel penuh yang dilokalkan natural (bukan terjemahan kata-per-kata kaku).'
      : `- BAHASA: isi HANYA "${langs[0]}" (isi bahasa lain dengan null).`;

  const templateRule = input.templateStructure
    ? `- TEMPLATE STRUKTUR (WAJIB diikuti — atur urutan section H2 sesuai alur ini): ${input.templateStructure}`
    : null;

  const system = [
    'You are a senior SEO copywriter for Asharu (asharu.id), bilingual ID+EN, helpful and authentic.',
    'You write long-form articles that rank on Google: clear H1-title, scannable H2 sections, FAQ, natural affiliate mention.',
    'Rules:',
    '- Output JSON ONLY with shape: {"id": <article|null>, "en": <article|null>} where <article> = {"title":"...","slug":"...","excerpt":"...","sections":[{"h2":"...","body":"..."}],"faq":[{"q":"...","a":"..."}],"meta_title":"...","meta_desc":"..."}',
    '- PANJANG: total isi (excerpt + semua body section) 800-1500 kata per bahasa. Tiap section body 150-300 kata, 4-7 sections. Jangan bertele-tele, tiap paragraf menambah informasi baru.',
    '- STRUKTUR: title = H1 yang memancing klik (10-70 karakter, masukkan keyword utama). excerpt 50-160 kata sebagai pengantar. sections = jawaban bertahap dari umum ke spesifik, H2 deskriptif (bukan "Pendahuluan"/"Kesimpulan" yang generik). faq 3-5 pasang Q&A yang benar-benar ditanyakan orang.',
    '- FAKTA: gunakan HANYA fakta dari blok konteks (key facts). Jangan mengarang data, angka, harga, atau klaim medis/finansial. Bila tidak yakin, tulis secara umum yang aman.',
    '- AFFILIATE: sisipkan {{PRODUCT_URL}} TEPAT 1 kali, inline di dalam body salah satu section tengah (bukan section pertama/terakhir), dibungkus 1-2 kalimat jembatan natural yang menjelaskan kenapa produk relevan + NAMA PRODUK persis seperti di blok produk. Jangan bare link tanpa konteks. Jangan hard-sell.',
    '- SLUG: huruf kecil, alfanumerik + strip saja (contoh: "tips-memilih-keyboard-mekanik-wfh"), 3-8 kata dari keyword utama.',
    '- META: meta_title ≤ 60 karakter (boleh = title bila sudah bagus), meta_desc 120-160 karakter yang memancing klik.',
    '- BAHASA: HANYA huruf Latin, angka, tanda baca standar. DILARANG karakter CJK. Tulis ID & EN yang benar dan natural.',
    langRule,
    ...(templateRule ? [templateRule] : []),
    '- Tone, audience, CTA style, purpose, dan constraints harus dihormati. CTA diletakkan natural di paragraf penutup.'
  ].join('\n');

  const user = [
    `Topic/angle: ${input.topic}`,
    `Tone: ${input.tone}`,
    `Audience: ${input.audience}`,
    `CTA style: ${input.ctaStyle}`,
    `Purpose: ${input.purpose}`,
    input.targetCategory ? `Target category hint: ${input.targetCategory}` : null,
    input.constraints ? `Constraints: ${input.constraints}` : null,
    input.keywords ? `Keywords (sebarkan natural di title/H2/body): ${input.keywords}` : null,
    input.hooks && input.hooks.length > 0 ? `Hooks (satu boleh jadi pembuka excerpt): ${input.hooks.join(' | ')}` : null,
    input.keyFacts && input.keyFacts.length > 0 ? `Key facts (fakta terverifikasi — HANYA ini yang boleh dipakai sebagai fakta): ${input.keyFacts.join(' | ')}` : null,
    input.uniqueAngle ? `Unique angle: ${input.uniqueAngle}` : null,
    `Language: ${input.language}`,
    '',
    `Available affiliate product (MUST mention exactly once via {{PRODUCT_URL}} with product name):`,
    `- ${product.friendlyCode}: ${product.name} — {{PRODUCT_URL}} — category ${product.category}`,
    `- URL placeholder: {{PRODUCT_URL}} (verbatim, will be replaced with ${product.url})`,
    '',
    'Generate now.'
  ]
    .filter(Boolean)
    .join('\n');

  return { system, user };
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0;
}

function parseArticleLang(raw: unknown): ArticleLangDraft | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (!isNonEmptyString(r.title) || r.title.trim().length > 200) return null;
  if (!isNonEmptyString(r.slug) || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(r.slug.trim())) return null;
  if (!isNonEmptyString(r.excerpt) || r.excerpt.trim().length < 50 || r.excerpt.trim().length > 2000) return null;
  if (!Array.isArray(r.sections) || r.sections.length < 3 || r.sections.length > 8) return null;
  const sections: ArticleSection[] = [];
  for (const s of r.sections) {
    if (!s || typeof s !== 'object') return null;
    const h2 = (s as Record<string, unknown>).h2;
    const body = (s as Record<string, unknown>).body;
    if (!isNonEmptyString(h2) || !isNonEmptyString(body)) return null;
    sections.push({ h2: h2.trim(), body: body.trim() });
  }
  const faqRaw = Array.isArray(r.faq) ? r.faq : [];
  if (faqRaw.length > 6) return null;
  const faq: ArticleFaq[] = [];
  for (const f of faqRaw) {
    if (!f || typeof f !== 'object') return null;
    const q = (f as Record<string, unknown>).q;
    const a = (f as Record<string, unknown>).a;
    if (!isNonEmptyString(q) || !isNonEmptyString(a)) return null;
    faq.push({ q: q.trim(), a: a.trim() });
  }
  if (!isNonEmptyString(r.meta_title) || r.meta_title.trim().length > 70) return null;
  if (!isNonEmptyString(r.meta_desc) || r.meta_desc.trim().length > 200) return null;
  return {
    title: (r.title as string).trim(),
    slug: (r.slug as string).trim(),
    excerpt: (r.excerpt as string).trim(),
    sections,
    faq,
    meta_title: (r.meta_title as string).trim(),
    meta_desc: (r.meta_desc as string).trim()
  };
}

/** Parse output LLM menjadi draf artikel. Null bila struktur tidak valid. */
export function parseArticleDraft(text: string): ParsedArticleDraft | null {
  let parsed: Record<string, unknown> | null = null;
  try {
    const cleaned = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
    parsed = JSON.parse(cleaned) as Record<string, unknown>;
  } catch {
    const m = text.match(/\{[\s\S]*\}/);
    if (m) {
      try {
        parsed = JSON.parse(m[0]) as Record<string, unknown>;
      } catch {
        parsed = null;
      }
    }
  }
  if (!parsed || typeof parsed !== 'object') return null;
  const id = parseArticleLang(parsed.id);
  const en = parseArticleLang(parsed.en);
  if (!id && !en) return null;
  return { id, en };
}

/** Hitung kata (excerpt + body semua section) untuk gate thin-content. */
export function countArticleWords(article: ArticleLangDraft): number {
  const text = [article.excerpt, ...article.sections.map((s) => s.body)].join(' ');
  return text.split(/\s+/).filter(Boolean).length;
}

/** Slugify judul sebagai fallback bila LLM memberi slug tak valid. */
export function slugifyTitle(title: string): string {
  const slug = title
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 80);
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) ? slug : 'artikel';
}
