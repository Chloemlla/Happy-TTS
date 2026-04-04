import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useFirstVisitDetection } from './useFirstVisitDetection';

const cleanupExpiredAccessTokens = vi.fn();
const getClientIP = vi.fn();
const getFingerprint = vi.fn();
const checkAccessToken = vi.fn();
const getAccessToken = vi.fn();
const verifyAccessToken = vi.fn();
const checkTempFingerprintStatus = vi.fn();
const reportTempFingerprint = vi.fn();

vi.mock('../utils/fingerprint', () => ({
  cleanupExpiredAccessTokens,
  getClientIP,
  getFingerprint,
  checkAccessToken,
  getAccessToken,
  verifyAccessToken,
  checkTempFingerprintStatus,
  reportTempFingerprint,
}));

describe('useFirstVisitDetection', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    getClientIP.mockResolvedValue('127.0.0.1');
    getFingerprint.mockResolvedValue('fingerprint-123456');
    checkAccessToken.mockResolvedValue(false);
    getAccessToken.mockReturnValue(null);
    verifyAccessToken.mockResolvedValue(false);
    checkTempFingerprintStatus.mockResolvedValue({ exists: false, verified: false });
    reportTempFingerprint.mockResolvedValue({ isFirstVisit: true, verified: false });
  });

  it('skips verification when the server already has a valid access token', async () => {
    checkAccessToken.mockResolvedValue(true);

    const { result } = renderHook(() => useFirstVisitDetection());

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.isFirstVisit).toBe(false);
    expect(result.current.isVerified).toBe(true);
    expect(reportTempFingerprint).not.toHaveBeenCalled();
  });

  it('requires verification when an existing temp fingerprint record is still unverified', async () => {
    checkTempFingerprintStatus.mockResolvedValue({ exists: true, verified: false });

    const { result } = renderHook(() => useFirstVisitDetection());

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.isFirstVisit).toBe(true);
    expect(result.current.isVerified).toBe(false);
    expect(reportTempFingerprint).not.toHaveBeenCalled();
  });

  it('reuses the generated fingerprint when creating a temp fingerprint record', async () => {
    const { result } = renderHook(() => useFirstVisitDetection());

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(reportTempFingerprint).toHaveBeenCalledWith('fingerprint-123456');
    expect(result.current.isFirstVisit).toBe(true);
    expect(result.current.isVerified).toBe(false);
  });
});
