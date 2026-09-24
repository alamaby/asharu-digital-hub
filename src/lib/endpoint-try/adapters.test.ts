import { describe, expect, it } from 'vitest';
import {
  buildAnthropicChatBody,
  buildOpenAIChatBody,
  extractAnthropicStreamText,
  extractOpenAIStreamText,
  normalizeAnthropicChat,
  normalizeAnthropicModels,
  normalizeOpenAIModels,
  normalizeOpenAIChat,
  parseSseChunks,
  tokensPerSec
} from './adapters';

describe('adapters — normalizeOpenAIModels', () => {
  it('array data → 2 item; item tanpa id dilewati', () => {
    const json = {
      data: [{ id: 'a' }, {}, { id: 'b', owned_by: 'org-o' }]
    };
    const out = normalizeOpenAIModels(json);
    expect(out).toHaveLength(2);
    expect(out[0]).toEqual({ id: 'a', ownedBy: null });
    expect(out[1]).toEqual({ id: 'b', ownedBy: 'org-o' });
  });
  it('payload bukan objek → kosong', () => {
    expect(normalizeOpenAIModels(null)).toEqual([]);
    expect(normalizeOpenAIModels('hello')).toEqual([]);
  });
});

describe('adapters — normalizeAnthropicModels', () => {
  it('Anthropic shape → 1 item', () => {
    const json = { data: [{ id: 'claude-3-opus' }] };
    const out = normalizeAnthropicModels(json);
    expect(out).toHaveLength(1);
    expect(out[0]?.id).toBe('claude-3-opus');
  });
  it('item tanpa id di-skip', () => {
    const json = { data: [{ id: 'x' }, {}] };
    const out = normalizeAnthropicModels(json);
    expect(out).toHaveLength(1);
    expect(out[0]?.id).toBe('x');
  });
});

describe('adapters — buildOpenAIChatBody', () => {
  it('tanpa response_format', () => {
    const body = buildOpenAIChatBody({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: 'hi' }],
      temperature: 0.7,
      maxTokens: 256,
      stream: true
    });
    expect(body).toMatchObject({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: 'hi' }],
      temperature: 0.7,
      max_tokens: 256,
      stream: true
    });
    expect('response_format' in body).toBe(false);
  });
  it('null temperature/maxTokens dihilangkan', () => {
    const body = buildOpenAIChatBody({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: 'hi' }]
    });
    expect('temperature' in body).toBe(false);
    expect('max_tokens' in body).toBe(false);
    expect('stream' in body).toBe(false);
  });
  it('content array tetap array saat masuk body (tanpa flattening)', () => {
    // Adaptor tidak meratakan — biarkan upstream menangani bila perlu.
    const body = buildOpenAIChatBody({
      model: 'm',
      messages: [{ role: 'system', content: 'sys' }, { role: 'user', content: 'u' }]
    });
    expect((body.messages as Array<{ role: string; content: string }>).length).toBe(2);
  });
});

describe('adapters — buildAnthropicChatBody', () => {
  it('system terpisah, default max_tokens=1024 saat tidak diberikan', () => {
    const body = buildAnthropicChatBody({
      model: 'claude-3-haiku',
      system: 'You are helpful.',
      messages: [{ role: 'user', content: 'hi' }],
      maxTokens: 256
    });
    expect(body).toMatchObject({
      model: 'claude-3-haiku',
      system: 'You are helpful.',
      messages: [{ role: 'user', content: 'hi' }],
      max_tokens: 256
    });
  });
  it('stream default false, tetap ada boolean', () => {
    const body = buildAnthropicChatBody({
      model: 'claude-3-haiku',
      messages: [{ role: 'user', content: 'hi' }],
      maxTokens: 256
    });
    expect(body).toHaveProperty('stream', false);
  });
  it('system kosong disembunyikan', () => {
    const body = buildAnthropicChatBody({
      model: 'c',
      messages: [{ role: 'user', content: 'hi' }],
      maxTokens: 256
    });
    expect('system' in body).toBe(false);
  });
});

