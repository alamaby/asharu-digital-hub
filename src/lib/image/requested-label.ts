/** Label provider·model untuk baris image yang masih antre (slug hasil kosong).
 * Bila baris membawa jejak request (llm_meta.requested_*) atau UUID pin
 * + katalog options, tampilkan pilihan yang diminta + "(antre)" — bukan "auto".
 * Tanpa jejak request (Auto murni) → "auto · auto" seperti semula.
 */

export interface ImageOptionEntry {
  providers: { id: string; slug: string; display_name: string }[];
  models: { id: string; provider_id: string; model_id: string; display_name: string; provider_slug: string }[];
}

interface QueuedRow {
  provider_slug: string;
  model_id: string;
  /** Studio: UUID pin langsung di baris. Konten: UUID pin di llm_meta.override. */
  provider_id?: string | null;
  model_id_uuid?: string | null;
  llm_meta: Record<string, unknown> | null;
}

/** Ambil pin UUID dari baris studio maupun baris konten (override review). */
export function requestedImageModelUuid(row: QueuedRow): string | null {
  if (row.model_id_uuid) return row.model_id_uuid;
  const meta = row.llm_meta;
  if (!meta || typeof meta !== 'object') return null;
  const override = (meta as { override?: { modelUuid?: string | null } }).override;
  const uuid = override?.modelUuid;
  return typeof uuid === 'string' && uuid ? uuid : null;
}

export function requestedImageProviderLabel(
  row: QueuedRow,
  options: ImageOptionEntry | null | undefined,
  labels: { auto: string; queued: string }
): string {
  if (row.provider_slug || row.model_id) return `${row.provider_slug} · ${row.model_id}`;
  const uuid = requestedImageModelUuid(row);
  if (!uuid || !options) return `${labels.auto} · ${labels.auto} (${labels.queued})`;
  const model = options.models.find((m) => m.id === uuid);
  if (!model) return `${labels.auto} · ${labels.auto} (${labels.queued})`;
  const provider = options.providers.find((p) => p.id === model.provider_id);
  const who = provider ? `${provider.slug} · ${model.model_id}` : `${model.provider_slug} · ${model.model_id}`;
  return `${who} (${labels.queued})`;
}
