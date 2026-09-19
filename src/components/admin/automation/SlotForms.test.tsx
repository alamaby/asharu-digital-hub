import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SlotCard, SlotSection } from './SlotForms';

const slot = {
  slot_key: 'pagi',
  label: 'Slot Pagi',
  hour: 8,
  minute: 30,
  weekdays: 31,
  is_enabled: true,
  window_minutes: 120,
  priority: 1,
  platform_slugs: ['artikel'],
  max_topics: null,
  product_pool_size: null,
  product_category: null,
  auto_publish_article: null,
  require_cover: null,
  notify_on: null,
  notify_emails: null,
  maximum_iterations: null,
  minimum_score: null,
  minimum_candidates: null,
  freshness_hours: null,
  cover_max_wait_minutes: null,
  cover_max_attempts: null,
  max_retry_attempts: null,
  language: null,
  tone: null,
  audience: null,
  purpose: null,
  cta_style: null,
  target_reply_count: null,
  template_slug: null,
  idea_generation_enabled: null,
  idea_product_search: null,
  email_from: null,
  email_reply_to: null,
  updated_at: '2026-09-19T10:00:00Z'
};

const globalDefaults = {
  max_topics: 1,
  product_pool_size: 50,
  language: 'both',
  tone: 'casual',
  audience: 'umum',
  purpose: 'membagikan informasi bermanfaat',
  cta_style: 'soft_sell',
  target_reply_count: null,
  template_slug: null,
  maximum_iterations: null,
  minimum_score: null,
  minimum_candidates: null,
  freshness_hours: null,
  cover_max_wait_minutes: 60,
  cover_max_attempts: 3,
  max_retry_attempts: 3,
  notify_on: 'both',
  notify_emails: [] as string[],
  idea_generation_enabled: false,
  idea_product_search: true,
  require_cover: true,
  auto_publish_article: false,
  email_from: 'Asharu <updates@alamaby.com>',
  email_reply_to: null,
  product_category: null
};

vi.mock('@/lib/automation/actions', () => ({
  updateAutomationSlot: vi.fn(async () => ({ ok: true, message: 'Slot pagi diperbarui.' })),
  toggleAutomationSlot: vi.fn(async () => ({ ok: true, message: 'Slot pagi diaktifkan.' })),
  deleteAutomationSlot: vi.fn(async () => ({ ok: true, message: 'Slot pagi dihapus.' })),
  runAutomationNow: vi.fn(async () => ({ ok: true, message: 'Tick slot dijalankan.' }))
}));

describe('SlotCard', () => {
  it('menampilkan slot_key dan jam di ringkasan', () => {
    render(<SlotCard slot={slot} platforms={[]} templates={[]} globalDefaults={globalDefaults} />);
    expect(screen.getByText('pagi')).toBeInTheDocument();
    // jam dipisah elemen, gunakan query selector
    const timeSpan = document.querySelector('p.text-xs.text-ink-muted');
    expect(timeSpan?.textContent).toContain('08');
    expect(timeSpan?.textContent).toContain('30');
  });

  it('select tri-state default bernilai kosong saat nilai slot null', () => {
    render(<SlotCard slot={slot} platforms={[]} templates={[]} globalDefaults={globalDefaults} />);
    // Buka details agar field override terlihat
    const details = document.querySelector('details');
    if (details) details.open = true;
    render(<SlotCard slot={slot} platforms={[]} templates={[]} globalDefaults={globalDefaults} />);
    const languageSelect = document.querySelector('select[name="language"]');
    expect(languageSelect).not.toBeNull();
    expect((languageSelect as HTMLSelectElement | null)?.value).toBe('');
  });

  it('tombol Hapus tidak dirender untuk slot default', () => {
    const defaultSlot = { ...slot, slot_key: 'default' };
    render(<SlotCard slot={defaultSlot} platforms={[]} templates={[]} globalDefaults={globalDefaults} />);
    expect(screen.queryByRole('button', { name: 'Hapus' })).toBeNull();
  });
});

describe('SlotSection', () => {
  it('menampilkan slot_key dari daftar slot', () => {
    render(
      <SlotSection
        slots={[slot]}
        platforms={[]}
        templates={[]}
        globalDefaults={globalDefaults}
      />
    );
    expect(screen.getByText('pagi')).toBeInTheDocument();
  });

  it('menampilkan pesan kosong bila slots kosong', () => {
    render(
      <SlotSection
        slots={[]}
        platforms={[]}
        templates={[]}
        globalDefaults={globalDefaults}
      />
    );
    expect(screen.getByText(/migrasi.*belum dijalankan/i)).toBeInTheDocument();
  });
});
