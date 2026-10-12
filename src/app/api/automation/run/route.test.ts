import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockRunAutomationTick = vi.fn();
const mockLoadAutomationConfig = vi.fn();

vi.mock('@/lib/automation/runner', () => ({
  get runAutomationTick() { return mockRunAutomationTick; }
}));

vi.mock('@/lib/automation/config', () => ({
  get loadAutomationConfig() { return mockLoadAutomationConfig; }
}));

vi.mock('@/lib/content/cron-auth', () => ({
  isCronAuthorized: () => true
}));

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseService: () => ({})
}));

const { POST } = await import('./route');

describe('/api/automation/run route', () => {
  beforeEach(() => {
    mockRunAutomationTick.mockReset();
    mockLoadAutomationConfig.mockReset();
  });

  it('mengembalikan skipped:disabled saat isEnabled:false tanpa memanggil runner', async () => {
    mockLoadAutomationConfig.mockResolvedValueOnce({ isEnabled: false });
    const req = new Request('http://localhost/api/automation/run', { method: 'POST' }) as never;
    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ ok: true, skipped: 'disabled' });
    expect(mockRunAutomationTick).not.toHaveBeenCalled();
  });

  it('memanggil runner saat isEnabled:true', async () => {
    mockLoadAutomationConfig.mockResolvedValueOnce({ isEnabled: true });
    mockRunAutomationTick.mockResolvedValueOnce({ ok: true, status: 'completed' });
    const req = new Request('http://localhost/api/automation/run', { method: 'POST' }) as never;
    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ ok: true, status: 'completed' });
    expect(mockRunAutomationTick).toHaveBeenCalledTimes(1);
  });
});
