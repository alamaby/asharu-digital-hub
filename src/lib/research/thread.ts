import { z } from 'zod';
import { countPlaceholdersInThread } from '@/lib/llm/prompt';
import type { ThreadGeneration } from '@/lib/llm/types';

// Batas replies diselaraskan dengan CHECK DB content_drafts.thread_shape.
// Migrasi 20260905000003: <=5 → <=10 agar TOTAL_REPLIES=7 (6 konten + 1 affiliate) lolos.
// Ubah di satu tempat ini + migrasi DB bila perlu menaikkan lagi.
export const MAX_THREAD_REPLIES_DB = 10;

// Maks pasangan (topik × platform) per tick developing agar cron maxDuration
// 300 dtk tidak timeout (1 pasangan ≈ ≤2 LLM call + retry-shorten).
export const DEVELOP_PAIRS_PER_TICK = 6;

export interface LengthIssue {
  post: number;
  lang: 'id' | 'en';
  chars: number;
  max: number;
}

/** Audit panjang tiap post (id + en, URL final) terhadap batas platform. */
export function auditThreadLength(
  thread: { main: { id: string; en: string }; replies: { id: string; en: string }[] },
  maxChars: number | null
): LengthIssue[] {
  if (maxChars == null) return [];
  const issues: LengthIssue[] = [];
  const posts = [thread.main, ...thread.replies];
  posts.forEach((p, i) => {
    (['id', 'en'] as const).forEach((lang) => {
      const len = (p[lang] ?? '').length;
      if (len > maxChars) issues.push({ post: i, lang, chars: len, max: maxChars });
    });
  });
  return issues;
}

const EMOJI_RE = /\p{Extended_Pictographic}/u;

/** True bila teks mengandung minimal 1 emoji. */
export function hasEmoji(text: string): boolean {
  return EMOJI_RE.test(text ?? '');
}

export interface EmojiGap {
  post: number;
  lang: 'id' | 'en';
}

/** Post yang tidak mengandung emoji sama sekali (aturan: 1-2 emoji per post). */
export function auditThreadEmoji(thread: {
  main: { id: string; en: string };
  replies: { id: string; en: string }[];
}): EmojiGap[] {
  const gaps: EmojiGap[] = [];
  const posts = [thread.main, ...thread.replies];
  posts.forEach((p, i) => {
    (['id', 'en'] as const).forEach((lang) => {
      if (!EMOJI_RE.test(p[lang] ?? '')) gaps.push({ post: i, lang });
    });
  });
  return gaps;
}

export const threadSchema = z.object({
  main: z.object({ id: z.string().min(1), en: z.string().min(1) }),
  replies: z
    .array(z.union([
      z.object({ id: z.string().min(1), en: z.string().min(1) }),
      // Toleransi: LLM kadang return string polos — coerce jadi {id,en} sama
      z.string().min(1).transform((s) => ({ id: s, en: s }))
    ]))
    .max(MAX_THREAD_REPLIES_DB)
});

const CJK_PATTERN = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uac00-\ud7af]/g;

export function sanitizeThreadText(s: string): string {
  // 2026-09-24: CJK di tengah kata Latin dipisah spasi agar tidak tersambung (anti过thinking → anti thinking).
  return s.replace(CJK_PATTERN, ' ').replace(/\s{2,}/g, ' ').trim();
}

function sanitizeThread(thread: ThreadGeneration): ThreadGeneration {
  return {
    main: { id: sanitizeThreadText(thread.main.id), en: sanitizeThreadText(thread.main.en) },
    replies: thread.replies.map((r) => ({
      id: sanitizeThreadText(r.id),
      en: sanitizeThreadText(r.en)
    }))
  };
}

// Label post sebagai konten — insiden 2026-09-24: repair emoji `03:24:06`
// mengembalikan "main"/"reply-N" sebagai isi field `id` dan menimpa thread bagus.
const PLACEHOLDER_POST_RE = /^\s*(main|reply-\d+|\d+)\s*$/i;

/** True bila teks hanya label post (mis. "main", "reply-3", "7"). String kosong BUKAN placeholder (ditangani skema). */
export function isPlaceholderPostText(text: string | null | undefined): boolean {
  if (!text) return false;
  return PLACEHOLDER_POST_RE.test(text);
}

type ThreadLike = { main: { id: string; en: string }; replies: { id: string; en: string }[] };

function countNonEmptyFields(thread: ThreadLike | null | undefined): number {
  if (!thread?.main) return 0;
  const fields = [thread.main.id, thread.main.en, ...(thread.replies ?? []).flatMap((r) => [r?.id, r?.en])];
  return fields.filter((f) => (f ?? '').trim().length > 0).length;
}

