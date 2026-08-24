/**
 * Message-driven meta titles carry the " | Asharu" suffix for SEO; visible
 * page headings reuse the same string minus the suffix.
 */
export function pageHeading(title: string): string {
  return title.replace(/\s*\|\s*Asharu\s*$/, '');
}
