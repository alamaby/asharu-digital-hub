import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import {
  LoginForm,
  loginFormReducer,
  initialLoginFormState
} from './LoginForm';

const mockSignInWithOtp = vi.fn();

vi.mock('@/lib/supabase/client', () => ({
  createSupabaseBrowser: () => ({
    auth: {
      signInWithOtp: (...args: unknown[]) => mockSignInWithOtp(...args)
    }
  })
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => {
    const dict: Record<string, string> = {
      emailLabel: 'Email',
      emailPlaceholder: 'nama@email.com',
      submit: 'Kirim Tautan Masuk',
      submitting: 'Mengirim…',
      success: 'Tautan telah dikirim.',
      error: 'Gagal mengirim tautan.',
      useDifferentEmail: 'Gunakan email lain'
    };
    return dict[key] ?? key;
  }
}));

describe('loginFormReducer FSM', () => {
  it('SET_EMAIL mengupdate email dan menghapus error', () => {
    const initial = { ...initialLoginFormState, errorMessage: 'ada error' };
    const next = loginFormReducer(initial, { type: 'SET_EMAIL', email: 'test@example.com' });
    expect(next.email).toBe('test@example.com');
    expect(next.errorMessage).toBeNull();
  });

  it('SUBMIT_START mengubah phase ke submitting', () => {
    const next = loginFormReducer(initialLoginFormState, { type: 'SUBMIT_START' });
    expect(next.phase).toBe('submitting');
  });

  it('SUBMIT_START diabaikan bila sudah dalam phase submitting (guard)', () => {
    const submitting = { ...initialLoginFormState, phase: 'submitting' as const };
    const next = loginFormReducer(submitting, { type: 'SUBMIT_START' });
    expect(next).toBe(submitting);
  });

  it('SUBMIT_SUCCESS mengubah phase ke success', () => {
    const submitting = { ...initialLoginFormState, phase: 'submitting' as const, email: 'admin@asharu.id' };
    const next = loginFormReducer(submitting, { type: 'SUBMIT_SUCCESS', message: 'Tautan terkirim' });
    expect(next.phase).toBe('success');
    expect(next.successMessage).toBe('Tautan terkirim');
  });

  it('SUBMIT_ERROR mengubah phase ke error dan menyimpan pesan', () => {
    const submitting = { ...initialLoginFormState, phase: 'submitting' as const };
    const next = loginFormReducer(submitting, { type: 'SUBMIT_ERROR', error: 'Email invalid' });
    expect(next.phase).toBe('error');
    expect(next.errorMessage).toBe('Email invalid');
  });

  it('RESET_FORM mengembalikan state ke idle dan mengosongkan email', () => {
    const success = {
      phase: 'success' as const,
      email: 'admin@asharu.id',
      errorMessage: null,
      successMessage: 'Tautan terkirim'
    };
    const next = loginFormReducer(success, { type: 'RESET_FORM' });
    expect(next).toEqual(initialLoginFormState);
  });
});

describe('LoginForm Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('merender form input awal dengan benar', () => {
    render(<LoginForm />);
    expect(screen.getByLabelText('Email')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Kirim Tautan Masuk' })).toBeDefined();
  });

  it('menangani alur submit sukses dan menampilkan tombol reset', async () => {
    mockSignInWithOtp.mockResolvedValue({ error: null });
    render(<LoginForm />);

    const input = screen.getByLabelText('Email');
    fireEvent.change(input, { target: { value: 'admin@asharu.id' } });

    const button = screen.getByRole('button', { name: 'Kirim Tautan Masuk' });
    fireEvent.click(button);

    await waitFor(() => {
      expect(mockSignInWithOtp).toHaveBeenCalledWith(
        expect.objectContaining({
          email: 'admin@asharu.id'
        })
      );
    });

    await waitFor(() => {
      expect(screen.getByText('Tautan telah dikirim.')).toBeDefined();
      expect(screen.getByRole('button', { name: 'Gunakan email lain' })).toBeDefined();
    });

    // Klik gunakan email lain harus mereset form kembali ke input awal
    fireEvent.click(screen.getByRole('button', { name: 'Gunakan email lain' }));
    expect(screen.getByLabelText('Email')).toBeDefined();
  });

  it('menampilkan pesan error saat submit gagal', async () => {
    mockSignInWithOtp.mockResolvedValue({ error: { message: 'Rate limit terlampaui' } });
    render(<LoginForm />);

    const input = screen.getByLabelText('Email');
    fireEvent.change(input, { target: { value: 'bad@asharu.id' } });

    const button = screen.getByRole('button', { name: 'Kirim Tautan Masuk' });
    fireEvent.click(button);

    await waitFor(() => {
      expect(screen.getByRole('status')).toBeDefined();
      expect(screen.getByText('Rate limit terlampaui')).toBeDefined();
    });
  });
});
