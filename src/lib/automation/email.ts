import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { env } from '@/lib/env';
import type { AutomationConfig } from './config';

const RESEND_ENDPOINT = 'https://api.resend.com/emails';
const SEND_TIMEOUT_MS = 15000;

export interface AutomationEmailInput {
  to: string[];
  subject: string;
  html: string;
  from: string;
  replyTo?: string | null;
}

export interface SendResult {
  ok: boolean;
  /** Resend message id bila sukses. */
  id?: string;
  error?: string;
  /** True bila email memang dilewati (tidak ada penerima / key). */
  skipped?: boolean;
}

/**
 * Resolve Resend API key: Vault `resend_api_key` (preferred, rotasi Dashboard)
 * → env `RESEND_API_KEY` (dev). Service-role client wajib untuk RPC.
 * Tidak pernah melempar — RPC bisa gagal jaringan; caller memperlakukannya
 * sebagai "email di-skip", bukan error fatal bagi alur automation.
 */
export async function resolveResendKey(supabase: SupabaseClient): Promise<string | null> {
  try {
    const fromEnv = env.resendApiKey?.trim();
    if (fromEnv) return fromEnv;
    const { data, error } = await supabase.rpc('vault_decrypt_secret_by_name', {
      p_name: 'resend_api_key'
    });
    if (error) return null;
    const key = typeof data === 'string' ? data.trim() : '';
    return key || null;
  } catch {
    return null;
  }
}

