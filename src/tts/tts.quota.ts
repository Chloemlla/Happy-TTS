import { mongoose } from "../services/mongoService";
import { UserStorage } from "../utils/userStorage";
import type { QuotaLedger, TtsQuotaReservation, TtsUsageSnapshot } from "./tts.ports";

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

  private async buildSnapshot(userId: string): Promise<TtsUsageSnapshot> {
    const user = await UserStorage.getUserById(userId);
    if (!user) {
      return { user: null, remainingToday: 0, reservedToday: 0, consumedToday: 0 };
    }

    if (user.role === "admin") {
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
    return this.buildSnapshot(userId);
  }

  public async reserve(userId: string, taskId: string): Promise<{ success: boolean; snapshot: TtsUsageSnapshot }> {
    const snapshot = await this.buildSnapshot(userId);
    if (!snapshot.user) {
      return { success: false, snapshot };
    }

    if (snapshot.user.role === "admin") {
      return { success: true, snapshot };
    }

    const usageDay = getUsageDay();
    const existing = await TtsQuotaReservationModel.findOne({ taskId }).lean().exec();
    if (existing) {
      return { success: true, snapshot: await this.buildSnapshot(userId) };
    }

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
        snapshot: await this.buildSnapshot(userId),
      };
    } finally {
      await session.endSession();
    }
  }

  public async confirm(userId: string, taskId: string): Promise<TtsUsageSnapshot> {
    const snapshot = await this.buildSnapshot(userId);
    if (!snapshot.user || snapshot.user.role === "admin") {
      return snapshot;
    }

    await TtsQuotaReservationModel.findOneAndUpdate(
      { taskId, userId, consumedAt: { $in: [null, undefined] }, releasedAt: { $in: [null, undefined] } },
      { $set: { consumedAt: new Date().toISOString() } },
      { returnDocument: "after" },
    ).exec();

    return this.buildSnapshot(userId);
  }

  public async release(userId: string, taskId: string): Promise<TtsUsageSnapshot> {
    const snapshot = await this.buildSnapshot(userId);
    if (!snapshot.user || snapshot.user.role === "admin") {
      return snapshot;
    }

    await TtsQuotaReservationModel.findOneAndUpdate(
      { taskId, userId, consumedAt: { $in: [null, undefined] }, releasedAt: { $in: [null, undefined] } },
      { $set: { releasedAt: new Date().toISOString() } },
      { returnDocument: "after" },
    ).exec();

    return this.buildSnapshot(userId);
  }
}

export const quotaLedger = new MongoQuotaLedger();
