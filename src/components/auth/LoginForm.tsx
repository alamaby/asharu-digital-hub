'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { createSupabaseBrowser } from '@/lib/supabase/client';
import { env } from '@/lib/env';

export function LoginForm() {
  const t = useTranslations('auth.login');
  const [email, setEmail] = useState('');
  const [pending, setPending] = useState(false);
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setStatus('idle');
    setMessage('');

    const supabase = createSupabaseBrowser();
    if (!supabase) {
      setStatus('error');
      setMessage(t('error'));
      setPending(false);
      return;
    }

    // Prefer the configured public site URL so magic links always point at
    // the production domain (e.g. https://asharu.id), even when the dashboard
    // opens a preview URL. Fall back to the current origin in local dev.
    //
    // CRITICAL: the email template (supabase/templates/magic_link.html) builds
    // the magic-link href from {{ .RedirectTo }} — i.e. THIS value — plus
    // {{ .TokenHash }}/{{ .Type }}. So redirect_to must be a FULL URL pointing
    // at the exchange page, and it MUST be listed in Supabase Dashboard →
    // Auth → URL Configuration → Redirect URLs (GoTrue validates against it).
    // We intentionally don't rely on {{ .SiteURL }} (Dashboard "Site URL"
    // setting defaults to http://localhost:3000 and is configured separately).
    // emailRedirectTo is also reused by the legacy ?code PKCE fallback flow.
    const base = (env.siteUrl && env.siteUrl.length > 0) ? env.siteUrl : window.location.origin;
    const emailRedirectTo = `${base.replace(/\/$/, '')}/id/auth/exchange`;

    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo }
    });

    if (error) {
      setStatus('error');
      setMessage(error.message);
    } else {
      setStatus('success');
      setMessage(t('success'));
    }
    setPending(false);
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      <div>
        <label htmlFor="login-email" className="block text-sm font-medium text-ink">
          {t('emailLabel')}
        </label>
        <input
          id="login-email"
          name="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder={t('emailPlaceholder')}
          className="mt-1 block w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-muted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
        />
      </div>

      <button
        type="submit"
        disabled={pending}
        className="btn-primary w-full"
        aria-busy={pending}
      >
        {pending ? t('submitting') : t('submit')}
      </button>

      {status !== 'idle' ? (
        <p
          role="status"
          aria-live="polite"
          className={
            status === 'success'
              ? 'rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800'
              : 'rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800'
          }
        >
          {message}
        </p>
      ) : null}
    </form>
  );
}
