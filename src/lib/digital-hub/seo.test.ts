import { describe, expect, it } from 'vitest';
import { digitalHubSoftwareSchema, simpleFaqSchema } from '@/lib/seo/jsonld';
import { buildMetadata } from '@/lib/seo/metadata';

describe('digital-hub SEO', () => {
  it('builds canonical + hreflang for /digital-hub', () => {
    const metadata = buildMetadata({
      locale: 'id',
      path: '/digital-hub',
      title: 'Asharu Digital Hub | Workspace Konten dan Portofolio untuk UMKM',
      description: 'Riset, susun, tinjau, siapkan konten dan portofolio.'
    });
    expect(metadata.alternates?.canonical).toBe('https://asharu.id/id/digital-hub');
    expect(metadata.alternates?.languages).toMatchObject({
      id: 'https://asharu.id/id/digital-hub',
      en: 'https://asharu.id/en/digital-hub'
    });
  });

  it('emits truthful SoftwareApplication without ratings', () => {
    const schema = digitalHubSoftwareSchema('id') as Record<string, unknown>;
    expect(schema['@type']).toBe('SoftwareApplication');
    expect(schema).not.toHaveProperty('aggregateRating');
    expect(schema).not.toHaveProperty('offers');
  });

  it('emits FAQPage from visible Q&A', () => {
    const schema = simpleFaqSchema([{ q: 'Q?', a: 'A.' }]) as {
      mainEntity: Array<{ acceptedAnswer: { text: string } }>;
    };
    expect(schema.mainEntity).toHaveLength(1);
    expect(schema.mainEntity[0]?.acceptedAnswer.text).toBe('A.');
  });
});
