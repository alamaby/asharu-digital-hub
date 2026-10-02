import { describe, expect, it, vi } from 'vitest';
import { compileLocator } from './locators.mjs';

function fakePage() {
  return {
    getByRole: vi.fn((role, options) => ({ method: 'getByRole', role, options })),
    getByText: vi.fn((value, options) => ({ method: 'getByText', value, options })),
    locator: vi.fn((selector) => ({ method: 'locator', selector })),
    getByPlaceholder: vi.fn((text) => ({ method: 'getByPlaceholder', text })),
    getByLabel: vi.fn((text) => ({ method: 'getByLabel', text })),
    getByTestId: (id) => ({ method: 'getByTestId', id })
  };
}

describe('compileLocator', () => {
  it('maps role with regex name to getByRole(name: RegExp)', () => {
    const page = fakePage();
    const locator = compileLocator('role:button[name=/new post|buat post/i]')(page);
    expect(locator.method).toBe('getByRole');
    expect(locator.role).toBe('button');
    expect(locator.options.name).toBeInstanceOf(RegExp);
    expect(locator.options.name.test('New post')).toBe(true);
    expect(locator.options.name.test('Buat post')).toBe(true);
  });

  it('maps role with quoted name to an exact match', () => {
    const page = fakePage();
    compileLocator('role:button[name="Post"]')(page);
    expect(page.getByRole).toHaveBeenCalledWith('button', { name: 'Post', exact: true });
  });

  it('maps plain role without name', () => {
    const page = fakePage();
    compileLocator('role:textbox')(page);
    expect(page.getByRole).toHaveBeenCalledWith('textbox');
  });

  it('maps css, placeholder, label, and testid', () => {
    const page = fakePage();
    expect(compileLocator('css:input[type=file]')(page).selector).toBe('input[type=file]');
    expect(compileLocator("placeholder:What's new")(page).method).toBe('getByPlaceholder');
    expect(compileLocator('label:Pencarian')(page).method).toBe('getByLabel');
    expect(compileLocator('testid:composer')(page).method).toBe('getByTestId');
  });

  it('maps text with regex and text with exact quotes', () => {
    const page = fakePage();
    compileLocator('text:/balas/i')(page);
    expect(page.getByText).toHaveBeenCalledWith(expect.any(RegExp));
    compileLocator('text:"Balas"')(page);
    expect(page.getByText).toHaveBeenCalledWith('Balas', { exact: true });
  });

  it('throws a precise error for a malformed spec', () => {
    expect(() => compileLocator('role:button[name=bogus]')).toThrow();
    expect(() => compileLocator('bogus:thing')).toThrow(
      'unsupported locator spec "bogus:thing"'
    );
    expect(() => compileLocator('')).toThrow('locator spec must be a non-empty string');
  });
});