/** Kirim 1 email via Resend REST (tanpa dependency baru). */
export async function sendViaResend(
  apiKey: string,
  input: AutomationEmailInput,
  fetchImpl: typeof fetch = fetch
): Promise<SendResult> {
  if (input.to.length === 0) return { ok: false, skipped: true, error: 'no recipients' };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SEND_TIMEOUT_MS);
  try {
    const res = await fetchImpl(RESEND_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: input.from,
        to: input.to,
        subject: input.subject,
        html: input.html,
        ...(input.replyTo ? { reply_to: input.replyTo } : {})
      }),
      signal: controller.signal
    });
    const text = await res.text();
    if (!res.ok) {
      return { ok: false, error: `resend ${res.status}: ${text.slice(0, 300)}` };
    }
    let id: string | undefined;
    try {
      id = (JSON.parse(text) as { id?: string }).id;
    } catch {
      /* respons sukses tanpa JSON yang bisa diparse — tetap ok */
    }
    return { ok: true, id };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { ok: false, error: `resend request gagal: ${message}` };
  } finally {
    clearTimeout(timer);
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function emailShell(title: string, bodyHtml: string): string {
  return [
    '<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;line-height:1.6;color:#111">',
    `<h2 style="margin:0 0 12px">${escapeHtml(title)}</h2>`,
    bodyHtml,
    '<hr style="margin:24px 0;border:none;border-top:1px solid #e5e7eb" />',
    '<p style="color:#6b7280;font-size:12px">Email otomatis dari Asharu Digital Hub — automation riset harian.</p>',
    '</div>'
  ].join('\n');
}

/**
 * Satu-satunya jalan keluar pengiriman email. Menangkap SEMUA error
 * (key resolution, render payload, fetch) dan selalu mengembalikan
 * `SendResult` — tidak pernah melempar. Kontrak ini yang menjaga workflow
 * tetap berjalan meski pengiriman email gagal total.
 */
async function deliver(
  supabase: SupabaseClient,
  cfg: AutomationConfig,
  input: { recipients: string[]; subject: string; html: string }
): Promise<SendResult> {
  try {
    if (input.recipients.length === 0) {
      return { ok: false, skipped: true, error: 'no recipients' };
    }
    const apiKey = await resolveResendKey(supabase);
    if (!apiKey) return { ok: false, skipped: true, error: 'resend key not configured' };
    return await sendViaResend(apiKey, {
      to: input.recipients,
      subject: input.subject,
      html: input.html,
      from: cfg.emailFrom,
      replyTo: cfg.emailReplyTo
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { ok: false, error: `email gagal: ${message}` };
  }
}

/**
 * Email "draft siap": daftar draf per platform + link review. Tidak pernah
 * melempar — kegagalan email tidak boleh memblok alur publish.
 */
export async function sendDraftReadyEmail(
  supabase: SupabaseClient,
  cfg: AutomationConfig,
  input: {
    recipients: string[];
    runDate: string;
    productName: string;
    drafts: Array<{ platform: string; draftId: string }>;
    siteUrl: string;
  }
): Promise<SendResult> {
  let rows: string;
  let shell: string;
  try {
    rows = input.drafts
      .map(
        (d) =>
          `<li>${escapeHtml(d.platform)} — <a href="${escapeHtml(
            `${input.siteUrl}/id/konten/review/${d.draftId}`
          )}">buka draf ${escapeHtml(d.draftId.slice(0, 8))}</a></li>`
      )
      .join('');
    shell = emailShell(
      `Draf riset ${input.runDate} siap direview`,
      [
        `<p>Produk terpilih: <strong>${escapeHtml(input.productName)}</strong>.</p>`,
        `<ul>${rows}</ul>`,
        `<p><a href="${escapeHtml(`${input.siteUrl}/id/konten/review`)}">Buka halaman review</a></p>`
      ].join('\n')
    );
  } catch (e) {
    return { ok: false, error: `render draft_ready gagal: ${e instanceof Error ? e.message : String(e)}` };
  }
  return deliver(supabase, cfg, {
    recipients: input.recipients,
    subject: `[Asharu] Draf riset ${input.runDate} siap`,
    html: shell
  });
}

/**
 * Email "artikel published": link artikel publik per locale. Tidak melempar.
 */
export async function sendPublishedEmail(
  supabase: SupabaseClient,
  cfg: AutomationConfig,
  input: {
    recipients: string[];
    runDate: string;
    productName: string;
    articles: Array<{ locale: string; slug: string }>;
    siteUrl: string;
  }
): Promise<SendResult> {
  let shell: string;
  try {
    const links = input.articles
      .map(
        (a) =>
          `<li><a href="${escapeHtml(`${input.siteUrl}/${a.locale}/artikel/${a.slug}`)}">${escapeHtml(
            a.locale.toUpperCase()
          )}: ${escapeHtml(a.slug)}</a></li>`
      )
      .join('');
    shell = emailShell(
      `Artikel ${input.runDate} sudah terbit`,
      [
        `<p>Produk: <strong>${escapeHtml(input.productName)}</strong>.</p>`,
        `<ul>${links}</ul>`
      ].join('\n')
    );
  } catch (e) {
    return { ok: false, error: `render published gagal: ${e instanceof Error ? e.message : String(e)}` };
  }
  return deliver(supabase, cfg, {
    recipients: input.recipients,
    subject: `[Asharu] Artikel ${input.runDate} sudah terbit`,
    html: shell
  });
}

/** Email kegagalan run (best-effort). Tidak melempar. */
export async function sendFailureEmail(
  supabase: SupabaseClient,
  cfg: AutomationConfig,
  input: { recipients: string[]; runDate: string; stage: string; error: string; siteUrl: string }
): Promise<SendResult> {
  let shell: string;
  try {
    shell = emailShell(
      `Automation riset ${input.runDate} gagal`,
      [
        `<p>Tahap: <strong>${escapeHtml(input.stage)}</strong></p>`,
        `<p style="color:#b91c1c">${escapeHtml(input.error)}</p>`,
        `<p><a href="${escapeHtml(`${input.siteUrl}/id/admin/automation`)}">Buka halaman automation</a></p>`
      ].join('\n')
    );
  } catch (e) {
    return { ok: false, error: `render failure gagal: ${e instanceof Error ? e.message : String(e)}` };
  }
  return deliver(supabase, cfg, {
    recipients: input.recipients,
    subject: `[Asharu] Automation gagal (${input.runDate})`,
    html: shell
  });
}
