import { NextRequest, NextResponse } from 'next/server';
import { env } from '@/lib/env';
import { isAdmin } from '@/lib/auth/is-admin';
import { createSupabaseService } from '@/lib/supabase/server';
import {
  exchangeCodeForShortToken,
  exchangeForLongLivedToken
} from '@/lib/social/threads';

/**
 * Fase 0 OAuth callback (admin-only).
 * Flow: Meta redirect ?code=... → tukar short (1 jam) → tukar long-lived (60 hari)
 * → simpan ke Vault (vault_create_secret) + update social_accounts.
 * Token tidak pernah di-echo ke response — hanya suffix 4 char di log server.
 */
export async function GET(request: NextRequest) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: 'Unauthorized: admin only' }, { status: 401 });
  }
  const code = request.nextUrl.searchParams.get('code');
  const errorParam = request.nextUrl.searchParams.get('error');
  if (errorParam) {
    return NextResponse.json({ error: `OAuth denied: ${errorParam}` }, { status: 400 });
  }
  if (!code) {
    return NextResponse.json({ error: 'missing ?code= (open the Threads authorize URL first)' }, { status: 400 });
  }
  const appId = env.threadsAppId ?? process.env.THREADS_APP_ID;
  const appSecret = env.threadsAppSecret ?? process.env.THREADS_APP_SECRET;
  const redirectUri =
    env.threadsRedirectUri ??
    process.env.THREADS_REDIRECT_URI ??
    `${env.siteUrl}/api/social/oauth/callback`;
  if (!appId || !appSecret) {
    return NextResponse.json(
      { error: 'THREADS_APP_ID/THREADS_APP_SECRET not configured (see .env.example Fase 0)' },
      { status: 500 }
    );
  }
  const supabase = createSupabaseService();
  if (!supabase) {
    return NextResponse.json({ error: 'service not configured' }, { status: 500 });
  }

  try {
    const { accessToken: shortToken, userId } = await exchangeCodeForShortToken(fetch, {
      appId,
      appSecret,
      code,
      redirectUri
    });
    const longToken = await exchangeForLongLivedToken(fetch, {
      appSecret,
      shortToken
    });

    const { data: vaultId, error: vaultError } = await supabase.rpc('vault_create_secret', {
      p_secret: longToken,
      p_name: 'threads_access_token_asharu_id'
    });
    if (vaultError || !vaultId) {
      throw new Error(`vault_create_secret: ${vaultError?.message ?? 'no id'}`);
    }
    const expiresAt = new Date(Date.now() + 60 * 24 * 60 * 60_000).toISOString();
    const { error: updError } = await supabase
      .from('social_accounts')
      .update({
        threads_user_id: String(userId),
        token_suffix: longToken.slice(-4),
        token_expires_at: expiresAt,
        status: 'active'
      })
      .eq('platform_slug', 'threads')
      .eq('vault_secret_name', 'threads_access_token_asharu_id');
    if (updError) throw new Error(updError.message);

    const site = env.siteUrl;
    return NextResponse.redirect(`${site}/id/admin/sosial?oauth=ok&user=${userId}`);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
