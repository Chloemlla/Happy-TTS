import { getFingerprint } from './fingerprint';

export type IpCaptchaType = 'turnstile' | 'hcaptcha';

export interface IpVerificationSession {
  success: boolean;
  verified: boolean;
  requiresVerification: boolean;
  fingerprint: string;
  ipAddress: string;
  token?: string;
  expiresAt?: string;
  issuedBy?: 'auto' | 'turnstile' | 'hcaptcha';
  reason?: string;
  fraudScore?: number;
  riskFlags?: string[];
  tokenTtlMinutes: number;
}

interface StoredIpVerificationToken {
  token: string;
  fingerprint: string;
  expiresAt: number;
  issuedBy?: 'auto' | 'turnstile' | 'hcaptcha';
}

const STORAGE_KEY = 'hapx_ip_verification_token_v1';
const EVENT_NAME = 'hapx:ip-verification-required';

const EXEMPT_PATH_PREFIXES = [
  '/api/ip-verification',
  '/api/turnstile',
  '/api/human-check',
  '/api/frontend-config',
  '/api/status',
  '/api/auth/linuxdo/',
];

let fetchTransportInstalled = false;

function resolveApiBaseUrl(): string {
  if (import.meta.env.DEV) {
    const currentHost = window.location.hostname;
    const currentPort = window.location.port;
    if (currentHost === '192.168.10.7' && currentPort === '3001') {
      return 'http://192.168.10.7:3000';
    }
    return 'http://localhost:3000';
  }
  if (import.meta.env.VITE_API_URL) {
    return import.meta.env.VITE_API_URL;
  }
  return 'https://api.951100.xyz';
}

function isExemptPath(pathname: string): boolean {
  return EXEMPT_PATH_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

function isBackendRequest(url: URL): boolean {
  const apiOrigin = new URL(resolveApiBaseUrl()).origin;
  const sameBackendOrigin = url.origin === apiOrigin || url.origin === window.location.origin;
  const relativeApiPath = url.pathname.startsWith('/api/');
  return sameBackendOrigin && relativeApiPath;
}

function readStoredToken(): StoredIpVerificationToken | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredIpVerificationToken;
    if (!parsed?.token || !parsed?.fingerprint || !parsed?.expiresAt) {
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }
    if (Date.now() >= parsed.expiresAt) {
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return parsed;
  } catch {
    localStorage.removeItem(STORAGE_KEY);
    return null;
  }
}

export function clearIpVerificationToken(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore storage failures
  }
}

export function getStoredIpVerificationToken(fingerprint?: string): string | null {
  const stored = readStoredToken();
  if (!stored) return null;
  if (fingerprint && stored.fingerprint !== fingerprint) {
    clearIpVerificationToken();
    return null;
  }
  return stored.token;
}

export function getStoredIpVerificationExpiry(): number | null {
  return readStoredToken()?.expiresAt ?? null;
}

export function storeIpVerificationToken(session: IpVerificationSession): void {
  if (!session.token || !session.expiresAt || !session.fingerprint) return;

  try {
    const expiresAt = new Date(session.expiresAt).getTime();
    if (!Number.isFinite(expiresAt)) return;
    const payload: StoredIpVerificationToken = {
      token: session.token,
      fingerprint: session.fingerprint,
      expiresAt,
      issuedBy: session.issuedBy,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // ignore storage failures
  }
}

function normalizeSessionPayload(payload: Partial<IpVerificationSession>, fingerprint: string): IpVerificationSession {
  return {
    success: Boolean(payload.success),
    verified: Boolean(payload.verified),
    requiresVerification: Boolean(payload.requiresVerification),
    fingerprint: typeof payload.fingerprint === 'string' && payload.fingerprint ? payload.fingerprint : fingerprint,
    ipAddress: typeof payload.ipAddress === 'string' ? payload.ipAddress : 'unknown',
    token: typeof payload.token === 'string' ? payload.token : undefined,
    expiresAt: typeof payload.expiresAt === 'string' ? payload.expiresAt : undefined,
    issuedBy:
      payload.issuedBy === 'turnstile' || payload.issuedBy === 'hcaptcha' || payload.issuedBy === 'auto'
        ? payload.issuedBy
        : undefined,
    reason: typeof payload.reason === 'string' ? payload.reason : undefined,
    fraudScore: typeof payload.fraudScore === 'number' ? payload.fraudScore : undefined,
    riskFlags: Array.isArray(payload.riskFlags) ? payload.riskFlags.filter((item): item is string => typeof item === 'string') : [],
    tokenTtlMinutes: typeof payload.tokenTtlMinutes === 'number' ? payload.tokenTtlMinutes : 40,
  };
}

export function emitIpVerificationRequired(detail: Record<string, unknown> = {}): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail }));
}

