import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import { runtimeMutableConfig } from "../config/config";
import logger from "../utils/logger";

/**
 * Play Integrity 设备证明（`sml_` 令牌风控 P2 层）。
 *
 * 背景：`deviceId` 一直是客户端自报（`SynapseDeviceId.kt` 里一个随机 UUID），
 * 可以连同 `sml_` 令牌一起被复制。有了本层之后，轮换请求必须附带一份由
 * Google Play 签发的证明，服务端据此确认"请求来自未被改包的真机上、由 Play 分发的
 * 那个 App"，而不是某个拿着令牌的脚本。
 *
 * 三条设计约束（与 docs/mobile-token-risk-control.md 一致）：
 * 1. 默认 `mode = "off"`，不配置就完全等价于 P1，不会改变任何既有行为；
 * 2. 校验失败**不拒绝登录**，只降级（缩短单代有效期 + 让客户端提前轮换）；
 * 3. 校验链路自身故障时由 `failOpen` 决定放行与否，默认放行。
 *
 * 能力边界（不要在文档或界面里夸大）：Play Integrity 不提供"设备唯一标识"，
 * 因此它证明的是**应用与设备环境的可信度**，不是"这台机器就是当初那台"。
 * 挡住的是改包客户端与脚本化重放；挡不住"在另一台干净设备上跑正版 App 并输入被复制的令牌"。
 */

const GOOGLE_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const GOOGLE_JWT_BEARER_GRANT = "urn:ietf:params:oauth:grant-type:jwt-bearer";
const PLAY_INTEGRITY_SCOPE = "https://www.googleapis.com/auth/playintegrity";
/** access token 提前量：还剩不到这么久就重新换一次。 */
const ACCESS_TOKEN_REFRESH_SLACK_MS = 5 * 60 * 1000;

/** 同时保留的未消费 nonce 上限，防止内存被刷爆。 */
const MAX_PENDING_NONCES = 20_000;

export type IntegrityMode = "off" | "observe" | "enforce";

export type DeviceIntegrityLevel = "STRONG" | "DEVICE" | "BASIC" | "NONE";

export interface IntegrityVerdict {
  /** 校验链路是否真的跑完并拿到 Google 的判定结果。false = 无法判定（走 failOpen / 降级）。 */
  evaluated: boolean;
  /** 仅在 evaluated 为 true 时有意义：是否满足策略要求的全部条件。 */
  trusted: boolean;
  level: DeviceIntegrityLevel;
  /** 判定失败的原因机器码，用于日志聚合与后台面板，不直接展示给用户。 */
  reasons: string[];
}

/** 判定策略：从运行时配置抽取出来的纯输入，便于单测直接构造。 */
export interface IntegrityPolicy {
  packageName: string;
  minDeviceIntegrity: "MEETS_BASIC_INTEGRITY" | "MEETS_DEVICE_INTEGRITY" | "MEETS_STRONG_INTEGRITY";
  requirePlayRecognizedApp: boolean;
  requireLicensedAccount: boolean;
  maxTokenAgeSeconds: number;
}

interface PendingNonce {
  userId: string;
  deviceId?: string;
  createdAt: number;
  expiresAt: number;
}

interface AccessTokenCache {
  token: string;
  expiresAt: number;
}

/** nonceHash → 待消费记录。与 mobileLoginService 的扫码挑战同为进程内状态。 */
const pendingNonces = new Map<string, PendingNonce>();
let accessTokenCache: AccessTokenCache | null = null;

function hashNonce(nonce: string): string {
  return crypto.createHash("sha256").update(nonce).digest("hex");
}

function serviceAccountPrivateKey(): string {
  return runtimeMutableConfig.mobileTokenIntegrity.serviceAccountPrivateKey.trim();
}

function isIntegrityConfigured(): boolean {
  const cfg = runtimeMutableConfig.mobileTokenIntegrity;
  return Boolean(cfg.packageName.trim() && cfg.serviceAccountEmail.trim() && serviceAccountPrivateKey());
}

export function getIntegrityMode(): IntegrityMode {
  return runtimeMutableConfig.mobileTokenIntegrity.mode;
}

/** 本层当前是否可能影响判定结果；供控制器与后台面板展示。 */
export function isIntegrityActive(): boolean {
  return getIntegrityMode() !== "off" && isIntegrityConfigured();
}

