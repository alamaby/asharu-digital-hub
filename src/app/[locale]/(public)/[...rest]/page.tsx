import { notFound } from 'next/navigation';

export const dynamicParams = false;

export function generateStaticParams() {
  return [];
}

/** Localized static 404 for any unmatched path inside a locale. */
export default function CatchAllPage() {
  notFound();
}
