import { z } from 'zod';
import { countPlaceholdersInThread } from '@/lib/llm/prompt';
import type { ThreadGeneration } from '@/lib/llm/types';

export const threadSchema = z.object({
  main: z.object({ id: z.string().min(1), en: z.string().min(1) }),
  replies: z
    .array(z.object({ id: z.string().min(1), en: z.string().min(1) }))
    .max(5)
});

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
  return normalized;
}

export function replacePlaceholders(thread: ThreadGeneration, productUrl: string): ThreadGeneration {
  const repl = (s: string) => s.split('{{PRODUCT_URL}}').join(productUrl);
  return {
    main: { id: repl(thread.main.id), en: repl(thread.main.en) },
    replies: thread.replies.map((r: { id: string; en: string }) => ({ id: repl(r.id), en: repl(r.en) }))
  };
}