export function getIntegrityPolicy(): IntegrityPolicy {
  const cfg = runtimeMutableConfig.mobileTokenIntegrity;
  return {
    packageName: cfg.packageName.trim(),
    minDeviceIntegrity: cfg.minDeviceIntegrity,
    requirePlayRecognizedApp: cfg.requirePlayRecognizedApp,
    requireLicensedAccount: cfg.requireLicensedAccount,
    maxTokenAgeSeconds: cfg.maxTokenAgeSeconds,
  };
}

function cleanupNonces(now: number): void {
  for (const [key, record] of pendingNonces.entries()) {
    if (record.expiresAt <= now) pendingNonces.delete(key);
  }
  if (pendingNonces.size <= MAX_PENDING_NONCES) return;

  const ordered = [...pendingNonces.entries()].sort((a, b) => a[1].createdAt - b[1].createdAt);
  for (const [key] of ordered.slice(0, pendingNonces.size - MAX_PENDING_NONCES)) {
    pendingNonces.delete(key);
  }
}

/**
 * 签发一次性 nonce：客户端把它交给 Play Integrity SDK 换 integrity token，
 * 服务端在轮换时按 nonce 反查这次证明是"谁、为哪台设备"申请的。
 */
export function issueIntegrityNonce(params: { userId: string; deviceId?: string }) {
  const now = Date.now();
  cleanupNonces(now);

  const nonce = crypto.randomBytes(32).toString("base64url");
  const cfg = runtimeMutableConfig.mobileTokenIntegrity;
  const ttlMs = cfg.nonceTtlSeconds * 1000;
  pendingNonces.set(hashNonce(nonce), {
    userId: params.userId,
    deviceId: params.deviceId,
    createdAt: now,
    expiresAt: now + ttlMs,
  });

  return {
    nonce,
    expiresAt: new Date(now + ttlMs).toISOString(),
    /** 客户端要拿到的完整性等级，便于其判断本机是否值得申请。 */
    minDeviceIntegrity: cfg.minDeviceIntegrity,
    /** Play Integrity 的 cloudProjectNumber；未配置时由客户端回落到其内置值。 */
    cloudProjectNumber: cfg.cloudProjectNumber,
  };
}

/** nonce 一旦被用于一次校验就作废，无论校验成功与否，避免重放。 */
function consumeNonce(nonce: string, params: { userId: string; deviceId?: string }): PendingNonce | null {
  const key = hashNonce(nonce);
  const record = pendingNonces.get(key);
  if (!record) return null;
  pendingNonces.delete(key);

  if (record.expiresAt <= Date.now()) return null;
  if (record.userId !== params.userId) return null;
  // 令牌本身已经绑定了 deviceId；nonce 也绑一遍，防止拿 A 设备的证明给 B 设备用。
  if (record.deviceId && params.deviceId && record.deviceId !== params.deviceId) return null;
  return record;
}

/**
 * 用服务账号换 Google access token（JWT bearer 流程）。
 * 失败返回 null，由调用方按 failOpen 决定放行还是降级。
 */
