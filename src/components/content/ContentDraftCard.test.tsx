import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { ContentDraftCard } from './ContentDraftCard';
import { renderWithMessages } from '@/test/utils';

const draft = {
  id: 'draft-1',
  request_id: 'req-1',
  generated_thread: {
    main: { id: 'Halo ini post utama ID dengan link https://s.shopee.co.id/xxx', en: 'Hello main EN with link https://s.shopee.co.id/xxx' },
    replies: [{ id: 'Balasan 1 ID', en: 'Reply 1 EN' }]
  },
  affiliate_injections: [{ friendly_code: 'ASH-001', url: 'https://s.shopee.co.id/xxx', post_index: 0 }],
  status: 'needs_review',
  llm_meta: { provider: 'naraya', model: 'naraya/nemotron-3-ultra' }
} as unknown as Parameters<typeof ContentDraftCard>[0]['draft'];

describe('ContentDraftCard', () => {
  it('renders main and replies with product chip', () => {
    renderWithMessages(<ContentDraftCard draft={draft} />);
    expect(screen.getAllByText(/ASH-001/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/Post Utama/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/Balasan 1/).length).toBeGreaterThanOrEqual(1);
  });

  it('has copy buttons per post', () => {
    renderWithMessages(<ContentDraftCard draft={draft} />);
    expect(screen.getAllByRole('button', { name: /Salin/ }).length).toBeGreaterThanOrEqual(2);
  });
});
