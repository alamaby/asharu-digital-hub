import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { SortableList } from './SortableList';

// dnd-kit relies on DOM APIs; minimal mocks keep jsdom happy.
vi.mock('@dnd-kit/core', () => {
  const actual = vi.importActual<typeof import('@dnd-kit/core')>('@dnd-kit/core');
  return actual;
});
vi.mock('@dnd-kit/sortable', () => {
  const actual = vi.importActual<typeof import('@dnd-kit/sortable')>('@dnd-kit/sortable');
  return actual;
});
vi.mock('@dnd-kit/utilities', () => {
  const actual = vi.importActual<typeof import('@dnd-kit/utilities')>('@dnd-kit/utilities');
  return actual;
});

describe('SortableList — sync items→ids via useEffect', () => {
  it('menampilkan item baru setelah rerender tanpa depend on setTimeout race', async () => {
    const { rerender } = render(
      <SortableList
        items={[{ id: 'a' }, { id: 'b' }]}
        onReorder={async () => {}}
        renderItem={(id) => <span>{id}</span>}
      />
    );
    expect(screen.getByText('a')).toBeInTheDocument();
    expect(screen.getByText('b')).toBeInTheDocument();

    rerender(
      <SortableList
        items={[{ id: 'a' }, { id: 'b' }, { id: 'c' }]}
        onReorder={async () => {}}
        renderItem={(id) => <span>{id}</span>}
      />
    );
    await waitFor(() => {
      expect(screen.getByText('c')).toBeInTheDocument();
    });
  });

  it('tidak melempar error saat items berubah cepat (simulasi Flight interleaving)', () => {
    const { rerender } = render(
      <SortableList
        items={[{ id: 'x' }]}
        onReorder={async () => {}}
        renderItem={(id) => <span>{id}</span>}
      />
    );
    // Rerender berulang dengan ukuran berbeda; setelah fix S1, efek menang,
    // bukan setTimeout di badan render yang berlomba.
    rerender(
      <SortableList
        items={[{ id: 'x' }, { id: 'y' }]}
        onReorder={async () => {}}
        renderItem={(id) => <span>{id}</span>}
      />
    );
    rerender(
      <SortableList
        items={[{ id: 'x' }, { id: 'y' }, { id: 'z' }]}
        onReorder={async () => {}}
        renderItem={(id) => <span>{id}</span>}
      />
    );
    expect(screen.getByText('x')).toBeInTheDocument();
    expect(screen.getByText('y')).toBeInTheDocument();
    expect(screen.getByText('z')).toBeInTheDocument();
  });
});
