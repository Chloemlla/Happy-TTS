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
  private async buildSnapshot(userId: string): Promise<TtsUsageSnapshot> {
    const user = await UserStorage.getUserById(userId);
    if (!user) {
      return { user: null, remainingToday: 0, reservedToday: 0, consumedToday: 0 };
    }

    if (user.role === "admin") {
      return { user, remainingToday: null, reservedToday: null, consumedToday: null };
    }

    const usageDay = getUsageDay();
    const reservations = await TtsQuotaReservationModel.find({
      userId,
      usageDay,
      releasedAt: { $in: [null, undefined] },
    })
      .lean()
      .exec();

    const reservedToday = reservations.filter((item) => !item.consumedAt).length;
    const consumedToday = reservations.filter((item) => !!item.consumedAt).length;
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

    if ((snapshot.remainingToday || 0) <= 0) {
      return { success: false, snapshot };
    }

    const usageDay = getUsageDay();
    const existing = await TtsQuotaReservationModel.findOne({ taskId }).lean().exec();
    if (!existing) {
      await TtsQuotaReservationModel.create({
        taskId,
        userId,
        usageDay,
        reservedAt: new Date().toISOString(),
      });
    }

    return { success: true, snapshot: await this.buildSnapshot(userId) };
  }

  public async confirm(userId: string, taskId: string): Promise<TtsUsageSnapshot> {
    const snapshot = await this.buildSnapshot(userId);
    if (!snapshot.user || snapshot.user.role === "admin") {
      return snapshot;
    }

    await TtsQuotaReservationModel.findOneAndUpdate(
      { taskId, userId, consumedAt: { $in: [null, undefined] }, releasedAt: { $in: [null, undefined] } },
      { $set: { consumedAt: new Date().toISOString() } },
      { new: true },
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
      { new: true },
    ).exec();

    return this.buildSnapshot(userId);
  }
}

export const quotaLedger = new MongoQuotaLedger();
