import { z } from 'zod';
import { countPlaceholdersInThread } from '@/lib/llm/prompt';
import type { ThreadGeneration } from '@/lib/llm/types';

// Batas replies diselaraskan dengan CHECK DB content_drafts.thread_shape.
// Migrasi 20260905000003: <=5 → <=10 agar TOTAL_REPLIES=7 (6 konten + 1 affiliate) lolos.
// Ubah di satu tempat ini + migrasi DB bila perlu menaikkan lagi.
export const MAX_THREAD_REPLIES_DB = 10;

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
  return s.replace(CJK_PATTERN, '').replace(/\s{2,}/g, ' ').trim();
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
