'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { createResearchSession } from '@/lib/content/actions';

interface ContentRequestFormProps {
  platforms: { slug: string; display_name: string }[];
}

export function ContentRequestForm({ platforms }: ContentRequestFormProps) {
  const t = useTranslations('content.form');
  const [pending, setPending] = useState(false);
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    await processForm(formData);
  }

  async function processForm(formData: FormData) {
    setPending(true);
    setStatus('idle');
    setMessage('');
    setFieldErrors({});
    setSessionId(null);

    const result = await createResearchSession(formData);

    if (result.success) {
      setStatus('success');
      setMessage('Riset berhasil dimulai. Cek halaman riset untuk progres.');
      setSessionId(result.sessionId ?? null);
      (document.getElementById('content-form') as HTMLFormElement)?.reset();
      setShowAdvanced(false);
    } else if (result.error === 'honeypot') {
      setStatus('error');
      setMessage(t('errorHoneypot'));
    } else if (result.error?.startsWith('rate_limit')) {
      const count = result.error.split(':')[1] ?? '5';
      setStatus('error');
      setMessage(t('errorRateLimit', { count }));
    } else if (result.fieldErrors) {
      setFieldErrors(result.fieldErrors);
      setStatus('error');
      setMessage(t('errorTitle'));
    } else {
      setStatus('error');
      setMessage(result.error ?? t('errorTitle'));
    }
    setPending(false);
  }

  if (status === 'success') {
    return (
      <div
        role="status"
        aria-live="polite"
        className="rounded-xl border border-emerald-200 bg-emerald-50 p-6 shadow-card"
      >
        <div className="flex items-center gap-2">
          <span aria-hidden className="inline-flex size-8 items-center justify-center rounded-full bg-emerald-600 text-white">
            <svg viewBox="0 0 20 20" fill="currentColor" className="size-5" aria-hidden>
              <path
                fillRule="evenodd"
                d="M16.704 5.29a1 1 0 010 1.42l-7.5 7.5a1 1 0 01-1.42 0l-3.5-3.5a1 1 0 111.42-1.42L8.5 12.08l6.79-6.79a1 1 0 011.414 0z"
                clipRule="evenodd"
              />
            </svg>
          </span>
          <h2 className="text-lg font-semibold text-emerald-900">{t('successTitle')}</h2>
        </div>
        <p className="mt-2 text-sm text-emerald-800">{t('successBody')}</p>
        <div className="mt-5 flex flex-wrap gap-2">
          {sessionId ? (
            <Link
              href={{ pathname: '/admin/riset/[sessionId]', params: { sessionId } }}
              className="btn-primary px-4 py-2 text-sm"
            >
              {t('successViewList')}
            </Link>
          ) : (
            <Link
              href={{ pathname: '/admin/riset' }}
              className="btn-primary px-4 py-2 text-sm"
            >
              {t('successViewList')}
            </Link>
          )}
          <button
            type="button"
            onClick={() => {
              setStatus('idle');
              setMessage('');
              setFieldErrors({});
              setSessionId(null);
            }}
            className="rounded-lg border border-emerald-300 bg-surface px-4 py-2 text-sm font-medium text-emerald-900 transition-colors hover:border-emerald-500"
          >
            {t('successCreateAnother')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <form id="content-form" onSubmit={handleSubmit} noValidate className="space-y-5">
      {/* Honeypot */}
      <input type="text" name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden />

      <div>
        <label htmlFor="topic" className="block text-sm font-medium text-ink">
          {t('topic')} <span className="text-red-600">*</span>
        </label>
        <textarea
          id="topic"
          name="topic"
          required
          rows={3}
          placeholder={t('topicPlaceholder')}
          className="mt-1 block w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-muted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
        />
        {fieldErrors.topic ? <p className="mt-1 text-xs text-red-600">{fieldErrors.topic}</p> : null}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="platform" className="block text-sm font-medium text-ink">
            {t('platform')} <span className="text-red-600">*</span>
          </label>
          <select
            id="platform"
            name="platform"
            required
            disabled={pending}
            className="mt-1 block w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {platforms.map((p) => (
              <option key={p.slug} value={p.slug}>
                {p.display_name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="tone" className="block text-sm font-medium text-ink">
            {t('tone')} <span className="text-red-600">*</span>
          </label>
          <select
            id="tone"
            name="tone"
            required
            disabled={pending}
            className="mt-1 block w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <option value="casual">casual</option>
            <option value="formal">formal</option>
            <option value="witty">witty</option>
            <option value="professional">professional</option>
            <option value="friendly">friendly</option>
            <option value="edukatif">edukatif</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="language" className="block text-sm font-medium text-ink">
            {t('language')} <span className="text-red-600">*</span>
          </label>
          <select
            id="language"
            name="language"
            required
            defaultValue="both"
            disabled={pending}
            className="mt-1 block w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <option value="id">{t('languageOptions.id')}</option>
            <option value="en">{t('languageOptions.en')}</option>
            <option value="both">{t('languageOptions.both')}</option>
          </select>
        </div>

        <div>
          <label htmlFor="targetCategory" className="block text-sm font-medium text-ink">
            {t('targetCategory')}
          </label>
          <select
            id="targetCategory"
            name="targetCategory"
            disabled={pending}
            className="mt-1 block w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <option value="">{t('targetCategoryPlaceholder')}</option>
            <option value="fashion">Fashion</option>
            <option value="electronics">Elektronik</option>
            <option value="home-living">Rumah Tangga</option>
            <option value="sports-hobby">Olahraga & Hobi</option>
          </select>
        </div>
      </div>

      <div>
        <label htmlFor="audience" className="block text-sm font-medium text-ink">
          {t('audience')} <span className="text-red-600">*</span>
        </label>
        <input
          id="audience"
          name="audience"
          required
          placeholder={t('audiencePlaceholder')}
          disabled={pending}
          className="mt-1 block w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-muted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:cursor-not-allowed disabled:opacity-60"
        />
        {fieldErrors.audience ? <p className="mt-1 text-xs text-red-600">{fieldErrors.audience}</p> : null}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="ctaStyle" className="block text-sm font-medium text-ink">
            {t('ctaStyle')} <span className="text-red-600">*</span>
          </label>
          <select
            id="ctaStyle"
            name="ctaStyle"
            required
            disabled={pending}
            className="mt-1 block w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <option value="soft_sell">{t('ctaStyleOptions.soft_sell')}</option>
            <option value="hard_sell">{t('ctaStyleOptions.hard_sell')}</option>
            <option value="question">{t('ctaStyleOptions.question')}</option>
            <option value="urgency">{t('ctaStyleOptions.urgency')}</option>
            <option value="storytelling">{t('ctaStyleOptions.storytelling')}</option>
          </select>
        </div>

        <div>
          <label htmlFor="purpose" className="block text-sm font-medium text-ink">
            {t('purpose')} <span className="text-red-600">*</span>
          </label>
          <input
            id="purpose"
            name="purpose"
            required
            placeholder={t('purposePlaceholder')}
            disabled={pending}
            className="mt-1 block w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-muted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:cursor-not-allowed disabled:opacity-60"
          />
          {fieldErrors.purpose ? <p className="mt-1 text-xs text-red-600">{fieldErrors.purpose}</p> : null}
        </div>
      </div>

      <div>
        <label htmlFor="constraints" className="block text-sm font-medium text-ink">
          {t('constraints')}
        </label>
        <textarea
          id="constraints"
          name="constraints"
          rows={2}
          placeholder={t('constraintsPlaceholder')}
          disabled={pending}
          className="mt-1 block w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-muted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:cursor-not-allowed disabled:opacity-60"
        />
      </div>

      <div>
        <label htmlFor="keywords" className="block text-sm font-medium text-ink">
          {t('keywords')}
        </label>
        <input
          id="keywords"
          name="keywords"
          placeholder={t('keywordsPlaceholder')}
          disabled={pending}
          className="mt-1 block w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-muted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:cursor-not-allowed disabled:opacity-60"
        />
      </div>

      <div className="rounded-xl border border-line bg-surface">
        <button
          type="button"
          onClick={() => setShowAdvanced((v) => !v)}
          aria-expanded={showAdvanced}
          className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-medium text-ink"
        >
          <span>{t('advancedTitle')}</span>
          <span aria-hidden className={`transition-transform ${showAdvanced ? 'rotate-180' : ''}`}>
            ▾
          </span>
        </button>
        {showAdvanced ? (
          <div className="space-y-4 border-t border-line px-4 py-4">
            <p className="text-xs text-ink-muted">{t('advancedIntro')}</p>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="targetLocation" className="block text-xs font-medium text-ink-muted">
                  {t('targetLocation')}
                </label>
                <input
                  id="targetLocation"
                  name="targetLocation"
                  type="text"
                  placeholder="Cth: Indonesia, Bandung"
                  disabled={pending}
                  className="mt-1 block w-full rounded-lg border border-line bg-background px-3 py-2 text-sm text-ink disabled:opacity-60"
                />
              </div>
              <div>
                <label htmlFor="secondaryLocation" className="block text-xs font-medium text-ink-muted">
                  {t('secondaryLocation')}
                </label>
                <input
                  id="secondaryLocation"
                  name="secondaryLocation"
                  type="text"
                  placeholder="Cth: Jakarta, nasional"
                  disabled={pending}
                  className="mt-1 block w-full rounded-lg border border-line bg-background px-3 py-2 text-sm text-ink disabled:opacity-60"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="audienceAge" className="block text-xs font-medium text-ink-muted">
                  {t('audienceAge')}
                </label>
                <input
                  id="audienceAge"
                  name="audienceAge"
                  type="text"
                  placeholder="Cth: 25-34 tahun"
                  disabled={pending}
                  className="mt-1 block w-full rounded-lg border border-line bg-background px-3 py-2 text-sm text-ink disabled:opacity-60"
                />
              </div>
              <div>
                <label htmlFor="audienceInterests" className="block text-xs font-medium text-ink-muted">
                  {t('audienceInterests')}
                </label>
                <input
                  id="audienceInterests"
                  name="audienceInterests"
                  type="text"
                  placeholder="Cth: parenting, keuangan keluarga"
                  disabled={pending}
                  className="mt-1 block w-full rounded-lg border border-line bg-background px-3 py-2 text-sm text-ink disabled:opacity-60"
                />
              </div>
            </div>

            <div>
              <label htmlFor="accountGoal" className="block text-xs font-medium text-ink-muted">
                {t('accountGoal')}
              </label>
              <input
                id="accountGoal"
                name="accountGoal"
                type="text"
                placeholder="Cth: mengedukasi calon orang tua baru"
                disabled={pending}
                className="mt-1 block w-full rounded-lg border border-line bg-background px-3 py-2 text-sm text-ink disabled:opacity-60"
              />
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="allowedCategories" className="block text-xs font-medium text-ink-muted">
                  {t('allowedCategories')}
                </label>
                <input
                  id="allowedCategories"
                  name="allowedCategories"
                  type="text"
                  placeholder={t('categoriesHint')}
                  disabled={pending}
                  className="mt-1 block w-full rounded-lg border border-line bg-background px-3 py-2 text-sm text-ink disabled:opacity-60"
                />
              </div>
              <div>
                <label htmlFor="excludedCategories" className="block text-xs font-medium text-ink-muted">
                  {t('excludedCategories')}
                </label>
                <input
                  id="excludedCategories"
                  name="excludedCategories"
                  type="text"
                  placeholder={t('categoriesHint')}
                  disabled={pending}
                  className="mt-1 block w-full rounded-lg border border-line bg-background px-3 py-2 text-sm text-ink disabled:opacity-60"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div>
                <label htmlFor="freshnessHours" className="block text-xs font-medium text-ink-muted">
                  {t('freshnessHours')}
                </label>
                <input
                  id="freshnessHours"
                  name="freshnessHours"
                  type="number"
                  min={1}
                  max={720}
                  placeholder="24"
                  disabled={pending}
                  className="mt-1 block w-full rounded-lg border border-line bg-background px-3 py-2 text-sm text-ink disabled:opacity-60"
                />
              </div>
              <div>
                <label htmlFor="minimumCandidates" className="block text-xs font-medium text-ink-muted">
                  {t('minimumCandidates')}
                </label>
                <input
                  id="minimumCandidates"
                  name="minimumCandidates"
                  type="number"
                  min={3}
                  max={50}
                  placeholder="12"
                  disabled={pending}
                  className="mt-1 block w-full rounded-lg border border-line bg-background px-3 py-2 text-sm text-ink disabled:opacity-60"
                />
              </div>
              <div>
                <label htmlFor="requiredWinners" className="block text-xs font-medium text-ink-muted">
                  {t('requiredWinners')}
                </label>
                <input
                  id="requiredWinners"
                  name="requiredWinners"
                  type="number"
                  min={1}
                  max={10}
                  placeholder="3"
                  disabled={pending}
                  className="mt-1 block w-full rounded-lg border border-line bg-background px-3 py-2 text-sm text-ink disabled:opacity-60"
                />
              </div>
              <div>
                <label htmlFor="maximumIterations" className="block text-xs font-medium text-ink-muted">
                  {t('maximumIterations')}
                </label>
                <input
                  id="maximumIterations"
                  name="maximumIterations"
                  type="number"
                  min={1}
                  max={10}
                  placeholder="3"
                  disabled={pending}
                  className="mt-1 block w-full rounded-lg border border-line bg-background px-3 py-2 text-sm text-ink disabled:opacity-60"
                />
              </div>
            </div>
          </div>
        ) : null}
      </div>

      <button
        type="submit"
        disabled={pending}
        aria-busy={pending}
        className="btn-primary flex w-full items-center justify-center gap-2 disabled:cursor-not-allowed disabled:opacity-70"
      >
        {pending ? (
          <>
            <svg
              viewBox="0 0 20 20"
              fill="none"
              className="size-4 animate-spin"
              aria-hidden
            >
              <circle cx="10" cy="10" r="8" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
              <path
                d="M18 10a8 8 0 00-8-8"
                stroke="currentColor"
                strokeWidth="3"
                strokeLinecap="round"
              />
            </svg>
            <span>{t('submitting')}</span>
          </>
        ) : (
          <span>{t('submit')}</span>
        )}
      </button>

      {status === 'error' ? (
        <p
          role="status"
          aria-live="polite"
          className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800"
        >
          {message}
        </p>
      ) : null}
    </form>
  );
}
