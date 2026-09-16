import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getServiceClient } from '@/lib/supabase/service';
import { assertValidReferenceFile, referenceExtensionFor } from '@/lib/image/types';

export const STUDIO_IMAGES_BUCKET = 'user-images';
/** Prefix file referensi img2img (`ref/`) — bedakan dari hasil generate. */
export const STUDIO_REFERENCE_PREFIX = 'ref';

/**
 * Error upload/generate Storage Studio yang membawa status HTTP + nama error
 * asli service. Tanpa ini, `error.message` Storage bisa berisi `<none>`
 * (kasus `c19c8d2f` 16 Sep 2026, HTTP 520) sehingga tak bisa didiagnosis.
 */
export class StudioStorageError extends Error {
  readonly status?: number;
  readonly statusCode?: string;
  readonly storageError?: string;
  readonly originalError?: unknown;

  constructor(
    message: string,
    opts: { status?: number; statusCode?: string; storageError?: string; originalError?: unknown } = {}
  ) {
    super(message);
    this.name = 'StudioStorageError';
    this.status = opts.status;
    this.statusCode = opts.statusCode;
    this.storageError = opts.storageError;
    this.originalError = opts.originalError;
  }
}

/**
 * Status HTTP yang layak dicoba ulang: 5xx (infra/gateway, mis. 520) dan
 * 408/429 (timeout/throttle). 4xx lain (400/403/409) permanen — retry sia-sia.
 */
export function isTransientStorageError(error: unknown): boolean {
  if (!(error instanceof StudioStorageError)) return false;
  const status = error.status;
  if (typeof status !== 'number') return true;
  return status >= 500 || status === 408 || status === 429;
}

/** Deskripsi diagnostik: sertakan status + nama error Storage asli bila ada. */
export function describeStorageError(error: unknown): string {
  if (error instanceof StudioStorageError) {
    const parts = [error.message];
    if (typeof error.status === 'number') parts.push(`HTTP ${error.status}`);
    if (error.statusCode) parts.push(`code=${error.statusCode}`);
    if (error.storageError && error.storageError !== 'none') parts.push(`storage=${error.storageError}`);
    return parts.join(' | ');
  }
  return error instanceof Error ? error.message : String(error);
}

/** Bungkus error Storage SDK → StudioStorageError (status + code + nama error). */
function toStudioStorageError(error: unknown, prefix: string): StudioStorageError {
  const e = error as { message?: string; status?: number; statusCode?: string; error?: string } | null;
  const detail = e?.message && e.message !== 'none' ? e.message : '';
  const storageError = typeof e?.error === 'string' ? e.error : undefined;
  const label = storageError && storageError !== 'none' ? storageError : detail || 'upload gagal';
  return new StudioStorageError(`${prefix}: ${label}`, {
    status: typeof e?.status === 'number' ? e.status : undefined,
    statusCode: typeof e?.statusCode === 'string' ? e.statusCode : undefined,
    storageError,
    originalError: error
  });
}

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
  if (error) throw toStudioStorageError(error, 'studio storage upload failed');
  const { data } = supabase.storage.from(STUDIO_IMAGES_BUCKET).getPublicUrl(storagePath);
  if (!data?.publicUrl) throw new Error('studio storage getPublicUrl returned empty');
  return { storagePath, publicUrl: data.publicUrl };
}

/** Jeda backoff retry upload (ms) — 2 percobaan ulang setelah percobaan awal. */
const UPLOAD_RETRY_DELAYS_MS = [400, 1200] as const;

/**
 * Upload hasil generate dengan retry berjenjang pada error TRANSIENT
 * (5xx/408/429). Kasus `c19c8d2f` (16 Sep 2026): Storage membalas 520 sesaat
 * setelah Pixazo berhasil generate — satu blip mematikan seluruh generate.
 * Error permanen (400/403/409) tidak diulang: langsung dilempar.
 */
export async function uploadUserImageWithRetry(
  userId: string,
  imageId: string,
  bytes: Uint8Array,
  mimeType: string,
  delaysMs: readonly number[] = UPLOAD_RETRY_DELAYS_MS
): Promise<{ storagePath: string; publicUrl: string }> {
  let lastError: unknown = null;
  for (let attempt = 0; attempt <= delaysMs.length; attempt += 1) {
    try {
      return await uploadUserImage(userId, imageId, bytes, mimeType);
    } catch (e) {
      lastError = e;
      const canRetry = attempt < delaysMs.length && isTransientStorageError(e);
      if (!canRetry) throw e;
      await new Promise((resolve) => setTimeout(resolve, delaysMs[attempt]));
    }
  }
  throw lastError ?? new Error('studio storage upload failed: unknown');
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
