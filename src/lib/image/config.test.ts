import { describe, expect, it, vi } from 'vitest';

type Row = Record<string, unknown>;

const { clientRef } = vi.hoisted(() => ({ clientRef: { current: null as unknown } }));

vi.mock('@/lib/supabase/service', () => ({
  getServiceClient: () => clientRef.current
}));

import { resolveImageTarget } from './config';

/** Client mock generik: from().select().eq()...maybeSingle() berbasis tabel. */
function makeClient(tables: Record<string, Row[]>) {
  return {
    from(table: string) {
      let rows: Row[] = tables[table] ?? [];
      const builder = {
        select: () => builder,
        eq: (col: string, val: unknown) => {
          rows = rows.filter((r) => r[col] === val);
          return builder;
        },
        order: () => builder,
        maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
        // Builder thenable (terminal): `await ...order()` → { data, error }.
        then: (onfulfilled: (v: { data: Row[]; error: null }) => unknown) =>
          onfulfilled({ data: rows, error: null })
      };
      return builder;
    }
  };
}

const provPixazo: Row = {
  id: 'prov-pixazo',
  slug: 'pixazo',
  display_name: 'Pixazo',
  base_url: 'https://gateway.pixazo.ai',
  is_active: true,
  priority: 10
};
const provCf: Row = {
  id: 'prov-cf',
  slug: 'cloudflare',
  display_name: 'Cloudflare',
  base_url: 'https://api.cloudflare.com',
  is_active: true,
  priority: 20
};
const modelFlux: Row = {
  id: 'model-flux-uuid',
  provider_id: 'prov-pixazo',
  model_id: 'flux-1-schnell',
  display_name: 'FLUX.1 Schnell',
  is_default: true,
  is_active: true,
  priority: 10,
  config: null,
  usage_count: 0,
  failure_count: 0,
  last_used_at: null,
  image_providers: provPixazo
};
const modelCf: Row = {
  id: 'model-cf-uuid',
  provider_id: 'prov-cf',
  model_id: '@cf/black-forest-labs/flux-1-schnell',
  display_name: 'FLUX.1 Schnell (CF)',
  is_default: true,
  is_active: true,
  priority: 10,
  config: null,
  usage_count: 0,
  failure_count: 0,
  last_used_at: null,
  image_providers: provCf
};
const modelSdImg2Img: Row = {
  id: 'model-sd-uuid',
  provider_id: 'prov-cf',
  model_id: '@cf/runwayml/stable-diffusion-v1-5-img2img',
  display_name: 'SD 1.5 Img2Img',
  is_default: false,
  is_active: true,
  priority: 21,
  config: { supports_reference: true },
  usage_count: 0,
  failure_count: 0,
  last_used_at: null,
  image_providers: provCf
};
const stylePhoto: Row = {
  slug: 'photorealistic',
  display_name: 'Photorealistic',
  prompt_suffix: 'photorealistic photo, sharp detail',
  is_active: true
};
const styleAnime: Row = {
  slug: 'anime',
  display_name: 'Anime',
  prompt_suffix: 'anime illustration style',
  is_active: true
};

function defaultsRow(over: Row = {}): Row {
  return {
    id: 1,
    provider_id: 'prov-pixazo',
    model_id: 'model-flux-uuid',
    style_slug: 'photorealistic',
    aspect: '1:1',
    image_mode: 'cover-only',
    ...over
  };
}

function makeTables(over: { session?: Row | null; defaults?: Row; styles?: Row[]; models?: Row[] } = {}) {
  return {
    image_providers: [provPixazo, provCf],
    image_models: over.models ?? [modelFlux, modelCf],
    image_style_presets: over.styles ?? [stylePhoto, styleAnime],
    image_gen_defaults: [over.defaults ?? defaultsRow()],
    content_research_sessions: over.session ? [over.session] : []
  };
}

function useTables(tables: Record<string, Row[]>) {
  clientRef.current = makeClient(tables);
}

