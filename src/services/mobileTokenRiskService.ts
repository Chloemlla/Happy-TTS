import crypto from "node:crypto";
import { runtimeMutableConfig } from "../config/config";
import type { MobileTokenRotationRiskRuntimeConfig } from "../config/runtimeConfigDefaults";
import { isMeaningfulLocation } from "./ipTelemetryService";

/**
 * 客户端登录令牌的**风险分级轮换**（`sml_` 风控 P3 层）。
 *
 * P2 的设备证明只管一件事：证明没通过就降级（压有效期 + 压节奏）。P3 管的是
 * "这一代看起来不太对劲"，手段只有一种 —— **把下一次轮换提前**（24 小时 → 1 小时），
 * 既不缩短单代有效期，也不拒绝任何请求。
 *
 * 之所以要和 P2 分开：把 `MOBILE_TOKEN_INTEGRITY.mode` 放在 `observe` 时，
 * P2 只记日志不下发降级；P3 正好是把那些观察结果变成实际动作的地方 ——
 * 判定没过就下一小时再证明一次，而不是干等 24 小时。
 *
 * 三路信号：
 * 1. `GEO_JUMP`：这次轮换的 IP 属地与上一代签发时的属地不是同一个地方；
 * 2. `VERIFICATION_PENDING`：上一代是在设备证明未通过的情况下签发的；
 * 3. `NEW_DEVICE`：这台设备在该账号上还很新（首次出现的 `newDeviceTrustHours` 内）。
 */

export type RotationRiskSignal = "GEO_JUMP" | "VERIFICATION_PENDING" | "NEW_DEVICE";

/** 判定所需的事实，全部由调用方查好；本模块不发网络请求、不读数据库。 */
export interface RotationRiskFacts {
  /** 上一代签发时的 IP 属地（来自会话台账），取不到给 null。 */
  previousIpLocation?: string | null;
  /** 这次轮换的 IP 属地，取不到给 null。 */
  currentIpLocation?: string | null;
  /** 血缘上遗留的"待重新验证"标记。 */
  verificationPending?: boolean;
  /** 这次判定本身没通过设备证明（不论 mode 是否降级）。 */
  verdictUntrusted?: boolean;
  /** 设备首次出现在该账号上的时间戳；未知给 null。 */
  deviceFirstSeenAt?: number | null;
  now?: number;
}

export function getRotationRiskConfig(): MobileTokenRotationRiskRuntimeConfig {
  return runtimeMutableConfig.mobileTokenRotationRisk;
}

export function isRotationRiskEnabled(): boolean {
  return getRotationRiskConfig().enabled;
}

/** 命中风险后的轮换间隔（毫秒）。未启用时调用方应继续用默认的 24 小时。 */
export function elevatedRotationIntervalMs(
  config: MobileTokenRotationRiskRuntimeConfig = getRotationRiskConfig(),
): number {
  return config.elevatedIntervalMinutes * 60 * 1000;
}

/**
 * 设备的稳定标识：`deviceId` 单独不够 —— 拿到令牌的一方可以自报原 `deviceId`
 * 却换一台机器名（`deviceName`）重放，两者一起才构成"这台设备"。
 * 只做哈希，不存明文组合，避免多一个可被关联的标识。
 */
export function deviceFingerprintOf(deviceId?: string, deviceName?: string): string | undefined {
  const id = typeof deviceId === "string" ? deviceId.trim() : "";
  if (!id) return undefined;
  const name = typeof deviceName === "string" ? deviceName.trim() : "";
  return crypto.createHash("sha256").update(`${id}|${name}`).digest("hex").slice(0, 32);
}

/**
 * 纯函数：两份属地字符串是否算"突变"。
 *
 * 属地形如 `"中国, 北京, 北京 运营商: 中国联通"`（见 ipTelemetryService 的三个 provider），
 * 按逗号切段后第一段是国家、第二段是省/州。任一侧取不到有意义的值就不判 ——
 * 宁可漏报，也不要拿"未知"当"换了个国家"。
 */
export function isGeoJump(
  previous: string | null | undefined,
  current: string | null | undefined,
  scope: MobileTokenRotationRiskRuntimeConfig["geoJumpScope"] = "country",
): boolean {
  const before = segmentOf(previous);
  const after = segmentOf(current);
  if (!before.country || !after.country) return false;
  if (before.country !== after.country) return true;
  // 省份未知时不作为依据：同一个国家里 provider 少给一段不该算突变。
  if (scope !== "region") return false;
  if (!before.region || !after.region) return false;
  return before.region !== after.region;
}

function segmentOf(location: string | null | undefined): { country: string; region: string } {
  const raw = typeof location === "string" ? location.trim() : "";
  if (!raw || !isMeaningfulLocation(raw)) return { country: "", region: "" };
  const parts = raw.split(",").map((part) => part.trim());
  return { country: parts[0] || "", region: parts[1] || "" };
}

/**
 * 纯函数：把事实折算成命中的信号列表。
 * 配置在这里生效（关掉某路信号、整体没开都返回空数组），便于单测直接喂事实。
 */
export function collectRotationRiskSignals(
  facts: RotationRiskFacts,
  config: MobileTokenRotationRiskRuntimeConfig = getRotationRiskConfig(),
): RotationRiskSignal[] {
  if (!config.enabled) return [];

  const signals: RotationRiskSignal[] = [];

  if (config.geoJumpEnabled && isGeoJump(facts.previousIpLocation, facts.currentIpLocation, config.geoJumpScope)) {
    signals.push("GEO_JUMP");
  }

  // 当前这一代的判定结果与血缘上遗留的标记都算：前者是刚看到的，后者是还没解除的。
  if (config.carryOverVerificationPending && (facts.verdictUntrusted || facts.verificationPending)) {
    signals.push("VERIFICATION_PENDING");
  }

  const firstSeen = typeof facts.deviceFirstSeenAt === "number" ? facts.deviceFirstSeenAt : null;
  if (firstSeen !== null) {
    const now = facts.now ?? Date.now();
    if (now - firstSeen < config.newDeviceTrustHours * 60 * 60 * 1000) {
      signals.push("NEW_DEVICE");
    }
  }

  return signals;
}

/**
 * 轮换响应的节奏：命中信号就压到提级间隔，否则沿用默认节奏。
 * 返回的 `signals` 只进日志；对客户端只表达"这次是提级节奏"这一件事，
 * 不下发命中原因（避免把风控口径当成客户端可依赖的接口）。
 */
export function resolveRotationInterval(
  signals: RotationRiskSignal[],
  defaultIntervalMs: number,
  config: MobileTokenRotationRiskRuntimeConfig = getRotationRiskConfig(),
): number {
  if (signals.length === 0) return defaultIntervalMs;
  return elevatedRotationIntervalMs(config);
}
