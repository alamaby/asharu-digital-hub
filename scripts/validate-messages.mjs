import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { validateMessageCatalogs } from './lib/message-catalog.mjs';

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  const messagesDir = resolve(process.cwd(), 'src/messages');
  const errors = validateMessageCatalogs(messagesDir);

  if (errors.length > 0) {
    for (const error of errors) console.error(`::error::${error}`);
    process.exitCode = 1;
  } else {
    console.log('message catalogs valid: id/en parity, required lab keys, non-empty values, and no duplicate keys');
  }
}

export { validateMessageCatalogs } from './lib/message-catalog.mjs';
