import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PropertyGallery } from './PropertyGallery';
import { getPublishedPropertyBySlug } from '@/data/properties';
import { renderWithMessages } from '@/test/utils';

const photos =
  getPublishedPropertyBySlug('dijual-apartemen-studio-buah-batu-park-bandung')
    ?.gallery ?? [];

function counterLabel(position: number) {
  // The counter <p> appends the localized photo caption after the position.
  return screen.getByText(
    (_, element) =>
      element?.tagName === 'P' &&
      (element.textContent ?? '').startsWith(`${position} / ${photos.length}`)
  );
}

describe('PropertyGallery', () => {
  it('renders one thumbnail button per photo with localized alt as name', () => {
    renderWithMessages(<PropertyGallery photos={photos} />);
    const thumbs = screen.getAllByRole('button');
    expect(thumbs).toHaveLength(photos.length + 0);
    expect(
      screen.getByRole('button', { name: 'Foto 1 unit studio Apartemen Buah Batu Park' })
    ).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('opens the lightbox, closes on Escape and restores focus to the invoker', async () => {
    const user = userEvent.setup();
    renderWithMessages(<PropertyGallery photos={photos} />);

    const firstThumb = screen.getByRole('button', {
      name: 'Foto 1 unit studio Apartemen Buah Batu Park'
    });
    await user.click(firstThumb);

    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeInTheDocument();
    expect(counterLabel(1)).toBeInTheDocument();

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(firstThumb).toHaveFocus();
  });

  it('arrow keys navigate photos while open', async () => {
    const user = userEvent.setup();
    renderWithMessages(<PropertyGallery photos={photos} />);

    await user.click(screen.getAllByRole('button')[0]!);
    await user.keyboard('{ArrowRight}');
    expect(counterLabel(2)).toBeInTheDocument();
    await user.keyboard('{ArrowLeft}');
    expect(counterLabel(1)).toBeInTheDocument();
  });
});
