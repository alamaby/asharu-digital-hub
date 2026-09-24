import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseTree } from 'jsonc-parser';

export const REQUIRED_LAB_KEYS = Object.freeze([
  'lab.title',
  'lab.form.promptLabel',
  'lab.form.submit',
  'lab.result.heading',
  'lab.history.heading',
  'lab.history.pageOf',
  'lab.history.prev',
  'lab.history.next',
  'lab.history.reuse',
  'lab.history.openDetail',
  'lab.history.delete',
  'lab.stats.heading',
  'lab.notice.running',
  'lab.detail.heading',
  'lab.detail.downloadCard',
  'lab.detail.shareCard',
  'lab.try.title',
  'lab.try.sendButton'
]);

function lineAtOffset(source, offset) {
  return source.slice(0, offset).split(/\r?\n/).length;
}

function walkTree(node, source, path, duplicates) {
  if (!node || typeof node !== 'object') return;

  if (node.type === 'object') {
    const seen = new Map();
    for (const property of node.children ?? []) {
      const keyNode = property.children?.[0];
      const valueNode = property.children?.[1];
      const key = String(keyNode?.value ?? '');
      const propertyPath = path ? `${path}.${key}` : key;
      const first = seen.get(key);

      if (seen.has(key)) {
        duplicates.push(
          `${propertyPath} (first at line ${lineAtOffset(source, first)}, duplicate at line ${lineAtOffset(source, keyNode?.offset ?? 0)})`
        );
      } else {
        seen.set(key, keyNode?.offset ?? 0);
      }

      walkTree(valueNode, source, propertyPath, duplicates);
    }
    return;
  }

  if (node.type === 'array') {
    for (const [index, child] of (node.children ?? []).entries()) {
      walkTree(child, source, `${path}[${index}]`, duplicates);
    }
  }
}

function flatten(value, prefix = '', output = new Map()) {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    for (const [key, child] of Object.entries(value)) {
      flatten(child, prefix ? `${prefix}.${key}` : key, output);
    }
    return output;
  }

  output.set(prefix, value);
  return output;
}

function hasKey(flattened, key) {
  return flattened.has(key);
}

export function validateMessageSource(label, source, requiredKeys = []) {
  const errors = [];
  const parseErrors = [];
  const root = parseTree(source, parseErrors, {
    allowTrailingComma: false,
    disallowComments: true
  });

  for (const error of parseErrors) {
    const line = lineAtOffset(source, error.offset);
    errors.push(`${label}:${line}: invalid JSON (${error.error})`);
  }

  if (!root) return errors;

  const duplicates = [];
  walkTree(root, source, '', duplicates);
  for (const duplicate of duplicates) {
    errors.push(`${label}: duplicate key at ${duplicate}`);
  }

  let catalog;
  try {
    catalog = JSON.parse(source);
  } catch (error) {
    if (parseErrors.length === 0) {
      errors.push(`${label}: unable to parse catalog (${error instanceof Error ? error.message : String(error)})`);
    }
    return errors;
  }

  const flattened = flatten(catalog);
  for (const key of requiredKeys) {
    if (!hasKey(flattened, key)) errors.push(`${label}: missing required key ${key}`);
  }

  for (const [key, value] of flattened) {
    if (typeof value !== 'string' || value.trim() === '') {
      errors.push(`${label}: translation ${key} must be a non-empty string`);
    }
  }

  return errors;
}

export function validateMessageCatalogs(messagesDir, locales = ['id', 'en'], requiredKeys = REQUIRED_LAB_KEYS) {
  const catalogs = new Map();
  const errors = [];

  for (const locale of locales) {
    const file = join(messagesDir, `${locale}.json`);
    let source;
    try {
      source = readFileSync(file, 'utf8');
    } catch (error) {
      errors.push(`${file}: unable to read catalog (${error instanceof Error ? error.message : String(error)})`);
      continue;
    }

    errors.push(...validateMessageSource(`${locale}.json`, source, requiredKeys));

    try {
      catalogs.set(locale, JSON.parse(source));
    } catch {
      // The source error is already reported by validateMessageSource.
    }
  }

  const idKeys = catalogs.has('id') ? [...flatten(catalogs.get('id')).keys()].sort() : [];
  const enKeys = catalogs.has('en') ? [...flatten(catalogs.get('en')).keys()].sort() : [];

  if (idKeys.length > 0 || enKeys.length > 0) {
    const missingInEn = idKeys.filter((key) => !enKeys.includes(key));
    const missingInId = enKeys.filter((key) => !idKeys.includes(key));
    for (const key of missingInEn) errors.push(`en.json: missing key ${key}`);
    for (const key of missingInId) errors.push(`id.json: missing key ${key}`);
  }

  return errors;
}
