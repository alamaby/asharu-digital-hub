import { describe, expect, it, vi, beforeEach } from 'vitest';

const mockGetUser = vi.fn();
const mockMaybeSingle = vi.fn();
const mockFrom = vi.fn();

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServer: vi.fn(async () => ({
    auth: { getUser: mockGetUser },
    from: mockFrom
  }))
}));

import { isAdmin } from './is-admin';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('isAdmin', () => {
  it('returns false when there is no user', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    expect(await isAdmin()).toBe(false);
  });

  it('returns true when profile.is_admin = true', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    mockMaybeSingle.mockResolvedValue({ data: { is_admin: true } });
    mockFrom.mockReturnValue({
      select: () => ({ eq: () => ({ maybeSingle: mockMaybeSingle }) })
    });
    expect(await isAdmin()).toBe(true);
  });

  it('returns false when profile.is_admin = false', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    mockMaybeSingle.mockResolvedValue({ data: { is_admin: false } });
    mockFrom.mockReturnValue({
      select: () => ({ eq: () => ({ maybeSingle: mockMaybeSingle }) })
    });
    expect(await isAdmin()).toBe(false);
  });

  it('returns false when profile is missing', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    mockMaybeSingle.mockResolvedValue({ data: null });
    mockFrom.mockReturnValue({
      select: () => ({ eq: () => ({ maybeSingle: mockMaybeSingle }) })
    });
    expect(await isAdmin()).toBe(false);
  });
});
