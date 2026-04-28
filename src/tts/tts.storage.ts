import fs from "node:fs";
import path from "node:path";
import { mongoose } from "../services/mongoService";
import logger from "../utils/logger";

export type TtsJobStatus = "queued" | "processing" | "completed" | "failed";

export interface TtsUsageSummary {
  authenticated: boolean;
  isAdmin: boolean;
  dailyLimit: number | null;
  usedToday: number | null;
  remainingToday: number | null;
}

export interface TtsNextAction {
  type: string;
  label: string;
  message: string;
}

export interface TtsJobResult {
  fileName: string;
  audioUrl: string;
  isDuplicate?: boolean;
  outputFormat?: string;
  message: string;
  status: "generated" | "reused";
}

export interface TtsJobRequestPayload {
  text: string;
  model: string;
  voice: string;
  outputFormat: string;
  speed: number;
}

export interface TtsJobRecord {
  taskId: string;
  status: TtsJobStatus;
  createdAt: string;
  updatedAt: string;
  request: TtsJobRequestPayload;
  userId?: string;
  isAdmin?: boolean;
  ip: string;
  fingerprint: string;
  message: string;
  error?: string;
  usage?: TtsUsageSummary;
  nextAction?: TtsNextAction;
  result?: TtsJobResult;
  attempts?: number;
  processingOwner?: string;
  leaseExpiresAt?: string;
}

const jobsDir = path.join(process.cwd(), "data", "tts-jobs");
const jobsFile = path.join(jobsDir, "jobs.json");
const MAX_PERSISTED_JOBS = 500;

const TtsJobSchema = new mongoose.Schema<TtsJobRecord>(
  {
    taskId: { type: String, required: true, unique: true, index: true },
    status: { type: String, required: true, index: true },
    createdAt: { type: String, required: true, index: true },
    updatedAt: { type: String, required: true },
    request: {
      text: { type: String, required: true },
      model: { type: String, required: true },
      voice: { type: String, required: true },
      outputFormat: { type: String, required: true },
      speed: { type: Number, required: true },
    },
    userId: { type: String, index: true },
    isAdmin: { type: Boolean },
    ip: { type: String, required: true },
    fingerprint: { type: String, required: true },
    message: { type: String, required: true },
    error: { type: String },
    usage: {
      authenticated: { type: Boolean },
      isAdmin: { type: Boolean },
      dailyLimit: { type: Number, default: null },
      usedToday: { type: Number, default: null },
      remainingToday: { type: Number, default: null },
    },
    nextAction: {
      type: { type: String },
      label: { type: String },
      message: { type: String },
    },
    result: {
      fileName: { type: String },
      audioUrl: { type: String },
      isDuplicate: { type: Boolean },
      outputFormat: { type: String },
      message: { type: String },
      status: { type: String },
    },
    attempts: { type: Number, default: 0 },
    processingOwner: { type: String, index: true },
    leaseExpiresAt: { type: String, index: true },
  },
  { collection: "tts_jobs" },
);

const TtsJobModel = mongoose.models.TtsJob || mongoose.model<TtsJobRecord>("TtsJob", TtsJobSchema);

interface TtsJobStore {
  createJob(job: TtsJobRecord): Promise<TtsJobRecord>;
  getJob(taskId: string): Promise<TtsJobRecord | null>;
  updateJob(taskId: string, patch: Partial<TtsJobRecord>): Promise<TtsJobRecord | null>;
  getQueuePosition(taskId: string): Promise<number>;
  claimNextQueuedJob(workerId: string, leaseMs: number): Promise<TtsJobRecord | null>;
  recoverStaleJobs(staleBefore: number): Promise<number>;
}

class FileTtsJobStore implements TtsJobStore {
  private jobs = new Map<string, TtsJobRecord>();
  private initialized = false;
  private persistChain: Promise<void> = Promise.resolve();

  private ensureInitialized() {
    if (this.initialized) {
      return;
    }

    try {
      if (fs.existsSync(jobsFile)) {
        const raw = fs.readFileSync(jobsFile, "utf8");
        const parsed = JSON.parse(raw) as TtsJobRecord[];
        for (const job of parsed) {
          this.jobs.set(job.taskId, job);
        }
      }
    } catch (error) {
      logger.warn("加载 TTS 文件作业存储失败，已从空状态继续", { error });
    }

    this.initialized = true;
  }

  private queuePersist() {
    this.persistChain = this.persistChain
      .then(async () => {
        await fs.promises.mkdir(jobsDir, { recursive: true });

        const records = Array.from(this.jobs.values())
          .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
          .slice(-MAX_PERSISTED_JOBS);

        await fs.promises.writeFile(jobsFile, JSON.stringify(records, null, 2), "utf8");
      })
      .catch((error) => {
        logger.error("持久化 TTS 文件作业存储失败", error);
      });

    return this.persistChain;
  }

  public async createJob(job: TtsJobRecord) {
    this.ensureInitialized();
    this.jobs.set(job.taskId, job);
    await this.queuePersist();
    return job;
  }

  public async getJob(taskId: string) {
    this.ensureInitialized();
    return this.jobs.get(taskId) ?? null;
  }

  public async updateJob(taskId: string, patch: Partial<TtsJobRecord>) {
    this.ensureInitialized();
    const current = this.jobs.get(taskId);
    if (!current) {
      return null;
    }

    const next: TtsJobRecord = {
      ...current,
      ...patch,
      updatedAt: new Date().toISOString(),
    };

    this.jobs.set(taskId, next);
    await this.queuePersist();
    return next;
  }

