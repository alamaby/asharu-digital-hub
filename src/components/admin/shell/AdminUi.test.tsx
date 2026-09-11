import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { AdminCard } from '@/components/admin/shell/AdminCard';
import { AdminBadge } from '@/components/admin/shell/AdminBadge';
import { AdminPageHeader } from '@/components/admin/shell/AdminPageHeader';
import { renderWithMessages } from '@/test/utils';

describe('admin shell UI primitives', () => {
  it('AdminCard renders title region with description and body', () => {
    renderWithMessages(
      <AdminCard title="Ringkasan" desc="Tujuh hari terakhir">
        <p>isi</p>
      </AdminCard>
    );
    expect(screen.getByRole('region', { name: 'Ringkasan' })).toBeInTheDocument();
    expect(screen.getByText('Tujuh hari terakhir')).toBeInTheDocument();
    expect(screen.getByText('isi')).toBeInTheDocument();
  });

  it('AdminBadge renders content', () => {
    renderWithMessages(<AdminBadge color="success">Aktif</AdminBadge>);
    expect(screen.getByText('Aktif')).toBeInTheDocument();
  });

  it('AdminPageHeader renders heading with intro', () => {
    renderWithMessages(<AdminPageHeader title="Dasbor" intro="Ringkasan operasional" />);
    expect(screen.getByRole('heading', { name: 'Dasbor', level: 1 })).toBeInTheDocument();
    expect(screen.getByText('Ringkasan operasional')).toBeInTheDocument();
  });
});