async function getAccessToken(): Promise<string | null> {
  const cfg = runtimeMutableConfig.mobileTokenIntegrity;
  const now = Date.now();
  if (accessTokenCache && accessTokenCache.expiresAt - ACCESS_TOKEN_REFRESH_SLACK_MS > now) {
    return accessTokenCache.token;
  }

  const issuedAtSeconds = Math.floor(now / 1000);
  let assertion: string;
  try {
    assertion = jwt.sign(
      {
        iss: cfg.serviceAccountEmail.trim(),
        scope: PLAY_INTEGRITY_SCOPE,
        aud: GOOGLE_TOKEN_ENDPOINT,
        iat: issuedAtSeconds,
        exp: issuedAtSeconds + 3600,
      },
      serviceAccountPrivateKey(),
      { algorithm: "RS256" },
    );
  } catch (error) {
    logger.error("[MobileIntegrity] 服务账号私钥无法用于签名，请检查 PEM 是否完整", {
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), cfg.timeoutMs);
  try {
    const response = await fetch(GOOGLE_TOKEN_ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: GOOGLE_JWT_BEARER_GRANT, assertion }).toString(),
      signal: controller.signal,
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      logger.error("[MobileIntegrity] 换取 Google access token 失败", {
        status: response.status,
        detail: detail.slice(0, 300),
      });
      return null;
    }
    const payload = (await response.json()) as { access_token?: string; expires_in?: number };
    if (!payload.access_token) return null;
    const ttlSeconds = Number(payload.expires_in) > 0 ? Number(payload.expires_in) : 3600;
    accessTokenCache = { token: payload.access_token, expiresAt: now + ttlSeconds * 1000 };
    return accessTokenCache.token;
  } catch (error) {
    logger.warn("[MobileIntegrity] 换取 Google access token 异常", {
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export interface DecodedIntegrityPayload {
  requestDetails?: {
    requestPackageName?: string;
    /** 标准请求（setRequestHash）的回显。 */
    requestHash?: string;
    /** 经典请求（setNonce）的回显。安卓端目前用经典请求，所以两种都要认。 */
    nonce?: string;
    timestampMillis?: string;
  };
  appIntegrity?: {
    appRecognitionVerdict?: string;
    packageName?: string;
    certificateSha256Digest?: string[];
    versionCode?: string;
  };
  deviceIntegrity?: {
    deviceRecognitionVerdict?: string[];
  };
  accountDetails?: {
    appLicensingVerdict?: string;
  };
}

async function decodeIntegrityToken(integrityToken: string): Promise<DecodedIntegrityPayload | null> {
  const cfg = runtimeMutableConfig.mobileTokenIntegrity;
  const accessToken = await getAccessToken();
  if (!accessToken) return null;

  const endpoint = `https://playintegrity.googleapis.com/v1/${encodeURIComponent(cfg.packageName.trim())}:decodeIntegrityToken`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), cfg.timeoutMs);
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ integrityToken }),
      signal: controller.signal,
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      logger.warn("[MobileIntegrity] decodeIntegrityToken 失败", {
        status: response.status,
        detail: detail.slice(0, 300),
      });
      // 401/403 说明凭据或权限不对，缓存里的 token 没意义了，下次重新换。
      if (response.status === 401 || response.status === 403) accessTokenCache = null;
      return null;
    }
    const payload = (await response.json()) as { tokenPayloadExternal?: DecodedIntegrityPayload };
    return payload.tokenPayloadExternal ?? null;
  } catch (error) {
    logger.warn("[MobileIntegrity] decodeIntegrityToken 异常", {
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  } finally {
    clearTimeout(timer);
  }
}

const LEVEL_BY_VERDICT: Record<string, DeviceIntegrityLevel> = {
  MEETS_STRONG_INTEGRITY: "STRONG",
  MEETS_DEVICE_INTEGRITY: "DEVICE",
  MEETS_BASIC_INTEGRITY: "BASIC",
};

const LEVEL_RANK: Record<DeviceIntegrityLevel, number> = {
  NONE: 0,
  BASIC: 1,
  DEVICE: 2,
  STRONG: 3,
};

function deviceLevelOf(setting: IntegrityPolicy["minDeviceIntegrity"]): DeviceIntegrityLevel {
  return LEVEL_BY_VERDICT[setting] ?? "DEVICE";
}

function highestDeviceLevel(verdicts: string[] | undefined): DeviceIntegrityLevel {
  let highest: DeviceIntegrityLevel = "NONE";
  for (const verdict of verdicts ?? []) {
    const level = LEVEL_BY_VERDICT[verdict];
    if (level && LEVEL_RANK[level] > LEVEL_RANK[highest]) highest = level;
  }
  return highest;
}

/**
 * 纯函数：把 Google 的判定载荷与策略比对。
 * 不读运行时配置、不发网络请求，单测直接喂样本即可覆盖全部分支。
 */
export function evaluateIntegrityPayload(
  payload: DecodedIntegrityPayload,
  policy: IntegrityPolicy,
  options: { expectedNonce: string; now?: number },
): IntegrityVerdict {
  const now = options.now ?? Date.now();
  const reasons: string[] = [];

  const requestDetails = payload.requestDetails ?? {};
  // 标准请求回显 requestHash、经典请求回显 nonce；客户端用哪种就认哪种，缺省视为没回显。
  const echoedNonce = [requestDetails.requestHash, requestDetails.nonce].find(
    (value) => typeof value === "string" && value.length > 0,
  );
  if (echoedNonce !== options.expectedNonce) {
    reasons.push("NONCE_MISMATCH");
  }
  const tokenTimestamp = Number(requestDetails.timestampMillis);
  if (!Number.isFinite(tokenTimestamp)) {
    reasons.push("TIMESTAMP_MISSING");
  } else if (now - tokenTimestamp > policy.maxTokenAgeSeconds * 1000) {
    reasons.push("TOKEN_STALE");
  }

  const appIntegrity = payload.appIntegrity ?? {};
  if (policy.requirePlayRecognizedApp && appIntegrity.appRecognitionVerdict !== "PLAY_RECOGNIZED") {
    reasons.push("APP_NOT_PLAY_RECOGNIZED");
  }
  if (appIntegrity.packageName && appIntegrity.packageName !== policy.packageName) {
    reasons.push("PACKAGE_MISMATCH");
  }

  const level = highestDeviceLevel(payload.deviceIntegrity?.deviceRecognitionVerdict);
  if (LEVEL_RANK[level] < LEVEL_RANK[deviceLevelOf(policy.minDeviceIntegrity)]) {
    reasons.push("DEVICE_INTEGRITY_TOO_LOW");
  }

  if (policy.requireLicensedAccount && payload.accountDetails?.appLicensingVerdict !== "LICENSED") {
    reasons.push("ACCOUNT_NOT_LICENSED");
  }

  return { evaluated: true, trusted: reasons.length === 0, level, reasons };
}

/**
 * 校验一次轮换/签发请求携带的设备证明。
 *
 * 客户端要同时带回 nonce 与 integrityToken：nonce 是我们自己签发的（按 hash 存表，
 * 伪造的 nonce 查不到），integrityToken 里回显的 `requestHash`（标准请求）或 `nonce`
 * （经典请求）必须等于它 —— 这一步同时完成了"证明是我要的"与"证明没过期/没被重放"。
 */
export async function verifyClientIntegrity(params: {
  integrityToken?: string;
  nonce?: string;
  userId: string;
  deviceId?: string;
}): Promise<IntegrityVerdict> {
  const notEvaluated = (reason: string): IntegrityVerdict => ({
    evaluated: false,
    trusted: false,
    level: "NONE",
    reasons: [reason],
  });

  if (getIntegrityMode() === "off") return notEvaluated("MODE_OFF");

  if (!isIntegrityConfigured()) {
    logger.warn("[MobileIntegrity] 已开启校验但缺少服务账号配置，本层不参与判定", {
      mode: getIntegrityMode(),
    });
    return notEvaluated("NOT_CONFIGURED");
  }

  const integrityToken = typeof params.integrityToken === "string" ? params.integrityToken.trim() : "";
  const nonce = typeof params.nonce === "string" ? params.nonce.trim() : "";
  if (!integrityToken || !nonce) return notEvaluated("TOKEN_MISSING");

  // 先消费 nonce：无论后面的解码成功与否，这次 nonce 都不能再用第二次。
  const record = consumeNonce(nonce, { userId: params.userId, deviceId: params.deviceId });
  if (!record) return notEvaluated("NONCE_UNKNOWN");

  const payload = await decodeIntegrityToken(integrityToken);
  if (!payload) return notEvaluated("DECODE_FAILED");

  return evaluateIntegrityPayload(payload, getIntegrityPolicy(), { expectedNonce: nonce });
}

/**
 * 把一次校验结果折算成"是否要降级"。
 *
 * - `observe` 模式下永远返回 false（只看日志，不改行为）；
 * - 判定为不可信 ⇒ 降级；
 * - 无法判定（链路故障/未带证明）⇒ 看 `failOpen`：放行就不降级。
 */
export function shouldDowngradeForVerdict(verdict: IntegrityVerdict): boolean {
  const mode = getIntegrityMode();
  if (mode !== "enforce") return false;
  if (verdict.evaluated) return !verdict.trusted;
  return !runtimeMutableConfig.mobileTokenIntegrity.failOpen;
}

/** 降级后单代有效期（毫秒）；未降级时返回 null，调用方沿用 90 天。 */
export function downgradedTtlMs(): number {
  return runtimeMutableConfig.mobileTokenIntegrity.downgradedTtlHours * 60 * 60 * 1000;
}

/**
 * 判定日志。`off` 不写（一圈"没开"没有任何信息量），判定通过也不写；
 * 其余一律留痕 —— `observe` 模式下这正是唯一产物，`enforce` 下用于追降级原因。
 */
export function logIntegrityVerdict(params: {
  verdict: IntegrityVerdict;
  userId: string;
  deviceId?: string;
  ip?: string;
  downgraded: boolean;
}): void {
  const { verdict } = params;
  if (getIntegrityMode() === "off") return;
  if (verdict.evaluated && verdict.trusted) return;

  logger.info("[MobileIntegrity] 设备证明判定", {
    userId: params.userId,
    deviceId: params.deviceId,
    ip: params.ip,
    mode: getIntegrityMode(),
    evaluated: verdict.evaluated,
    trusted: verdict.trusted,
    level: verdict.level,
    reasons: verdict.reasons,
    downgraded: params.downgraded,
  });
}

export function resetIntegrityStateForTests(): void {
  pendingNonces.clear();
  accessTokenCache = null;
}
