import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AutomationConfigForm, RetryRunForm } from './AutomationForms';

const cfg = {
  is_enabled: true,
  schedule_hour: 10,
  schedule_minute: 0,
  timezone: 'Asia/Jakarta',
  schedule_window_minutes: 180,
  platform_slugs: ['artikel', 'twitter', 'threads'],
  template_slug: null,
  max_topics: 1,
  language: 'both',
  tone: 'casual',
  audience: 'umum',
  purpose: 'membagikan informasi bermanfaat',
  cta_style: 'soft_sell',
  target_reply_count: null,
  product_pool_size: 50,
  product_category: null,
  idea_generation_enabled: false,
  idea_product_search: true,
  require_cover: true,
  cover_max_wait_minutes: 60,
  cover_max_attempts: 3,
  auto_publish_article: true,
  max_retry_attempts: 3,
  notify_on: 'both',
  notify_emails: [] as string[],
  email_from: 'Asharu <updates@alamaby.com>',
  email_reply_to: null,
  last_run_at: null,
  product_repeat_blackout_days: 14
};

const platformRows = [
  { slug: 'artikel', display_name: 'Artikel' },
  { slug: 'threads', display_name: 'Threads' },
  { slug: 'twitter', display_name: 'Twitter' }
];

vi.mock('@/lib/automation/actions', () => ({
  updateAutomationConfig: vi.fn(async () => ({ ok: true, message: 'Tersimpan (artikel, twitter, threads).' })),
  runAutomationNow: vi.fn(async () => ({ ok: true, message: 'Tick dijalankan: run 2026-09-16 → developing.' })),
  retryAutomationRun: vi.fn(async () => ({ ok: true, message: 'Run dikembalikan ke awaiting_cover.' }))
}));

describe('AutomationConfigForm', () => {
  it('tiga platform dari DB tampil tercentang sejak awal', () => {
    const { container } = render(
      <AutomationConfigForm cfg={cfg} platformRows={platformRows} templateRows={[]} />
    );
    for (const slug of ['artikel', 'threads', 'twitter']) {
      const box = container.querySelector(`input[type="checkbox"][name="platform_slugs"][value="${slug}"]`);
      expect(box).not.toBeNull();
      expect(box as HTMLElement).toBeChecked();
    }
    // Instagram tidak ada di DB config → render unchecked.
    const other = container.querySelector('input[type="checkbox"][name="platform_slugs"][value="instagram"]');
    expect(other).toBeNull();
  });

  it('klik Simpan → pending lalu notice sukses berisi platform', async () => {
    const user = userEvent.setup();
    render(<AutomationConfigForm cfg={cfg} platformRows={platformRows} templateRows={[]} />);
    await user.click(screen.getByRole('button', { name: 'Simpan' }));
    expect(screen.getByRole('status')).toHaveTextContent(/Menyimpan|Tersimpan/);
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent('Tersimpan (artikel, twitter, threads).')
    );
  });

  it('klik Run now → notice berisi status run', async () => {
    const user = userEvent.setup();
    render(<AutomationConfigForm cfg={cfg} platformRows={platformRows} templateRows={[]} />);
    await user.click(screen.getByRole('button', { name: 'Run now' }));
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent('Tick dijalankan: run 2026-09-16 → developing.')
    );
  });
});

describe('RetryRunForm', () => {
  it('klik Coba lagi → notice sukses', async () => {
    const user = userEvent.setup();
    render(<RetryRunForm runId="run-1" />);
    await user.click(screen.getByRole('button', { name: 'Coba lagi' }));
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent('Run dikembalikan ke awaiting_cover.')
    );
  });
});
