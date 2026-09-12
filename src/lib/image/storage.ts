import 'server-only';
import { getServiceClient } from '@/lib/supabase/service';
import { assertValidReferenceFile, referenceExtensionFor } from './types';

export const DRAFT_IMAGES_BUCKET = 'draft-images';
/** Prefix file referensi img2img (`ref/`) — bedakan dari hasil generate. */
export const DRAFT_REFERENCE_PREFIX = 'ref';

/** Upload bytes → Storage publik, kembalikan { storagePath, publicUrl }. */
export async function uploadDraftImage(
  draftId: string,
  imageId: string,
  bytes: Uint8Array,
  mimeType: string
): Promise<{ storagePath: string; publicUrl: string }> {
  const supabase = getServiceClient();
  const ext = mimeType.includes('jpeg') || mimeType.includes('jpg') ? 'jpg' : 'png';
  const storagePath = `${draftId}/${imageId}.${ext}`;
  const { error } = await supabase.storage
    .from(DRAFT_IMAGES_BUCKET)
    .upload(storagePath, bytes, { contentType: mimeType, upsert: true });
  if (error) throw new Error(`storage upload failed: ${error.message}`);
  const { data } = supabase.storage.from(DRAFT_IMAGES_BUCKET).getPublicUrl(storagePath);
  if (!data?.publicUrl) throw new Error('storage getPublicUrl returned empty');
  return { storagePath, publicUrl: data.publicUrl };
}

/** Fetch remote image URL (Pixazo) → bytes. */
export async function fetchRemoteImage(url: string, timeoutMs = 60000): Promise<{ bytes: Uint8Array; mimeType: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`fetch remote image ${res.status}`);
    const buf = new Uint8Array(await res.arrayBuffer());
    if (buf.length === 0) throw new Error('remote image empty body');
    return { bytes: buf, mimeType: res.headers.get('content-type') ?? 'image/png' };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Upload gambar referensi img2img draf → `draft-images/ref/{draftId}/{refId}.ext`.
 * Validasi tipe (JPEG/PNG/WebP) + ukuran (≤5MB). Tulis via service_role.
 */
export async function uploadDraftReference(
  draftId: string,
  refId: string,
  bytes: Uint8Array,
  mimeType: string
): Promise<{ storagePath: string; publicUrl: string }> {
  assertValidReferenceFile(bytes.length, mimeType);
  const ext = referenceExtensionFor(mimeType);
  const supabase = getServiceClient();
  const storagePath = `${DRAFT_REFERENCE_PREFIX}/${draftId}/${refId}.${ext}`;
  const { error } = await supabase.storage
    .from(DRAFT_IMAGES_BUCKET)
    .upload(storagePath, bytes, { contentType: mimeType, upsert: true });
  if (error) throw new Error(`reference upload failed: ${error.message}`);
  const { data } = supabase.storage.from(DRAFT_IMAGES_BUCKET).getPublicUrl(storagePath);
  if (!data?.publicUrl) throw new Error('reference getPublicUrl returned empty');
  return { storagePath, publicUrl: data.publicUrl };
}
