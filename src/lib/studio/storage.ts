import 'server-only';
import { getServiceClient } from '@/lib/supabase/service';

export const STUDIO_IMAGES_BUCKET = 'user-images';

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

/** Hapus 1 file studio (best-effort — cleanup tetap lanjut bila file sudah hilang). */
export async function removeUserImage(storagePath: string): Promise<void> {
  const supabase = getServiceClient();
  const { error } = await supabase.storage.from(STUDIO_IMAGES_BUCKET).remove([storagePath]);
  if (error && !/not found|does not exist/i.test(error.message)) {
    throw new Error(`studio storage remove failed: ${error.message}`);
  }
}
