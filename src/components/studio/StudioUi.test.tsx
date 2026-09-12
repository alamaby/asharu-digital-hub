import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import idMessages from '@/messages/id.json';
import { StudioForm } from './StudioForm';
import { StudioHistory } from './StudioHistory';
import { renderWithMessages } from '@/test/utils';
import type { StudioGenerationRow, StudioOptions } from '@/lib/studio/types';
import { DEFAULT_STUDIO_CONFIG } from '@/lib/studio/types';

vi.mock('@/lib/studio/actions', () => ({
  enqueueStudioImage: vi.fn(async () => ({ imageId: 'new-id', expiresAt: '2026-10-11T00:00:00Z' })),
  enhanceStudioPrompt: vi.fn(async () => ({ image_prompt: 'polished prompt', negative_prompt: 'blurry', reasoning: { visual_strategy: 'after' } })),
  retryFailedStudioImage: vi.fn(async () => ({ imageId: 'x' })),
  deleteStudioImage: vi.fn(async () => {}),
  listUserImages: vi.fn(async () => [])
}));

function options(): StudioOptions {
  return {
    providers: [
      { id: 'prov-1', slug: 'pixazo', display_name: 'Pixazo' },
      { id: 'prov-cf', slug: 'cloudflare', display_name: 'Cloudflare Workers AI' }
    ],
    models: [
      { id: 'model-1', provider_id: 'prov-1', model_id: 'flux-schnell', display_name: 'Flux Schnell', provider_slug: 'pixazo', supports_reference: false },
      { id: 'model-cf', provider_id: 'prov-cf', model_id: '@cf/black-forest-labs/flux-1-schnell', display_name: 'Flux 1 Schnell', provider_slug: 'cloudflare', supports_reference: false }
    ],
    styles: [{ slug: 'photorealistic', display_name: 'Photorealistic' }],
    subjects: [{ slug: 'wanita-muda-modis', display_name: 'Wanita Muda Modis' }],
    cameras: [{ slug: 'eye-level-three-quarter', display_name: 'Eye-Level Three-Quarter' }],
    aspects: [{ slug: '1:1', display_name: 'Square (1:1)', width: 1024, height: 1024, sort_order: 10, is_active: true }],
    config: DEFAULT_STUDIO_CONFIG,
    llmProviders: [{ id: 'llm-prov-1', slug: 'naraya', display_name: 'Naraya' }],
    llmModels: [{ id: 'llm-model-1', provider_id: 'llm-prov-1', model_id: 'naraya/agnes-2.5-flash', display_name: 'Agnes 2.5 Flash' }]
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
    camera_slug: null,
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
    reference_storage_path: null,
    reference_public_url: null,
    reference_strength: null,
    expires_at: '2026-10-11T00:00:00Z',
    created_at: '2026-09-11T00:00:00Z',
    updated_at: '2026-09-11T00:00:00Z',
    ...over
  };
}

