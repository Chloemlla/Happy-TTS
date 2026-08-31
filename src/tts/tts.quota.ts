import crypto from "node:crypto";
import { mongoose } from "../services/mongoService";
import logger from "../utils/logger";
import type { User } from "../utils/userStorage";
import { UserStorage } from "../utils/userStorage";
import type { QuotaLedger, TtsQuotaReservation, TtsUsageSnapshot } from "./tts.ports";
import type { TtsUsageSummary } from "./tts.storage";

// 匿名 TTS 每日生成次数上限（按 fingerprintHash + IP 聚合）。
export const ANONYMOUS_DAILY_LIMIT = 20;
const ANONYMOUS_USER_PREFIX = "anon:";
// 过期预留清扫：超过 4 小时仍未消费/释放的预留视为悬挂，批量释放。
const RESERVATION_STALE_MS = 4 * 60 * 60 * 1000;

/** 匿名额度作用域键：对 ip::fingerprint 做单向哈希，避免明文落库。 */
export function buildAnonymousScopeKey(ip: string, fingerprint: string): string {
  return crypto.createHash("sha256").update(`${ip}::${fingerprint}`).digest("hex").slice(0, 24);
}

function anonUserId(scopeKey: string): string {
  return `${ANONYMOUS_USER_PREFIX}${scopeKey}`;
}

interface TtsQuotaReservationDocument extends TtsQuotaReservation {}

const TtsQuotaReservationSchema = new mongoose.Schema<TtsQuotaReservationDocument>(
  {
    taskId: { type: String, required: true, unique: true, index: true },
    userId: { type: String, required: true, index: true },
    usageDay: { type: String, required: true, index: true },
    reservedAt: { type: String, required: true },
    consumedAt: { type: String },
    releasedAt: { type: String },
  },
  { collection: "tts_quota_reservations" },
);

TtsQuotaReservationSchema.index({ userId: 1, usageDay: 1, consumedAt: 1, releasedAt: 1 });

const TtsQuotaReservationModel =
  mongoose.models.TtsQuotaReservation ||
  mongoose.model<TtsQuotaReservationDocument>("TtsQuotaReservation", TtsQuotaReservationSchema);

function getUsageDay(date = new Date()): string {
  return date.toISOString().split("T")[0];
}

export function buildUsageSummaryFromSnapshot(user: User | null, snapshot: TtsUsageSnapshot | null): TtsUsageSummary {
  if (!user) {
    return {
      authenticated: false,
      isAdmin: false,
      dailyLimit: null,
      usedToday: null,
      remainingToday: null,
      reservedToday: null,
    };
  }

  if (user.role === "admin" || user.role === "superadmin") {
    return {
      authenticated: true,
      isAdmin: true,
      dailyLimit: null,
      usedToday: null,
      remainingToday: null,
      reservedToday: null,
    };
  }

  const dailyLimit = UserStorage.getDailyLimit();
  const reservedToday = snapshot?.reservedToday ?? 0;
  const consumedToday = snapshot?.consumedToday ?? 0;
  const remainingToday = snapshot?.remainingToday ?? Math.max(0, dailyLimit - reservedToday - consumedToday);

  return {
    authenticated: true,
    isAdmin: false,
    dailyLimit,
    usedToday: consumedToday,
    remainingToday,
    reservedToday,
  };
}

export class MongoQuotaLedger implements QuotaLedger {
  private async countActiveUsage(userId: string, usageDay: string): Promise<{ reservedToday: number; consumedToday: number }> {
    const [counts] = await TtsQuotaReservationModel.aggregate([
      {
        $match: {
          userId,
          usageDay,
          releasedAt: { $in: [null, undefined] },
        },
      },
      {
        $group: {
          _id: null,
          reservedToday: {
            $sum: {
              $cond: [{ $eq: ["$consumedAt", null] }, 1, 0],
            },
          },
          consumedToday: {
            $sum: {
              $cond: [{ $ne: ["$consumedAt", null] }, 1, 0],
            },
          },
        },
      },
    ]).exec();

    return {
      reservedToday: counts?.reservedToday || 0,
      consumedToday: counts?.consumedToday || 0,
    };
  }

