import { describe, expect, it } from 'vitest';
import { requestedImageModelUuid, requestedImageProviderLabel } from './requested-label';

const options = {
  providers: [{ id: 'prov-cf', slug: 'cloudflare', display_name: 'Cloudflare Workers AI' }],
  models: [
    {
      id: 'model-cf-uuid',
      provider_id: 'prov-cf',
      model_id: '@cf/black-forest-labs/flux-1-schnell',
      display_name: 'Flux 1 Schnell',
      provider_slug: 'cloudflare'
    }
  ]
};

const labels = { auto: 'auto', queued: 'antre' };

describe('requestedImageModelUuid', () => {
  it('membaca pin studio langsung dari baris', () => {
    expect(
      requestedImageModelUuid({ provider_slug: '', model_id: '', model_id_uuid: 'm1', llm_meta: null })
    ).toBe('m1');
  });

  it('membaca override review dari llm_meta', () => {
    expect(
      requestedImageModelUuid({
        provider_slug: '',
        model_id: '',
        llm_meta: { override: { modelUuid: 'm2', styleSlug: null } }
      })
    ).toBe('m2');
  });

  it('null bila tidak ada pin', () => {
    expect(requestedImageModelUuid({ provider_slug: '', model_id: '', llm_meta: {} })).toBeNull();
    expect(requestedImageModelUuid({ provider_slug: '', model_id: '', llm_meta: null })).toBeNull();
  });
});

describe('requestedImageProviderLabel', () => {
  it('slug hasil menang bila sudah terisi', () => {
    expect(
      requestedImageProviderLabel(
        { provider_slug: 'pixazo', model_id: 'flux-1-schnell', llm_meta: null },
        options,
        labels
      )
    ).toBe('pixazo · flux-1-schnell');
  });

  it('pin cloudflare antre menampilkan yang diminta, bukan auto', () => {
    expect(
      requestedImageProviderLabel(
        {
          provider_slug: '',
          model_id: '',
          llm_meta: { override: { modelUuid: 'model-cf-uuid', styleSlug: null } }
        },
        options,
        labels
      )
    ).toBe('cloudflare · @cf/black-forest-labs/flux-1-schnell (antre)');
  });

  it('Auto murni tetap auto · auto (antre)', () => {
    expect(
      requestedImageProviderLabel({ provider_slug: '', model_id: '', llm_meta: null }, options, labels)
    ).toBe('auto · auto (antre)');
  });

  it('pin tak dikenal di katalog → auto antre (tanpa crash)', () => {
    expect(
      requestedImageProviderLabel(
        { provider_slug: '', model_id: '', llm_meta: { override: { modelUuid: 'unknown' } } },
        options,
        labels
      )
    ).toBe('auto · auto (antre)');
  });
});
