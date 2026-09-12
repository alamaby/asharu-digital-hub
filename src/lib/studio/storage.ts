import 'server-only';
import { getServiceClient } from '@/lib/supabase/service';
import { assertValidReferenceFile, referenceExtensionFor } from '@/lib/image/types';

export const STUDIO_IMAGES_BUCKET = 'user-images';
/** Prefix file referensi img2img (`ref/`) — bedakan dari hasil generate. */
export const STUDIO_REFERENCE_PREFIX = 'ref';

/** Upload bytes hasil generate studio → Storage publik `user-images/{userId}/{imageId}.ext`. */
export async function uploadUserImage(
  userId: string,
  imageId: string,
  bytes: Uint8Array,
  mimeType: string
): Promise<{ storagePath: string; publicUrl: string }> {
  const supabase = getServiceClient();
  const ext = mimeType.includes('jpeg') || mimeType.includes('jpg') ? 'jpg' : 'png';
  const storagePath = `${userId}/${imageId}.${ext}`;
  const { error } = await supabase.storage
    .from(STUDIO_IMAGES_BUCKET)
    .upload(storagePath, bytes, { contentType: mimeType, upsert: true });
  if (error) throw new Error(`studio storage upload failed: ${error.message}`);
  const { data } = supabase.storage.from(STUDIO_IMAGES_BUCKET).getPublicUrl(storagePath);
  if (!data?.publicUrl) throw new Error('studio storage getPublicUrl returned empty');
  return { storagePath, publicUrl: data.publicUrl };
}

/**
 * Upload gambar referensi img2img milik user → `user-images/ref/{userId}/{refId}.ext`.
 * Validasi tipe (JPEG/PNG/WebP) + ukuran (≤5MB) sebelum upload.
 */
export async function uploadUserReference(
  userId: string,
  refId: string,
  bytes: Uint8Array,
  mimeType: string
): Promise<{ storagePath: string; publicUrl: string }> {
  assertValidReferenceFile(bytes.length, mimeType);
  const ext = referenceExtensionFor(mimeType);
  const supabase = getServiceClient();
  const storagePath = `${STUDIO_REFERENCE_PREFIX}/${userId}/${refId}.${ext}`;
  const { error } = await supabase.storage
    .from(STUDIO_IMAGES_BUCKET)
    .upload(storagePath, bytes, { contentType: mimeType, upsert: true });
  if (error) throw new Error(`studio reference upload failed: ${error.message}`);
  const { data } = supabase.storage.from(STUDIO_IMAGES_BUCKET).getPublicUrl(storagePath);
  if (!data?.publicUrl) throw new Error('studio reference getPublicUrl returned empty');
  return { storagePath, publicUrl: data.publicUrl };
}

/** Download bytes dari URL referensi (public URL Storage sendiri). Timeout 30s. */
export async function fetchReferenceBytes(url: string, timeoutMs = 30000): Promise<{ bytes: Uint8Array; mimeType: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`fetch reference ${res.status}`);
    const buf = new Uint8Array(await res.arrayBuffer());
    if (buf.length === 0) throw new Error('reference empty body');
    return { bytes: buf, mimeType: res.headers.get('content-type') ?? 'image/png' };
  } finally {
    clearTimeout(timeout);
  }
}

/** Hapus 1 file studio (best-effort — cleanup tetap lanjut bila file sudah hilang). */
export async function removeUserImage(storagePath: string): Promise<void> {
  const supabase = getServiceClient();
  const { error } = await supabase.storage.from(STUDIO_IMAGES_BUCKET).remove([storagePath]);
  if (error && !/not found|does not exist/i.test(error.message)) {
    throw new Error(`studio storage remove failed: ${error.message}`);
  }
}
