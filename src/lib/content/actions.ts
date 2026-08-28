'use server';

import { z } from 'zod';
import { headers } from 'next/headers';
import { createClient } from '@supabase/supabase-js';
import { checkRateLimit, getClientIp, incrementRateLimit } from './rate-limit';

const requestSchema = z.object({
  topic: z.string().min(10).max(500),
  platform: z.string().min(1),
  tone: z.enum(['casual', 'formal', 'witty', 'professional', 'friendly', 'edukatif']),
  targetCategory: z.string().optional(),
  audience: z.string().min(3).max(200),
  ctaStyle: z.string().min(1),
  purpose: z.string().min(3).max(200),
  constraints: z.string().max(500).optional(),
  keywords: z.string().max(200).optional(),
  language: z.enum(['id', 'en', 'both']),
  website: z.string().optional() // honeypot
});

export interface ActionResult {
  success: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
}

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase service credentials missing');
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function createContentRequest(formData: FormData): Promise<ActionResult> {
  const raw = Object.fromEntries(formData.entries()) as Record<string, string>;

  // Honeypot
  if (raw.website && raw.website.trim() !== '') {
    return { success: false, error: 'honeypot' };
  }

  // Normalize empty targetCategory
  if (raw.targetCategory === '' || raw.targetCategory === 'all') {
    raw.targetCategory = undefined as unknown as string;
  }
  if (raw.constraints === '') raw.constraints = undefined as unknown as string;
  if (raw.keywords === '') raw.keywords = undefined as unknown as string;

  const parsed = requestSchema.safeParse(raw);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path.join('.') || 'form';
      fieldErrors[key] = issue.message;
    }
    return { success: false, fieldErrors, error: 'validation' };
  }

  // Rate limit
  const hdrs = await headers();
  const ip = getClientIp(hdrs);
  const { allowed, count } = await checkRateLimit(ip);
  if (!allowed) {
    return { success: false, error: `rate_limit:${count}` };
  }

  const supabase = getServiceClient();

  // Validate platform exists
  const { data: platform } = await supabase.from('platforms').select('slug').eq('slug', parsed.data.platform).maybeSingle();
  if (!platform) {
    return { success: false, fieldErrors: { platform: 'Platform tidak valid' }, error: 'validation' };
  }

  const { error } = await supabase.from('content_requests').insert({
    topic: parsed.data.topic,
    platform_slug: parsed.data.platform,
    tone: parsed.data.tone,
    target_category: parsed.data.targetCategory || null,
    audience: parsed.data.audience,
    cta_style: parsed.data.ctaStyle,
    purpose: parsed.data.purpose,
    constraints: parsed.data.constraints || null,
    keywords: parsed.data.keywords || null,
    language: parsed.data.language,
    status: 'pending'
  });

  if (error) {
    return { success: false, error: error.message };
  }

  await incrementRateLimit(ip);
  return { success: true };
}
