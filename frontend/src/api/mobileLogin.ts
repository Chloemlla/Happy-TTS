import { api } from './api';
import type { User } from '../types/auth';

export type MobileLoginChallengeStatus = 'pending' | 'scanned' | 'approved' | 'consumed' | 'expired';

export interface MobileLoginChallenge {
  sessionId: string;
  pollToken: string;
  qrPayload: string;
  expiresAt: string;
  pollIntervalMs: number;
}

export interface MobileLoginPollResponse {
  success: true;
  status: MobileLoginChallengeStatus;
  expiresAt: string | null;
  token?: string;
  user?: User;
}

export interface MobileLoginTokenResponse {
  success: true;
  token: string;
  user: User;
}

export const createMobileLoginChallenge = async (): Promise<MobileLoginChallenge> => {
  const response = await api.post<{ success: true } & MobileLoginChallenge>('/api/auth/mobile-login/challenge');
  return response.data;
};

export const pollMobileLoginChallenge = async (
  sessionId: string,
  pollToken: string,
): Promise<MobileLoginPollResponse> => {
  const response = await api.post<MobileLoginPollResponse>('/api/auth/mobile-login/challenge/poll', {
    sessionId,
    pollToken,
  });
  return response.data;
};

export const exchangeMobileClientToken = async (
  clientLoginToken: string,
  deviceId?: string,
): Promise<MobileLoginTokenResponse> => {
  const response = await api.post<MobileLoginTokenResponse>('/api/auth/mobile-login/client-token/exchange', {
    clientLoginToken,
    ...(deviceId ? { deviceId } : {}),
  });
  return response.data;
};
