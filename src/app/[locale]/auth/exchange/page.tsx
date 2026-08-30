'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Link } from '@/i18n/navigation';
import { createSupabaseBrowser } from '@/lib/supabase/client';

/**
 * Client-side fallback for the magic-link PKCE exchange.
 *
 * The server-side /api/auth/callback can fail when the PKCE code_verifier
 * cookie isn't visible to Next.js' server cookies() — happens when the
 * cookie was set with attributes that prevent server-side reads, or when the
 * redirect_to is not in the Supabase allow list (GoTrue still redirects
 * but with a stripped / invalid code).
 *
 * This page does the exchange entirely in the browser, where the verifier
 * cookie lives in the same origin and is reliably readable.
 */
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
      // detectSessionInUrl + exchangeCodeForSession handle the ?code= from
      // the magic-link redirect. The PKCE verifier cookie is in the same
      // origin, so the client SDK can read it.
      const url = new URL(window.location.href);
      const code = url.searchParams.get('code');
      const next = url.searchParams.get('next') ?? '/id/konten/review';
      const errorParam = url.searchParams.get('error_description') ?? url.searchParams.get('error');

      if (errorParam) {
        setStatus('error');
        setMessage(errorParam);
        return;
      }
      if (!code) {
        setStatus('error');
        setMessage('Tautan tidak berisi kode. Coba minta tautan baru.');
        return;
      }

      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (error) {
        setStatus('error');
        setMessage(error.message);
        return;
      }
      setStatus('ok');
      // Use replace so the back button doesn't bring us back to the error page.
      router.replace(next);
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
        <p className="mt-3 text-sm text-red-700">{message}</p>
      ) : null}
      {status === 'error' ? (
        <Link className="mt-6 inline-block text-sm text-primary underline" href="/masuk">
          Kembali ke halaman masuk
        </Link>
      ) : null}
    </div>
  );
}