describe('resolveImageTarget — prioritas style', () => {
  it('styleSlug override diterapkan walau modelUuid kosong (model Auto = default global)', async () => {
    useTables(makeTables());
    const t = await resolveImageTarget({
      sessionId: null,
      draftOverride: { modelUuid: null, styleSlug: 'anime' }
    });
    expect(t.model.model_id).toBe('flux-1-schnell');
    expect(t.style?.slug).toBe('anime');
    expect(t.style?.prompt_suffix).toBe('anime illustration style');
  });

  it('styleSlug override mengalahkan style sesi', async () => {
    useTables(makeTables({ session: { id: 'sess-1', image_model_id: null, image_style_slug: 'anime', image_mode: null } }));
    const t = await resolveImageTarget({
      sessionId: 'sess-1',
      draftOverride: { modelUuid: null, styleSlug: 'photorealistic' }
    });
    expect(t.style?.slug).toBe('photorealistic');
  });

  it('tanpa override: style sesi dipakai', async () => {
    useTables(makeTables({ session: { id: 'sess-1', image_model_id: null, image_style_slug: 'anime', image_mode: null } }));
    const t = await resolveImageTarget({ sessionId: 'sess-1', draftOverride: null });
    expect(t.style?.slug).toBe('anime');
  });

  it('tanpa override & tanpa sesi: style default global dipakai', async () => {
    useTables(makeTables());
    const t = await resolveImageTarget({ sessionId: null, draftOverride: null });
    expect(t.style?.slug).toBe('photorealistic');
  });

  it('modelUuid + styleSlug: model pinned + style override', async () => {
    useTables(makeTables());
    const t = await resolveImageTarget({
      sessionId: null,
      draftOverride: { modelUuid: 'model-flux-uuid', styleSlug: 'anime' }
    });
    expect(t.model.model_id).toBe('flux-1-schnell');
    expect(t.style?.slug).toBe('anime');
    expect(t.pinned).toBe(true);
  });

  it('pin manual nonaktif → throw jujur (tanpa fallback diam-diam ke pixazo)', async () => {
    useTables(makeTables());
    await expect(
      resolveImageTarget({
        sessionId: null,
        draftOverride: { modelUuid: 'model-tidak-ada', styleSlug: null }
      })
    ).rejects.toThrow('Model pilihan tidak aktif');
  });

  it('waterfall Auto → pinned false (boleh fallback lintas-provider)', async () => {
    useTables(makeTables({ defaults: defaultsRow({ model_id: null }) }));
    const t = await resolveImageTarget({ sessionId: null, draftOverride: null });
    expect(t.model.model_id).toBe('flux-1-schnell');
    expect(t.pinned).toBe(false);
  });

  it('model sesi + styleSlug override: model sesi tetap, style manual menang', async () => {
    useTables(makeTables({ session: { id: 'sess-1', image_model_id: 'model-cf-uuid', image_style_slug: 'anime', image_mode: null } }));
    const t = await resolveImageTarget({
      sessionId: 'sess-1',
      draftOverride: { modelUuid: null, styleSlug: 'photorealistic' }
    });
    expect(t.model.model_id).toBe('@cf/black-forest-labs/flux-1-schnell');
    expect(t.style?.slug).toBe('photorealistic');
  });

  it('styleSlug override tidak aktif → fallback ke default global', async () => {
    useTables(makeTables({ styles: [stylePhoto, { ...styleAnime, is_active: false }] }));
    const t = await resolveImageTarget({
      sessionId: null,
      draftOverride: { modelUuid: null, styleSlug: 'anime' }
    });
    expect(t.style?.slug).toBe('photorealistic');
  });

  it('styleSlug override diterapkan di cabang waterfall (default tanpa model pin)', async () => {
    useTables(makeTables({ defaults: defaultsRow({ model_id: null }) }));
    const t = await resolveImageTarget({
      sessionId: null,
      draftOverride: { modelUuid: null, styleSlug: 'anime' }
    });
    expect(t.model.model_id).toBe('flux-1-schnell');
    expect(t.style?.slug).toBe('anime');
  });

  it('style null di semua level → style null', async () => {
    useTables(makeTables({ defaults: defaultsRow({ style_slug: null }) }));
    const t = await resolveImageTarget({ sessionId: null, draftOverride: null });
    expect(t.style).toBeNull();
  });
});

describe('resolveImageTarget — needsReference', () => {
  it('pin model non-support + referensi → throw jujur', async () => {
    useTables(makeTables());
    await expect(
      resolveImageTarget({
        sessionId: null,
        draftOverride: { modelUuid: 'model-flux-uuid', styleSlug: null },
        needsReference: true
      })
    ).rejects.toThrow('tidak mendukung image reference');
  });

  it('pin model support + referensi → pinned', async () => {
    useTables(makeTables({ models: [modelFlux, modelCf, modelSdImg2Img] }));
    const t = await resolveImageTarget({
      sessionId: null,
      draftOverride: { modelUuid: 'model-sd-uuid', styleSlug: null },
      needsReference: true
    });
    expect(t.model.model_id).toBe('@cf/runwayml/stable-diffusion-v1-5-img2img');
    expect(t.pinned).toBe(true);
  });

  it('waterfall + referensi dipersempit ke model support', async () => {
    useTables(makeTables({ models: [modelFlux, modelCf, modelSdImg2Img], defaults: defaultsRow({ provider_id: null, model_id: null }) }));
    const t = await resolveImageTarget({ sessionId: null, draftOverride: null, needsReference: true });
    expect(t.model.model_id).toBe('@cf/runwayml/stable-diffusion-v1-5-img2img');
    expect(t.pinned).toBe(false);
  });

  it('tanpa model support sama sekali → throw jelas', async () => {
    useTables(makeTables({ defaults: defaultsRow({ provider_id: null, model_id: null }) }));
    await expect(
      resolveImageTarget({ sessionId: null, draftOverride: null, needsReference: true })
    ).rejects.toThrow('Tidak ada model image reference aktif');
  });
});