describe('adapters — normalizeOpenAIChat', () => {
  it('choices[0].message.content string → text', () => {
    const json = {
      choices: [
        {
          message: { content: 'Halo dunia' },
          finish_reason: 'stop'
        }
      ],
      usage: { prompt_tokens: 5, completion_tokens: 7, total_tokens: 12 }
    };
    const out = normalizeOpenAIChat(json);
    expect(out.text).toBe('Halo dunia');
    expect(out.finishReason).toBe('stop');
    expect(out.usage).toEqual({
      promptTokens: 5,
      completionTokens: 7,
      totalTokens: 12
    });
  });
  it('snake/camel usage normalisasi', () => {
    const json = {
      choices: [{ message: { content: 'x' }, finish_reason: null }],
      usage: { promptTokens: 1, completionTokens: 2 }
    };
    const out = normalizeOpenAIChat(json);
    expect(out.usage?.promptTokens).toBe(1);
    expect(out.usage?.completionTokens).toBe(2);
  });
  it('non-json input → teks kosong', () => {
    const out = normalizeOpenAIChat('hello');
    expect(out.text).toBe('');
    expect(out.usage).toBeNull();
  });
  it('content array text parts digabung', () => {
    const json = {
      choices: [
        { message: { content: [{ type: 'text', text: 'A' }, { type: 'text', text: 'B' }] }, finish_reason: null }
      ]
    };
    const out = normalizeOpenAIChat(json);
    expect(out.text).toBe('AB');
  });
});

describe('adapters — normalizeAnthropicChat', () => {
  it('content blocks joined', () => {
    const json = {
      content: [
        { type: 'text', text: 'Hi' },
        { type: 'text', text: '!' },
        { type: 'thinking', text: '...' }
      ],
      usage: { input_tokens: 3, output_tokens: 2 },
      stop_reason: 'end_turn'
    };
    const out = normalizeAnthropicChat(json);
    expect(out.text).toBe('Hi!');
    expect(out.finishReason).toBe('end_turn');
    expect(out.usage).toEqual({ promptTokens: 3, completionTokens: 2 });
  });
  it('non-json input → teks kosong', () => {
    const out = normalizeAnthropicChat('hello');
    expect(out.text).toBe('');
    expect(out.usage).toBeNull();
  });
});

describe('adapters — SSE parsing', () => {
  it('parses OpenAI SSE chunks, ignores [DONE]', () => {
    const sse = `data: {"a":1}\n\ndata: {"a":2}\n\ndata: [DONE]\n\n`;
    const chunks = parseSseChunks(sse);
    expect(chunks).toEqual(['{"a":1}', '{"a":2}']);
  });
  it('extractOpenAIStreamText returns delta content text', () => {
    // OpenAI Streaming: {"choices":[{"delta":{"content":"hi"}}]}
    expect(
      extractOpenAIStreamText('{"choices":[{"delta":{"content":"hi"}}]}')
    ).toBe('hi');
    expect(extractOpenAIStreamText('{"notchoices":true}')).toBeNull();
  });
  it('extractAnthropicStreamText returns delta text', () => {
    expect(
      extractAnthropicStreamText(
        '{"type":"content_block_delta","delta":{"text":"ok"}}'
      )
    ).toBe('ok');
    expect(extractAnthropicStreamText('{"not":"this"}')).toBeNull();
  });
  it('comment events di-skip, data tetap diproses', () => {
    // Komentar SSE (`: ...`) diabaikan; data setelahnya tetap masuk.
    expect(parseSseChunks(':comment\ndata: ok\n')).toEqual(['ok']);
  });
  it('ping/whitespace diabaikan', () => {
    expect(parseSseChunks('\n\n:data: hi\n\n')).toEqual(['hi']);
    expect(parseSseChunks('   \n')).toEqual([]);
  });
  it('chunk tanpa data prefix disatukan ke buffer lalu dikosongkan saat baris kosong', () => {
    // Garis non-data yang berurutan disatukan sampai pemisah kosong.
    expect(parseSseChunks('event: chunk\ndata: x\n')).toEqual(['x']);
  });
});

describe('adapters — tokensPerSec', () => {
  it('hitung benar', () => {
    expect(tokensPerSec(100, 500)).toBeCloseTo(200, 0);
  });
  it('null/0 → null', () => {
    expect(tokensPerSec(null, 100)).toBeNull();
    expect(tokensPerSec(100, null)).toBeNull();
    expect(tokensPerSec(100, 0)).toBeNull();
  });
});
