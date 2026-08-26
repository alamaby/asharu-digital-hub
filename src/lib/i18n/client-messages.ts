import type { AbstractIntlMessages } from 'next-intl';

/**
 * Client Components only need the namespaces they translate at runtime.
 * Passing the full catalog bloats the RSC payload and hydration cost, so the
 * locale layout prunes it with this allow-list before handing it to
 * NextIntlClientProvider.
 */
export const CLIENT_MESSAGE_NAMESPACES = [
  'a11y',
  'categories',
  'consent',
  'header',
  'nav',
  'notFound',
  'product',
  'property',
  'propertyFilters'
] as const;

function pickNamespace(
  messages: AbstractIntlMessages,
  namespace: string
): AbstractIntlMessages | undefined {
  const value = messages[namespace];
  return typeof value === 'object' && value !== null
    ? (value as AbstractIntlMessages)
    : undefined;
}

export function pickClientMessages(
  messages: AbstractIntlMessages,
  namespaces: readonly string[] = CLIENT_MESSAGE_NAMESPACES
): AbstractIntlMessages {
  const picked: AbstractIntlMessages = {};
  for (const namespace of namespaces) {
    const subset = pickNamespace(messages, namespace);
    if (subset) {
      picked[namespace] = subset;
    }
  }
  return picked;
}
