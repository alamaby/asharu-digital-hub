'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { submitPilotInterest } from '@/lib/digital-hub/waitlist';
import { ExternalLink } from '@/components/ui/ExternalLink';

type FormState =
  | { status: 'idle' }
  | { status: 'error'; message: string; fieldErrors?: Record<string, string> }
  | { status: 'success'; whatsappHref?: string; mailtoHref?: string };

/**
 * Pilot-interest form: client usability + server validation.
 * Honeypot `website` hidden from sighted/keyboard users.
 * No PII is logged to the console.
 */
export function WaitlistForm() {
  const t = useTranslations('digitalHub');
  const [state, setState] = useState<FormState>({ status: 'idle' });
  const [pending, startTransition] = useTransition();

  async function onSubmit(formData: FormData) {
    setState({ status: 'idle' });
    startTransition(async () => {
      const result = await submitPilotInterest(formData);
      if (!result.success) {
        const message =
          result.error === 'honeypot'
            ? 'Spam terdeteksi.'
            : result.error?.startsWith('rate_limit')
              ? 'Terlalu sering mengirim. Coba lagi satu jam lagi.'
              : result.error === 'validation'
                ? t('formErrorTitle')
                : (result.error ?? t('formErrorTitle'));
        setState({ status: 'error', message, fieldErrors: result.fieldErrors });
        return;
      }
      setState({
        status: 'success',
        whatsappHref: result.whatsappHref,
        mailtoHref: result.mailtoHref
      });
    });
  }

  if (state.status === 'success') {
    return (
      <div
        role="status"
        aria-live="polite"
        className="rounded-2xl border border-line bg-surface p-6 shadow-card"
      >
        <h3 className="text-lg font-semibold text-ink">{t('formSuccessTitle')}</h3>
        <p className="mt-2 text-sm leading-relaxed text-ink-muted">{t('formSuccessBody')}</p>
        <div className="mt-4 flex flex-wrap gap-3">
          {state.whatsappHref ? (
            <ExternalLink href={state.whatsappHref} className="btn-primary">
              {t('formWhatsapp')}
            </ExternalLink>
          ) : null}
          {state.mailtoHref ? (
            <ExternalLink href={state.mailtoHref} className="btn-secondary">
              {t('formEmail')}
            </ExternalLink>
          ) : null}
          {!state.whatsappHref && !state.mailtoHref ? (
            <p className="text-sm text-ink-muted">{t('formContactMissing')}</p>
          ) : null}
        </div>
      </div>
    );
  }

  const fieldError = (key: string) =>
    state.status === 'error' ? state.fieldErrors?.[key] : undefined;

  const inputClass = (hasError: boolean | undefined) =>
    `mt-1 w-full rounded-lg border bg-surface px-3 py-2 text-base text-ink ${hasError ? 'border-danger' : 'border-line'}`;

  return (
    <form action={onSubmit} className="rounded-2xl border border-line bg-surface p-6 shadow-card sm:p-8" noValidate>
      {state.status === 'error' ? (
        <p role="alert" className="mb-4 rounded-lg border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger">
          {state.message}
        </p>
      ) : null}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="dh-name" className="text-sm font-medium text-ink">
            {t('formName')}
          </label>
          <input id="dh-name" name="name" autoComplete="name" required minLength={2} maxLength={80} className={inputClass(!!fieldError('name'))} aria-invalid={!!fieldError('name')} aria-describedby={fieldError('name') ? 'dh-name-err' : undefined} />
          {fieldError('name') ? <p id="dh-name-err" className="mt-1 text-sm text-danger">{fieldError('name')}</p> : null}
        </div>
        <div>
          <label htmlFor="dh-business" className="text-sm font-medium text-ink">
            {t('formBusiness')}
          </label>
          <input id="dh-business" name="businessName" autoComplete="organization" required minLength={2} maxLength={120} className={inputClass(!!fieldError('businessName'))} aria-invalid={!!fieldError('businessName')} aria-describedby={fieldError('businessName') ? 'dh-business-err' : undefined} />
          {fieldError('businessName') ? <p id="dh-business-err" className="mt-1 text-sm text-danger">{fieldError('businessName')}</p> : null}
        </div>
        <div>
          <label htmlFor="dh-category" className="text-sm font-medium text-ink">
            {t('formCategory')}
          </label>
          <select id="dh-category" name="category" required defaultValue="" className={inputClass(!!fieldError('category'))} aria-invalid={!!fieldError('category')}>
            <option value="" disabled>
              —
            </option>
            <option value="kuliner">{t('user2')}</option>
            <option value="produk_rumahan">{t('user1')}</option>
            <option value="jasa_lokal">{t('user3')}</option>
            <option value="kreatif">{t('user4')}</option>
            <option value="profesional_mandiri">{t('user5')}</option>
            <option value="properti">{t('user6')}</option>
            <option value="online_shop">{t('user7')}</option>
            <option value="lainnya">Lainnya / Other</option>
          </select>
          {fieldError('category') ? <p className="mt-1 text-sm text-danger">{fieldError('category')}</p> : null}
        </div>
        <div>
          <label htmlFor="dh-channel" className="text-sm font-medium text-ink">
            {t('formChannel')}
          </label>
          <select id="dh-channel" name="channel" required defaultValue="" className={inputClass(!!fieldError('channel'))} aria-invalid={!!fieldError('channel')}>
            <option value="" disabled>
              —
            </option>
            <option value="instagram">Instagram</option>
            <option value="tiktok">TikTok</option>
            <option value="facebook">Facebook</option>
            <option value="whatsapp">WhatsApp</option>
            <option value="threads">Threads</option>
            <option value="shopee">Shopee</option>
            <option value="lainnya">Lainnya / Other</option>
          </select>
          {fieldError('channel') ? <p className="mt-1 text-sm text-danger">{fieldError('channel')}</p> : null}
        </div>
      </div>

      <div className="mt-4">
        <label htmlFor="dh-challenge" className="text-sm font-medium text-ink">
          {t('formChallenge')}
        </label>
        <textarea id="dh-challenge" name="challenge" required minLength={10} maxLength={500} rows={3} className={inputClass(!!fieldError('challenge'))} aria-invalid={!!fieldError('challenge')} />
        {fieldError('challenge') ? <p className="mt-1 text-sm text-danger">{fieldError('challenge')}</p> : null}
      </div>

      <div className="mt-4">
        <label htmlFor="dh-contact" className="text-sm font-medium text-ink">
          {t('formContact')}
        </label>
        <input id="dh-contact" name="contact" autoComplete="email" required minLength={5} maxLength={120} className={inputClass(!!fieldError('contact'))} aria-invalid={!!fieldError('contact')} />
        {fieldError('contact') ? <p className="mt-1 text-sm text-danger">{fieldError('contact')}</p> : null}
      </div>

      <div className="mt-4 flex items-start gap-2">
        <input id="dh-consent" name="consent" type="checkbox" required className="mt-1 size-4 accent-primary" />
        <label htmlFor="dh-consent" className="text-sm text-ink-muted">
          {t('formConsent')}
        </label>
      </div>
      {fieldError('consent') ? <p className="mt-1 text-sm text-danger">{fieldError('consent')}</p> : null}

      <div aria-hidden="true" className="absolute -left-[9999px] top-auto h-px w-px overflow-hidden">
        <label>
          {t('formHoneypot')}
          <input type="text" name="website" tabIndex={-1} autoComplete="off" />
        </label>
      </div>

      <p className="mt-4 text-xs leading-relaxed text-ink-muted">{t('formPrivacy')}</p>

      <button type="submit" disabled={pending} className="btn-primary mt-4 min-h-touch">
        {pending ? '…' : t('formSubmit')}
      </button>
    </form>
  );
}