export function onIpVerificationRequired(
  handler: (event: CustomEvent<Record<string, unknown>>) => void,
): () => void {
  const wrapped = (event: Event) => {
    handler(event as CustomEvent<Record<string, unknown>>);
  };
  window.addEventListener(EVENT_NAME, wrapped);
  return () => window.removeEventListener(EVENT_NAME, wrapped);
}

function isIpVerificationErrorPayload(payload: unknown): payload is Record<string, unknown> {
  return Boolean(
    payload &&
      typeof payload === 'object' &&
      ((payload as Record<string, unknown>).errorCode === 'IP_VERIFICATION_REQUIRED' ||
        (payload as Record<string, unknown>).requiresVerification === true),
  );
}

async function maybeHandleBlockedResponse(response: Response, url: URL): Promise<void> {
  if (response.status !== 403 || isExemptPath(url.pathname)) return;

  const payload = await response
    .clone()
    .json()
    .catch(() => null);

  if (!isIpVerificationErrorPayload(payload)) return;

  clearIpVerificationToken();
  emitIpVerificationRequired({
    ...payload,
    url: url.toString(),
  });
}

export async function buildIpVerificationHeaders(): Promise<Record<string, string>> {
  const fingerprint = await getFingerprint();
  const headers: Record<string, string> = {};

  if (!fingerprint) return headers;

  headers['X-Fingerprint'] = fingerprint;

  const token = getStoredIpVerificationToken(fingerprint);
  if (token) {
    headers['X-IP-Verification-Token'] = token;
  }

  return headers;
}

export async function initializeIpVerificationSession(existingFingerprint?: string): Promise<IpVerificationSession> {
  const fingerprint = existingFingerprint || (await getFingerprint()) || '';
  const response = await fetch(`${resolveApiBaseUrl()}/api/ip-verification/session`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'include',
    body: JSON.stringify({ fingerprint }),
  });

  const payload = await response.json().catch(() => ({}));
  const normalized = normalizeSessionPayload(payload, fingerprint);

  if (normalized.token && normalized.verified) {
    storeIpVerificationToken(normalized);
  } else if (normalized.requiresVerification) {
    clearIpVerificationToken();
  }

  return normalized;
}

export async function completeIpVerification(
  fingerprintInput: string,
  captchaToken: string,
  captchaType: IpCaptchaType,
): Promise<IpVerificationSession> {
  const fingerprint = fingerprintInput || (await getFingerprint()) || '';
  const response = await fetch(`${resolveApiBaseUrl()}/api/ip-verification/complete`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'include',
    body: JSON.stringify({
      fingerprint,
      captchaToken,
      captchaType,
    }),
  });

  const payload = await response.json().catch(() => ({}));
  const normalized = normalizeSessionPayload(payload, fingerprint);

  if (normalized.token && normalized.verified) {
    storeIpVerificationToken(normalized);
  }

  return normalized;
}

export function installIpVerificationTransport(): void {
  if (fetchTransportInstalled || typeof window === 'undefined') return;
  fetchTransportInstalled = true;

  const originalFetch = window.fetch.bind(window);

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init);
    const url = new URL(request.url, window.location.origin);

    if (!isBackendRequest(url) || isExemptPath(url.pathname)) {
      return originalFetch(request);
    }

    const headers = new Headers(request.headers);
    const ipVerificationHeaders = await buildIpVerificationHeaders();

    Object.entries(ipVerificationHeaders).forEach(([key, value]) => {
      if (!headers.has(key)) {
        headers.set(key, value);
      }
    });

    const nextRequest = new Request(request, { headers });
    const response = await originalFetch(nextRequest);
    await maybeHandleBlockedResponse(response, url);
    return response;
  };
}

installIpVerificationTransport();
