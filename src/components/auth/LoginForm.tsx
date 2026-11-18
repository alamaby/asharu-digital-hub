'use client';

import { useReducer } from 'react';
import { useTranslations } from 'next-intl';
import { createSupabaseBrowser } from '@/lib/supabase/client';
import { env } from '@/lib/env';

export type LoginPhase = 'idle' | 'submitting' | 'success' | 'error';

export interface LoginFormState {
  phase: LoginPhase;
  email: string;
  errorMessage: string | null;
  successMessage: string | null;
}

export type LoginFormAction =
  | { type: 'SET_EMAIL'; email: string }
  | { type: 'SUBMIT_START' }
  | { type: 'SUBMIT_SUCCESS'; message: string }
  | { type: 'SUBMIT_ERROR'; error: string }
  | { type: 'RESET_FORM' };

export const initialLoginFormState: LoginFormState = {
  phase: 'idle',
  email: '',
  errorMessage: null,
  successMessage: null
};

export function loginFormReducer(state: LoginFormState, action: LoginFormAction): LoginFormState {
  switch (action.type) {
    case 'SET_EMAIL':
      return {
        ...state,
        email: action.email,
        errorMessage: null
      };
    case 'SUBMIT_START':
      if (state.phase === 'submitting') return state; // Guard anti-reentrancy
      return {
        ...state,
        phase: 'submitting',
        errorMessage: null,
        successMessage: null
      };
    case 'SUBMIT_SUCCESS':
      return {
        ...state,
        phase: 'success',
        successMessage: action.message,
        errorMessage: null
      };
    case 'SUBMIT_ERROR':
      return {
        ...state,
        phase: 'error',
        errorMessage: action.error,
        successMessage: null
      };
    case 'RESET_FORM':
      return {
        ...initialLoginFormState,
        email: ''
      };
    default:
      return state;
  }
}

export function LoginForm() {
  const t = useTranslations('auth.login');
  const [state, dispatch] = useReducer(loginFormReducer, initialLoginFormState);

  const isSubmitting = state.phase === 'submitting';
  const isSuccess = state.phase === 'success';

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting) return;

    dispatch({ type: 'SUBMIT_START' });

    const supabase = createSupabaseBrowser();
    if (!supabase) {
      dispatch({ type: 'SUBMIT_ERROR', error: t('error') });
      return;
    }

    const base = env.siteUrl && env.siteUrl.length > 0 ? env.siteUrl : window.location.origin;
    const emailRedirectTo = `${base.replace(/\/$/, '')}/id/auth/exchange`;

    const { error } = await supabase.auth.signInWithOtp({
      email: state.email.trim(),
      options: { emailRedirectTo }
    });

    if (error) {
      dispatch({ type: 'SUBMIT_ERROR', error: error.message });
    } else {
      dispatch({ type: 'SUBMIT_SUCCESS', message: t('success') });
    }
  }

  if (isSuccess) {
    return (
      <div className="space-y-4 rounded-xl border border-emerald-200 bg-emerald-50/70 p-5 dark:border-emerald-900/40 dark:bg-emerald-950/20">
        <div className="flex items-start gap-3">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-sm font-bold text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300">
            ✓
          </span>
          <div className="space-y-1">
            <p className="text-sm font-medium text-emerald-900 dark:text-emerald-200">
              {state.successMessage}
            </p>
            <p className="text-xs text-emerald-700 dark:text-emerald-400">
              Tautan dikirim ke <span className="font-semibold">{state.email}</span>.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => dispatch({ type: 'RESET_FORM' })}
          className="text-xs font-medium text-emerald-700 underline hover:text-emerald-800 dark:text-emerald-300 dark:hover:text-emerald-200"
        >
          {t('useDifferentEmail')}
        </button>
      </div>
    );
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
          disabled={isSubmitting}
          value={state.email}
          onChange={(event) => dispatch({ type: 'SET_EMAIL', email: event.target.value })}
          placeholder={t('emailPlaceholder')}
          className="mt-1 block w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-muted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:cursor-not-allowed disabled:bg-line/20"
        />
      </div>

      <button
        type="submit"
        disabled={isSubmitting}
        className="btn-primary w-full"
        aria-busy={isSubmitting}
      >
        {isSubmitting ? t('submitting') : t('submit')}
      </button>

      {state.phase === 'error' && state.errorMessage ? (
        <p
          role="status"
          aria-live="polite"
          className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800 dark:bg-red-950/20 dark:text-red-300"
        >
          {state.errorMessage}
        </p>
      ) : null}
    </form>
  );
}
