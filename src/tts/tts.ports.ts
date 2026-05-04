import type { User } from "../utils/userStorage";
import type { TtsJobRecord, TtsJobResult, TtsNextAction, TtsUsageSummary } from "./tts.storage";

export interface TtsQuotaReservation {
  taskId: string;
  userId: string;
  usageDay: string;
  reservedAt: string;
  consumedAt?: string;
  releasedAt?: string;
}

export interface TtsHistoryRecord {
  id?: string;
  scope: "user" | "anonymous";
  userId?: string;
  ip?: string;
  fingerprint?: string;
  text: string;
  voice: string;
  model: string;
  outputFormat: string;
  speed: number;
  contentHash: string;
  fileName: string;
  audioUrl: string;
  createdAt: string;
}

export interface TtsDuplicateHit {
  fileName: string;
  audioUrl: string;
  outputFormat: string;
  contentHash: string;
}

export interface TtsUsageSnapshot {
  user: User | null;
  remainingToday: number | null;
  reservedToday: number | null;
  consumedToday: number | null;
}

export interface QuotaLedger {
  getUsageSnapshot(userId: string): Promise<TtsUsageSnapshot>;
  reserve(userId: string, taskId: string): Promise<{ success: boolean; snapshot: TtsUsageSnapshot }>;
  confirm(userId: string, taskId: string): Promise<TtsUsageSnapshot>;
  release(userId: string, taskId: string): Promise<TtsUsageSnapshot>;
}

export interface TtsSettingsStore {
  getGenerationCode(): Promise<string | null>;
}

export interface TtsJobStore {
  createTaskId(): string;
  createJob(job: TtsJobRecord): Promise<TtsJobRecord>;
  getJob(taskId: string): Promise<TtsJobRecord | null>;
  updateJob(taskId: string, patch: Partial<TtsJobRecord>): Promise<TtsJobRecord | null>;
  completeJob(taskId: string, result: TtsJobResult, usage?: TtsUsageSummary, nextAction?: TtsNextAction): Promise<TtsJobRecord | null>;
  failJob(taskId: string, error: string, usage?: TtsUsageSummary, nextAction?: TtsNextAction): Promise<TtsJobRecord | null>;
  getQueuePosition(taskId: string): Promise<number>;
  claimNextQueuedJob(workerId: string, leaseMs: number): Promise<TtsJobRecord | null>;
  recoverStaleJobs(staleBefore: number): Promise<number>;
}

export interface GenerationHistoryStore {
  findDuplicateForUser(params: {
    userId: string;
    text: string;
    voice: string;
    model: string;
    contentHash: string;
  }): Promise<TtsDuplicateHit | null>;
  findDuplicateForAnonymous(params: {
    ip: string;
    fingerprint: string;
    text: string;
    contentHash: string;
  }): Promise<TtsDuplicateHit | null>;
  addRecord(record: TtsHistoryRecord): Promise<TtsHistoryRecord>;
  getRecentRecords(params: {
    userId?: string;
    ip?: string;
    fingerprint?: string;
    limit?: number;
  }): Promise<TtsHistoryRecord[]>;
}