  public async getQueuePosition(taskId: string) {
    this.ensureInitialized();
    const queued = Array.from(this.jobs.values())
      .filter((job) => job.status === "queued")
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt));

    const index = queued.findIndex((job) => job.taskId === taskId);
    return index >= 0 ? index + 1 : 0;
  }

  public async claimNextQueuedJob(workerId: string, leaseMs: number) {
    this.ensureInitialized();
    const nextJob =
      Array.from(this.jobs.values())
        .filter((job) => job.status === "queued")
        .sort((left, right) => left.createdAt.localeCompare(right.createdAt))[0] ?? null;

    if (!nextJob) {
      return null;
    }

    const leaseExpiresAt = new Date(Date.now() + leaseMs).toISOString();
    const claimed = {
      ...nextJob,
      status: "processing" as const,
      message: "正在生成语音...",
      attempts: (nextJob.attempts ?? 0) + 1,
      processingOwner: workerId,
      leaseExpiresAt,
      updatedAt: new Date().toISOString(),
    };

    this.jobs.set(nextJob.taskId, claimed);
    await this.queuePersist();
    return claimed;
  }

  public async recoverStaleJobs(staleBefore: number) {
    this.ensureInitialized();
    let recovered = 0;

    for (const [taskId, job] of this.jobs.entries()) {
      if (job.status !== "processing" || !job.leaseExpiresAt) {
        continue;
      }

      if (Date.parse(job.leaseExpiresAt) > staleBefore) {
        continue;
      }

      this.jobs.set(taskId, {
        ...job,
        status: "queued",
        message: "检测到任务处理中断，已重新入队",
        processingOwner: undefined,
        leaseExpiresAt: undefined,
        updatedAt: new Date().toISOString(),
      });
      recovered += 1;
    }

    if (recovered > 0) {
      await this.queuePersist();
    }

    return recovered;
  }
}

class MongoTtsJobStore implements TtsJobStore {
  public async createJob(job: TtsJobRecord) {
    await TtsJobModel.create(job);
    return job;
  }

  public async getJob(taskId: string) {
    return (await TtsJobModel.findOne({ taskId }).lean().exec()) as TtsJobRecord | null;
  }

  public async updateJob(taskId: string, patch: Partial<TtsJobRecord>) {
    return (await TtsJobModel.findOneAndUpdate(
      { taskId },
      { $set: { ...patch, updatedAt: new Date().toISOString() } },
      { new: true },
    )
      .lean()
      .exec()) as TtsJobRecord | null;
  }

  public async getQueuePosition(taskId: string) {
    const job = await this.getJob(taskId);
    if (!job || job.status !== "queued") {
      return 0;
    }

    return await TtsJobModel.countDocuments({
      status: "queued",
      createdAt: { $lt: job.createdAt },
    }).exec().then((count) => count + 1);
  }

  public async claimNextQueuedJob(workerId: string, leaseMs: number) {
    return (await TtsJobModel.findOneAndUpdate(
      { status: "queued" },
      {
        $set: {
          status: "processing",
          message: "正在生成语音...",
          processingOwner: workerId,
          leaseExpiresAt: new Date(Date.now() + leaseMs).toISOString(),
          updatedAt: new Date().toISOString(),
        },
        $inc: { attempts: 1 },
      },
      { sort: { createdAt: 1 }, new: true },
    )
      .lean()
      .exec()) as TtsJobRecord | null;
  }

  public async recoverStaleJobs(staleBefore: number) {
    const result = await TtsJobModel.updateMany(
      {
        status: "processing",
        leaseExpiresAt: { $lte: new Date(staleBefore).toISOString() },
      },
      {
        $set: {
          status: "queued",
          message: "检测到任务处理中断，已重新入队",
          processingOwner: null,
          leaseExpiresAt: null,
          updatedAt: new Date().toISOString(),
        },
      },
    ).exec();

    return result.modifiedCount;
  }
}

class TtsStorageManager {
  private readonly fileStore = new FileTtsJobStore();
  private readonly mongoStore = new MongoTtsJobStore();

  public createTaskId() {
    return `tts_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  }

  private async withStore<T>(action: (store: TtsJobStore) => Promise<T>): Promise<T> {
    if (mongoose.connection.readyState === 1) {
      try {
        return await action(this.mongoStore);
      } catch (error) {
        logger.warn("TTS Mongo job store 操作失败，回退文件存储", { error });
      }
    }

    return action(this.fileStore);
  }

  public async createJob(job: TtsJobRecord) {
    return this.withStore((store) => store.createJob(job));
  }

  public async getJob(taskId: string) {
    return this.withStore((store) => store.getJob(taskId));
  }

  public async updateJob(taskId: string, patch: Partial<TtsJobRecord>) {
    return this.withStore((store) => store.updateJob(taskId, patch));
  }

  public async completeJob(taskId: string, result: TtsJobResult, usage?: TtsUsageSummary, nextAction?: TtsNextAction) {
    return this.updateJob(taskId, {
      status: "completed",
      message: result.message,
      result,
      usage,
      nextAction,
      error: undefined,
      processingOwner: undefined,
      leaseExpiresAt: undefined,
    });
  }

  public async failJob(taskId: string, error: string, nextAction?: TtsNextAction) {
    return this.updateJob(taskId, {
      status: "failed",
      message: error,
      error,
      nextAction,
      processingOwner: undefined,
      leaseExpiresAt: undefined,
    });
  }

  public async getQueuePosition(taskId: string) {
    return this.withStore((store) => store.getQueuePosition(taskId));
  }

  public async claimNextQueuedJob(workerId: string, leaseMs: number) {
    return this.withStore((store) => store.claimNextQueuedJob(workerId, leaseMs));
  }

  public async recoverStaleJobs(staleBefore: number) {
    return this.withStore((store) => store.recoverStaleJobs(staleBefore));
  }
}

export const ttsStorage = new TtsStorageManager();
