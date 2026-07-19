import type { PenaltyAppealKind } from '../components/PenaltyAppealActions';
import { SUPPORT_EMAIL } from '../components/PenaltyAppealActions';

export const PENALTY_APPEAL_EVENT = 'synapse:penalty-appeal-required';

export interface PenaltyAppealPayload {
  kind: PenaltyAppealKind;
  reason?: string;
  details?: string;
  remainingText?: string;
  title?: string;
  ticketChannelEnabled?: boolean;
  supportEmail?: string;
  source?: string;
}

type PenaltyLikeData = Record<string, unknown> | null | undefined;

function asText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function joinDetails(...parts: Array<string | undefined>): string | undefined {
  const lines = parts.map((part) => (part || '').trim()).filter(Boolean);
  return lines.length > 0 ? lines.join('\n') : undefined;
}

export function isTicketPermissionBanError(data: PenaltyLikeData, errorText = ''): boolean {
  const error = errorText || asText(data?.error) || asText(data?.message);
  const punishment = asText(data?.punishment);
  const code = asText(data?.code) || asText(data?.errorCode);
  const haystack = `${error}\n${punishment}\n${code}`;
  return (
    code === 'TICKET_PERMISSION_BANNED' ||
    error.includes('工单权限已被封禁') ||
    error.includes('工单权限被封禁') ||
    haystack.includes('工单访问权限已封禁') ||
    (error.includes('封禁') && (error.includes('工单') || punishment.includes('封禁')))
  );
}

export function isAccountSuspendedError(data: PenaltyLikeData, errorText = '', status?: number): boolean {
  const error = errorText || asText(data?.error) || asText(data?.message);
  const code = asText(data?.code) || asText(data?.errorCode);
  if (code === 'ACCOUNT_SUSPENDED' || code === 'TTS_ACCOUNT_SUSPENDED') return true;
  if (error.includes('账户已被封停') || error.includes('账户已暂停') || error.includes('账户已被暂停')) return true;
  if (status === 403 && error.includes('封停')) return true;
  return false;
}

export function classifyPenaltyAppeal(
  data: PenaltyLikeData,
  options: { status?: number; errorText?: string; source?: string } = {},
): PenaltyAppealPayload | null {
  const status = options.status;
  const errorText = options.errorText || asText(data?.error) || asText(data?.message);
  if (status != null && status !== 403 && !isAccountSuspendedError(data, errorText, status)) {
    // Still allow explicit suspended text without 403.
    if (!isAccountSuspendedError(data, errorText) && !isTicketPermissionBanError(data, errorText)) {
      return null;
    }
  }

  if (isTicketPermissionBanError(data, errorText)) {
    return {
      kind: 'ticket_permission_ban',
      title: errorText || '您的工单权限已被封禁',
      reason: asText(data?.punishment) || errorText || '工单权限当前不可用',
      details: joinDetails(asText(data?.details), `申诉邮箱: ${SUPPORT_EMAIL}`),
      remainingText: asText(data?.details).includes('剩余') ? asText(data?.details) : undefined,
      ticketChannelEnabled: false,
      supportEmail: asText(data?.supportEmail) || SUPPORT_EMAIL,
      source: options.source,
    };
  }

  if (isAccountSuspendedError(data, errorText, status)) {
    return {
      kind: 'account_suspended',
      title: errorText || '账户已被封停',
      reason: asText(data?.punishment) || errorText || '当前账户状态为已暂停/封停，部分功能不可用。',
      details: joinDetails(asText(data?.details), `申诉邮箱: ${SUPPORT_EMAIL}`),
      ticketChannelEnabled: true,
      supportEmail: asText(data?.supportEmail) || SUPPORT_EMAIL,
      source: options.source,
    };
  }

  return null;
}

export function emitPenaltyAppealRequired(payload: PenaltyAppealPayload): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(PENALTY_APPEAL_EVENT, { detail: payload }));
}

export function onPenaltyAppealRequired(
  handler: (payload: PenaltyAppealPayload) => void,
): () => void {
  if (typeof window === 'undefined') return () => undefined;
  const wrapped = (event: Event) => {
    const custom = event as CustomEvent<PenaltyAppealPayload>;
    if (custom?.detail?.kind) handler(custom.detail);
  };
  window.addEventListener(PENALTY_APPEAL_EVENT, wrapped);
  return () => window.removeEventListener(PENALTY_APPEAL_EVENT, wrapped);
}

export function maybeEmitPenaltyAppealFromError(
  error: unknown,
  source = 'api',
): PenaltyAppealPayload | null {
  const response =
    error && typeof error === 'object' && 'response' in error
      ? (error as { response?: { status?: number; data?: Record<string, unknown> } }).response
      : undefined;
  const message =
    error && typeof error === 'object' && 'message' in error
      ? asText((error as { message?: unknown }).message)
      : '';
  const payload = classifyPenaltyAppeal(response?.data, {
    status: response?.status,
    errorText: asText(response?.data?.error) || message,
    source,
  });
  if (payload) emitPenaltyAppealRequired(payload);
  return payload;
}
