import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getServiceClient } from '@/lib/supabase/service';
import { assertValidReferenceFile, referenceExtensionFor } from '@/lib/image/types';

export const STUDIO_IMAGES_BUCKET = 'user-images';
/** Prefix file referensi img2img (`ref/`) — bedakan dari hasil generate. */
export const STUDIO_REFERENCE_PREFIX = 'ref';

/** Nama file referensi: UUID + ekstensi aman (tanpa path traversal). */
const FRESH_REFERENCE_FILE_RE = /^[0-9a-fA-F-]{1,64}\.(jpg|jpeg|png|webp)$/;

/**
 * Turunkan storage path dari public URL upload-baru milik user sendiri.
 * Syarat: URL == prefix publik bucket + `ref/{userId}/{nama-file}`.
 * Kembalikan null bila bukan milik user (URL asing / format tak dikenal).
 * Murni (tanpa I/O) agar mudah diuji; keberadaan file dicek terpisah
 * via `assertFreshReferenceExists`.
 */
export function resolveFreshReferenceStoragePath(args: {
  userId: string;
  publicUrl: string;
  supabaseUrl: string;
}): string | null {
  const base = args.supabaseUrl.replace(/\/+$/, '');
  if (!base || !args.userId) return null;
  const prefix = `${base}/storage/v1/object/public/${STUDIO_IMAGES_BUCKET}/${STUDIO_REFERENCE_PREFIX}/${args.userId}/`;
  if (!args.publicUrl.startsWith(prefix)) return null;
  const file = args.publicUrl.slice(prefix.length);
  if (!FRESH_REFERENCE_FILE_RE.test(file)) return null;
  return `${STUDIO_REFERENCE_PREFIX}/${args.userId}/${file}`;
}

/**
 * Pastikan file referensi benar ada di Storage (anti URL karangan yang
 * kebetulan cocok prefix). Best-effort: `exists()` → false = tolak; error
 * jaringan/Storage transient = lanjut (prefix `ref/{userId}/` + regex URL
 * sudah jadi batas keamanan, jangan blokir enqueue karena gangguan infra).
 *
 * PENTING: pakai Storage API (`storage.from().exists()`), BUKAN
 * `.from('storage.objects')` — schema `storage` tidak diekspos PostgREST
 * (PGRST106/PGRST205), itu yang membuat upload-baru selalu ditolak 12 Sep 2026.
 */
export async function assertFreshReferenceExists(
  supabase: SupabaseClient,
  storagePath: string
): Promise<void> {
  let found: boolean;
  try {
    const { data } = await supabase.storage.from(STUDIO_IMAGES_BUCKET).exists(storagePath);
    found = data;
  } catch {
    return;
  }
  if (!found) throw new Error('Referensi harus dari upload atau histori milik Anda.');
}

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
