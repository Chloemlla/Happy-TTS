import type { User } from "../utils/userStorage";
import type { TtsJobRecord, TtsJobResult, TtsNextAction, TtsUsageSummary } from "./tts.storage";

export type TtsHistoryReviewStatus = "none" | "needs_review" | "in_review" | "fixed" | "dismissed";

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
  provider: string;
  providerModel: string;
  providerVoice: string;
  createdAt: string;
  adminNote?: string;
  adminSuggestion?: string;
  reviewStatus?: TtsHistoryReviewStatus;
  reviewedBy?: string;
  reviewedAt?: string;
  fixedAt?: string;
  updatedAt?: string;
}

export interface TtsDuplicateHit {
  fileName: string;
  audioUrl: string;
  outputFormat: string;
  contentHash: string;
  provider?: string;
  providerModel?: string;
  providerVoice?: string;
}

export interface TtsUsageSnapshot {
  user: User | null;
  remainingToday: number | null;
  reservedToday: number | null;
  consumedToday: number | null;
}

export interface TtsProviderRequest {
  text: string;
  model: string;
  voice: string;
  outputFormat: string;
  speed: number;
  userId?: string;
  isAdmin?: boolean;
  taskId?: string;
  ip?: string;
  fingerprint?: string;
  policyVersion?: string;
}

export interface TtsProviderResponse {
  provider: string;
  providerModel: string;
  providerVoice: string;
  outputFormat: string;
  audioBuffer: Buffer;
}

export interface TtsProvider {
  readonly providerId: string;
  synthesize(request: TtsProviderRequest): Promise<TtsProviderResponse>;
}

export interface TtsAudioPostProcessInput {
  audioBuffer: Buffer;
  outputFormat: string;
  taskId?: string;
  contentHash: string;
}

export interface TtsAudioPostProcessResult {
  audioBuffer: Buffer;
  outputFormat: string;
  metadata?: Record<string, unknown>;
  source: "node-passthrough" | "rust-audio-worker";
}

export interface TtsAudioPostProcessor {
  process(input: TtsAudioPostProcessInput): Promise<TtsAudioPostProcessResult>;
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
  getAllRecords(params: {
    page?: number;
    limit?: number;
    userId?: string;
    scope?: "user" | "anonymous";
    reviewStatus?: TtsHistoryReviewStatus | "all";
    q?: string;
  }): Promise<{
    records: TtsHistoryRecord[];
    total: number;
    page: number;
    limit: number;
  }>;
  updateAdminReview(
    recordId: string,
    patch: {
      adminNote?: string;
      adminSuggestion?: string;
      reviewStatus?: TtsHistoryReviewStatus;
      reviewedBy?: string;
    },
  ): Promise<TtsHistoryRecord | null>;
}
