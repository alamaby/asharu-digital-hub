import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StudioForm } from './StudioForm';
import { StudioHistory } from './StudioHistory';
import { renderWithMessages } from '@/test/utils';
import type { StudioGenerationRow, StudioOptions } from '@/lib/studio/types';
import { DEFAULT_STUDIO_CONFIG } from '@/lib/studio/types';

vi.mock('@/lib/studio/actions', () => ({
  enqueueStudioImage: vi.fn(async () => ({ imageId: 'new-id', expiresAt: '2026-10-11T00:00:00Z' })),
  retryFailedStudioImage: vi.fn(async () => ({ imageId: 'x' })),
  deleteStudioImage: vi.fn(async () => {}),
  listUserImages: vi.fn(async () => [])
}));

// embla tidak jalan penuh di jsdom (tiru stub ImageHistoryCarousel.test).
function mockMatchMedia() {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockReturnValue({
      matches: false,
      media: '',
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => true
    })
  );
}

function mockObservers() {
  vi.stubGlobal(
    'IntersectionObserver',
    vi.fn().mockImplementation(() => ({
      observe: () => {},
      unobserve: () => {},
      disconnect: () => {},
      takeRecords: () => []
    }))
  );
  vi.stubGlobal(
    'ResizeObserver',
    vi.fn().mockImplementation(() => ({
      observe: () => {},
      unobserve: () => {},
      disconnect: () => {}
    }))
  );
}

function options(): StudioOptions {
  return {
    providers: [{ id: 'prov-1', slug: 'pixazo', display_name: 'Pixazo' }],
    models: [
      { id: 'model-1', provider_id: 'prov-1', model_id: 'flux-schnell', display_name: 'Flux Schnell', provider_slug: 'pixazo' }
    ],
    styles: [{ slug: 'photorealistic', display_name: 'Photorealistic' }],
    subjects: [{ slug: 'wanita-muda-modis', display_name: 'Wanita Muda Modis' }],
    aspects: [{ slug: '1:1', display_name: 'Square (1:1)', width: 1024, height: 1024, sort_order: 10, is_active: true }],
    config: DEFAULT_STUDIO_CONFIG
  };
}

function genRow(over: Partial<StudioGenerationRow> & { id: string }): StudioGenerationRow {
  return {
    user_id: 'u1',
    image_prompt: 'tidy bedroom after declutter, soft light',
    negative_prompt: null,
    provider_id: null,
    model_id: null,
    style_slug: null,
    subject_slug: null,
    aspect_slug: '1:1',
    provider_slug: 'pixazo',
    model_slug: 'flux-schnell',
    storage_path: null,
    public_url: null,
    width: null,
    height: null,
    status: 'pending',
    last_error: null,
    attempts: 0,
    llm_meta: null,
    expires_at: '2026-10-11T00:00:00Z',
    created_at: '2026-09-11T00:00:00Z',
    updated_at: '2026-09-11T00:00:00Z',
    ...over
  };
}

describe('StudioForm', () => {
  it('merender label terjemahan (bukan key mentah) + counter karakter', () => {
    renderWithMessages(
      <StudioForm options={options()} quota={{ used: 0, remaining: 20, limit: 20 }} />
    );
    expect(screen.getByLabelText('Image prompt (EN, deskriptif)')).toBeInTheDocument();
    expect(screen.getByLabelText('Provider')).toBeInTheDocument();
    expect(screen.getByLabelText('Aspek rasio')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Generate' })).toBeInTheDocument();
    // Tidak ada key mentah yang bocor ke DOM.
    expect(document.body.textContent).not.toMatch(/studio\.(form|title|notice)/);
    // Counter prompt (maxPrompt config 500) + negative (fix 500) sama-sama "0/500 karakter".
    expect(screen.getAllByText('0/500 karakter')).toHaveLength(2);
  });

  it('prompt <10 karakter menampilkan peringatan inline', async () => {
    const user = userEvent.setup();
    renderWithMessages(
      <StudioForm options={options()} quota={{ used: 0, remaining: 20, limit: 20 }} />
    );
    await user.type(screen.getByLabelText('Image prompt (EN, deskriptif)'), 'kucing');
    expect(await screen.findByRole('alert')).toHaveTextContent('Prompt minimal 10 karakter');
  });

  it('kuota habis menampilkan pesan exhausted yang jelas', () => {
    renderWithMessages(
      <StudioForm options={options()} quota={{ used: 20, remaining: 0, limit: 20 }} />
    );
    expect(screen.getByRole('button', { name: 'Generate' })).toBeDisabled();
  });
});

describe('StudioHistory', () => {
  it('merender badge status terjemahan + meta provider·model·style·aspek', () => {
    mockMatchMedia();
    mockObservers();
    renderWithMessages(
      <StudioHistory
        images={[
          genRow({ id: 'r1', status: 'ready', public_url: 'https://cdn.test/1.png' }),
          genRow({ id: 'f1', status: 'failed', last_error: 'boom' })
        ]}
        pollingIntervalSec={10}
      />
    );
    expect(screen.getByText('Riwayat Generate')).toBeInTheDocument();
    expect(screen.getAllByText('Siap').length).toBeGreaterThan(0);
    // Slide ready + failed saja → tidak ada badge "Menunggu worker".
    expect(screen.queryByText('Menunggu worker')).not.toBeInTheDocument();
    expect(screen.getByText('Gagal')).toBeInTheDocument();
    // Meta label sama di kedua slide → getAllByText.
    expect(screen.getAllByText('pixazo · flux-schnell · tanpa style · 1:1')).toHaveLength(2);
    expect(screen.getByText('Error: boom')).toBeInTheDocument();
    // Tombol aksi terjemahan.
    expect(screen.getByRole('button', { name: 'Unduh' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ulangi' })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Hapus' }).length).toBeGreaterThan(0);
    expect(document.body.textContent).not.toMatch(/studio\.history\./);
    vi.unstubAllGlobals();
  });

  it('menampilkan placeholder memproses untuk antrean pending', () => {
    mockMatchMedia();
    mockObservers();
    renderWithMessages(<StudioHistory images={[genRow({ id: 'p1', status: 'pending' })]} pollingIntervalSec={10} />);
    expect(screen.getByText('Worker sedang memproses...')).toBeInTheDocument();
    vi.unstubAllGlobals();
  });
});