/** True bila thread berupa skeleton label (main.id placeholder ATAU ≥50% field placeholder). Null/undefined → false (jangan throw). */
export function isPlaceholderThread(thread: ThreadLike | null | undefined): boolean {
  if (!thread?.main) return false;
  const fields = [thread.main.id, thread.main.en, ...(thread.replies ?? []).flatMap((r) => [r?.id, r?.en])];
  if (fields.length === 0) return false;
  if (isPlaceholderPostText(thread.main.id)) return true;
  const bad = fields.filter((f) => isPlaceholderPostText(f ?? '')).length;
  return bad / fields.length >= 0.5;
}

/**
 * Guard penerimaan hasil repair LLM (emoji/length): tolak bila kandidat
 * skeleton, kehilangan bahasa, atau placeholder-nya bukan tepat 1.
 * Perbandingan jumlah emoji gap DILAKUKAN di caller development.ts
 * (butuh `auditThreadEmoji` + batas platform); fungsi ini hanya guard kualitas konten.
 */
export function shouldAcceptRepairThread(
  before: ThreadLike | null | undefined,
  after: ThreadLike | null | undefined
): boolean {
  if (!before || !after) return false;
  if (isPlaceholderThread(after)) return false;
  if (countNonEmptyFields(after) < countNonEmptyFields(before)) return false;
  if (countPlaceholdersInThread(after) !== 1) return false;
  return true;
}

const PLACEHOLDER = '{{PRODUCT_URL}}';
// Backstop opener mengikuti rule wajib (pilih varian natural; default "Btw,").
// Body dipisah dari opener agar prepend tidak menduplikasi opener.
const BASA_BASI_OPENER = 'Btw,';
const BASA_BASI_OPENER_EN = 'By the way,';
const BASA_BASI_BODY = `kalau ini relevan buat kamu, cek rekomendasinya di sini ya ${PLACEHOLDER}`;
const BASA_BASI_BODY_EN = `if this is relevant for you, check the pick here ${PLACEHOLDER}`;
const BASA_BASI_TEMPLATE = `${BASA_BASI_OPENER} ${BASA_BASI_BODY}`;
const BASA_BASI_TEMPLATE_EN = `${BASA_BASI_OPENER_EN} ${BASA_BASI_BODY_EN}`;

function findPlaceholderLocation(thread: {
  main: { id: string; en: string };
  replies: { id: string; en: string }[];
}): { post: 'main' | `reply-${number}`; field: 'id' | 'en' } | null {
  if (thread.main.id.includes(PLACEHOLDER)) return { post: 'main', field: 'id' };
  if (thread.main.en.includes(PLACEHOLDER)) return { post: 'main', field: 'en' };
  for (let i = 0; i < thread.replies.length; i++) {
    if (thread.replies[i]!.id.includes(PLACEHOLDER)) return { post: `reply-${i}` as const, field: 'id' };
    if (thread.replies[i]!.en.includes(PLACEHOLDER)) return { post: `reply-${i}` as const, field: 'en' };
  }
  return null;
}

function stripPlaceholder(s: string): string {
  return s.split(PLACEHOLDER).join('').replace(/\s{2,}/g, ' ').trim();
}

/**
 * Reposition the single {{PRODUCT_URL}} placeholder into a middle (or
 * second-to-last) reply. If the thread has no replies, the placeholder stays
 * in the main post as a fallback. Also applies a basa-basi backstop: if the
 * target reply text is a bare link (surrounding text < 20 chars), wraps the
 * placeholder in a conversational sentence.
 *
 * Tolerance: placeholder already within ±1 of the target is left alone —
 * LLM kini diinstruksikan reply eksak (Balasan 4 = index 3) sehingga koreksi
 * destruktif (kasus 679b2494: nama tertinggal, link pindah) tidak terjadi.
 *
 * Returns the repositioned thread plus the resolved post_index (0 = main,
 * k+1 = reply[k]) so callers can record accurate metadata.
 */
