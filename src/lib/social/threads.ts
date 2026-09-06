/**
 * Minimal Threads (Meta) API client — TEXT only tahap awal.
 * Flow resmi: POST /{user-id}/threads → creation_id → POST /{user-id}/threads_publish.
 * Reply chain: tiap reply container membawa reply_to_id = parent threads_media_id.
 * `fetchImpl` di-inject agar unit-testable tanpa network.
 */

const GRAPH_HOST = 'https://graph.threads.com/v1.0';

export interface ThreadsPublishResult {
  containerId: string;
  mediaId: string;
}

type FetchImpl = typeof fetch;

async function postJson(
  fetchImpl: FetchImpl,
  url: string,
  token: string,
  body: Record<string, unknown>
): Promise<unknown> {
  const res = await fetchImpl(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const data = (await res.json().catch(() => null)) as {
    id?: string;
    error?: { code?: number; message?: string };
  } | null;
  if (!res.ok || !data?.id) {
    const message = data?.error?.message ?? `Threads API ${res.status}`;
    throw new Error(message);
  }
  return data;
}

export async function createTextContainer(
  fetchImpl: FetchImpl,
  params: { threadsUserId: string; token: string; text: string; replyToId?: string }
): Promise<string> {
  const body: Record<string, unknown> = { media_type: 'TEXT', text: params.text };
  if (params.replyToId) body.reply_to_id = params.replyToId;
  const data = (await postJson(
    fetchImpl,
    `${GRAPH_HOST}/${params.threadsUserId}/threads`,
    params.token,
    body
  )) as { id: string };
  return data.id;
}

export async function publishContainer(
  fetchImpl: FetchImpl,
  params: { threadsUserId: string; token: string; creationId: string }
): Promise<string> {
  const data = (await postJson(
    fetchImpl,
    `${GRAPH_HOST}/${params.threadsUserId}/threads_publish`,
    params.token,
    { creation_id: params.creationId }
  )) as { id: string };
  return data.id;
}

/** Publish 1 teks (container → publish). */
export async function publishSingleText(
  fetchImpl: FetchImpl,
  params: { threadsUserId: string; token: string; text: string; replyToId?: string }
): Promise<ThreadsPublishResult> {
  const containerId = await createTextContainer(fetchImpl, params);
  const mediaId = await publishContainer(fetchImpl, {
    threadsUserId: params.threadsUserId,
    token: params.token,
    creationId: containerId
  });
  return { containerId, mediaId };
}

/**
 * Publish full thread berurutan: opener dulu, tiap reply me-reply parent.
 * `onPost` dipanggil per post sukses (untuk audit logs per post_index).
 * Berhenti (throw) di post gagal pertama agar worker bisa resume dari index terakhir.
 */
export async function publishThreadChain(
  fetchImpl: FetchImpl,
  params: {
    threadsUserId: string;
    token: string;
    texts: string[];
    startIndex?: number;
    parentMediaId?: string;
    onPost?: (index: number, result: ThreadsPublishResult) => void | Promise<void>;
  }
): Promise<ThreadsPublishResult[]> {
  const results: ThreadsPublishResult[] = [];
  let parent = params.parentMediaId;
  const start = params.startIndex ?? 0;
  for (let i = start; i < params.texts.length; i++) {
    const text = params.texts[i]!;
    const result = await publishSingleText(fetchImpl, {
      threadsUserId: params.threadsUserId,
      token: params.token,
      text,
      replyToId: parent
    });
    results.push(result);
    parent = result.mediaId;
    await params.onPost?.(i, result);
  }
  return results;
}

/** Cek kuota publish sebelum burst (butuh scope threads_basic + threads_content_publish). */
export async function fetchPublishingLimit(
  fetchImpl: FetchImpl,
  params: { threadsUserId: string; token: string }
): Promise<{ quotaUsage: number | null }> {
  const url =
    `${GRAPH_HOST}/${params.threadsUserId}/threads_publishing_limit` +
    `?fields=quota_usage,config,reply_quota_usage`;
  const res = await fetchImpl(url, {
    headers: { Authorization: `Bearer ${params.token}` }
  });
  if (!res.ok) return { quotaUsage: null };
  const data = (await res.json().catch(() => null)) as { quota_usage?: number } | null;
  return { quotaUsage: typeof data?.quota_usage === 'number' ? data.quota_usage : null };
}

/** Exchange OAuth code → short-lived token (server-side, secret tidak boleh ke client). */
export async function exchangeCodeForShortToken(
  fetchImpl: FetchImpl,
  params: { appId: string; appSecret: string; code: string; redirectUri: string }
): Promise<{ accessToken: string; userId: number }> {
  const res = await fetchImpl('https://graph.threads.com/oauth/access_token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: params.appId,
      client_secret: params.appSecret,
      code: params.code,
      grant_type: 'authorization_code',
      redirect_uri: params.redirectUri
    })
  });
  const data = (await res.json().catch(() => null)) as {
    access_token?: string;
    user_id?: number;
  } | null;
  if (!res.ok || !data?.access_token) throw new Error('Threads OAuth code exchange failed');
  return { accessToken: data.access_token, userId: data.user_id ?? 0 };
}

/** Tukar short-lived (1 jam) → long-lived (60 hari). */
export async function exchangeForLongLivedToken(
  fetchImpl: FetchImpl,
  params: { appSecret: string; shortToken: string }
): Promise<string> {
  const url =
    `https://graph.threads.com/access_token?grant_type=th_exchange_token` +
    `&client_secret=${encodeURIComponent(params.appSecret)}` +
    `&access_token=${encodeURIComponent(params.shortToken)}`;
  const res = await fetchImpl(url);
  const data = (await res.json().catch(() => null)) as { access_token?: string } | null;
  if (!res.ok || !data?.access_token) throw new Error('Threads long-lived exchange failed');
  return data.access_token;
}

/** Refresh long-lived token (syarat umur ≥24 jam, valid 60 hari lagi). */
export async function refreshLongLivedToken(
  fetchImpl: FetchImpl,
  params: { token: string }
): Promise<string> {
  const url =
    `https://graph.threads.com/refresh_access_token?grant_type=th_refresh_token` +
    `&access_token=${encodeURIComponent(params.token)}`;
  const res = await fetchImpl(url);
  const data = (await res.json().catch(() => null)) as { access_token?: string } | null;
  if (!res.ok || !data?.access_token) throw new Error('Threads token refresh failed');
  return data.access_token;
}
