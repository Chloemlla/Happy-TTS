import logger from "../utils/logger";

/**
 * 血缘代次数上限告警（P5-②）。
 *
 * 轮换默认每天推进一代，正常一条血缘一年也就三百多代；上限的意义是给"链被异常刷长"
 * （拿着有效令牌循环轮换、想用代次淹没取证）留一条显式告警。它是**观测**，不是闸门：
 * 与 P2 的降级、P3 的提级同一个原则 —— 告警不改变任何令牌的可用性，真正的节流仍然只由
 * `ROTATION_DAILY_LIMIT`（8 次 / 24h / 血缘）与 `ROTATION_MIN_INTERVAL_MS` 负责。
 */
export const LINEAGE_MAX_GENERATIONS = 400;

/** 该代是本链第几代（`rotationIndex` 从 0 起）。 */
export function generationCountOf(rotationIndex?: number | null): number {
  return (rotationIndex ?? 0) + 1;
}

/** 该代的代次数是否已达上限。 */
export function isLineageOverGenerationCap(rotationIndex?: number | null): boolean {
  return generationCountOf(rotationIndex) >= LINEAGE_MAX_GENERATIONS;
}

/** 轮换落地后调用；只有真的越线才写日志，正常轮换不产生噪声。 */
export function reportLineageOverGenerationCap(params: {
  userId: string;
  lineageId: string;
  rotationIndex: number;
  deviceId?: string | null;
  ip?: string | null;
}): void {
  logger.warn("[MobileToken] 令牌血缘代次数已达上限", {
    userId: params.userId,
    deviceId: params.deviceId ?? null,
    lineageId: params.lineageId,
    rotationIndex: params.rotationIndex,
    generationCount: generationCountOf(params.rotationIndex),
    cap: LINEAGE_MAX_GENERATIONS,
    ip: params.ip ?? "unknown",
  });
}
