import fs from "node:fs";
import path from "node:path";
import { config } from "../config/config";
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
}

const jobsDir = path.join(process.cwd(), "data", "tts-jobs");
const jobsFile = path.join(jobsDir, "jobs.json");

class TtsStorageManager {
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
      logger.warn("加载 TTS 作业存储失败，已回退到内存存储", { error });
    }

    this.initialized = true;
  }

  private queuePersist() {
    this.persistChain = this.persistChain
      .then(async () => {
        await fs.promises.mkdir(jobsDir, { recursive: true });

        const records = Array.from(this.jobs.values())
          .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
          .slice(-500);

        await fs.promises.writeFile(jobsFile, JSON.stringify(records, null, 2), "utf8");
      })
      .catch((error) => {
        logger.error("持久化 TTS 作业存储失败", error);
      });

    return this.persistChain;
  }

  public createTaskId() {
    return `tts_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  }

  public async createJob(job: TtsJobRecord) {
    this.ensureInitialized();
    this.jobs.set(job.taskId, job);
    await this.queuePersist();
    return job;
  }

  public getJob(taskId: string) {
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

  public async completeJob(taskId: string, result: TtsJobResult, usage?: TtsUsageSummary, nextAction?: TtsNextAction) {
    return this.updateJob(taskId, {
      status: "completed",
      message: result.message,
      result,
      usage,
      nextAction,
      error: undefined,
    });
  }

  public async failJob(taskId: string, error: string, nextAction?: TtsNextAction) {
    return this.updateJob(taskId, {
      status: "failed",
      message: error,
      error,
      nextAction,
    });
  }

  public getNextQueuedJob() {
    this.ensureInitialized();
    return Array.from(this.jobs.values())
      .filter((job) => job.status === "queued")
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt))[0] ?? null;
  }

  public getQueuePosition(taskId: string) {
    this.ensureInitialized();
    const queued = Array.from(this.jobs.values())
      .filter((job) => job.status === "queued")
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt));

    const index = queued.findIndex((job) => job.taskId === taskId);
    return index >= 0 ? index + 1 : 0;
  }
}

export const ttsStorage = new TtsStorageManager();
