import 'server-only';
import { getServiceClient } from '@/lib/supabase/service';
import type {
  ImageAspect,
  ImageGenDefaults,
  ImageModelRow,
  ImageProviderRow,
  ImageProviderSlug,
  ImageStylePreset
} from './types';

export interface ResolvedImageTarget {
  provider: ImageProviderRow;
  model: ImageModelRow;
  style: ImageStylePreset | null;
  aspect: ImageAspect;
}

interface SessionImageOverride {
  image_model_id: string | null;
  image_style_slug: string | null;
}

async function activeProviders(): Promise<ImageProviderRow[]> {
  const supabase = getServiceClient();
  const { data, error } = await supabase
    .from('image_providers')
    .select('*')
    .eq('is_active', true)
    .order('priority', { ascending: true });
  if (error) throw new Error(`activeProviders: ${error.message}`);
  return (data ?? []) as unknown as ImageProviderRow[];
}

async function activeModels(providerId: string): Promise<ImageModelRow[]> {
  const supabase = getServiceClient();
  const { data, error } = await supabase
    .from('image_models')
    .select('*')
    .eq('provider_id', providerId)
    .eq('is_active', true)
    .order('priority', { ascending: true })
    .order('last_used_at', { ascending: true, nullsFirst: true });
  if (error) throw new Error(`activeModels: ${error.message}`);
  return (data ?? []) as unknown as ImageModelRow[];
}

async function findModel(modelUuid: string): Promise<{ provider: ImageProviderRow; model: ImageModelRow } | null> {
  const supabase = getServiceClient();
  const { data: m } = await supabase
    .from('image_models')
    .select('*, image_providers!inner(*)')
    .eq('id', modelUuid)
    .eq('is_active', true)
    .maybeSingle();
  const row = m as (ImageModelRow & { image_providers: ImageProviderRow }) | null;
  if (!row || !row.image_providers?.is_active) return null;
  const { image_providers: provider, ...model } = row;
  return { provider, model: model as ImageModelRow };
}

async function findStyle(slug: string | null | undefined): Promise<ImageStylePreset | null> {
  if (!slug) return null;
  const supabase = getServiceClient();
  const { data } = await supabase
    .from('image_style_presets')
    .select('*')
    .eq('slug', slug)
    .eq('is_active', true)
    .maybeSingle();
  return (data as ImageStylePreset | null) ?? null;
}

async function getGenDefaults(): Promise<ImageGenDefaults | null> {
  const supabase = getServiceClient();
  const { data } = await supabase.from('image_gen_defaults').select('*').eq('id', 1).maybeSingle();
  return (data as ImageGenDefaults | null) ?? null;
}

async function getSessionOverride(sessionId: string | null | undefined): Promise<SessionImageOverride | null> {
  if (!sessionId) return null;
  const supabase = getServiceClient();
  const { data } = await supabase
    .from('content_research_sessions')
    .select('image_model_id, image_style_slug')
    .eq('id', sessionId)
    .maybeSingle();
  return (data as SessionImageOverride | null) ?? null;
}

/**
 * Resolve target image (provider + model + style + aspect).
 * Priority: per-draft override > session override > global defaults > waterfall prioritas.
 * `draftOverride` diisi saat admin regenerate dengan pilihan manual di review.
 */
export async function resolveImageTarget(options: {
  sessionId?: string | null;
  draftOverride?: { modelUuid?: string | null; styleSlug?: string | null } | null;
}): Promise<ResolvedImageTarget> {
  const { sessionId, draftOverride } = options;

  // 1) Per-draft override (review picker)
  if (draftOverride?.modelUuid) {
    const found = await findModel(draftOverride.modelUuid);
    if (found) {
      const style =
        (await findStyle(draftOverride.styleSlug ?? null)) ??
        (await findStyle((await getSessionOverride(sessionId))?.image_style_slug)) ??
        (await findStyle((await getGenDefaults())?.style_slug));
      const defaults = await getGenDefaults();
      return { provider: found.provider, model: found.model, style, aspect: defaults?.aspect ?? '1:1' };
    }
  }

  // 2) Session override
  const session = await getSessionOverride(sessionId);
  if (session?.image_model_id) {
    const found = await findModel(session.image_model_id);
    if (found) {
      const style =
        (await findStyle(session.image_style_slug)) ??
        (await findStyle((await getGenDefaults())?.style_slug));
      const defaults = await getGenDefaults();
      return { provider: found.provider, model: found.model, style, aspect: defaults?.aspect ?? '1:1' };
    }
  }

  // 3) Global defaults (half-pin guard: keduanya set atau keduanya NULL)
  const defaults = await getGenDefaults();
  if (defaults?.model_id) {
    const found = await findModel(defaults.model_id);
    if (found) {
      const style =
        (await findStyle(session?.image_style_slug)) ?? (await findStyle(defaults.style_slug));
      return { provider: found.provider, model: found.model, style, aspect: defaults.aspect };
    }
  }

  // 4) Waterfall: provider aktif prioritas teratas + model default/pertama
  const providers = await activeProviders();
  for (const provider of providers) {
    const models = await activeModels(provider.id);
    const pick = models.find((m) => m.is_default) ?? models[0];
    if (!pick) continue;
    const style =
      (await findStyle(session?.image_style_slug)) ?? (await findStyle(defaults?.style_slug));
    return { provider, model: pick, style, aspect: defaults?.aspect ?? '1:1' };
  }
  throw new Error('No active image provider/model available');
}

/** Daftar provider + model aktif untuk picker review (tanpa secret). */
export async function listActiveImageOptions(): Promise<{
  providers: ImageProviderRow[];
  models: (ImageModelRow & { provider_slug: ImageProviderSlug })[];
  styles: ImageStylePreset[];
}> {
  const supabase = getServiceClient();
  const [{ data: providers }, { data: models }, { data: styles }] = await Promise.all([
    supabase.from('image_providers').select('*').eq('is_active', true).order('priority'),
    supabase
      .from('image_models')
      .select('*, image_providers!inner(slug)')
      .eq('is_active', true)
      .order('priority'),
    supabase.from('image_style_presets').select('*').eq('is_active', true).order('slug')
  ]);
  const mappedModels = ((models ?? []) as Array<ImageModelRow & { image_providers: { slug: ImageProviderSlug } }>).map(
    ({ image_providers, ...m }) => ({ ...m, provider_slug: image_providers.slug })
  );
  return {
    providers: (providers ?? []) as ImageProviderRow[],
    models: mappedModels,
    styles: (styles ?? []) as ImageStylePreset[]
  };
}

export async function markImageModelUsage(modelId: string): Promise<void> {
  const supabase = getServiceClient();
  const { data } = await supabase.from('image_models').select('usage_count').eq('id', modelId).single();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const current = (data as any)?.usage_count ?? 0;
  await supabase
    .from('image_models')
    .update({ usage_count: current + 1, last_used_at: new Date().toISOString() })
    .eq('id', modelId);
}

export async function markImageModelFailure(modelId: string): Promise<void> {
  const supabase = getServiceClient();
  const { data } = await supabase.from('image_models').select('failure_count').eq('id', modelId).single();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const current = (data as any)?.failure_count ?? 0;
  const next = current + 1;
  const patch: Record<string, unknown> = { failure_count: next };
  if (next > 5) patch.is_active = false;
  await supabase.from('image_models').update(patch).eq('id', modelId);
}
