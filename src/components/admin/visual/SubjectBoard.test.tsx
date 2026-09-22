import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { SubjectBoard } from './SubjectBoard';
import { renderWithMessages } from '@/test/utils';

vi.mock('@/lib/admin/visual-actions', () => ({
  reorderImageSubjects: vi.fn().mockResolvedValue({ ok: true }),
  toggleSubjectActive: vi.fn().mockResolvedValue({ ok: true })
}));

const rows = [
  { slug: 'a', display_name: 'A', subject_en: ' Substansi cukup panjang untuk valid ', is_active: true, sort_order: 10 },
  { slug: 'b', display_name: 'B', subject_en: ' Subject B', is_active: false, sort_order: 20 }
];

describe('SubjectBoard — growth', () => {
  it('menampilkan baris baru setelah rerender tanpa melempar', async () => {
    const { rerender } = renderWithMessages(<SubjectBoard subjects={rows} />);
    expect(screen.getByText(/#10 · A/)).toBeInTheDocument();
    expect(screen.getByText(/#20 · B/)).toBeInTheDocument();

    rerender(<SubjectBoard subjects={[...rows, { slug: 'c', display_name: 'C', subject_en: ' Subject C', is_active: true, sort_order: 30 }]} />);
    await waitFor(() => {
      // Lebih spesifik: cari baris yang memuat "#30 · C" agar tidak bentrok dengan subject_en.
      expect(screen.getByText(/#30 · C/)).toBeInTheDocument();
    });
  });
});

describe('SubjectBoard — shrink / state basi', () => {
  it('tidak melempar bila id exist di list tapi tidak ada di subjects (fallback muncul lalu hilang)', async () => {
    const { rerender } = renderWithMessages(
      <SubjectBoard subjects={[
        { slug: 'a', display_name: 'A', subject_en: ' S A', is_active: true, sort_order: 1 },
        { slug: 'b', display_name: 'B', subject_en: ' S B', is_active: true, sort_order: 2 },
        { slug: 'c', display_name: 'C', subject_en: ' S C', is_active: true, sort_order: 3 }
      ]} />
    );
    expect(screen.getByText(/#3 · C/)).toBeInTheDocument();

    // Simulasi state `ids` masih berisi 'c' sedang props subjects menyusut (kasusFlight interleaving pra-fix).
    // Setelah S2 (null-safe renderItem), harus fallback ke "Memuat template..." bukan TypeError.
    rerender(<SubjectBoard subjects={[rows[0]!, rows[1]!]} />);
    await waitFor(() => {
      // Baris c hilang; fallback mungkin muncul transien.
      expect(screen.queryByText(/#3 · C/)).not.toBeInTheDocument();
    });
    // Pastikan tidak ada error boundary terpicu.
    expect(screen.getByText(/Template Subjek/)).toBeInTheDocument();
  });
});
