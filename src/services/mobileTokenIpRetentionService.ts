import { MobileClientTokenModel } from "../models/mobileClientTokenModel";
import { isConnected } from "./mongoService";
import { registerBackgroundTaskStopper } from "../utils/backgroundTaskRegistry";
import logger from "../utils/logger";

/**
 * 被顶替代次的来源 IP 保留期（P5-③）。
 *
 * `lastUsedIp` / `rotatedIp` 只在"这一代还被使用/刚被顶替"的那几天有运维价值：
 * 排查异常登录、对齐属地。一旦这一代被顶替超过保留期，它上面留着的 IP 就只剩隐私成本
 * ——令牌本体是一串 90 天后自然过期的哈希，没理由让它带着一串历史出口 IP 一起过完余生。
 *
 * 两个刻意的边界：
 * - **不动 `reusedIp`**：那是 `MOBILE_TOKEN_REUSED` 事件的取证记录（P4 看板的取数依据），
 *   属于安全事件而不是日常痕迹。清理它等于把已发生的断链事故抹掉。
 * - **不动 `rotatedFingerprint` / `deviceFingerprint`**：那是设备指纹而非用户出口地址，
 *   且 P3 的新设备判定要靠它跨代继承。
 *
 * 保留期可用 `MOBILE_TOKEN_IP_RETENTION_DAYS` 覆盖（0 表示下次扫描即清）。
 */
export const SUPERSEDED_IP_RETENTION_DAYS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;
/** 每 6 小时扫一次；清理是幂等的，扫描本身也被 supersededAt 索引覆盖。 */
const SWEEP_INTERVAL_MS = 6 * 60 * 60 * 1000;

export function supersededIpRetentionDays(): number {
  const raw = process.env.MOBILE_TOKEN_IP_RETENTION_DAYS;
  if (raw === undefined || raw.trim() === "") return SUPERSEDED_IP_RETENTION_DAYS;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 0) return SUPERSEDED_IP_RETENTION_DAYS;
  return parsed;
}

/** 早于这个时间戳被顶替的代次，其来源 IP 视为可清。 */
export function ipRetentionCutoff(now: number, days: number = supersededIpRetentionDays()): number {
  return now - days * DAY_MS;
}

/** 只挑"确实还挂着待清 IP"的文档，避免每轮都把全部历史代次写一遍。 */
export function supersededIpCleanupFilter(
  cutoff: number,
): Parameters<typeof MobileClientTokenModel.updateMany>[0] {
  return {
    supersededAt: { $lt: cutoff },
    $or: [{ lastUsedIp: { $exists: true } }, { rotatedIp: { $exists: true } }],
  };
}

/** 返回本次清掉 IP 的代次数量；Mongo 未就绪时直接跳过，不发查询。 */
export async function sweepSupersededTokenIps(now: number = Date.now()): Promise<number> {
  if (!isConnected()) return 0;
  const cutoff = ipRetentionCutoff(now);
  const result = await MobileClientTokenModel.updateMany(supersededIpCleanupFilter(cutoff), {
    $unset: { lastUsedIp: "", rotatedIp: "" },
  });
  return result?.modifiedCount ?? 0;
}

let sweepTimer: NodeJS.Timeout | null = null;

export function startMobileTokenIpRetention(): void {
  if (sweepTimer) return;

  const run = () => {
    sweepSupersededTokenIps()
      .then((count) => {
        if (count > 0) {
          logger.info("[MobileToken] 已清理被顶替代次的来源 IP", {
            count,
            retentionDays: supersededIpRetentionDays(),
          });
        }
      })
      .catch((error: unknown) => {
        logger.error("[MobileToken] 被顶替代次的来源 IP 清理失败", {
          error: error instanceof Error ? error.message : String(error),
        });
      });
  };

  run();
  sweepTimer = setInterval(run, SWEEP_INTERVAL_MS);
  sweepTimer.unref?.();
  registerBackgroundTaskStopper(stopMobileTokenIpRetention);
}

export function stopMobileTokenIpRetention(): void {
  if (!sweepTimer) return;
  clearInterval(sweepTimer);
  sweepTimer = null;
}
