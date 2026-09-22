import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { CameraAngleBoard } from './CameraAngleBoard';
import { renderWithMessages } from '@/test/utils';

vi.mock('@/lib/admin/visual-actions', () => ({
  reorderCameraAngles: vi.fn().mockResolvedValue({ ok: true }),
  toggleCameraAngleActive: vi.fn().mockResolvedValue({ ok: true })
}));

const rows = [
  { slug: 'low', display_name: 'Low Angle', angle_en: ' Low-angle shot', is_active: true, sort_order: 10 },
  { slug: 'high', display_name: 'High Angle', angle_en: ' High-angle shot', is_active: false, sort_order: 20 }
];

describe('CameraAngleBoard — growth', () => {
  it('menampilkan baris baru setelah rerender tanpa melempar', async () => {
    const { rerender } = renderWithMessages(<CameraAngleBoard angles={rows} />);
    expect(screen.getByText(/#10 · Low Angle/)).toBeInTheDocument();
    expect(screen.getByText(/#20 · High Angle/)).toBeInTheDocument();

    rerender(<CameraAngleBoard angles={[...rows, { slug: 'eye', display_name: 'Eye Level', angle_en: ' Eye-level shot', is_active: true, sort_order: 30 }]} />);
    await waitFor(() => {
      expect(screen.getByText(/#30 · Eye Level/)).toBeInTheDocument();
    });
  });
});

describe('CameraAngleBoard — shrink / state basi', () => {
  it('tidak melempar bila id exist di list tapi tidak ada di angles', async () => {
    const { rerender } = renderWithMessages(
      <CameraAngleBoard angles={[
        { slug: 'a', display_name: 'A', angle_en: ' A', is_active: true, sort_order: 1 },
        { slug: 'b', display_name: 'B', angle_en: ' B', is_active: true, sort_order: 2 },
        { slug: 'c', display_name: 'C', angle_en: ' C', is_active: true, sort_order: 3 }
      ]} />
    );
    expect(screen.getByText(/#3 · C/)).toBeInTheDocument();

    rerender(<CameraAngleBoard angles={[rows[0]!, rows[1]!]} />);
    await waitFor(() => {
      expect(screen.queryByText(/#3 · C/)).not.toBeInTheDocument();
    });
    expect(screen.getByText(/Template Camera Angle/)).toBeInTheDocument();
  });
});
