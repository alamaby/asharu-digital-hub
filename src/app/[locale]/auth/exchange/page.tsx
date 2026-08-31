'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Link } from '@/i18n/navigation';
import { createSupabaseBrowser } from '@/lib/supabase/client';

/**
 * Magic-link exchange page.
 *
 * Supports two flows:
 * 1. `?token_hash=<hash>&type=magiclink` — recommended. The email template
 *    embeds {{ .TokenHash }} so no PKCE verifier cookie is needed; the hash is
 *    exchanged via `verifyOtp` (works client- or server-side).
 * 2. `?code=<pkce-code>` — legacy PKCE fallback (requires the code_verifier
 *    cookie set at signInWithOtp time and preserved across the redirect).
 *
 * Also handles `?error=` / `?error_description=` from GoTrue rejections.
 */
const VERIFY_TYPES = ['magiclink', 'signup', 'invite', 'recovery', 'email'] as const;
type VerifyType = (typeof VERIFY_TYPES)[number];

function parseVerifyType(value: string | null): VerifyType {
  return VERIFY_TYPES.includes(value as VerifyType) ? (value as VerifyType) : 'magiclink';
}

export default function ExchangePage() {
  const router = useRouter();
  const [status, setStatus] = useState<'pending' | 'ok' | 'error'>('pending');
  const [message, setMessage] = useState('');

  useEffect(() => {
    const supabase = createSupabaseBrowser();
    if (!supabase) {
      setStatus('error');
      setMessage('Konfigurasi Supabase belum diisi.');
      return;
    }

    (async () => {
      const url = new URL(window.location.href);
      const next = url.searchParams.get('next') ?? '/id/konten/review';
      const code = url.searchParams.get('code');
      const tokenHash = url.searchParams.get('token_hash') ?? url.searchParams.get('token');
      const type = parseVerifyType(url.searchParams.get('type'));
      const errorParam = url.searchParams.get('error_description') ?? url.searchParams.get('error');

      if (errorParam) {
        setStatus('error');
        setMessage(errorParam);
        return;
      }

      // Flow 1: token_hash (no PKCE verifier needed — deterministic).
      if (tokenHash) {
        const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
        if (error) {
          setStatus('error');
          setMessage(error.message);
          return;
        }
        setStatus('ok');
        router.replace(next);
        return;
      }

      // Flow 2: legacy PKCE code (requires code_verifier cookie).
      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) {
          setStatus('error');
          setMessage(error.message);
          return;
        }
        setStatus('ok');
        router.replace(next);
        return;
      }

      // Fallback: implicit flow (#access_token=...) or an existing session.
      const { data } = await supabase.auth.getSession();
      if (data.session) {
        setStatus('ok');
        router.replace(next);
        return;
      }

      setStatus('error');
      setMessage('Tautan tidak berisi kode. Coba minta tautan baru.');
    })();
  }, [router]);

  return (
    <div className="mx-auto max-w-md px-4 py-16 text-center sm:px-6">
      <h1 className="text-2xl font-semibold text-ink">
        {status === 'pending' && 'Memproses tautan masuk...'}
        {status === 'ok' && 'Berhasil! Mengalihkan...'}
        {status === 'error' && 'Gagal Masuk'}
      </h1>
      {status === 'error' ? (
        <>
          <p className="mt-3 text-sm text-red-700">{message}</p>
          <Link className="mt-6 inline-block text-sm text-primary underline" href="/masuk">
            Kembali ke halaman masuk
          </Link>
        </>
      ) : null}
    </div>
  );
}
