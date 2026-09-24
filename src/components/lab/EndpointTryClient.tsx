'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import type { Locale } from '@/i18n/routing';
import { formatDateTime } from '@/lib/utils/format';
import {
  saveEndpointTryRun,
  listEndpointTryRuns
} from '@/lib/endpoint-try/actions';
import type { EndpointKind, EndpointModelsResult, EndpointChatResult, EndpointTryRunRow } from '@/lib/endpoint-try/types';
import { parseSseChunks, extractOpenAIStreamText, extractAnthropicStreamText } from '@/lib/endpoint-try/adapters';

const LS_KEY_BASEURL = 'endpoint-try-baseUrl';
const LS_KEY_KIND = 'endpoint-try-kind';
const LS_KEY_MODEL = 'endpoint-try-model';

const PAGE_SIZE = 10;

interface Props {
  locale: string;
  timeZone: string;
  quota: { used: number; limit: number | null; remaining: number | null } | null;
  history: { items: EndpointTryRunRow[]; total: number; page: number; pageSize: number; totalPages: number } | null;
  error: string | null;
}

interface TryHistoryFilters {
  status: 'all' | 'ok' | 'error';
  providerKind: '' | EndpointKind;
  modelQuery: string;
  sortDir: 'desc' | 'asc';
}

const DEFAULT_FILTERS: TryHistoryFilters = {
  status: 'all',
  providerKind: '',
  modelQuery: '',
  sortDir: 'desc'
};

function fmtInt(v: number | null | undefined): string {
  return v === null || v === undefined ? '-' : v.toLocaleString();
}

function MetricBox({
  label,
  value,
  accent
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="rounded-lg border border-line px-1 py-1.5">
      <dt className="text-[10px] uppercase tracking-wide text-ink-muted">{label}</dt>
      <dd className={`font-mono text-sm font-semibold ${accent ? 'text-primary' : 'text-ink'}`}>
        {value}
      </dd>
    </div>
  );
}

const selectCls =
  'w-full rounded-md border border-line bg-surface px-2 py-1.5 text-xs text-ink focus:outline-none focus:ring-2 focus:ring-primary';

