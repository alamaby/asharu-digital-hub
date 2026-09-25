import { describe, expect, it } from 'vitest';
import {
  assertAllowedBaseUrl,
  chatRequestSchema,
  isBlockedHostname,
  joinUpstreamPath,
  sanitizeErrorMessage
} from './validation';
import {
  buildAnthropicChatBody,
  buildOpenAIChatBody,
  extractAnthropicStreamText,
  extractOpenAIStreamText,
  normalizeAnthropicChat,
  normalizeOpenAIModels,
  normalizeOpenAIChat,
  parseSseChunks
} from './adapters';

describe('validation — baseUrl normalization', () => {
  it('trailing slash dihapus', () => {
    const res = chatRequestSchema.safeParse({
      kind: 'openai',
      baseUrl: 'https://api.x.com/v1///',
      apiKey: 'sk-testabc',
      model: 'gpt-4o',
      user: 'Halo, apa kabar?'
    });
    expect(res.success).toBe(true);
    if (res.success) expect(res.data.baseUrl).toBe('https://api.x.com/v1');
  });
});

describe('validation — SSRF hostnames', () => {
  it('blok localhost', () => {
    expect(isBlockedHostname('localhost')).toBe(true);
  });
  it('blok sufiks .localhost/.local/.internal', () => {
    expect(isBlockedHostname('foo.localhost')).toBe(true);
    expect(isBlockedHostname('bar.local')).toBe(true);
    expect(isBlockedHostname('baz.internal')).toBe(true);
  });
  it('blok IP privat 127/8, 10/8, 172.16/12, 192.168/16, 169.254/16', () => {
    expect(isBlockedHostname('127.0.0.1')).toBe(true);
    expect(isBlockedHostname('10.0.0.1')).toBe(true);
    expect(isBlockedHostname('172.16.0.1')).toBe(true);
    expect(isBlockedHostname('172.31.255.255')).toBe(true);
    expect(isBlockedHostname('192.168.1.1')).toBe(true);
    expect(isBlockedHostname('169.254.169.254')).toBe(true);
    expect(isBlockedHostname('::1')).toBe(true);
    expect(isBlockedHostname('0.0.0.0')).toBe(true);
  });
  it('tidak blokir hostname publik', () => {
    expect(isBlockedHostname('api.openai.com')).toBe(false);
    expect(isBlockedHostname('example.com')).toBe(false);
  });
});

describe('validation — assertAllowedBaseUrl', () => {
  it('tolak URL dengan userinfo', () => {
    expect(() =>
      assertAllowedBaseUrl('https://user:pass@api.example.com/v1')
    ).toThrow(/userinfo/);
  });
  it('tolak protocol selain http/https', () => {
    expect(() => assertAllowedBaseUrl('ftp://example.com')).toThrow(
      /diizinkan/
    );
  });
  it('tolak localhost via http', () => {
    expect(() => assertAllowedBaseUrl('http://localhost:11434/v1')).toThrow(
      /lokal/
    );
  });
  it('tolak IP privat link-local', () => {
    expect(() => assertAllowedBaseUrl('http://169.254.169.254/')).toThrow(
      /lokal/
    );
  });
  it('accept https public hostname (trailing slash dipotong)', () => {
    const r = assertAllowedBaseUrl('https://api.openai.com/v1/');
    expect(r.base).toBe('https://api.openai.com/v1');
    expect(r.origin).toBe('https://api.openai.com');
  });
});

describe('validation — joinUpstreamPath', () => {
  it('prefix path dipertahankan (kasus BlazeAPI /paid/v1)', () => {
    expect(joinUpstreamPath('https://api.blazeapi.org/paid/v1', '/chat/completions')).toBe(
      'https://api.blazeapi.org/paid/v1/chat/completions'
    );
    expect(joinUpstreamPath('https://api.blazeapi.org/paid/v1', '/models')).toBe(
      'https://api.blazeapi.org/paid/v1/models'
    );
    expect(joinUpstreamPath('https://api.blazeapi.org/paid/v1', '/messages')).toBe(
      'https://api.blazeapi.org/paid/v1/messages'
    );
  });
  it('root path tetap seperti dulu', () => {
    expect(joinUpstreamPath('https://api.openai.com/v1', '/chat/completions')).toBe(
      'https://api.openai.com/v1/chat/completions'
    );
  });
  it('suffix yang sudah ada tidak digandakan', () => {
    expect(joinUpstreamPath('https://h.com/v1/chat/completions', '/chat/completions')).toBe(
      'https://h.com/v1/chat/completions'
    );
  });
});

describe('validation — chat schema boundaries', () => {
  it('prompt 9 karakter gagal', () => {
    const res = chatRequestSchema.safeParse({
      kind: 'openai',
      baseUrl: 'https://api.openai.com/v1',
      apiKey: 'sk-testabc',
      model: 'gpt-4o',
      user: '123456789'
    });
    expect(res.success).toBe(false);
  });
  it('prompt 10 karakter lolos', () => {
    const res = chatRequestSchema.safeParse({
      kind: 'openai',
      baseUrl: 'https://api.openai.com/v1',
      apiKey: 'sk-testabc',
      model: 'gpt-4o',
      user: '1234567890'
    });
    expect(res.success).toBe(true);
  });
  it('maxTokens 5000 gagal (cap MAX_BODY=4000)', () => {
    const res = chatRequestSchema.safeParse({
      kind: 'openai',
      baseUrl: 'https://api.openai.com/v1',
      apiKey: 'sk-testabc',
      model: 'gpt-4o',
      user: '1234567890',
      maxTokens: 5000
    });
    expect(res.success).toBe(false);
  });
  it('key spasi (9 karakter) lolos validasi', () => {
    const res = chatRequestSchema.safeParse({
      kind: 'openai',
      baseUrl: 'https://api.openai.com/v1',
      apiKey: 'sk-abc def',
      model: 'gpt-4o',
      user: '1234567890'
    });
    expect(res.success).toBe(true);
  });
});

describe('validation — sanitizeErrorMessage', () => {
  it('redaksi substring secret', () => {
    const msg = 'Authentication failed with key sk-ABC123XY';
    const out = sanitizeErrorMessage(msg, ['sk-ABC123XY']);
    expect(out).not.toContain('sk-ABC123XY');
    expect(out).toContain('[REDACTED]');
    expect(out.length).toBeLessThanOrEqual(300);
  });
});

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
  it('ping/space events ignored', () => {
    // Komentar SSE (`: ...`) diabaikan; data setelahnya tetap masuk.
    expect(parseSseChunks(':comment\n:data: ok\n')).toEqual(['ok']);
    // Baris kosong dan whitespace tidak menghasilkan chunk.
    expect(parseSseChunks('\n\n:data: hi\n\n')).toEqual(['hi']);
    expect(parseSseChunks('   \n')).toEqual([]);
  });
  it('chunk tanpa data prefix di-skip', () => {
    expect(parseSseChunks('event: chunk\ndata: x')).toEqual(['x']);
  });
});
