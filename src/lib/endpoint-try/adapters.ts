import type {
  EndpointChatMessage,
  EndpointChatResult
} from './types';

// ─────────────────────────────────────────────────────────────────────────────
// Normalisasi model list (OpenAI-compatible / Anthropic)
// ─────────────────────────────────────────────────────────────────────────────

function toArray(v: unknown): unknown[] {
  if (Array.isArray(v)) return v;
  if (v != null && typeof v === 'object') return [v];
  return [];
}

export function normalizeOpenAIModels(json: unknown): {
  id: string;
  ownedBy: string | null;
}[] {
  const obj = json as Record<string, unknown> | undefined;
  if (!obj) return [];
  const items = toArray(obj.data);
  return items
    .map((it) => {
      const r = it as Record<string, unknown> | null;
      if (!r || typeof r.id !== 'string' || !r.id) return null;
      return {
        id: r.id,
        ownedBy:
          (typeof r.owned_by === 'string' && r.owned_by) ||
          (typeof r.ownedBy === 'string' && r.ownedBy) ||
          null
      };
    })
    .filter((v): v is { id: string; ownedBy: string | null } => v !== null) as {
    id: string;
    ownedBy: string | null;
  }[];
}

export function normalizeAnthropicModels(json: unknown): {
  id: string;
  ownedBy: string | null;
}[] {
  const obj = json as Record<string, unknown> | undefined;
  if (!obj) return [];
  const items = toArray(obj.data);
  return items
    .map((it) => {
      const r = it as Record<string, unknown> | null;
      if (!r || typeof r.id !== 'string' || !r.id) return null;
      return {
        id: r.id,
        ownedBy:
          (typeof r.owned_by === 'string' && r.owned_by) ||
          (typeof r.ownedBy === 'string' && r.ownedBy) ||
          null
      };
    })
    .filter(Boolean) as { id: string; ownedBy: string | null }[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Builder body request
// ─────────────────────────────────────────────────────────────────────────────

function omitUndefined<T extends Record<string, unknown>>(obj: T): T {
  return Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== undefined)
  ) as T;
}

export function buildOpenAIChatBody(params: {
  model: string;
  messages: EndpointChatMessage[];
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
}): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model: params.model,
    messages: params.messages,
    ...(params.temperature != null && { temperature: params.temperature }),
    ...(params.maxTokens != null && { max_tokens: params.maxTokens }),
    ...(params.stream === true && { stream: true })
  };
  return omitUndefined(body);
}

export function buildAnthropicChatBody(params: {
  model: string;
  system?: string;
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  temperature?: number;
  maxTokens: number;
  stream?: boolean;
}): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model: params.model,
    messages: params.messages,
    max_tokens: params.maxTokens,
    ...(params.system && { system: params.system }),
    ...(params.temperature != null && { temperature: params.temperature }),
    stream: params.stream === true ? true : false
  };
  return omitUndefined(body);
}

// ─────────────────────────────────────────────────────────────────────────────
// Normalisasi response chat
// ─────────────────────────────────────────────────────────────────────────────

function num(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}

function extractTextFromContent(content: unknown): string {
  if (typeof content === 'string' && content.trim()) return content.trim();
  if (Array.isArray(content)) {
    const joined = content
      .map((part) => {
        if (typeof part === 'string') return part;
        if (
          part != null &&
          typeof part === 'object' &&
          'type' in part &&
          'text' in part
        ) {
          return typeof part.text === 'string' ? part.text : '';
        }
        return '';
      })
      .join('')
      .trim();
    if (joined) return joined;
  }
  return '';
}

export function normalizeOpenAIChat(
  json: unknown
): EndpointChatResult {
  const obj = json as Record<string, unknown> | undefined;
  if (!obj)
    return {
      text: '',
      usage: null,
      finishReason: null,
      latencyMs: 0,
      tokensPerSec: null
    };
  const choices = obj.choices as
    | Array<{
        message?: {
          content?: unknown;
          text?: string;
          tool_calls?: unknown;
        };
        finish_reason?: string | null;
        text?: string;
      }>
    | undefined;
  const choice = choices?.[0];
  const msg = choice?.message;
  let text = '';
  if (msg) {
    const c = extractTextFromContent(msg.content);
    if (c) text = c;
    else if (typeof msg.text === 'string' && msg.text.trim())
      text = msg.text.trim();
    else if (typeof choice.text === 'string' && choice.text.trim())
      text = choice.text.trim();
  }
  const rawUsage = obj.usage as Record<string, unknown> | undefined;
  const prompt =
    num(rawUsage?.prompt_tokens) ??
    num(rawUsage?.promptTokens) ??
    num(rawUsage?.input_tokens) ??
    num(rawUsage?.prompt_eval_count);
  const completion =
    num(rawUsage?.completion_tokens) ??
    num(rawUsage?.completionTokens) ??
    num(rawUsage?.output_tokens) ??
    num(rawUsage?.eval_count);
  const total = num(rawUsage?.total_tokens) ?? num(rawUsage?.totalTokens);
  const usage =
    prompt === undefined && completion === undefined && total === undefined
      ? null
      : {
          promptTokens: prompt ?? 0,
          completionTokens: completion ?? 0,
          totalTokens: total
        };
  return {
    text,
    usage,
    finishReason: choice?.finish_reason ?? null,
    latencyMs: 0,
    tokensPerSec: null
  };
}