export function repositionPlaceholder(
  thread: ThreadGeneration,
  strategy: 'middle' | 'second_to_last' = 'middle'
): { thread: ThreadGeneration; postIndex: number } {
  const loc = findPlaceholderLocation(thread);
  if (!loc) return { thread, postIndex: 0 };

  if (thread.replies.length === 0) {
    return { thread, postIndex: 0 };
  }

  const n = thread.replies.length;
  let targetIdx: number;
  if (strategy === 'second_to_last') {
    targetIdx = Math.max(0, n - 2);
  } else {
    targetIdx = Math.floor(n / 2);
  }

  const targetPost: 'main' | `reply-${number}` = `reply-${targetIdx}`;
  if (loc.post === targetPost) {
    return { thread, postIndex: targetIdx + 1 };
  }
  // Toleransi ±1: reply LLM index 2 vs target 3 = Balasan 4 yang dimaksud
  // (LLM menghitung tanpa main). Pindah destruktif hanya bila jauh.
  if (loc.post !== 'main') {
    const locIdx = Number((loc.post as string).split('-')[1]);
    if (Number.isFinite(locIdx) && Math.abs(locIdx - targetIdx) <= 1) {
      return { thread, postIndex: locIdx + 1 };
    }
  }

  const remove = (s: string) => stripPlaceholder(s);
  const target = thread.replies[targetIdx]!;

  // Preserve the original surface (id or en) — the thread has exactly 1
  // placeholder, so we move that single token to the same surface of the
  // target reply to avoid introducing a second placeholder.
  const field: 'id' | 'en' = loc.field;
  const opener = field === 'en' ? BASA_BASI_OPENER_EN : BASA_BASI_OPENER;
  const body = field === 'en' ? BASA_BASI_BODY_EN : BASA_BASI_BODY;
  // Prepend opener di depan target agar reply diawali opener (sesuai AFFILIATE_OPENER_RULE),
  // bukan menempel di tengah kalimat. Target dijadikan lanjutan kalimat (lowercase awal).
  const lowered = target[field].charAt(0).toLowerCase() + target[field].slice(1);
  let newTargetText = target[field].includes(PLACEHOLDER)
    ? target[field]
    : `${opener} ${lowered} ${body}`;

  const textAround = (s: string) => s.replace(PLACEHOLDER, '').trim();
  if (textAround(newTargetText).length < 20) {
    newTargetText = field === 'en' ? BASA_BASI_TEMPLATE_EN : BASA_BASI_TEMPLATE;
  }

  const newThread: ThreadGeneration = {
    main: {
      id: loc.post === 'main' && loc.field === 'id' ? remove(thread.main.id) : thread.main.id,
      en: loc.post === 'main' && loc.field === 'en' ? remove(thread.main.en) : thread.main.en
    },
    replies: thread.replies.map((r, i) => {
      if (i === targetIdx) {
        return field === 'id' ? { id: newTargetText, en: r.en } : { id: r.id, en: newTargetText };
      }
      if (loc.post === `reply-${i}`) {
        return {
          id: loc.field === 'id' ? remove(r.id) : r.id,
          en: loc.field === 'en' ? remove(r.en) : r.en
        };
      }
      return r;
    })
  };

  return { thread: newThread, postIndex: targetIdx + 1 };
}

export function normalizePlaceholder(thread: {
  main: { id: string; en: string };
  replies: { id: string; en: string }[];
}): { main: { id: string; en: string }; replies: { id: string; en: string }[] } {
  const total = countPlaceholdersInThread(thread);
  if (total === 1) return thread;
  if (total === 0) {
    return {
      main: { id: `${thread.main.id} {{PRODUCT_URL}}`.trim(), en: thread.main.en },
      replies: thread.replies
    };
  }
  let kept = false;
  const strip = (s: string): string =>
    s.replace(/\{\{PRODUCT_URL\}\}/g, () => (kept ? '' : (kept = true, '{{PRODUCT_URL}}')));
  return {
    main: { id: strip(thread.main.id), en: strip(thread.main.en) },
    replies: thread.replies.map((r) => ({ id: strip(r.id), en: strip(r.en) }))
  };
}

/**
 * Heuristik duplicate-key `"id"`: tolak bila kemunculan `"id":` melebihi
 * jumlah post + 2. Ambang +2 menutup kasus insiden (7 post vs 14+ kemunculan)
 * tanpa false positive bila kata `"id"` muncul sekali di dalam teks.
 */
function hasExcessIdKeys(trimmed: string, postCount: number): boolean {
  const occurrences = trimmed.match(/"id"\s*:/g)?.length ?? 0;
  return occurrences >= postCount + 2;
}

export function parseThread(text: string): ThreadGeneration | null {
  const trimmed = text.replace(/^```(?:json)?/i, '').replace(/```\s*$/i, '').trim();
  let raw: unknown;
  try {
    raw = JSON.parse(trimmed);
  } catch {
    const m = trimmed.match(/\{[\s\S]*\}/);
    if (!m) return null;
    try {
      raw = JSON.parse(m[0]);
    } catch {
      return null;
    }
  }
  const parsed = threadSchema.safeParse(raw);
  if (!parsed.success) return null;
  const t = parsed.data;
  // 2026-09-24: duplicate-key (id ganda per reply, kasus attempt-1 03:23:40)
  // ditolak agar retry suhu 0.3 memproduksi JSON bersih; skeleton label
  // (kasus repair 03:24:06) ditolak via isPlaceholderThread.
  if (hasExcessIdKeys(trimmed, 1 + t.replies.length)) return null;
  if (isPlaceholderThread(t)) return null;
  const normalized = normalizePlaceholder(t);
  if (countPlaceholdersInThread(normalized) !== 1) return null;
  return sanitizeThread(normalized);
}

export function replacePlaceholders(thread: ThreadGeneration, productUrl: string): ThreadGeneration {
  const repl = (s: string) => s.split('{{PRODUCT_URL}}').join(productUrl);
  return {
    main: { id: repl(thread.main.id), en: repl(thread.main.en) },
    replies: thread.replies.map((r: { id: string; en: string }) => ({ id: repl(r.id), en: repl(r.en) }))
  };
}
