import type { User } from "../utils/userStorageTypes";

export type AccountSecurityRiskLevel = "good" | "watch" | "risk";
export type AccountSecurityRecommendationSeverity = "info" | "warning" | "critical";

export interface AccountSecurityRecommendation {
  id: string;
  label: string;
  detail: string;
  severity: AccountSecurityRecommendationSeverity;
  action?: "enable_mfa" | "review_login" | "bind_identity" | "report_fingerprint" | "contact_admin";
}

export interface AccountSecuritySummary {
  score: number;
  riskLevel: AccountSecurityRiskLevel;
  mfaEnabled: boolean;
  totpEnabled: boolean;
  passkeyEnabled: boolean;
  linkedProviderCount: number;
  fingerprintCount: number;
  lastFingerprintAt: number | null;
  lastFingerprintIp: string | null;
  lastLoginAt: string | null;
  lastLoginIp: string | null;
  loginIpMatchesLastFingerprint: boolean | null;
  accountStatus: "active" | "suspended";
  translationEnabled: boolean;
  translationLimitedUntil: string | null;
  requireFingerprint: boolean;
  recommendations: AccountSecurityRecommendation[];
}

const getLatestFingerprint = (user: User): { ts?: number; ip?: string } | null => {
  const list = Array.isArray(user.fingerprints) ? user.fingerprints : [];
  const latest = list.reduce((currentLatest, item) => {
    const currentTs = Number(currentLatest?.ts || 0);
    const itemTs = Number(item?.ts || 0);
    return itemTs > currentTs ? item : currentLatest;
  }, list[0]);

  if (latest) return latest;
  return user.latestFingerprint || null;
};

const isFutureDate = (value?: string | null): boolean => {
  if (!value) return false;
  const ts = Date.parse(value);
  return Number.isFinite(ts) && ts > Date.now();
};

const countLinkedProviders = (user: User): number => {
  let count = 0;
  if (user.authProvider && user.authProvider !== "local") count += 1;
  if (user.linuxdoId) count += 1;
  return count;
};

const clampScore = (value: number): number => Math.max(0, Math.min(100, Math.round(value)));

export function buildAccountSecuritySummary(user: User): AccountSecuritySummary {
  const totpEnabled = Boolean(user.totpEnabled);
  const passkeyEnabled = Boolean(
    user.passkeyEnabled || (Array.isArray(user.passkeyCredentials) && user.passkeyCredentials.length > 0),
  );
  const mfaEnabled = totpEnabled || passkeyEnabled;
  const latestFingerprint = getLatestFingerprint(user);
  const fingerprintCount =
    typeof user.fingerprintCount === "number"
      ? user.fingerprintCount
      : Array.isArray(user.fingerprints)
        ? user.fingerprints.length
        : latestFingerprint
          ? 1
          : 0;
  const lastLoginIp = typeof user.lastLoginIp === "string" && user.lastLoginIp ? user.lastLoginIp : null;
  const lastFingerprintIp =
    typeof latestFingerprint?.ip === "string" && latestFingerprint.ip ? latestFingerprint.ip : null;
  const loginIpMatchesLastFingerprint =
    lastLoginIp && lastFingerprintIp ? lastLoginIp === lastFingerprintIp : null;
  const translationLimitedUntil = isFutureDate(user.translationAccessUntil) ? user.translationAccessUntil || null : null;
  const accountStatus = user.accountStatus === "suspended" ? "suspended" : "active";
  const recommendations: AccountSecurityRecommendation[] = [];
  let score = 100;

  if (!mfaEnabled) {
    score -= 24;
    recommendations.push({
      id: "enable-mfa",
      label: "启用二次验证",
      detail: "当前账户只依赖密码。建议启用 TOTP 或 Passkey，降低密码泄露后的风险。",
      severity: "critical",
      action: "enable_mfa",
    });
  }

  if (fingerprintCount === 0) {
    score -= 12;
    recommendations.push({
      id: "report-fingerprint",
      label: "补充设备指纹",
      detail: "还没有设备指纹记录，异常登录和设备变更判断会不够准确。",
      severity: "warning",
      action: "report_fingerprint",
    });
  }

  if (user.requireFingerprint) {
    score -= 10;
    recommendations.push({
      id: "fingerprint-required",
      label: "需要完成指纹上报",
      detail: "管理员已要求该账户下次上报设备指纹，请按页面提示完成。",
      severity: "warning",
      action: "report_fingerprint",
    });
  }

  if (loginIpMatchesLastFingerprint === false) {
    score -= 14;
    recommendations.push({
      id: "review-login",
      label: "核对最近登录 IP",
      detail: "最近登录 IP 与最新设备指纹 IP 不一致，请确认是否为本人操作。",
      severity: "warning",
      action: "review_login",
    });
  }

  if (countLinkedProviders(user) === 0) {
    score -= 6;
    recommendations.push({
      id: "bind-identity",
      label: "绑定第三方账号",
      detail: "绑定 Google 或 Linux.do 后，账号恢复和跨端登录体验会更完整。",
      severity: "info",
      action: "bind_identity",
    });
  }

  if (accountStatus === "suspended") {
    score -= 35;
    recommendations.push({
      id: "account-suspended",
      label: "账户已暂停",
      detail: "当前账户处于暂停状态，如有疑问请联系管理员处理。",
      severity: "critical",
      action: "contact_admin",
    });
  }

  if (user.isTranslationEnabled === false || translationLimitedUntil) {
    score -= 8;
    recommendations.push({
      id: "translation-limited",
      label: "翻译权限受限",
      detail: translationLimitedUntil
        ? `翻译权限限制有效至 ${translationLimitedUntil}。`
        : "翻译权限当前已停用。",
      severity: "info",
      action: "contact_admin",
    });
  }

  const normalizedScore = clampScore(score);
  const riskLevel: AccountSecurityRiskLevel =
    normalizedScore >= 80 ? "good" : normalizedScore >= 55 ? "watch" : "risk";

  return {
    score: normalizedScore,
    riskLevel,
    mfaEnabled,
    totpEnabled,
    passkeyEnabled,
    linkedProviderCount: countLinkedProviders(user),
    fingerprintCount,
    lastFingerprintAt: latestFingerprint?.ts ? Number(latestFingerprint.ts) : null,
    lastFingerprintIp,
    lastLoginAt: user.lastLoginAt || null,
    lastLoginIp,
    loginIpMatchesLastFingerprint,
    accountStatus,
    translationEnabled: user.isTranslationEnabled !== false,
    translationLimitedUntil,
    requireFingerprint: Boolean(user.requireFingerprint),
    recommendations,
  };
}
