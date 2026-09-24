import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { validateMessageSource } from './message-catalog.mjs';

const fixture = (name) => readFileSync(resolve('scripts/lib/fixtures', name), 'utf8');

describe('message catalog duplicate-key validation', () => {
  it('reports a duplicate top-level key with its path', () => {
    const errors = validateMessageSource('fixture.json', fixture('messages-duplicate.json'));

    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('duplicate key at lab');
  });

  it('reports a duplicate nested key with its path', () => {
    const errors = validateMessageSource('fixture.json', fixture('messages-duplicate-nested.json'));

    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('duplicate key at lab.try.title');
  });

  it('accepts a catalog with unique keys and non-empty values', () => {
    const errors = validateMessageSource('fixture.json', '{"lab":{"try":{"title":"Endpoint Try"}}}', ['lab.try.title']);

    expect(errors).toEqual([]);
  });
});