  private async buildSnapshotForUser(userId: string, user: User | null): Promise<TtsUsageSnapshot> {
    if (!user) {
      return { user: null, remainingToday: 0, reservedToday: 0, consumedToday: 0 };
    }

    if (user.role === "admin" || user.role === "superadmin") {
      return { user, remainingToday: null, reservedToday: null, consumedToday: null };
    }

    const usageDay = getUsageDay();
    const { reservedToday, consumedToday } = await this.countActiveUsage(userId, usageDay);
    const dailyLimit = UserStorage.getDailyLimit();
    const remainingToday = Math.max(0, dailyLimit - reservedToday - consumedToday);

    return {
      user,
      remainingToday,
      reservedToday,
      consumedToday,
    };
  }

  public async getUsageSnapshot(userId: string): Promise<TtsUsageSnapshot> {
    return this.buildSnapshotForUser(userId, await UserStorage.getUserById(userId));
  }

  public async reserve(userId: string, taskId: string): Promise<{ success: boolean; snapshot: TtsUsageSnapshot }> {
    const user = await UserStorage.getUserById(userId);
    if (!user) {
      return { success: false, snapshot: await this.buildSnapshotForUser(userId, null) };
    }

    if (user.role === "admin" || user.role === "superadmin") {
      return { success: true, snapshot: await this.buildSnapshotForUser(userId, user) };
    }

    const usageDay = getUsageDay();
    const session = await mongoose.startSession();
    try {
      let reserved = false;
      await session.withTransaction(async () => {
        const alreadyReserved = await TtsQuotaReservationModel.findOne({ taskId }).session(session).lean().exec();
        if (alreadyReserved) {
          reserved = true;
          return;
        }

        const [counts] = await TtsQuotaReservationModel.aggregate([
          {
            $match: {
              userId,
              usageDay,
              releasedAt: { $in: [null, undefined] },
            },
          },
          {
            $group: {
              _id: null,
              activeCount: { $sum: 1 },
            },
          },
        ]).session(session);

        const dailyLimit = UserStorage.getDailyLimit();
        if ((counts?.activeCount || 0) >= dailyLimit) {
          return;
        }

        await TtsQuotaReservationModel.create(
          [
            {
              taskId,
              userId,
              usageDay,
              reservedAt: new Date().toISOString(),
            },
          ],
          { session },
        );
        reserved = true;
      });

      return {
        success: reserved,
        snapshot: await this.buildSnapshotForUser(userId, user),
      };
    } finally {
      await session.endSession();
    }
  }

  public async confirm(userId: string, taskId: string): Promise<TtsUsageSnapshot> {
    const user = await UserStorage.getUserById(userId);
    if (!user || user.role === "admin" || user.role === "superadmin") {
      return this.buildSnapshotForUser(userId, user);
    }

    await TtsQuotaReservationModel.findOneAndUpdate(
      { taskId, userId, consumedAt: { $in: [null, undefined] }, releasedAt: { $in: [null, undefined] } },
      { $set: { consumedAt: new Date().toISOString() } },
      { returnDocument: "after" },
    ).exec();

    return this.buildSnapshotForUser(userId, user);
  }

  public async release(userId: string, taskId: string): Promise<TtsUsageSnapshot> {
    const user = await UserStorage.getUserById(userId);
    if (!user || user.role === "admin" || user.role === "superadmin") {
      return this.buildSnapshotForUser(userId, user);
    }

    await TtsQuotaReservationModel.findOneAndUpdate(
      { taskId, userId, consumedAt: { $in: [null, undefined] }, releasedAt: { $in: [null, undefined] } },
      { $set: { releasedAt: new Date().toISOString() } },
      { returnDocument: "after" },
    ).exec();

    return this.buildSnapshotForUser(userId, user);
  }

