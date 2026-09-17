import { describe, expect, it } from 'vitest';
import { labInputSchema, validateLabTargetLink } from './validation';

const UUID_A = '11111111-1111-4111-8111-111111111111';
const UUID_B = '22222222-2222-4222-8222-222222222222';
const UUID_C = '33333333-3333-4333-8333-333333333333';

describe('labInputSchema', () => {
  it('menerima submit valid 1–3 target', () => {
    const parsed = labInputSchema(3).safeParse({
      systemPrompt: 'Jawab singkat.',
      userPrompt: 'Jelaskan fotosintesis dalam 2 kalimat.',
      temperature: 0.7,
      maxTokens: 500,
      targets: [{ providerId: UUID_A, modelId: UUID_B }]
    });
    expect(parsed.success).toBe(true);
  });

  it('menolak prompt <10 karakter', () => {
    const parsed = labInputSchema(3).safeParse({
      systemPrompt: null,
      userPrompt: 'pendek',
      temperature: null,
      maxTokens: null,
      targets: [{ providerId: UUID_A, modelId: UUID_B }]
    });
    expect(parsed.success).toBe(false);
  });

  it('menolak tanpa target dan lebih dari max', () => {
    const empty = labInputSchema(3).safeParse({
      systemPrompt: null,
      userPrompt: 'Prompt yang cukup panjang untuk lolos.',
      temperature: null,
      maxTokens: null,
      targets: []
    });
    expect(empty.success).toBe(false);
    const over = labInputSchema(2).safeParse({
      systemPrompt: null,
      userPrompt: 'Prompt yang cukup panjang untuk lolos.',
      temperature: null,
      maxTokens: null,
      targets: [
        { providerId: UUID_A, modelId: UUID_B },
        { providerId: UUID_A, modelId: UUID_C },
        { providerId: UUID_B, modelId: UUID_C }
      ]
    });
    expect(over.success).toBe(false);
  });

  it('menolak temperature/maxTokens di luar batas', () => {
    const bad = labInputSchema(3).safeParse({
      systemPrompt: null,
      userPrompt: 'Prompt yang cukup panjang untuk lolos.',
      temperature: 5,
      maxTokens: 99999,
      targets: [{ providerId: UUID_A, modelId: UUID_B }]
    });
    expect(bad.success).toBe(false);
  });
});

describe('validateLabTargetLink', () => {
  const models = [
    { id: UUID_B, provider_id: UUID_A },
    { id: UUID_C, provider_id: UUID_B }
  ];

  it('lolos bila model milik provider', () => {
    expect(validateLabTargetLink(UUID_A, UUID_B, models)).toBeNull();
  });

  it('menolak pin silang provider/model', () => {
    expect(validateLabTargetLink(UUID_A, UUID_C, models)).toMatch(/bukan milik provider/);
  });

  it('menolak model tak dikenal', () => {
    expect(
      validateLabTargetLink(UUID_A, '44444444-4444-4444-8444-444444444444', models)
    ).toMatch(/tidak dikenal/);
  });
});
