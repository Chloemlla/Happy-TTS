import { mongoose } from "../services/mongoService";
import type { User } from "../utils/userStorage";
import { UserStorage } from "../utils/userStorage";
import type { QuotaLedger, TtsQuotaReservation, TtsUsageSnapshot } from "./tts.ports";
import type { TtsUsageSummary } from "./tts.storage";

const DAILY_LIMIT = 5;

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
    const remainingToday = Math.max(0, DAILY_LIMIT - reservedToday - consumedToday);

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

        if ((counts?.activeCount || 0) >= DAILY_LIMIT) {
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
}

export const quotaLedger = new MongoQuotaLedger();
