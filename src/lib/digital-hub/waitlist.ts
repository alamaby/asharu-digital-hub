'use server';

import { headers } from 'next/headers';
import { consumeRateLimit, getClientIp } from '@/lib/content/rate-limit';
import { contactConfig } from '@/config/site';
import { validatePilotInterest } from './validation';

export interface WaitlistResult {
  success: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
  /** Prefilled contact links — data is NOT auto-stored. */
  whatsappHref?: string;
  mailtoHref?: string;
}

/**
 * Honest pilot-interest handler: validates server-side, applies honeypot +
 * rate-limit, then returns prefilled official-contact links. It never writes
 * PII to logs and never claims database persistence.
 */
export async function submitPilotInterest(formData: FormData): Promise<WaitlistResult> {
  const raw = {
    name: String(formData.get('name') ?? ''),
    businessName: String(formData.get('businessName') ?? ''),
    category: String(formData.get('category') ?? ''),
    channel: String(formData.get('channel') ?? ''),
    challenge: String(formData.get('challenge') ?? ''),
    contact: String(formData.get('contact') ?? ''),
    consent: formData.get('consent') === 'on' || formData.get('consent') === 'true',
    website: String(formData.get('website') ?? '')
  };

  if (raw.website.trim() !== '') return { success: false, error: 'honeypot' };

  const parsed = validatePilotInterest(raw);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? 'form');
      if (!fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { success: false, error: 'validation', fieldErrors };
  }

  const hdrs = await headers();
  const { allowed, count } = await consumeRateLimit(getClientIp(hdrs), 'digital_hub_waitlist', 5, 60);
  if (!allowed) return { success: false, error: `rate_limit:${count}` };

  const message = `Halo Asharu, saya ${parsed.data.name} dari ${parsed.data.businessName} (${parsed.data.category}). Kanal utama: ${parsed.data.channel}. Kendala: ${parsed.data.challenge}. Kontak saya: ${parsed.data.contact}. Saya berminat pilot Asharu Digital Hub.`;
  const whatsappHref = contactConfig.whatsappUrl
    ? `${contactConfig.whatsappUrl}?text=${encodeURIComponent(message)}`
    : undefined;
  const mailtoHref = contactConfig.email
    ? `mailto:${contactConfig.email}?subject=${encodeURIComponent(`Minat pilot Digital Hub — ${parsed.data.businessName}`)}&body=${encodeURIComponent(message)}`
    : undefined;

  return { success: true, whatsappHref, mailtoHref };
}