  // =============== 匿名维度额度（G6-12） ===============

  public async reserveAnonymous(
    scopeKey: string,
    taskId: string,
  ): Promise<{ success: boolean; remainingToday: number }> {
    const userId = anonUserId(scopeKey);
    const usageDay = getUsageDay();
    const activeCount = await TtsQuotaReservationModel.countDocuments({
      userId,
      usageDay,
      releasedAt: { $in: [null, undefined] },
    }).exec();

    if (activeCount >= ANONYMOUS_DAILY_LIMIT) {
      return { success: false, remainingToday: 0 };
    }

    try {
      await TtsQuotaReservationModel.create([
        { taskId, userId, usageDay, reservedAt: new Date().toISOString() },
      ]);
    } catch (error) {
      // 同一 taskId 并发重复预留：视为已成功（幂等）。
      if ((error as { code?: number }).code === 11000) {
        return { success: true, remainingToday: Math.max(0, ANONYMOUS_DAILY_LIMIT - activeCount - 1) };
      }
      throw error;
    }

    return { success: true, remainingToday: Math.max(0, ANONYMOUS_DAILY_LIMIT - activeCount - 1) };
  }

  public async confirmAnonymous(scopeKey: string, taskId: string): Promise<void> {
    await TtsQuotaReservationModel.findOneAndUpdate(
      {
        taskId,
        userId: anonUserId(scopeKey),
        consumedAt: { $in: [null, undefined] },
        releasedAt: { $in: [null, undefined] },
      },
      { $set: { consumedAt: new Date().toISOString() } },
    ).exec();
  }

  public async releaseAnonymous(scopeKey: string, taskId: string): Promise<void> {
    await TtsQuotaReservationModel.findOneAndUpdate(
      {
        taskId,
        userId: anonUserId(scopeKey),
        consumedAt: { $in: [null, undefined] },
        releasedAt: { $in: [null, undefined] },
      },
      { $set: { releasedAt: new Date().toISOString() } },
    ).exec();
  }
}

export const quotaLedger = new MongoQuotaLedger();

// =============== 过期预留回收（G6-14） ===============

export async function sweepExpiredReservations(limit = 500): Promise<number> {
  const staleBefore = new Date(Date.now() - RESERVATION_STALE_MS).toISOString();
  const stale = await TtsQuotaReservationModel.find({
    consumedAt: { $in: [null, undefined] },
    releasedAt: { $in: [null, undefined] },
    reservedAt: { $lte: staleBefore },
  })
    .limit(Math.min(Math.max(limit, 1), 1000))
    .select("taskId")
    .lean()
    .exec();

  if (stale.length === 0) return 0;

  const result = await TtsQuotaReservationModel.updateMany(
    { taskId: { $in: stale.map((doc) => doc.taskId) } },
    { $set: { releasedAt: new Date().toISOString() } },
  ).exec();

  if (result.modifiedCount > 0) {
    logger.warn("[TTS Quota] 清理悬挂的过期额度预留", { count: result.modifiedCount });
  }
  return result.modifiedCount;
}

let reservationSweeperTimer: NodeJS.Timeout | null = null;

export function startExpiredReservationSweeper(): void {
  if (reservationSweeperTimer) return;
  const run = (): void => {
    sweepExpiredReservations().catch((error) => {
      logger.warn("[TTS Quota] 过期预留清扫失败", {
        error: error instanceof Error ? error.message : String(error),
      });
    });
  };
  run();
  reservationSweeperTimer = setInterval(run, 60 * 60 * 1000);
  reservationSweeperTimer.unref?.();
}

export function stopExpiredReservationSweeper(): void {
  if (!reservationSweeperTimer) return;
  clearInterval(reservationSweeperTimer);
  reservationSweeperTimer = null;
}
