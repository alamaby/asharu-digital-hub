'use client';

import { useRef, useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { createResearchSession, generateIdea } from '@/lib/content/actions';
import { AffiliateProductPicker } from './AffiliateProductPicker';
import { StageModelPicker } from './StageModelPicker';

interface LlmProviderOpt { id: string; slug: string; display_name: string; }
interface LlmModelOpt { id: string; provider_id: string; model_id: string; display_name: string; priority: number; config: Record<string, unknown> | null; }

interface ContentRequestFormProps {
  platforms: { slug: string; display_name: string }[];
  categories: { slug: string; display_name: string }[];
  llmProviders?: LlmProviderOpt[];
  llmModels?: LlmModelOpt[];
  isAdmin?: boolean;
}

export function ContentRequestForm({ platforms, categories, llmProviders = [], llmModels = [], isAdmin = false }: ContentRequestFormProps) {
  const t = useTranslations('content.form');
  const [pending, setPending] = useState(false);
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [ideaGenerating, setIdeaGenerating] = useState(false);
  const [ideaApplied, setIdeaApplied] = useState(false);
  const [ideaError, setIdeaError] = useState<string | null>(null);
  const [, startIdeaTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  // Controlled fields so generateIdea can fill them
  const [topic, setTopic] = useState('');
  const realPlatforms = platforms.filter((p) => p.slug !== 'all');
  const [selPlatforms, setSelPlatforms] = useState<string[]>(() => realPlatforms.map((p) => p.slug));
  // Mekanisme riset: 'satu' topik-dulu | 'dua' produk-dulu (1-2 produk tetap).
  const [mechanism, setMechanism] = useState<'satu' | 'dua'>('satu');
  const [mechProducts, setMechProducts] = useState<{ id: string; name: string }[]>([]);
  const [mechPickerOpen, setMechPickerOpen] = useState(false);
  const [tone, setTone] = useState('casual');
  const [language, setLanguage] = useState('both');
  const [targetCategory, setTargetCategory] = useState('');
  const [audience, setAudience] = useState('');
  const [ctaStyle, setCtaStyle] = useState('soft_sell');
  const [purpose, setPurpose] = useState('');
  const [constraints, setConstraints] = useState('');
  const [keywords, setKeywords] = useState('');
  const [targetLocation, setTargetLocation] = useState('');
  const [secondaryLocation, setSecondaryLocation] = useState('');
  const [audienceAge, setAudienceAge] = useState('');
  const [audienceInterests, setAudienceInterests] = useState('');
  const [accountGoal, setAccountGoal] = useState('');
  const [allowedCategories, setAllowedCategories] = useState('');
  const [excludedCategories, setExcludedCategories] = useState('');
  const [targetReplyCount, setTargetReplyCount] = useState('7');
  // Per-stage model overrides (admin only) — provider→model cascade
  const [genProviderId, setGenProviderId] = useState('');
  const [genModelId, setGenModelId] = useState('');
  const [discProviderId, setDiscProviderId] = useState('');
  const [discModelId, setDiscModelId] = useState('');
  const [verifyProviderId, setVerifyProviderId] = useState('');
  const [verifyModelId, setVerifyModelId] = useState('');
  const [scoringProviderId, setScoringProviderId] = useState('');
  const [scoringModelId, setScoringModelId] = useState('');
  const [devProviderId, setDevProviderId] = useState('');
  const [devModelId, setDevModelId] = useState('');

  function handleGenerateIdea() {
    setIdeaError(null);
    setIdeaApplied(false);
    setIdeaGenerating(true);
    startIdeaTransition(async () => {
      // Collect all current field states as hints so the idea varies with input
      const fd = new FormData();
      fd.set('platform', selPlatforms.length === 1 ? selPlatforms[0]! : 'all');
      fd.set('tone', tone);
      fd.set('language', language);
      if (topic) fd.set('topic', topic);
      if (targetCategory) fd.set('targetCategory', targetCategory);
      if (audience) fd.set('audience', audience);
      if (ctaStyle) fd.set('ctaStyle', ctaStyle);
      if (purpose) fd.set('purpose', purpose);
      if (constraints) fd.set('constraints', constraints);
      if (keywords) fd.set('keywords', keywords);
      if (targetLocation) fd.set('targetLocation', targetLocation);
      if (secondaryLocation) fd.set('secondaryLocation', secondaryLocation);
      if (audienceAge) fd.set('audienceAge', audienceAge);
      if (audienceInterests) fd.set('audienceInterests', audienceInterests);
      if (accountGoal) fd.set('accountGoal', accountGoal);
      if (allowedCategories) fd.set('allowedCategories', allowedCategories);
      if (excludedCategories) fd.set('excludedCategories', excludedCategories);
      if (isAdmin && genModelId) fd.set('ideaGenerationModelId', genModelId);
      // call server action
      const res = await generateIdea(fd);
      setIdeaGenerating(false);
      if (!res.success || !res.idea) {
        const err = res.error ?? 'Gagal generate idea';
        if (err.startsWith('rate_limit')) {
          setIdeaError(`Batas 30/jam tercapai. Coba lagi nanti.`);
        } else {
          setIdeaError(err);
        }
        return;
      }
      const i = res.idea;
      if (i.topic) setTopic(i.topic);
      if (i.platform && platforms.some((p) => p.slug === i.platform)) setSelPlatforms([i.platform!]);
      if (i.tone) setTone(i.tone!);
      if (i.language) setLanguage(i.language!);
      if (i.targetCategory) setTargetCategory(i.targetCategory!);
      if (i.audience) setAudience(i.audience!);
      if (i.ctaStyle) setCtaStyle(i.ctaStyle!);
      if (i.purpose) setPurpose(i.purpose!);
      if (i.constraints !== undefined) setConstraints(i.constraints!);
      if (i.keywords !== undefined) setKeywords(i.keywords!);
      if (i.targetLocation !== undefined) setTargetLocation(i.targetLocation!);
      if (i.secondaryLocation !== undefined) setSecondaryLocation(i.secondaryLocation!);
      if (i.audienceAge !== undefined) setAudienceAge(i.audienceAge!);
      if (i.audienceInterests !== undefined) setAudienceInterests(i.audienceInterests!);
      if (i.accountGoal !== undefined) setAccountGoal(i.accountGoal!);
      if (i.allowedCategories !== undefined) setAllowedCategories(i.allowedCategories!);
      if (i.excludedCategories !== undefined) setExcludedCategories(i.excludedCategories!);
      setShowAdvanced(true);
      setIdeaApplied(true);
      setFieldErrors({});
    });
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (selPlatforms.length === 0) {
      setStatus('error');
      setFieldErrors({ platforms: t('platformMinOne') });
      return;
    }
    if (mechanism === 'dua' && (mechProducts.length === 0 || mechProducts.length > 2)) {
      setStatus('error');
      setFieldErrors({ mechProducts: t('productMinMax') });
      return;
    }
    const formData = new FormData(e.currentTarget);
    if (isAdmin) {
      if (genModelId) formData.set('ideaGenerationModelId', genModelId);
      if (discModelId) formData.set('discoveringModelId', discModelId);
      if (verifyModelId) formData.set('verifyingModelId', verifyModelId);
      if (scoringModelId) formData.set('scoringModelId', scoringModelId);
      if (devModelId) formData.set('developingModelId', devModelId);
    }
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
      formRef.current?.reset();
      // reset controlled states
      setTopic('');
      setSelPlatforms(realPlatforms.map((p) => p.slug));
      setMechanism('satu');
      setMechProducts([]);
      setAudience('');
      setPurpose('');
      setKeywords('');
      setConstraints('');
      setTargetCategory('');
      setTargetLocation('');
      setSecondaryLocation('');
      setAudienceAge('');
      setAudienceInterests('');
      setAccountGoal('');
      setAllowedCategories('');
      setExcludedCategories('');
      setGenProviderId(''); setGenModelId('');
      setDiscProviderId(''); setDiscModelId('');
      setVerifyProviderId(''); setVerifyModelId('');
      setScoringProviderId(''); setScoringModelId('');
      setDevProviderId(''); setDevModelId('');
      setShowAdvanced(false);
      setIdeaApplied(false);
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
              href={{ pathname: '/konten/riset/[sessionId]', params: { sessionId } }}
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
    <form ref={formRef} id="content-form" onSubmit={handleSubmit} noValidate className="space-y-5">
      {/* Honeypot */}
      <input type="text" name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden />

      <div>
        <div className="flex items-center justify-between gap-2">
          <label htmlFor="topic" className="block text-sm font-medium text-ink">
            {t('topic')} <span className="text-red-600">*</span>
          </label>
          <button
            type="button"
            onClick={handleGenerateIdea}
            disabled={ideaGenerating || pending}
            aria-busy={ideaGenerating}
            className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-medium text-primary transition-colors hover:bg-primary/20 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {ideaGenerating ? (
              <>
                <svg viewBox="0 0 20 20" fill="none" className="size-3.5 animate-spin" aria-hidden>
                  <circle cx="10" cy="10" r="8" stroke="currentColor" strokeOpacity="0.25" strokeWidth="2.5" />
                  <path d="M18 10a8 8 0 00-8-8" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
                </svg>
                <span>{t('generating')}</span>
              </>
            ) : (
              <>
                <span aria-hidden>✦</span>
                <span>{t('generateIdea')}</span>
              </>
            )}
          </button>
        </div>
        <textarea
          id="topic"
          name="topic"
          required
          rows={3}
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          placeholder={t('topicPlaceholder')}
          disabled={pending || ideaGenerating}
          className="mt-1 block w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-muted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-60"
        />
        {fieldErrors.topic ? <p className="mt-1 text-xs text-red-600">{fieldErrors.topic}</p> : null}
        {ideaApplied ? (
          <p role="status" aria-live="polite" className="mt-2 rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
            {t('ideaApplied')}
          </p>
        ) : null}
        {ideaError ? (
          <p role="alert" className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-800">
            {ideaError}
          </p>
        ) : null}
        <p className="mt-1 text-xs text-ink-muted">{t('generateIdeaHint')}</p>
      </div>

      <div>
        <fieldset>
          <legend className="block text-sm font-medium text-ink">
            {t('mechanism')} <span className="text-red-600">*</span>
          </legend>
          <div className="mt-2 space-y-1">
            <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink has-checked:border-primary">
              <input
                type="radio"
                name="mechanism"
                value="satu"
                checked={mechanism === 'satu'}
                disabled={pending || ideaGenerating}
                onChange={() => setMechanism('satu')}
                className="mt-1 size-4"
              />
              <span>
                <span className="block font-medium">{t('mechanismOne')}</span>
                <span className="block text-xs text-ink-muted">{t('mechanismOneHint')}</span>
              </span>
            </label>
            <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink has-checked:border-primary">
              <input
                type="radio"
                name="mechanism"
                value="dua"
                checked={mechanism === 'dua'}
                disabled={pending || ideaGenerating}
                onChange={() => setMechanism('dua')}
                className="mt-1 size-4"
              />
              <span>
                <span className="block font-medium">{t('mechanismTwo')}</span>
                <span className="block text-xs text-ink-muted">{t('mechanismTwoHint')}</span>
              </span>
            </label>
          </div>
        </fieldset>
        {mechanism === 'dua' ? (
          <div className="mt-2 rounded-lg border border-line bg-surface px-3 py-2">
            {mechProducts.map((p) => (
              <input key={p.id} type="hidden" name="productIds" value={p.id} />
            ))}
            {mechProducts.length > 0 ? (
              <ul className="space-y-1">
                {mechProducts.map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-2 text-sm text-ink">
                    <span className="truncate">{p.name}</span>
                    <button
                      type="button"
                      onClick={() => setMechProducts((prev) => prev.filter((x) => x.id !== p.id))}
                      disabled={pending || ideaGenerating}
                      className="shrink-0 rounded-md px-2 py-0.5 text-xs text-red-700 hover:bg-red-50 disabled:opacity-60"
                      aria-label={`✕ ${p.name}`}
                    >
                      ✕
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-ink-muted">{t('pickProductsHint')}</p>
            )}
            <button
              type="button"
              onClick={() => setMechPickerOpen(true)}
              disabled={pending || ideaGenerating}
              className="mt-2 rounded-lg border border-line bg-background px-3 py-1.5 text-xs font-medium text-ink hover:border-primary disabled:opacity-60"
            >
              {t('pickProducts')} ({mechProducts.length}/2)
            </button>
            {fieldErrors.mechProducts ? (
              <p role="alert" className="mt-1 text-xs text-red-700">{fieldErrors.mechProducts}</p>
            ) : null}
            {mechPickerOpen ? (
              <AffiliateProductPicker
                draftId="new"
                multi
                maxSelect={2}
                initialSelectedIds={mechProducts.map((p) => p.id)}
                onSelect={() => undefined}
                onClose={() => setMechPickerOpen(false)}
                onConfirmSelect={(items) => {
                  setMechProducts(items);
                  setMechPickerOpen(false);
                  setFieldErrors((prev) => {
                    const next = { ...prev };
                    delete next.mechProducts;
                    return next;
                  });
                }}
              />
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <fieldset>
            <legend className="block text-sm font-medium text-ink">
              {t('platform')} <span className="text-red-600">*</span>
            </legend>
            <div className="mt-1 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setSelPlatforms(realPlatforms.map((p) => p.slug))}
                disabled={pending || ideaGenerating}
                className="rounded-lg border border-line bg-surface px-2 py-1 text-xs text-ink-muted hover:border-primary disabled:opacity-60"
              >
                {t('selectAll')}
              </button>
              <button
                type="button"
                onClick={() => setSelPlatforms([])}
                disabled={pending || ideaGenerating}
                className="rounded-lg border border-line bg-surface px-2 py-1 text-xs text-ink-muted hover:border-primary disabled:opacity-60"
              >
                {t('clearAll')}
              </button>
            </div>
            <div className="mt-2 grid grid-cols-1 gap-1 sm:grid-cols-2">
              {realPlatforms.map((p) => (
                <label key={p.slug} className="flex items-center gap-2 rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink has-checked:border-primary">
                  <input
                    type="checkbox"
                    name="platforms"
                    value={p.slug}
                    checked={selPlatforms.includes(p.slug)}
                    disabled={pending || ideaGenerating}
                    onChange={(e) => {
                      setSelPlatforms((prev) =>
                        e.target.checked ? [...prev, p.slug] : prev.filter((s) => s !== p.slug)
                      );
                    }}
                    className="size-4 accent-[var(--color-primary)]"
                  />
                  {p.display_name}
                </label>
              ))}
            </div>
            <p className="mt-1 text-xs text-ink-muted">
              {selPlatforms.length === 0
                ? t('platformMinOne')
                : t('platformCountHint', { count: selPlatforms.length })}
            </p>
            {fieldErrors.platforms ? (
              <p role="alert" className="mt-1 text-xs text-red-700">{fieldErrors.platforms}</p>
            ) : null}
          </fieldset>
        </div>

        <div>
          <label htmlFor="tone" className="block text-sm font-medium text-ink">
            {t('tone')} <span className="text-red-600">*</span>
          </label>
          <select
            id="tone"
            name="tone"
            required
            disabled={pending || ideaGenerating}
            value={tone}
            onChange={(e) => setTone(e.target.value)}
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
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            disabled={pending || ideaGenerating}
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
            value={targetCategory}
            onChange={(e) => setTargetCategory(e.target.value)}
            disabled={pending || ideaGenerating}
            className="mt-1 block w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <option value="">{t('targetCategoryPlaceholder')}</option>
            {categories.map((c) => (
              <option key={c.slug} value={c.slug}>
                {c.display_name}
              </option>
            ))}
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
          value={audience}
          onChange={(e) => setAudience(e.target.value)}
          placeholder={t('audiencePlaceholder')}
          disabled={pending || ideaGenerating}
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
            value={ctaStyle}
            onChange={(e) => setCtaStyle(e.target.value)}
            disabled={pending || ideaGenerating}
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
            value={purpose}
            onChange={(e) => setPurpose(e.target.value)}
            placeholder={t('purposePlaceholder')}
            disabled={pending || ideaGenerating}
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
          value={constraints}
          onChange={(e) => setConstraints(e.target.value)}
          placeholder={t('constraintsPlaceholder')}
          disabled={pending || ideaGenerating}
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
          value={keywords}
          onChange={(e) => setKeywords(e.target.value)}
          placeholder={t('keywordsPlaceholder')}
          disabled={pending || ideaGenerating}
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

            {(selPlatforms.includes('threads') || selPlatforms.includes('twitter')) ? (
              <div className="rounded-lg border border-primary/30 bg-primary/5 px-3 py-3">
                <label htmlFor="targetReplyCount" className="block text-xs font-medium text-primary">
                  {t('targetReplyCount')} <span className="text-ink-muted">{t('targetReplyCountHint')}</span>
                </label>
                <input
                  id="targetReplyCount"
                  name="targetReplyCount"
                  type="number"
                  min={1}
                  max={10}
                  value={targetReplyCount}
                  onChange={(e) => setTargetReplyCount(e.target.value)}
                  disabled={pending || ideaGenerating}
                  className="mt-1 block w-full rounded-lg border border-line bg-background px-3 py-2 text-sm text-ink disabled:opacity-60"
                />
              </div>
            ) : null}

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="targetLocation" className="block text-xs font-medium text-ink-muted">
                  {t('targetLocation')}
                </label>
                <input
                  id="targetLocation"
                  name="targetLocation"
                  type="text"
                  value={targetLocation}
                  onChange={(e) => setTargetLocation(e.target.value)}
                  placeholder="Cth: Indonesia, Bandung"
                  disabled={pending || ideaGenerating}
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
                  value={secondaryLocation}
                  onChange={(e) => setSecondaryLocation(e.target.value)}
                  placeholder="Cth: Jakarta, nasional"
                  disabled={pending || ideaGenerating}
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
                  value={audienceAge}
                  onChange={(e) => setAudienceAge(e.target.value)}
                  placeholder="Cth: 25-34 tahun"
                  disabled={pending || ideaGenerating}
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
                  value={audienceInterests}
                  onChange={(e) => setAudienceInterests(e.target.value)}
                  placeholder="Cth: parenting, keuangan keluarga"
                  disabled={pending || ideaGenerating}
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
                value={accountGoal}
                onChange={(e) => setAccountGoal(e.target.value)}
                placeholder="Cth: mengedukasi calon orang tua baru"
                disabled={pending || ideaGenerating}
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
                  value={allowedCategories}
                  onChange={(e) => setAllowedCategories(e.target.value)}
                  placeholder={t('categoriesHint')}
                  disabled={pending || ideaGenerating}
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
                  value={excludedCategories}
                  onChange={(e) => setExcludedCategories(e.target.value)}
                  placeholder={t('categoriesHint')}
                  disabled={pending || ideaGenerating}
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
                  disabled={pending || ideaGenerating}
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
                  disabled={pending || ideaGenerating}
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
                  disabled={pending || ideaGenerating}
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
                  disabled={pending || ideaGenerating}
                  className="mt-1 block w-full rounded-lg border border-line bg-background px-3 py-2 text-sm text-ink disabled:opacity-60"
                />
              </div>
            </div>
            {isAdmin && llmProviders.length > 0 ? (
              <div className="space-y-3 rounded-xl border border-dashed border-primary/30 bg-primary/[0.03] p-3">
                <p className="text-xs font-semibold text-ink">{t('stageModelSectionTitle')}</p>
                <p className="text-[11px] text-ink-muted">{t('stageModelSectionHint')}</p>
                <StageModelPicker stage="idea_generation" label={t('stageLabel.idea_generation')} providers={llmProviders} models={llmModels} providerId={genProviderId} modelId={genModelId} onProviderChange={setGenProviderId} onModelChange={setGenModelId} disabled={pending || ideaGenerating} />
                <StageModelPicker stage="discovering" label={t('stageLabel.discovering')} providers={llmProviders} models={llmModels} providerId={discProviderId} modelId={discModelId} onProviderChange={setDiscProviderId} onModelChange={setDiscModelId} disabled={pending || ideaGenerating} />
                <StageModelPicker stage="verifying" label={t('stageLabel.verifying')} providers={llmProviders} models={llmModels} providerId={verifyProviderId} modelId={verifyModelId} onProviderChange={setVerifyProviderId} onModelChange={setVerifyModelId} disabled={pending || ideaGenerating} />
                <StageModelPicker stage="scoring" label={t('stageLabel.scoring')} providers={llmProviders} models={llmModels} providerId={scoringProviderId} modelId={scoringModelId} onProviderChange={setScoringProviderId} onModelChange={setScoringModelId} disabled={pending || ideaGenerating} />
                <StageModelPicker stage="developing" label={t('stageLabel.developing')} providers={llmProviders} models={llmModels} providerId={devProviderId} modelId={devModelId} onProviderChange={setDevProviderId} onModelChange={setDevModelId} disabled={pending || ideaGenerating} />
                <StageModelPicker stage="regen_affiliate" label={t('stageLabel.regen_affiliate')} providers={llmProviders} models={llmModels} providerId="" modelId="" onProviderChange={() => {}} onModelChange={() => {}} disabled />
                <p className="text-[11px] text-ink-muted">{t('stageLabel.regen_affiliate_hint')}</p>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      <button
        type="submit"
        disabled={pending || ideaGenerating}
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
