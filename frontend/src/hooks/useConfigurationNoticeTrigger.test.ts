import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useConfigurationNoticeTrigger } from './useConfigurationNoticeTrigger';

vi.mock('../api/api', () => ({
  getApiBaseUrl: () => 'https://api.example.test',
}));

describe('useConfigurationNoticeTrigger', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);
    window.sessionStorage.clear();
  });

  it('reports only the first application visit in a browser session', async () => {
    renderHook(() => useConfigurationNoticeTrigger());
    renderHook(() => useConfigurationNoticeTrigger());

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.example.test/api/health/frontend-visit',
      expect.objectContaining({ method: 'POST', keepalive: true }),
    );
  });

  it('allows a later visit to retry after the backend rejects the signal', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false }).mockResolvedValueOnce({ ok: true });

    renderHook(() => useConfigurationNoticeTrigger());
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(window.sessionStorage.length).toBe(0));

    renderHook(() => useConfigurationNoticeTrigger());
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  });
});