export function EndpointTryPageClient({ locale, timeZone, quota, history, error }: Props) {
  const t = useTranslations('lab.try');
  const tResult = useTranslations('lab.result');
  const tHist = useTranslations('lab.history');
  const tQuota = useTranslations('lab.quota');
  const [kind, setKind] = useState<EndpointKind>(() => {
    try {
      return (localStorage.getItem(LS_KEY_KIND) as EndpointKind | null) ?? 'openai';
    } catch {
      return 'openai';
    }
  });
  const [baseUrl, setBaseUrl] = useState(() => {
    try { return localStorage.getItem(LS_KEY_BASEURL) ?? ''; } catch { return ''; }
  });
  const [apiKey, setApiKey] = useState('');
  const [models, setModels] = useState<Array<{ id: string; ownedBy: string | null }>>([]);
  const [modelsLatencyMs, setModelsLatencyMs] = useState<number | null>(null);
  const [selectedModel, setSelectedModel] = useState(() => {
    try { return localStorage.getItem(LS_KEY_MODEL) ?? ''; } catch { return ''; }
  });
  const [system, setSystem] = useState('');
  const [prompt, setPrompt] = useState('');
  const [temperature, setTemperature] = useState('');
  const [maxTokens, setMaxTokens] = useState('');
  const [stream, setStream] = useState(false);
  const [result, setResult] = useState<EndpointChatResult | null>(null);
  const [resultStreamed, setResultStreamed] = useState(false);
  const [notice, setNotice] = useState<string | null>(error);
  const [isPending, startTransition] = useTransition();
  const [isHistoryPending, startHistoryTransition] = useTransition();
  const [pageData, setPageData] = useState<{
    items: EndpointTryRunRow[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  }>(history ?? { items: [], total: 0, page: 1, pageSize: PAGE_SIZE, totalPages: 1 });
  const [filters, setFilters] = useState<TryHistoryFilters>(DEFAULT_FILTERS);
  const abortRef = useRef<AbortController | null>(null);

  // Persist non-secret state to localStorage.
  useEffect(() => {
    try {
      localStorage.setItem(LS_KEY_KIND, kind);
      localStorage.setItem(LS_KEY_BASEURL, baseUrl);
      localStorage.setItem(LS_KEY_MODEL, selectedModel);
    } catch { /* ignore */ }
  }, [kind, baseUrl, selectedModel]);

  function clearNotice() {
    setNotice(null);
  }

  async function fetchPage(page: number, f: TryHistoryFilters) {
    try {
      const res = await listEndpointTryRuns({
        page,
        pageSize: PAGE_SIZE,
        dir: f.sortDir,
        providerKind: f.providerKind || null,
        modelQuery: f.modelQuery || null,
        status: f.status
      });
      setPageData(res);
    } catch (e) {
      setNotice(e instanceof Error ? e.message : t('loadHistoryError'));
    }
  }

  function fetchHistoryTransition(page: number, f: TryHistoryFilters) {
    startHistoryTransition(async () => fetchPage(page, f));
  }

  function applyFilters(next: TryHistoryFilters) {
    setFilters(next);
    fetchHistoryTransition(1, next);
  }

  function goTo(page: number) {
    const clamped = Math.min(Math.max(1, page), pageData.totalPages);
    fetchHistoryTransition(clamped, filters);
  }

  async function loadModels() {
    clearNotice();
    setResult(null);
    if (!apiKey.trim()) {
      setNotice(t('keyMissing'));
      return;
    }
    if (!baseUrl.trim()) {
      setNotice(t('baseUrlInvalid'));
      return;
    }
    startTransition(async () => {
      try {
        const res = await fetch('/api/endpoint-try/models', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ kind, baseUrl: baseUrl.replace(/\/+$/, ''), apiKey: apiKey.trim() })
        });
        const json = await res.json() as { ok?: boolean; models?: EndpointModelsResult['models']; latencyMs?: number; error?: string };
        if (!res.ok || json.error) {
          setNotice(json.error ?? `HTTP ${res.status}`);
          setModels([]);
          setModelsLatencyMs(null);
          return;
        }
        setModels(json.models ?? []);
        setModelsLatencyMs(json.latencyMs ?? null);
        const first = json.models?.[0];
        if (first && !selectedModel) {
          setSelectedModel(first.id);
        }
      } catch (e) {
        setNotice(e instanceof Error ? e.message : 'Gagal memuat model.');
        setModels([]);
        setModelsLatencyMs(null);
      }
    });
  }

  async function sendChat(isStreamMode: boolean) {
    clearNotice();
    setResult(null);
    setResultStreamed(false);
    if (!apiKey.trim()) {
      setNotice(t('keyMissing'));
      return;
    }
    if (!baseUrl.trim()) {
      setNotice(t('baseUrlInvalid'));
      return;
    }
    if (prompt.trim().length < 10) {
      setNotice('Prompt minimal 10 karakter.');
      return;
    }
    if (abortRef.current) {
      abortRef.current.abort();
    }
    const controller = new AbortController();
    abortRef.current = controller;

    const payload = {
      kind,
      baseUrl: baseUrl.replace(/\/+$/, ''),
      apiKey: apiKey.trim(),
      model: selectedModel.trim(),
      system: system.trim() || null,
      user: prompt.trim(),
      temperature: temperature.trim() ? parseFloat(temperature) : null,
      maxTokens: maxTokens.trim() ? parseInt(maxTokens, 10) : null,
      stream: isStreamMode
    };

    startTransition(async () => {
      const startedAt = Date.now();
      try {
        if (isStreamMode) {
          // Streaming: baca SSE chunks via fetch + readable stream.
          const res = await fetch('/api/endpoint-try/chat', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(payload),
            signal: controller.signal
          });
          if (!res.ok) {
            const text = await res.text().catch(() => '');
            setNotice(`HTTP ${res.status}: ${text.slice(0, 300)}`);
            return;
          }
          const reader = res.body?.getReader();
          if (!reader) {
            setNotice('Stream kosong — coba lagi.');
            return;
          }
          const decoder = new TextDecoder();
          let textAccum = '';
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            const str = decoder.decode(value, { stream: true });
            // Hanya proses chunk baru dari bacaan ini (hindari duplikasi).
            const newChunks = parseSseChunks(str);
            for (const c of newChunks) {
              const delta = kind === 'anthropic'
                ? extractAnthropicStreamText(c)
                : extractOpenAIStreamText(c);
              if (delta) textAccum += delta;
            }
            setResult({
              text: textAccum,
              usage: null,
              finishReason: null,
              latencyMs: Date.now() - startedAt,
              tokensPerSec: null
            });
            setResultStreamed(true);
          }
          reader.releaseLock();
          abortRef.current = null;
          const latencyMs = Date.now() - startedAt;
          const finalResult: EndpointChatResult = {
            text: textAccum,
            usage: null,
            finishReason: null,
            latencyMs,
            tokensPerSec: null
          };
          setResult(finalResult);
          setResultStreamed(true);
          await saveAndReset(payload, finalResult, null);
        } else {
          // Non-streaming.
          const res = await fetch('/api/endpoint-try/chat', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(payload),
            signal: controller.signal
          });
          const json = await res.json() as { ok?: boolean; text?: string; usage?: unknown; finishReason?: string | null; latencyMs?: number; tokensPerSec?: number | null; error?: string };
          if (!res.ok || !json.ok) {
            setNotice(json.error ?? `HTTP ${res.status}`);
            await saveAndReset(payload, null, json.error ?? `HTTP ${res.status}`);
            return;
          }
          const chatResult: EndpointChatResult = {
            text: json.text ?? '',
            usage: json.usage as EndpointChatResult['usage'] ?? null,
            finishReason: json.finishReason ?? null,
            latencyMs: json.latencyMs ?? 0,
            tokensPerSec: json.tokensPerSec ?? null
          };
          setResult(chatResult);
          setResultStreamed(false);
          await saveAndReset(payload, chatResult, null);
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Gagal mengirim chat.';
        setNotice(msg);
        await saveAndReset(payload, null, msg);
      } finally {
        abortRef.current = null;
      }
    });
  }

  async function saveAndReset(payload: unknown, result: EndpointChatResult | null, errorMsg: string | null) {
    try {
      const input = {
        providerKind: kind,
        baseUrl: (payload as Record<string, unknown>)?.baseUrl as string ?? '',
        model: (payload as Record<string, unknown>)?.model as string ?? '',
        systemPrompt: (payload as Record<string, unknown>)?.system as string | null ?? null,
        userPrompt: (payload as Record<string, unknown>)?.user as string ?? '',
        temperature: (payload as Record<string, unknown>)?.temperature as number | null ?? null,
        maxTokens: (payload as Record<string, unknown>)?.maxTokens as number | null ?? null,
        promptTokens: result?.usage?.promptTokens ?? null,
        completionTokens: result?.usage?.completionTokens ?? null,
        totalTokens: result?.usage?.totalTokens ?? null,
        latencyMs: result?.latencyMs ?? null,
        tokensPerSec: result?.tokensPerSec ?? null,
        finishReason: result?.finishReason ?? null,
        error: errorMsg,
        requestMessages: payload,
        responseText: result?.text ?? null
      };
      const saved = await saveEndpointTryRun(input);
      if (!saved.ok) {
        setNotice(saved.error);
      }
      // Refresh history halaman 1 dengan filter aktif.
      await fetchPage(1, filters);
    } catch {
      // Silently ignore save errors — chat still worked.
    }
  }

  async function deleteRun(id: string) {
    if (!confirm(t('deleteConfirm'))) return;
    try {
      const mod = await import('@/lib/endpoint-try/actions');
      const res = await mod.deleteEndpointTryRun(id);
      if (!res.ok) {
        setNotice(res.error);
        return;
      }
      const next = await listEndpointTryRuns({
        page: pageData.page,
        pageSize: PAGE_SIZE,
        dir: filters.sortDir,
        providerKind: filters.providerKind || null,
        modelQuery: filters.modelQuery || null,
        status: filters.status
      }).catch(() => null);
      if (next && next.items.length === 0 && next.page > 1) {
        fetchHistoryTransition(next.page - 1, filters);
      } else if (next) {
        setPageData(next);
      }
    } catch {
      setNotice(t('loadHistoryError'));
    }
  }

  const quotaLine = quota && quota.limit !== null && quota.limit !== undefined
    ? tQuota('used', { used: quota.used, limit: quota.limit })
    : quota
      ? tQuota('unlimited')
      : null;

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <div className="mb-4 flex items-center justify-between gap-3 text-sm">
        <Link
          href={{ pathname: '/lab' }}
          locale={locale as 'id' | 'en'}
          className="inline-flex items-center gap-1 text-ink-muted transition-colors hover:text-primary"
        >
          <span aria-hidden>←</span>
          {t('back', { defaultMessage: 'Kembali ke Chat Lab' })}
        </Link>
      </div>

      <h1 className="text-3xl font-bold tracking-tight text-ink sm:text-4xl">{t('title')}</h1>
      <p className="mt-2 text-base leading-relaxed text-ink-muted">{t('intro')}</p>
      {quotaLine ? (
        <p className="mt-2 text-sm text-ink-muted">{quotaLine}</p>
      ) : null}

      {notice ? (
        <p role="alert" className="mt-4 text-sm text-red-600">
          {notice}
        </p>
      ) : null}

      {/* Section 1: Connection */}
      <div className="mt-8 rounded-lg border border-line bg-surface p-6 shadow-card">
        <h2 className="mb-4 text-lg font-semibold text-ink">{t('sectionConnection')}</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium text-ink">{t('kindLabel')}</label>
            <select
              value={kind}
              onChange={(e) => setKind(e.target.value as EndpointKind)}
              className="w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="openai">{t('kindOpenai')}</option>
              <option value="anthropic">{t('kindAnthropic')}</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-ink">{t('baseUrlLabel')}</label>
            <input
              type="url"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder={t('baseUrlPlaceholder')}
              className="w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="mb-1 block text-sm font-medium text-ink">{t('apiKeyLabel')}</label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="sk-… / hf_…"
              className="w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-primary"
            />
            <p className="mt-1 text-xs text-ink-muted">{t('apiKeyHint')}</p>
          </div>
          <div className="sm:col-span-2">
            <button
              onClick={loadModels}
              disabled={isPending}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary/90 disabled:opacity-50"
            >
              {isPending ? t('testing') : t('testButton')}
            </button>
            {modelsLatencyMs !== null ? (
              <p className="mt-2 text-xs text-ink-muted">
                {t('modelsLatency', { ms: modelsLatencyMs, count: models.length })}
              </p>
            ) : null}
          </div>
        </div>
      </div>

      {/* Section 2: Model */}
      <div className="mt-4 rounded-lg border border-line bg-surface p-6 shadow-card">
        <h2 className="mb-4 text-lg font-semibold text-ink">{t('modelSection')}</h2>
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[200px]">
            <label className="mb-1 block text-sm font-medium text-ink">{t('modelLabel')}</label>
            <select
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
              className="w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-primary"
            >
              {models.length === 0 ? (
                <option value="">{t('modelEmpty')}</option>
              ) : (
                models.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.id}{m.ownedBy ? ` (${m.ownedBy})` : ''}
                  </option>
                ))
              )}
            </select>
          </div>
          <div className="flex-1 min-w-[200px]">
            <label className="mb-1 block text-sm font-medium text-ink">{t('modelManualLabel')}</label>
            <input
              type="text"
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
              className="w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
          <button
            onClick={loadModels}
            disabled={isPending}
            className="rounded-md border border-line px-4 py-2 text-sm text-ink transition-colors hover:bg-surface/50 disabled:opacity-50"
          >
            {t('refresh')}
          </button>
        </div>
      </div>

      {/* Section 3: Chat */}
      <div className="mt-4 rounded-lg border border-line bg-surface p-6 shadow-card">
        <h2 className="mb-4 text-lg font-semibold text-ink">{t('chatSection')}</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="mb-1 block text-sm font-medium text-ink">{t('systemLabel')}</label>
            <textarea
              value={system}
              onChange={(e) => setSystem(e.target.value)}
              placeholder={t('systemPlaceholder')}
              rows={2}
              maxLength={2000}
              className="w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-primary"
            />
            <p className="mt-1 text-xs text-ink-muted">{system.length}/2000</p>
          </div>
          <div className="sm:col-span-2">
            <label className="mb-1 block text-sm font-medium text-ink">{t('userLabel')}</label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder={t('userPlaceholder')}
              rows={4}
              maxLength={4000}
              className="w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-primary"
            />
            <p className="mt-1 text-xs text-ink-muted">{prompt.length}/4000</p>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-ink">{t('temperatureLabel')}</label>
            <input
              type="number"
              min={0}
              max={2}
              step={0.1}
              value={temperature}
              onChange={(e) => setTemperature(e.target.value)}
              placeholder="0.7"
              className="w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-ink">{t('maxTokensLabel')}</label>
            <input
              type="number"
              min={1}
              max={4000}
              value={maxTokens}
              onChange={(e) => setMaxTokens(e.target.value)}
              placeholder="1024"
              className="w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
          <div className="flex items-center gap-2 pt-6">
            <input
              id="stream-check"
              type="checkbox"
              checked={stream}
              onChange={(e) => setStream(e.target.checked)}
              className="h-4 w-4 rounded border-line text-primary focus:ring-primary"
            />
            <label htmlFor="stream-check" className="text-sm text-ink">{t('streamLabel')}</label>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => sendChat(false)}
              disabled={isPending || !apiKey.trim() || !prompt.trim()}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary/90 disabled:opacity-50"
            >
              {isPending ? t('sendingButton') : t('sendButton')}
            </button>
            <button
              onClick={() => sendChat(true)}
              disabled={isPending || !apiKey.trim() || !prompt.trim()}
              className="rounded-md border border-line px-4 py-2 text-sm text-ink transition-colors hover:bg-surface/50 disabled:opacity-50"
              title={t('streamLabel')}
            >
              {t('sendStreamButton')}
            </button>
            {isPending && (
              <button
                onClick={() => { abortRef.current?.abort(); setNotice(null); }}
                className="rounded-md border border-line px-4 py-2 text-sm text-ink transition-colors hover:bg-surface/50"
              >
                {t('stopButton')}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Section 4: Result — metrik ala Lab Chat */}
      {result ? (
        <div className="mt-4 rounded-lg border border-line bg-surface p-6 shadow-card">
          <h2 className="mb-4 text-lg font-semibold text-ink">{t('resultSection')}</h2>
          <pre className="whitespace-pre-wrap break-words rounded-md bg-surface-alt p-3 text-sm text-ink">
            {result.text}
          </pre>
          <dl className="mt-3 grid grid-cols-3 gap-1.5 text-center">
            <MetricBox label={tResult('tokensIn')} value={fmtInt(result.usage?.promptTokens ?? null)} />
            <MetricBox label={tResult('tokensOut')} value={fmtInt(result.usage?.completionTokens ?? null)} accent />
            <MetricBox label={tResult('tokensTotal')} value={fmtInt(result.usage?.totalTokens ?? (result.usage ? (result.usage.promptTokens + result.usage.completionTokens) : null))} />
            <MetricBox label={tResult('latency')} value={result.latencyMs === null ? '-' : `${result.latencyMs}ms`} />
            <MetricBox label={tResult('speed')} value={result.tokensPerSec === null ? '-' : `${result.tokensPerSec}`} />
            <MetricBox label={t('finishReasonLabel')} value={result.finishReason ?? '-'} />
          </dl>
          {resultStreamed || result.usage === null ? (
            <p className="mt-1 text-[11px] text-ink-muted">{t('streamUsageNote')}</p>
          ) : null}
          <details className="mt-3">
            <summary className="cursor-pointer text-sm text-ink-muted">{t('rawJsonLabel')}</summary>
            <pre className="mt-2 whitespace-pre-wrap break-words rounded-md bg-surface-alt p-3 text-xs text-ink-muted">
              {JSON.stringify(result, null, 2)}
            </pre>
          </details>
        </div>
      ) : null}

      {/* Section 5: History — pagination + sorting + filter */}
      <div className="mt-4 rounded-lg border border-line bg-surface p-6 shadow-card">
        <h2 className="mb-4 text-lg font-semibold text-ink">{t('historySection')}</h2>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <label className="block text-xs text-ink-muted">
            {tHist('filterStatus')}
            <select
              value={filters.status}
              onChange={(e) => applyFilters({ ...filters, status: e.target.value as TryHistoryFilters['status'] })}
              className={selectCls}
            >
              <option value="all">{tHist('all')}</option>
              <option value="ok">{tHist('ok')}</option>
              <option value="error">{tHist('error')}</option>
            </select>
          </label>
          <label className="block text-xs text-ink-muted">
            {t('kindLabel')}
            <select
              value={filters.providerKind}
              onChange={(e) => applyFilters({ ...filters, providerKind: e.target.value as TryHistoryFilters['providerKind'] })}
              className={selectCls}
            >
              <option value="">{tHist('all')}</option>
              <option value="openai">{t('kindOpenai')}</option>
              <option value="anthropic">{t('kindAnthropic')}</option>
            </select>
          </label>
          <label className="block text-xs text-ink-muted">
            {tHist('filterModel')}
            <input
              type="text"
              value={filters.modelQuery}
              onChange={(e) => applyFilters({ ...filters, modelQuery: e.target.value })}
              placeholder={t('modelSearchPlaceholder')}
              className={selectCls}
            />
          </label>
          <label className="block text-xs text-ink-muted">
            {tHist('sortLabel')}
            <select
              value={filters.sortDir}
              onChange={(e) => applyFilters({ ...filters, sortDir: e.target.value as 'desc' | 'asc' })}
              className={selectCls}
            >
              <option value="desc">{tHist('sortNewest')}</option>
              <option value="asc">{tHist('sortOldest')}</option>
            </select>
          </label>
        </div>
        <button
          type="button"
          onClick={() => applyFilters(DEFAULT_FILTERS)}
          className="mt-2 text-xs text-primary hover:underline"
        >
          {tHist('clearFilters')}
        </button>

        {isHistoryPending ? (
          <p className="mt-4 text-sm text-ink-muted">…</p>
        ) : pageData.items.length === 0 ? (
          <p className="mt-4 text-sm text-ink-muted">{tHist('noResults')}</p>
        ) : (
          <div className="mt-4 space-y-3">
            {pageData.items.map((run) => (
              <div key={run.id} className="rounded-md border border-line p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-ink">
                      {run.provider_kind} · {run.model}
                    </div>
                    <div className="mt-1 truncate text-xs text-ink-muted">{run.base_url}</div>
                    {run.response_text ? (
                      <p className="mt-1 line-clamp-2 text-sm text-ink">{run.response_text}</p>
                    ) : run.error ? (
                      <p className="mt-1 line-clamp-2 text-sm text-red-600">{run.error}</p>
                    ) : null}
                    <div className="mt-1 font-mono text-xs text-ink-muted">
                      {run.latency_ms ?? '-'}ms · {run.tokens_per_sec ?? '-'} tok/s · p:{run.prompt_tokens ?? '-'} c:{run.completion_tokens ?? '-'} t:{run.total_tokens ?? '-'} · {run.finish_reason ?? '—'}
                    </div>
                    <div className="mt-1 text-xs text-ink-muted">
                      {formatDateTime(run.created_at, locale as Locale, timeZone)}
                    </div>
                  </div>
                  <button
                    onClick={() => deleteRun(run.id)}
                    className="shrink-0 rounded-md border border-line px-2 py-1 text-xs text-ink transition-colors hover:bg-red-50 hover:text-red-600 hover:border-red-200"
                  >
                    {t('deleteRun')}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="mt-4 flex items-center justify-between text-sm">
          <span className="text-ink-muted">
            {tHist('pageOf', { page: pageData.page, total: pageData.totalPages })} · {pageData.total}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => goTo(pageData.page - 1)}
              disabled={pageData.page <= 1 || isHistoryPending}
              className="rounded border border-line px-3 py-1 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {tHist('prev')}
            </button>
            <button
              type="button"
              onClick={() => goTo(pageData.page + 1)}
              disabled={pageData.page >= pageData.totalPages || isHistoryPending}
              className="rounded border border-line px-3 py-1 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {tHist('next')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