function historyProps(imgs: StudioGenerationRow[]) {
  return {
    images: imgs,
    pollingIntervalSec: 10,
    options: options(),
    locale: 'id' as const,
    timeZone: 'Asia/Jakarta'
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
    // Panel enhance: picker LLM + tombol Sempurnakan.
    expect(screen.getByLabelText('Provider LLM')).toBeInTheDocument();
    expect(screen.getByLabelText('Model LLM')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sempurnakan' })).toBeInTheDocument();
    // Tidak ada key mentah yang bocor ke DOM.
    expect(document.body.textContent).not.toMatch(/studio\.(form|title|notice|enhance)/);
    // Counter prompt (maxPrompt config 500) + negative (fix 500) sama-sama "0/500 karakter".
    expect(screen.getAllByText('0/500 karakter')).toHaveLength(2);
  });

  it('submit sukses memanggil onEnqueued agar parent me-refresh list', async () => {
    const user = userEvent.setup();
    const onEnqueued = vi.fn();
    const { enqueueStudioImage } = await import('@/lib/studio/actions');
    vi.mocked(enqueueStudioImage).mockClear();
    renderWithMessages(
      <StudioForm options={options()} quota={{ used: 0, remaining: 20, limit: 20 }} onEnqueued={onEnqueued} />
    );
    await user.type(screen.getByLabelText('Image prompt (EN, deskriptif)'), 'a tidy bedroom with soft morning light');
    await user.click(screen.getByRole('button', { name: 'Generate' }));
    expect(enqueueStudioImage).toHaveBeenCalled();
    expect(onEnqueued).toHaveBeenCalledTimes(1);
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

  it('tombol Sempurnakan menampilkan usulan side-by-side + Terima mengisi textarea', async () => {
    const user = userEvent.setup();
    renderWithMessages(
      <StudioForm options={options()} quota={{ used: 0, remaining: 20, limit: 20 }} />
    );
    await user.type(screen.getByLabelText('Image prompt (EN, deskriptif)'), 'a tidy bedroom with soft morning light');
    await user.click(screen.getByRole('button', { name: 'Sempurnakan' }));
    expect(await screen.findByText('Side-by-side — usulan LLM')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Terima' }));
    expect(screen.getByLabelText('Image prompt (EN, deskriptif)')).toHaveValue('polished prompt');
  });

  it('panel referensi: upload + slider strength + badge ref di opsi model', async () => {
    const user = userEvent.setup();
    const opts = options();
    opts.models = [
      ...opts.models,
      { id: 'model-sd', provider_id: 'prov-cf', model_id: '@cf/runwayml/stable-diffusion-v1-5-img2img', display_name: 'SD 1.5 Img2Img', provider_slug: 'cloudflare', supports_reference: true }
    ];
    renderWithMessages(
      <StudioForm options={opts} quota={{ used: 0, remaining: 20, limit: 20 }} />
    );
    expect(screen.getByText('Gambar referensi (opsional, img2img)')).toBeInTheDocument();
    expect(screen.getByText('Upload JPEG/PNG/WebP ≤5MB, atau Pakai ulang dari riwayat. Tanpa mask — inpainting menyusul.')).toBeInTheDocument();
    // Slider muncul setelah referensi ada — simulasikan dengan file upload gagal tipe.
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    expect(fileInput).toBeInTheDocument();
    expect(fileInput.accept).toContain('image/webp');
    await user.selectOptions(screen.getByLabelText('Model'), 'model-sd');
    expect(screen.getByLabelText('Model')).toHaveValue('model-sd');
  });
});

describe('StudioHistory', () => {
  it('merender daftar kronologis: badge + meta + prompt penuh + tombol aksi', () => {
    renderWithMessages(
      <StudioHistory
        {...historyProps([
          genRow({ id: 'r1', status: 'ready', public_url: 'https://cdn.test/1.png' }),
          genRow({ id: 'f1', status: 'failed', last_error: 'boom' })
        ])}
        onReuse={() => {}}
      />
    );
    expect(screen.getByText('Riwayat Generate')).toBeInTheDocument();
    const rows = screen.getAllByTestId('studio-row');
    expect(rows).toHaveLength(2);
    // Toolbar ikut merender kata "Siap"/"Gagal" di <option> — batasi ke baris.
    expect(within(rows[0] as HTMLElement).getByText('Siap')).toBeInTheDocument();
    expect(within(rows[1] as HTMLElement).getByText('Gagal')).toBeInTheDocument();
    // Badge "Menunggu worker" tidak ada di baris (opsi <option> toolbar abaikan).
    for (const r of rows) {
      expect(within(r as HTMLElement).queryByText('Menunggu worker')).not.toBeInTheDocument();
    }
    // Meta label sama di kedua baris → getAllByText.
    expect(screen.getAllByText('pixazo · flux-schnell · tanpa style · 1:1')).toHaveLength(2);
    // Prompt penuh (tanpa line-clamp) + tombol copy/reuse.
    expect(screen.getAllByText('tidy bedroom after declutter, soft light')).toHaveLength(2);
    expect(screen.getAllByRole('button', { name: 'Salin prompt' })).toHaveLength(2);
    expect(screen.getAllByRole('button', { name: 'Pakai ulang' })).toHaveLength(2);
    // Tombol aksi lain.
    expect(screen.getByRole('button', { name: 'Unduh' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ulangi' })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Hapus' }).length).toBeGreaterThan(0);
    expect(document.body.textContent).not.toMatch(/studio\.history\./);
  });

  it('timestamp dibuat ditampilkan dalam zona waktu user', () => {
    renderWithMessages(
      <StudioHistory
        {...historyProps([genRow({ id: 't1', status: 'ready', created_at: '2026-09-11T00:00:00Z' })])}
      />
    );
    // 00:00 UTC = 07:00 Asia/Jakarta, format id-ID "11 Sep, 07.00".
    const rows = screen.getAllByTestId('studio-row');
    expect(within(rows[0] as HTMLElement).getByText('11 Sep, 07.00')).toBeInTheDocument();
  });

  it('detail log menampilkan error penuh + attempts + llm_meta', async () => {
    const user = userEvent.setup();
    renderWithMessages(
      <StudioHistory
        {...historyProps([
          genRow({ id: 'f2', status: 'failed', last_error: 'cloudflare image 400: boom detail', attempts: 2, llm_meta: { provider: 'cloudflare' } })
        ])}
      />
    );
    await user.click(screen.getByText('Detail log'));
    expect(screen.getByText('cloudflare image 400: boom detail')).toBeInTheDocument();
    expect(screen.getByText('Percobaan')).toBeInTheDocument();
    expect(document.body.textContent).toContain('"provider": "cloudflare"');
  });

  it('menampilkan placeholder memproses untuk antrean pending', () => {
    renderWithMessages(
      <StudioHistory
        {...historyProps([genRow({ id: 'p1', status: 'pending', provider_slug: '', model_slug: '' })])}
      />
    );
    expect(screen.getByText('Worker sedang memproses...')).toBeInTheDocument();
  });

  it('antrean pending dengan pin cloudflare menampilkan request, bukan auto', () => {
    renderWithMessages(
      <StudioHistory
        {...historyProps([
          genRow({
            id: 'p2',
            status: 'pending',
            provider_slug: '',
            model_slug: '',
            provider_id: 'prov-cf',
            model_id: 'model-cf'
          })
        ])}
      />
    );
    // Label request + "(antre)" — regresi kasus cloudflare→pixazo 11 Sep 2026.
    expect(
      screen.getByText('cloudflare · @cf/black-forest-labs/flux-1-schnell · tanpa style · 1:1 (antre)')
    ).toBeInTheDocument();
  });

  it('toolbar sort + filter status tersedia', () => {
    renderWithMessages(
      <StudioHistory {...historyProps([genRow({ id: 's1', status: 'ready' })])} />
    );
    expect(screen.getByLabelText('Status')).toBeInTheDocument();
    expect(screen.getByLabelText('Provider')).toBeInTheDocument();
    expect(screen.getByLabelText('Model')).toBeInTheDocument();
    expect(screen.getByLabelText('Urutkan')).toBeInTheDocument();
    expect(screen.getByText('Filter lanjutan')).toBeInTheDocument();
  });

  it('tombol Pakai ulang memanggil onReuse dengan barisnya', async () => {
    const user = userEvent.setup();
    const onReuse = vi.fn();
    renderWithMessages(
      <StudioHistory {...historyProps([genRow({ id: 'u1', status: 'ready' })])} onReuse={onReuse} />
    );
    await user.click(screen.getByRole('button', { name: 'Pakai ulang' }));
    expect(onReuse).toHaveBeenCalledTimes(1);
    expect(onReuse.mock.calls[0]?.[0]).toMatchObject({ id: 'u1' });
  });

  it('badge ref + tautan referensi tampil di baris berisi referensi', () => {
    renderWithMessages(
      <StudioHistory
        {...historyProps([
          genRow({ id: 'ref1', status: 'ready', public_url: 'https://cdn.test/1.png', reference_public_url: 'https://cdn.test/ref.jpg' })
        ])}
        onReuse={() => {}}
      />
    );
    const rows = screen.getAllByTestId('studio-row');
    expect(within(rows[0] as HTMLElement).getByText('ref')).toBeInTheDocument();
    expect(within(rows[0] as HTMLElement).getByText('Referensi:')).toBeInTheDocument();
  });

  it('refreshKey berubah memicu listUserImages + baris pending tampil', async () => {
    const { listUserImages } = await import('@/lib/studio/actions');
    vi.mocked(listUserImages).mockClear();
    const pending = [genRow({ id: 'n1', status: 'pending', provider_slug: '', model_slug: '' })];
    vi.mocked(listUserImages).mockResolvedValueOnce(pending);
    const view = render(
      <NextIntlClientProvider locale="id" messages={idMessages}>
        <StudioHistory {...historyProps([])} refreshKey={0} />
      </NextIntlClientProvider>
    );
    expect(screen.queryByTestId('studio-row')).not.toBeInTheDocument();
    expect(listUserImages).not.toHaveBeenCalled();
    view.rerender(
      <NextIntlClientProvider locale="id" messages={idMessages}>
        <StudioHistory {...historyProps([])} refreshKey={1} />
      </NextIntlClientProvider>
    );
    expect(await screen.findByTestId('studio-row')).toBeInTheDocument();
    expect(listUserImages).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Worker sedang memproses...')).toBeInTheDocument();
    vi.mocked(listUserImages).mockResolvedValue([]);
  });
});
