'use server';

import { revalidatePath } from 'next/cache';
import { isAdmin } from '@/lib/auth/is-admin';
import { createSupabaseService } from '@/lib/supabase/server';
import type { LlmActionResult } from './llm-actions';

function fail(message: string): LlmActionResult {
  return { ok: false, error: message };
}

async function requireAdmin() {
  if (!(await isAdmin())) throw new Error('Unauthorized: admin only');
  const supabase = createSupabaseService();
  if (!supabase) throw new Error('Supabase not configured');
  return supabase;
}

function slugify(raw: string): string {
  return raw
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

export interface SubjectRow {
  slug: string;
  display_name: string;
  subject_en: string;
  is_active: boolean;
  sort_order: number;
}

export async function addSubject(formData: FormData): Promise<LlmActionResult> {
  const supabase = await requireAdmin();
  const displayName = String(formData.get('display_name') ?? '').trim();
  const subjectEn = String(formData.get('subject_en') ?? '').trim();
  const slugRaw = String(formData.get('slug') ?? '').trim();
  if (!displayName) return fail('display_name required');
  if (subjectEn.length < 10 || subjectEn.length > 500) return fail('subject_en 10–500 karakter');
  const slug = slugRaw ? slugify(slugRaw) : slugify(displayName);
  if (!slug) return fail('slug tidak valid');
  const { data: maxRow } = await supabase.from('image_subject_templates').select('sort_order').order('sort_order', { ascending: false }).limit(1).maybeSingle();
  const nextOrder = (((maxRow as { sort_order?: number } | null)?.sort_order ?? 90) + 10);
  const { error } = await supabase.from('image_subject_templates').insert({
    slug, display_name: displayName, subject_en: subjectEn, is_active: true, sort_order: nextOrder
  } as never);
  if (error) return fail(error.message);
  revalidatePath('/admin/visual');
  revalidatePath('/konten/review');
  return { ok: true };
}

export async function updateSubject(slug: string, formData: FormData): Promise<LlmActionResult> {
  const supabase = await requireAdmin();
  const displayName = String(formData.get('display_name') ?? '').trim();
  const subjectEn = String(formData.get('subject_en') ?? '').trim();
  const sortOrder = Number(String(formData.get('sort_order') ?? '').trim());
  if (!displayName) return fail('display_name required');
  if (subjectEn.length < 10 || subjectEn.length > 500) return fail('subject_en 10–500 karakter');
  const patch: Record<string, unknown> = { display_name: displayName, subject_en: subjectEn };
  if (Number.isFinite(sortOrder)) patch.sort_order = Math.floor(sortOrder);
  const { error } = await supabase.from('image_subject_templates').update(patch).eq('slug', slug);
  if (error) return fail(error.message);
  revalidatePath('/admin/visual');
  revalidatePath('/admin/visual/subjects/[subjectSlug]');
  revalidatePath('/konten/review');
  return { ok: true };
}

export async function toggleSubjectActive(slug: string, isActive: boolean): Promise<LlmActionResult> {
  const supabase = await requireAdmin();
  const { error } = await supabase.from('image_subject_templates').update({ is_active: isActive }).eq('slug', slug);
  if (error) return fail(error.message);
  revalidatePath('/admin/visual');
  revalidatePath('/admin/visual/subjects/[subjectSlug]');
  revalidatePath('/konten/review');
  return { ok: true };
}

export async function reorderImageSubjects(orderedSlugs: string[]): Promise<LlmActionResult> {
  const supabase = await requireAdmin();
  for (let i = 0; i < orderedSlugs.length; i++) {
    const slug = orderedSlugs[i]!;
    const sortOrder = (i + 1) * 10;
    const { error } = await supabase.from('image_subject_templates').update({ sort_order: sortOrder }).eq('slug', slug);
    if (error) return fail(`reorderImageSubjects ${slug}: ${error.message}`);
  }
  revalidatePath('/admin/visual');
  revalidatePath('/admin/visual/subjects/[subjectSlug]');
  revalidatePath('/konten/review');
  return { ok: true };
}

export interface CameraAngleRow {
  slug: string;
  display_name: string;
  angle_en: string;
  is_active: boolean;
  sort_order: number;
}

function failAngle(message: string): LlmActionResult {
  return { ok: false, error: message };
}

function revalidateAnglePaths() {
  revalidatePath('/admin/visual');
  revalidatePath('/admin/visual/angles/[angleSlug]');
  revalidatePath('/studio');
  revalidatePath('/konten/review');
  revalidatePath('/konten/review/[draftId]', 'page');
}

export async function addCameraAngle(formData: FormData): Promise<LlmActionResult> {
  const supabase = await requireAdmin();
  const displayName = String(formData.get('display_name') ?? '').trim();
  const angleEn = String(formData.get('angle_en') ?? '').trim();
  const slugRaw = String(formData.get('slug') ?? '').trim();
  if (!displayName) return failAngle('display_name required');
  if (angleEn.length < 10 || angleEn.length > 500) return failAngle('angle_en 10–500 karakter');
  const slug = slugRaw ? slugify(slugRaw) : slugify(displayName);
  if (!slug) return failAngle('slug tidak valid');
  const { data: maxRow } = await supabase.from('image_camera_angles').select('sort_order').order('sort_order', { ascending: false }).limit(1).maybeSingle();
  const nextOrder = (((maxRow as { sort_order?: number } | null)?.sort_order ?? 250) + 10);
  const { error } = await supabase.from('image_camera_angles').insert({
    slug, display_name: displayName, angle_en: angleEn, is_active: true, sort_order: nextOrder
  } as never);
  if (error) return failAngle(error.message);
  revalidateAnglePaths();
  return { ok: true };
}

export async function updateCameraAngle(slug: string, formData: FormData): Promise<LlmActionResult> {
  const supabase = await requireAdmin();
  const displayName = String(formData.get('display_name') ?? '').trim();
  const angleEn = String(formData.get('angle_en') ?? '').trim();
  const sortOrder = Number(String(formData.get('sort_order') ?? '').trim());
  if (!displayName) return failAngle('display_name required');
  if (angleEn.length < 10 || angleEn.length > 500) return failAngle('angle_en 10–500 karakter');
  const patch: Record<string, unknown> = { display_name: displayName, angle_en: angleEn };
  if (Number.isFinite(sortOrder)) patch.sort_order = Math.floor(sortOrder);
  const { error } = await supabase.from('image_camera_angles').update(patch).eq('slug', slug);
  if (error) return failAngle(error.message);
  revalidateAnglePaths();
  return { ok: true };
}

export async function toggleCameraAngleActive(slug: string, isActive: boolean): Promise<LlmActionResult> {
  const supabase = await requireAdmin();
  const { error } = await supabase.from('image_camera_angles').update({ is_active: isActive }).eq('slug', slug);
  if (error) return failAngle(error.message);
  revalidateAnglePaths();
  return { ok: true };
}

export async function reorderCameraAngles(orderedSlugs: string[]): Promise<LlmActionResult> {
  const supabase = await requireAdmin();
  for (let i = 0; i < orderedSlugs.length; i++) {
    const slug = orderedSlugs[i]!;
    const sortOrder = (i + 1) * 10;
    const { error } = await supabase.from('image_camera_angles').update({ sort_order: sortOrder }).eq('slug', slug);
    if (error) return failAngle(`reorderCameraAngles ${slug}: ${error.message}`);
  }
  revalidateAnglePaths();
  return { ok: true };
}
