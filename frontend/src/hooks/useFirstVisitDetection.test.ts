import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useFirstVisitDetection } from './useFirstVisitDetection';

// vi.mock 会被提到文件顶部执行，工厂里引用的变量必须同时在 vi.hoisted 里创建。
// 之前这几个 vi.fn() 是顶层 const，导入被测 hook 时它们还在 TDZ 里，
// 整个套件直接死在 "Cannot access 'getFingerprint' before initialization"。
const {
  getFingerprint,
  initializeIpVerificationSession,
  getStoredIpVerificationExpiry,
  onIpVerificationRequired,
} = vi.hoisted(() => ({
  getFingerprint: vi.fn(),
  initializeIpVerificationSession: vi.fn(),
  getStoredIpVerificationExpiry: vi.fn(),
  onIpVerificationRequired: vi.fn(),
}));

vi.mock('../utils/fingerprint', () => ({
  getFingerprint,
}));

vi.mock('../utils/ipVerification', () => ({
  initializeIpVerificationSession,
  getStoredIpVerificationExpiry,
  onIpVerificationRequired,
}));

describe('useFirstVisitDetection', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    getFingerprint.mockResolvedValue('fingerprint-123456');
    initializeIpVerificationSession.mockResolvedValue({
      success: true,
      verified: true,
      requiresVerification: false,
      fingerprint: 'fingerprint-123456',
      ipAddress: '127.0.0.1',
      token: 'verification-token',
      expiresAt: new Date(Date.now() + 40 * 60 * 1000).toISOString(),
      tokenTtlMinutes: 40,
    });
    getStoredIpVerificationExpiry.mockReturnValue(null);
    onIpVerificationRequired.mockImplementation(() => () => {});
  });

  it('marks the visitor as verified when the backend auto-approves the session', async () => {
    const { result } = renderHook(() => useFirstVisitDetection());

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.isFirstVisit).toBe(false);
    expect(result.current.isVerified).toBe(true);
    expect(result.current.clientIP).toBe('127.0.0.1');
  });

  it('requires verification when the backend returns a challenge decision', async () => {
    initializeIpVerificationSession.mockResolvedValue({
      success: true,
      verified: false,
      requiresVerification: true,
      fingerprint: 'fingerprint-123456',
      ipAddress: '203.0.113.10',
      reason: 'fraud_score=91;flags=proxy,vpn',
      tokenTtlMinutes: 40,
    });

    const { result } = renderHook(() => useFirstVisitDetection());

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.isFirstVisit).toBe(true);
    expect(result.current.isVerified).toBe(false);
    expect(result.current.clientIP).toBe('203.0.113.10');
  });

  it('exposes an error when fingerprint generation fails', async () => {
    getFingerprint.mockResolvedValue(null);

    const { result } = renderHook(() => useFirstVisitDetection());

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.isVerified).toBe(false);
    expect(result.current.error).toContain('fingerprint');
  });

  it('re-runs the bootstrap silently when the server demands verification mid-session', async () => {
    let notify: (event: CustomEvent<Record<string, unknown>>) => void = () => {};
    onIpVerificationRequired.mockImplementation((handler) => {
      notify = handler;
      return () => {};
    });

    const { result } = renderHook(() => useFirstVisitDetection());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(initializeIpVerificationSession).toHaveBeenCalledTimes(1);

    initializeIpVerificationSession.mockResolvedValue({
      success: true,
      verified: false,
      requiresVerification: true,
      fingerprint: 'fingerprint-123456',
      ipAddress: '203.0.113.10',
      reason: 'fraud_score=91',
      tokenTtlMinutes: 40,
    });

    act(() => {
      notify(new CustomEvent('hapx:ip-verification-required', { detail: { reason: 'missing_verification_headers' } }));
    });

    await waitFor(() => expect(initializeIpVerificationSession).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(result.current.isFirstVisit).toBe(true));
    expect(result.current.isVerified).toBe(false);
  });
});