export function normalizeAnthropicChat(
  json: unknown
): EndpointChatResult {
  const obj = json as Record<string, unknown> | undefined;
  if (!obj)
    return {
      text: '',
      usage: null,
      finishReason: null,
      latencyMs: 0,
      tokensPerSec: null
    };
  const content = obj.content as Array<Record<string, unknown>> | undefined;
  let text = '';
  if (Array.isArray(content)) {
    text = content
      .map((block) => {
        if (block.type === 'text' && typeof block.text === 'string')
          return block.text;
        return '';
      })
      .join('')
      .trim();
  }
  const rawUsage = obj.usage as Record<string, unknown> | undefined;
  const prompt =
    num(rawUsage?.prompt_tokens) ??
    num(rawUsage?.promptTokens) ??
    num(rawUsage?.input_tokens);
  const completion =
    num(rawUsage?.completion_tokens) ??
    num(rawUsage?.completionTokens) ??
    num(rawUsage?.output_tokens);
  const total = num(rawUsage?.total_tokens) ?? num(rawUsage?.totalTokens);
  const usage =
    prompt === undefined && completion === undefined && total === undefined
      ? null
      : {
          promptTokens: prompt ?? 0,
          completionTokens: completion ?? 0,
          totalTokens: total
        };
  return {
    text,
    usage,
    finishReason:
      ((typeof obj.stop_reason === 'string' && obj.stop_reason) ||
        null) as string | null,
    latencyMs: 0,
    tokensPerSec: null
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// SSE parser (client-side friendly; read-only, no network)
// ─────────────────────────────────────────────────────────────────────────────

export function parseSseChunks(sseText: string): string[] {
  const chunks: string[] = [];
  let buffer = '';
  const lines = sseText.split('\n');
  // SSE allows fields prefixed with an optional label and colon. Standard field
  // name is "data". Lines starting with ':' alone are comments and must be skipped.
  // A line like ":data: x" carries no data: prefix — skip it.
  // Only lines whose first token (after optional colon-prefix) is "data:" carry payload.
  for (const raw of lines) {
    const line = raw.trimEnd();
    // Comment-only lines: a single colon or colon followed by non-data content.
    if (/^:(?:\s|$)/.test(line)) continue;
    if (!line) {
      // Flush any accumulated buffer when a blank line arrives.
      if (buffer) {
        const trimmed = buffer.trim();
        if (trimmed && trimmed !== '[DONE]') {
          chunks.push(trimmed);
        }
        buffer = '';
      }
      continue;
    }
    // Strip optional leading colon-label prefix (e.g. ":data:" → "data:") before
    // checking for the standard "data:" field.
    const stripped = line.replace(/^:+/, '');
    if (stripped.startsWith('data:')) {
      buffer = stripped.slice(5).trimStart();
    } else {
      // Non-data, non-comment line: append to buffer until a blank line flushes it.
      buffer += line;
    }
  }
  // Flush trailing buffer (no final blank line).
  if (buffer) {
    const trimmed = buffer.trim();
    if (trimmed && trimmed !== '[DONE]') {
      chunks.push(trimmed);
    }
  }
  return chunks;
}

export function extractOpenAIStreamText(dataPayload: string): string | null {
  try {
    const obj = JSON.parse(dataPayload) as Record<string, unknown> | null;
    if (!obj) return null;
    // Standard OpenAI SSE chunk shape: {choices:[{delta:{content:...}}]}
    const choices = obj.choices as
      | Array<{
          delta?: { content?: string | null; text?: string | null };
          text?: string | null;
        }>
      | undefined;
    const delta = choices?.[0]?.delta;
    if (typeof delta?.content === 'string' && delta.content) return delta.content;
    if (typeof delta?.text === 'string' && delta.text) return delta.text;
    // Fallback for non-standard payloads exposing delta directly
    if (typeof (obj as { delta?: { content?: string; text?: string } }).delta?.content === 'string') {
      return (obj as { delta?: { content?: string } }).delta!.content!;
    }
    return null;
  } catch {
    return null;
  }
}

export function extractAnthropicStreamText(dataPayload: string): string | null {
  try {
    const obj = JSON.parse(dataPayload) as Record<string, unknown> | null;
    if (!obj) return null;
    // Non-event chunks (inline content blocks)
    const objWithDelta = obj as {
      type?: string;
      delta?: Record<string, unknown>;
    };
    if (objWithDelta.type === 'content_block_delta' && typeof objWithDelta.delta?.text === 'string')
      return objWithDelta.delta.text as string;
    // Delta event (streaming response format)
    const delta = objWithDelta.delta as Record<string, unknown> | undefined;
    if (delta && typeof delta.text === 'string') return delta.text as string;
    return null;
  } catch {
    return null;
  }
}

/** Hitung kecepatan token per detik; kembali null bila tak bisa dihitung. */
export function tokensPerSec(
  completion: number | null,
  latencyMs: number | null
): number | null {
  if (completion == null || latencyMs == null || latencyMs === 0) return null;
  return parseFloat(((completion / latencyMs) * 1000).toFixed(2));
}
