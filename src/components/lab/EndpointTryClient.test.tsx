import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EndpointTryPageClient } from './EndpointTryClient';
import { renderWithMessages } from '@/test/utils';

vi.mock('@/lib/endpoint-try/actions', () => ({
  saveEndpointTryRun: vi.fn(async () => ({ ok: true, data: { id: 'run-123' } })),
  listEndpointTryRuns: vi.fn(async () => ({
    items: [],
    total: 0,
    page: 1,
    pageSize: 10,
    totalPages: 1
  })),
  deleteEndpointTryRun: vi.fn(async () => ({ ok: true, data: null }))
}));

const defaultProps = {
  locale: 'id',
  timeZone: 'Asia/Jakarta',
  quota: { used: 2, limit: 10, remaining: 8 },
  history: null,
  error: null
};

describe('EndpointTryPageClient FSM', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  it('renders initial form and controls in idle state', () => {
    renderWithMessages(<EndpointTryPageClient {...defaultProps} />);
    expect(screen.getByRole('heading', { level: 1, name: 'Coba Endpoint' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Uji & List Model' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Kirim' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Kirim (Stream)' })).toBeInTheDocument();
    // Stop button should not be present when idle
    expect(screen.queryByRole('button', { name: 'Stop' })).not.toBeInTheDocument();
  });

  it('handles model catalog loading state independently from chat', async () => {
    const user = userEvent.setup();
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        ok: true,
        models: [{ id: 'gpt-4o-mini', ownedBy: 'openai' }],
        latencyMs: 120
      })
    });

    renderWithMessages(<EndpointTryPageClient {...defaultProps} />);

    // Fill credentials
    const baseUrlInput = screen.getByPlaceholderText('https://api.openai.com/v1');
    const apiKeyInput = screen.getByPlaceholderText('sk-… / hf_…');
    await user.type(baseUrlInput, 'https://api.openai.com/v1');
    await user.type(apiKeyInput, 'sk-test123456');

    const testBtn = screen.getByRole('button', { name: 'Uji & List Model' });
    await user.click(testBtn);

    await waitFor(() => {
      expect(screen.getByText(/120 ms/)).toBeInTheDocument();
    });

    // Send button should remain "Kirim", not contaminated by model testing
    expect(screen.getByRole('button', { name: 'Kirim' })).toHaveTextContent('Kirim');
  });

  it('handles chat sending state and displays results cleanly', async () => {
    const user = userEvent.setup();
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        ok: true,
        text: 'Ini adalah jawaban AI.',
        usage: { promptTokens: 15, completionTokens: 8, totalTokens: 23 },
        finishReason: 'stop',
        latencyMs: 450,
        tokensPerSec: 17.7
      })
    });

    renderWithMessages(<EndpointTryPageClient {...defaultProps} />);

    const baseUrlInput = screen.getByPlaceholderText('https://api.openai.com/v1');
    const apiKeyInput = screen.getByPlaceholderText('sk-… / hf_…');
    const promptInput = screen.getByPlaceholderText('Contoh: Jelaskan fotosintesis dalam 2 kalimat.');

    await user.type(baseUrlInput, 'https://api.openai.com/v1');
    await user.type(apiKeyInput, 'sk-test123456');
    await user.type(promptInput, 'Jelaskan apa itu FSM!');

    const sendBtn = screen.getByRole('button', { name: 'Kirim' });
    await user.click(sendBtn);

    await waitFor(() => {
      expect(screen.getByText('Ini adalah jawaban AI.')).toBeInTheDocument();
    });

    // Connection test button was never set to "Menguji..." during chat
    expect(screen.getByRole('button', { name: 'Uji & List Model' })).toHaveTextContent('Uji & List Model');
  });
});
