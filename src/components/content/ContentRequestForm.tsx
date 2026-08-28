'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { createContentRequest } from '@/lib/content/actions';

interface ContentRequestFormProps {
  platforms: { slug: string; display_name: string }[];
}

export function ContentRequestForm({ platforms }: ContentRequestFormProps) {
  const t = useTranslations('content.form');
  const [pending, setPending] = useState(false);
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  async function onSubmit(formData: FormData) {
    setPending(true);
    setStatus('idle');
    setMessage('');
    setFieldErrors({});

    const result = await createContentRequest(formData);

    if (result.success) {
      setStatus('success');
      setMessage('Draf berhasil dibuat. Cek halaman review.');
      (document.getElementById('content-form') as HTMLFormElement)?.reset();
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

  return (
    <form id="content-form" action={onSubmit} noValidate className="space-y-5">
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
            className="mt-1 block w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
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
            className="mt-1 block w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
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
            className="mt-1 block w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
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
            className="mt-1 block w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
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
          className="mt-1 block w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-muted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
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
            className="mt-1 block w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
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
            className="mt-1 block w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-muted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
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
          className="mt-1 block w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-muted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
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
          className="mt-1 block w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-muted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
        />
      </div>

      <button type="submit" disabled={pending} className="btn-primary w-full" aria-busy={pending}>
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
