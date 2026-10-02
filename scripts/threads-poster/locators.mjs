/**
 * Mini-DSL locator untuk threads-poster.
 *
 * `selectors.json` menyimpan locator sebagai string berdiri sendiri dengan
 * format PASTI berikut, di-resolve menjadi Playwright Locator:
 *
 *   role:<role>[name=/regex/flags]   → getByRole(role, { name: RegExp })
 *   role:<role>[name="Exact text"]   → getByRole(role, { name: 'Exact text', exact: true })
 *   role:<role>                      → getByRole(role)
 *   text:/regex/flags                → getByText(RegExp)
 *   text:"Exact text"                → getByText('Exact text', { exact: true })
 *   css:<selector>                   → locator(selector)
 *   placeholder:<text>               → getByPlaceholder(text)
 *   label:<text>                     → getByLabel(text)
 *   testid:<id>                      → getByTestId(id)
 *
 * `null` (atau string kosong) berarti kontrol tidak ditemukan / tidak ada.
 */

const STRATEGY_RE = /^(role|text|css|placeholder|label|testid):([\s\S]*)$/;
const ROLE_RE = /^([a-z][\w-]*)(?:\[name=(\/(?:[^/\\\]]|\\.)+\/[a-z]*|"[^"]*")\])?$/i;

/**
 * @param {string} spec
 * @returns {(page: { getByRole?: Function, getByText?: Function, locator?: Function,
 *                    getByPlaceholder?: Function, getByLabel?: Function, getByTestId?: Function }) => unknown}
 */
export function compileLocator(spec) {
  if (typeof spec !== 'string' || spec.trim().length === 0) {
    throw new Error('locator spec must be a non-empty string');
  }
  const match = STRATEGY_RE.exec(spec.trim());
  if (!match) {
    throw new Error(`unsupported locator spec "${spec}" — expected role:|text:|css:|placeholder:|label:|testid:`);
  }
  const [, strategy, rest] = match;

  if (strategy === 'css') return (page) => page.locator(rest);
  if (strategy === 'placeholder') return (page) => page.getByPlaceholder(rest);
  if (strategy === 'label') return (page) => page.getByLabel(rest);
  if (strategy === 'testid') return (page) => page.getByTestId(rest);

  if (strategy === 'text') {
    if (rest.startsWith('/')) return (page) => page.getByText(toRegExp(rest));
    if (rest.startsWith('"') && rest.endsWith('"')) {
      const exact = rest.slice(1, -1);
      return (page) => page.getByText(exact, { exact: true });
    }
    throw new Error(`unsupported text locator "${spec}" — use text:/regex/flags or text:"exact"`);
  }

  // role
  const roleMatch = ROLE_RE.exec(rest);
  if (!roleMatch) {
    throw new Error(`unsupported role locator "${spec}" — use role:button[name=/regex/i] or role:textbox`);
  }
  const role = roleMatch[1].toLowerCase();
  const namePart = roleMatch[2];
  if (!namePart) return (page) => page.getByRole(role);
  if (namePart.startsWith('/')) {
    const re = toRegExp(namePart);
    return (page) => page.getByRole(role, { name: re });
  }
  const exact = namePart.slice(1, -1);
  return (page) => page.getByRole(role, { name: exact, exact: true });
}

/** `/halo/i` → /halo/i */
function toRegExp(source) {
  const lastSlash = source.lastIndexOf('/');
  const body = source.slice(1, lastSlash);
  const flags = source.slice(lastSlash + 1);
  return new RegExp(body, flags);
}

/**
 * @param {import('playwright').Page} page
 * @param {string | null | undefined} spec
 * @returns {ReturnType<import('playwright').Page['locator']> | null} null bila spec kosong
 */
export function resolveLocator(page, spec) {
  if (spec === null || spec === undefined || String(spec).trim().length === 0) return null;
  return compileLocator(String(spec))(page);
}
