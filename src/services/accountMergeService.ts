import crypto from "node:crypto";
import { AccountIdentityModel, type AccountIdentityProvider } from "../models/accountIdentityModel";
import {
  OAuthAuthorizationCodeModel,
  OAuthClientModel,
  OAuthGrantModel,
  OAuthTokenModel,
} from "../models/oauthModel";
import RecommendationHistoryModel from "../models/recommendationHistoryModel";
import UserPreferencesModel from "../models/userPreferencesModel";
import WorkspaceModel from "../models/workspaceModel";
import { mongoose } from "./mongoService";
import { AuditLogService, type AuditEntry } from "./auditLogService";
import logger from "../utils/logger";
import { type User, UserStorage } from "../utils/userStorage";

type MergeStrategy = "auto" | "smart" | "conservative";
type RiskSeverity = "low" | "medium" | "high";

export interface AccountMergeItem {
  key: string;
  label: string;
  count: number;
  strategy: MergeStrategy;
}

export interface AccountMergeRiskItem {
  key: string;
  label: string;
  severity: RiskSeverity;
  blocking: boolean;
  message: string;
}

export interface AccountMergeAccountSummary {
  id: string;
  username: string;
  email: string;
  role: string;
  accountStatus: string;
}

export interface AccountMergePreview {
  sourceAccount: AccountMergeAccountSummary;
  targetAccount: AccountMergeAccountSummary;
  provider: AccountIdentityProvider;
  providerUserId: string;
  mergeItems: AccountMergeItem[];
  riskItems: AccountMergeRiskItem[];
  canConfirm: boolean;
  requiresRiskAcknowledgement: boolean;
  createdAt: string;
  expiresAt?: number;
}

interface AccountMergeSession {
  token: string;
  sourceUserId: string;
  targetUserId: string;
  provider: AccountIdentityProvider;
  providerUserId: string;
  expiresAt: number;
  preview: AccountMergePreview;
}

export interface AccountMergeConfirmOptions {
  includeApiKeys?: boolean;
  includeOAuthClients?: boolean;
  acknowledgeRisks?: boolean;
}

export interface AccountMergeActor {
  userId: string;
  username: string;
  role: string;
  ip: string;
  userAgent?: string;
  path?: string;
  method?: string;
  requestId?: string;
}

const MERGE_SESSION_TTL_MS = 15 * 60 * 1000;
const mergeSessions = new Map<string, AccountMergeSession>();

const ROLE_RANK: Record<string, number> = {
  viewer: 1,
  editor: 2,
  admin: 3,
};

function cleanupExpiredMergeSessions(now = Date.now()): void {
  for (const [token, session] of mergeSessions.entries()) {
    if (session.expiresAt <= now) {
      mergeSessions.delete(token);
    }
  }
}

function toAccountSummary(user: User): AccountMergeAccountSummary {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    role: user.role,
    accountStatus: (user as any).accountStatus || "active",
  };
}

function collection(name: string) {
  return mongoose.connection.collection(name);
}

async function safeCount(name: string, filter: Record<string, unknown>): Promise<number> {
  try {
    return await collection(name).countDocuments(filter);
  } catch (error) {
    logger.warn("[AccountMerge] 统计集合失败", { name, error });
    return 0;
  }
}

async function countRecommendationGenerations(userId: string): Promise<number> {
  const doc = await RecommendationHistoryModel.findOne({ userId }).lean();
  if (!doc) return 0;
  if (typeof (doc as any).totalCount === "number") return (doc as any).totalCount;
  return Array.isArray((doc as any).generations) ? (doc as any).generations.length : 1;
}

async function countUserPreferences(userId: string): Promise<number> {
  return (await UserPreferencesModel.exists({ userId })) ? 1 : 0;
}

async function countWorkspaceMemberships(userId: string): Promise<number> {
  return await WorkspaceModel.countDocuments({
    $or: [{ creatorId: userId }, { "members.userId": userId }],
  });
}

async function buildMergeItems(sourceUserId: string): Promise<AccountMergeItem[]> {
  const [
    ttsJobs,
    ttsHistory,
    ttsAssets,
    ttsQuotaReservations,
    artifacts,
    shortUrls,
    tickets,
    translationLogs,
    recommendationHistory,
    userPreferences,
    workspaces,
    voiceProjects,
    versions,
    apiKeys,
    apiKeyBillingEvents,
    oauthClients,
    oauthGrants,
    oauthTokens,
    oauthCodes,
  ] = await Promise.all([
    safeCount("tts_jobs", { userId: sourceUserId }),
    safeCount("tts_generation_history", { scope: "user", userId: sourceUserId }),
    safeCount("tts_audio_assets", { ownerUserId: sourceUserId }),
    safeCount("tts_quota_reservations", { userId: sourceUserId }),
    safeCount("artifacts", { userId: sourceUserId }),
    safeCount("short_urls", { userId: sourceUserId }),
    safeCount("tickets", { userId: sourceUserId }),
    safeCount("translation_logs", { userId: sourceUserId }),
    countRecommendationGenerations(sourceUserId),
    countUserPreferences(sourceUserId),
    countWorkspaceMemberships(sourceUserId),
    safeCount("voice_projects", { ownerId: sourceUserId }),
    safeCount("versions", { authorId: sourceUserId }),
    safeCount("apikeys", { userId: sourceUserId }),
    safeCount("apikeybillingevents", { userId: sourceUserId }),
    safeCount("oauthclients", { ownerUserId: sourceUserId }),
    safeCount("oauthgrants", { userId: sourceUserId, revokedAt: null }),
    safeCount("oauthtokens", { userId: sourceUserId, revokedAt: null }),
    safeCount("oauthauthorizationcodes", { userId: sourceUserId }),
  ]);

  return [
    { key: "ttsJobs", label: "TTS 任务", count: ttsJobs, strategy: "auto" },
    { key: "ttsHistory", label: "TTS 历史", count: ttsHistory, strategy: "auto" },
    { key: "ttsAssets", label: "TTS 音频资产", count: ttsAssets, strategy: "auto" },
    { key: "ttsQuotaReservations", label: "TTS 配额记录", count: ttsQuotaReservations, strategy: "auto" },
    { key: "artifacts", label: "Artifacts", count: artifacts, strategy: "auto" },
    { key: "shortUrls", label: "短链", count: shortUrls, strategy: "auto" },
    { key: "tickets", label: "工单", count: tickets, strategy: "auto" },
    { key: "translationLogs", label: "翻译日志", count: translationLogs, strategy: "auto" },
    { key: "recommendationHistory", label: "推荐历史", count: recommendationHistory, strategy: "smart" },
    { key: "userPreferences", label: "用户偏好", count: userPreferences, strategy: "smart" },
    { key: "workspaces", label: "工作空间", count: workspaces, strategy: "smart" },
    { key: "voiceProjects", label: "语音项目", count: voiceProjects, strategy: "auto" },
    { key: "versions", label: "版本记录", count: versions, strategy: "auto" },
    { key: "apiKeys", label: "API Key", count: apiKeys, strategy: "conservative" },
    { key: "apiKeyBillingEvents", label: "API Key 计费事件", count: apiKeyBillingEvents, strategy: "conservative" },
    { key: "oauthClients", label: "OAuth 应用", count: oauthClients, strategy: "conservative" },
    { key: "oauthGrants", label: "OAuth 授权", count: oauthGrants, strategy: "conservative" },
    { key: "oauthTokens", label: "OAuth Token", count: oauthTokens, strategy: "conservative" },
    { key: "oauthCodes", label: "OAuth 授权码", count: oauthCodes, strategy: "conservative" },
  ];
}

function buildRiskItems(sourceUser: User, targetUser: User, mergeItems: AccountMergeItem[]): AccountMergeRiskItem[] {
  const risks: AccountMergeRiskItem[] = [];
  const sourceStatus = (sourceUser as any).accountStatus || "active";
  const targetStatus = (targetUser as any).accountStatus || "active";

  if (sourceStatus === "suspended" || targetStatus === "suspended") {
    risks.push({
      key: "suspendedAccount",
      label: "封停状态",
      severity: "high",
      blocking: true,
      message: "任一账号处于封停状态时，不能通过合并绕过限制。",
    });
  }

  if (["admin", "trusted"].includes(sourceUser.role) || ["admin", "trusted"].includes(targetUser.role)) {
    risks.push({
      key: "privilegedRole",
      label: "管理员/可信用户角色",
      severity: "high",
      blocking: false,
      message: "角色不会从源账号覆盖到目标账号，确认前需要明确知悉。",
    });
  }

  if (
    sourceUser.email &&
    targetUser.email &&
    sourceUser.email.trim().toLowerCase() !== targetUser.email.trim().toLowerCase()
  ) {
    risks.push({
      key: "emailConflict",
      label: "邮箱冲突",
      severity: "medium",
      blocking: false,
      message: "源账号邮箱不会覆盖目标账号邮箱。",
    });
  }

  const apiKeyCount = mergeItems.find((item) => item.key === "apiKeys")?.count || 0;
  if (apiKeyCount > 0) {
    risks.push({
      key: "apiKeys",
      label: "API Key",
      severity: "high",
      blocking: false,
      message: "API Key 默认不迁移，确认时可选择迁移并保留计费事件归属。",
    });
  }

  const oauthTokenCount = mergeItems.find((item) => item.key === "oauthTokens")?.count || 0;
  const oauthGrantCount = mergeItems.find((item) => item.key === "oauthGrants")?.count || 0;
  if (oauthTokenCount > 0 || oauthGrantCount > 0) {
    risks.push({
      key: "oauthTokens",
      label: "OAuth Token",
      severity: "high",
      blocking: false,
      message: "源账号 OAuth grant/token 不会迁移，确认合并时会默认撤销。",
    });
  }

  return risks;
}

export async function buildAccountMergePreview(params: {
  sourceUserId: string;
  targetUserId: string;
  provider: AccountIdentityProvider;
  providerUserId: string;
  expiresAt?: number;
}): Promise<AccountMergePreview> {
  const [sourceUser, targetUser] = await Promise.all([
    UserStorage.getUserById(params.sourceUserId),
    UserStorage.getUserById(params.targetUserId),
  ]);

  if (!sourceUser || !targetUser) {
    throw new Error("合并账号不存在或已被删除");
  }

  if (sourceUser.id === targetUser.id) {
    throw new Error("源账号和目标账号不能相同");
  }

  const mergeItems = await buildMergeItems(sourceUser.id);
  const riskItems = buildRiskItems(sourceUser, targetUser, mergeItems);
  const canConfirm = !riskItems.some((item) => item.blocking);
  const requiresRiskAcknowledgement = riskItems.some((item) => item.severity === "high" && !item.blocking);

  return {
    sourceAccount: toAccountSummary(sourceUser),
    targetAccount: toAccountSummary(targetUser),
    provider: params.provider,
    providerUserId: params.providerUserId,
    mergeItems,
    riskItems,
    canConfirm,
    requiresRiskAcknowledgement,
    createdAt: new Date().toISOString(),
    expiresAt: params.expiresAt,
  };
}

export async function createMergePreviewSession(params: {
  sourceUserId: string;
  targetUserId: string;
  provider: AccountIdentityProvider;
  providerUserId: string;
}): Promise<{ token: string; preview: AccountMergePreview }> {
  cleanupExpiredMergeSessions();

  for (const [token, session] of mergeSessions.entries()) {
    if (
      session.sourceUserId === params.sourceUserId &&
      session.targetUserId === params.targetUserId &&
      session.provider === params.provider &&
      session.providerUserId === params.providerUserId
    ) {
      mergeSessions.delete(token);
    }
  }

  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = Date.now() + MERGE_SESSION_TTL_MS;
  const preview = await buildAccountMergePreview({ ...params, expiresAt });

  mergeSessions.set(token, {
    token,
    ...params,
    expiresAt,
    preview,
  });

  return { token, preview };
}

export async function getMergePreviewByToken(token: string, targetUserId: string): Promise<AccountMergePreview> {
  cleanupExpiredMergeSessions();

  const session = mergeSessions.get(token);
  if (!session || session.targetUserId !== targetUserId || session.expiresAt <= Date.now()) {
    throw new Error("合并预览不存在或已过期");
  }

  session.preview = await buildAccountMergePreview({
    sourceUserId: session.sourceUserId,
    targetUserId: session.targetUserId,
    provider: session.provider,
    providerUserId: session.providerUserId,
    expiresAt: session.expiresAt,
  });
  mergeSessions.set(token, session);

  return session.preview;
}

export function getPendingMergeSessionForUser(
  targetUserId: string,
  provider?: AccountIdentityProvider,
): { token: string; preview: AccountMergePreview } | null {
  cleanupExpiredMergeSessions();

  for (const session of mergeSessions.values()) {
    if (session.targetUserId === targetUserId && (!provider || session.provider === provider)) {
      return {
        token: session.token,
        preview: session.preview,
      };
    }
  }

  return null;
}

function uniqueStrings(...values: unknown[]): string[] {
  const result = new Set<string>();
  for (const value of values) {
    if (Array.isArray(value)) {
      for (const item of value) {
        if (typeof item === "string" && item.trim()) {
          result.add(item.trim());
        }
      }
    }
  }
  return Array.from(result);
}

function mergePreferences(source: any, target: any): Record<string, unknown> {
  const sourceRecommendation = source?.recommendationSettings || {};
  const targetRecommendation = target?.recommendationSettings || {};

  return {
    recommendationSettings: {
      ...sourceRecommendation,
      ...targetRecommendation,
      enabledCategories: uniqueStrings(sourceRecommendation.enabledCategories, targetRecommendation.enabledCategories),
      disabledCategories: uniqueStrings(sourceRecommendation.disabledCategories, targetRecommendation.disabledCategories),
      preferredLanguages: uniqueStrings(sourceRecommendation.preferredLanguages, targetRecommendation.preferredLanguages),
      preferredVoices: uniqueStrings(sourceRecommendation.preferredVoices, targetRecommendation.preferredVoices),
    },
    notificationSettings: {
      ...(source?.notificationSettings || {}),
      ...(target?.notificationSettings || {}),
    },
    privacySettings: {
      ...(source?.privacySettings || {}),
      ...(target?.privacySettings || {}),
    },
    updatedAt: new Date(),
  };
}

async function mergeUserPreferences(sourceUserId: string, targetUserId: string, session: any): Promise<void> {
  const [source, target] = await Promise.all([
    UserPreferencesModel.findOne({ userId: sourceUserId }).session(session).lean(),
    UserPreferencesModel.findOne({ userId: targetUserId }).session(session).lean(),
  ]);

  if (!source) return;

  if (!target) {
    await UserPreferencesModel.updateOne({ userId: sourceUserId }, { $set: { userId: targetUserId, updatedAt: new Date() } }, { session });
    return;
  }

  await UserPreferencesModel.updateOne({ userId: targetUserId }, { $set: mergePreferences(source, target) }, { session });
  await UserPreferencesModel.deleteOne({ userId: sourceUserId }).session(session);
}

async function mergeRecommendationHistory(sourceUserId: string, targetUserId: string, session: any): Promise<void> {
  const [source, target] = await Promise.all([
    RecommendationHistoryModel.findOne({ userId: sourceUserId }).session(session).lean(),
    RecommendationHistoryModel.findOne({ userId: targetUserId }).session(session).lean(),
  ]);

  if (!source) return;

  if (!target) {
    await RecommendationHistoryModel.updateOne(
      { userId: sourceUserId },
      { $set: { userId: targetUserId, lastUpdated: new Date() } },
      { session },
    );
    return;
  }

  const byId = new Map<string, any>();
  for (const record of [...((target as any).generations || []), ...((source as any).generations || [])]) {
    const key = typeof record?.id === "string" && record.id ? record.id : JSON.stringify(record);
    byId.set(key, record);
  }

  const generations = Array.from(byId.values()).sort((left, right) => {
    const leftTime = new Date(left.timestamp || 0).getTime();
    const rightTime = new Date(right.timestamp || 0).getTime();
    return rightTime - leftTime;
  });

  await RecommendationHistoryModel.updateOne(
    { userId: targetUserId },
    {
      $set: {
        generations,
        totalCount: generations.length,
        lastUpdated: new Date(),
      },
    },
    { session },
  );
  await RecommendationHistoryModel.deleteOne({ userId: sourceUserId }).session(session);
}

function mergeWorkspaceMembers(members: any[], sourceUserId: string, targetUserId: string): any[] {
  const byUserId = new Map<string, any>();

  for (const member of members || []) {
    const normalized = {
      ...member,
      userId: member.userId === sourceUserId ? targetUserId : member.userId,
    };
    const existing = byUserId.get(normalized.userId);
    if (!existing) {
      byUserId.set(normalized.userId, normalized);
      continue;
    }

    const existingRank = ROLE_RANK[existing.role] || 0;
    const normalizedRank = ROLE_RANK[normalized.role] || 0;
    byUserId.set(normalized.userId, {
      ...existing,
      ...normalized,
      role: normalizedRank > existingRank ? normalized.role : existing.role,
      joinedAt:
        existing.joinedAt && normalized.joinedAt && new Date(existing.joinedAt) < new Date(normalized.joinedAt)
          ? existing.joinedAt
          : normalized.joinedAt || existing.joinedAt,
    });
  }

  return Array.from(byUserId.values());
}

async function mergeWorkspaces(sourceUserId: string, targetUserId: string, session: any): Promise<void> {
  const workspaces = await WorkspaceModel.find({
    $or: [{ creatorId: sourceUserId }, { "members.userId": sourceUserId }, { "members.userId": targetUserId }],
  })
    .session(session)
    .lean();

  for (const workspace of workspaces as any[]) {
    await WorkspaceModel.updateOne(
      { _id: workspace._id },
      {
        $set: {
          creatorId: workspace.creatorId === sourceUserId ? targetUserId : workspace.creatorId,
          members: mergeWorkspaceMembers(workspace.members || [], sourceUserId, targetUserId),
          updatedAt: new Date(),
        },
      },
      { session },
    );
  }
}

async function transferSourceIdentities(sourceUserId: string, targetUserId: string, session: any): Promise<void> {
  const sourceIdentities = await AccountIdentityModel.find({ userId: sourceUserId, status: "active" })
    .session(session)
    .lean();

  for (const identity of sourceIdentities) {
    const targetIdentity = await AccountIdentityModel.findOne({
      userId: targetUserId,
      provider: identity.provider,
      status: "active",
    })
      .session(session)
      .lean();

    if (!targetIdentity || targetIdentity.providerUserId === identity.providerUserId) {
      await AccountIdentityModel.updateOne(
        { provider: identity.provider, providerUserId: identity.providerUserId },
        { $set: { userId: targetUserId, lastUsedAt: new Date(), status: "active" } },
        { session },
      );
    } else {
      await AccountIdentityModel.updateOne(
        { provider: identity.provider, providerUserId: identity.providerUserId },
        { $set: { status: "revoked", lastUsedAt: new Date() } },
        { session },
      );
    }
  }
}

async function updateMany(
  name: string,
  filter: Record<string, unknown>,
  update: Record<string, unknown>,
  session: any,
  options: Record<string, unknown> = {},
): Promise<number> {
  const result = await collection(name).updateMany(filter, update, { ...options, session });
  return result.modifiedCount || 0;
}

async function runMergeTransaction(params: {
  sourceUser: User;
  targetUser: User;
  options: AccountMergeConfirmOptions;
}): Promise<Record<string, number>> {
  const counters: Record<string, number> = {};
  const session = await mongoose.startSession();
  const now = new Date();

  try {
    await session.withTransaction(async () => {
      counters.ttsJobs = await updateMany("tts_jobs", { userId: params.sourceUser.id }, { $set: { userId: params.targetUser.id } }, session);
      counters.ttsHistory = await updateMany(
        "tts_generation_history",
        { scope: "user", userId: params.sourceUser.id },
        { $set: { userId: params.targetUser.id, duplicateScopeKey: params.targetUser.id } },
        session,
      );
      counters.ttsAssets = await updateMany(
        "tts_audio_assets",
        { ownerUserId: params.sourceUser.id },
        { $set: { ownerUserId: params.targetUser.id } },
        session,
      );
      counters.ttsQuotaReservations = await updateMany(
        "tts_quota_reservations",
        { userId: params.sourceUser.id },
        { $set: { userId: params.targetUser.id } },
        session,
      );
      counters.artifacts = await updateMany(
        "artifacts",
        { userId: params.sourceUser.id },
        { $set: { userId: params.targetUser.id } },
        session,
      );
      counters.shortUrls = await updateMany(
        "short_urls",
        { userId: params.sourceUser.id },
        { $set: { userId: params.targetUser.id, username: params.targetUser.username } },
        session,
      );
      counters.tickets = await updateMany(
        "tickets",
        { userId: params.sourceUser.id },
        {
          $set: {
            userId: params.targetUser.id,
            username: params.targetUser.username,
            "messages.$[sender].senderId": params.targetUser.id,
          },
        },
        session,
        { arrayFilters: [{ "sender.senderId": params.sourceUser.id }] },
      );
      counters.translationLogs = await updateMany(
        "translation_logs",
        { userId: params.sourceUser.id },
        { $set: { userId: params.targetUser.id } },
        session,
      );
      counters.voiceProjects = await updateMany(
        "voice_projects",
        { ownerId: params.sourceUser.id },
        { $set: { ownerId: params.targetUser.id, updatedAt: now } },
        session,
      );
      const voiceProjectSharesAdded = await updateMany(
        "voice_projects",
        { "sharing.sharedWith": params.sourceUser.id },
        { $addToSet: { "sharing.sharedWith": params.targetUser.id } },
        session,
      );
      const voiceProjectSharesPulled = await updateMany(
        "voice_projects",
        { "sharing.sharedWith": params.sourceUser.id },
        { $pull: { "sharing.sharedWith": params.sourceUser.id } },
        session,
      );
      counters.voiceProjectShares = Math.max(voiceProjectSharesAdded, voiceProjectSharesPulled);
      counters.versions = await updateMany(
        "versions",
        { authorId: params.sourceUser.id },
        { $set: { authorId: params.targetUser.id } },
        session,
      );

      await mergeUserPreferences(params.sourceUser.id, params.targetUser.id, session);
      await mergeRecommendationHistory(params.sourceUser.id, params.targetUser.id, session);
      await mergeWorkspaces(params.sourceUser.id, params.targetUser.id, session);

      if (params.options.includeApiKeys) {
        counters.apiKeys = await updateMany(
          "apikeys",
          { userId: params.sourceUser.id },
          { $set: { userId: params.targetUser.id, updatedAt: now } },
          session,
        );
        counters.apiKeyBillingEvents = await updateMany(
          "apikeybillingevents",
          { userId: params.sourceUser.id },
          { $set: { userId: params.targetUser.id } },
          session,
        );
      }

      if (params.options.includeOAuthClients) {
        counters.oauthClients = (
          await OAuthClientModel.updateMany(
            { ownerUserId: params.sourceUser.id },
            { $set: { ownerUserId: params.targetUser.id, updatedAt: now } },
            { session },
          )
        ).modifiedCount;
      }

      counters.oauthGrantsRevoked = (
        await OAuthGrantModel.updateMany(
          { userId: params.sourceUser.id, revokedAt: null },
          { $set: { revokedAt: now, updatedAt: now } },
          { session },
        )
      ).modifiedCount;
      counters.oauthTokensRevoked = (
        await OAuthTokenModel.updateMany(
          { userId: params.sourceUser.id, revokedAt: null },
          { $set: { revokedAt: now, refreshTokenHash: null, updatedAt: now } },
          { session },
        )
      ).modifiedCount;
      counters.oauthCodesDeleted = (
        await OAuthAuthorizationCodeModel.deleteMany({ userId: params.sourceUser.id }, { session })
      ).deletedCount;

      await transferSourceIdentities(params.sourceUser.id, params.targetUser.id, session);
    });

    return counters;
  } finally {
    await session.endSession();
  }
}

function buildAuditEntry(params: {
  actor: AccountMergeActor;
  sourceUser: User;
  targetUser: User;
  provider: AccountIdentityProvider;
  providerUserId: string;
  result: "success" | "failure";
  errorMessage?: string;
  detail?: Record<string, unknown>;
}): AuditEntry {
  return {
    requestId: params.actor.requestId,
    userId: params.actor.userId,
    username: params.actor.username,
    role: params.actor.role,
    action: "account.merge.confirm",
    module: "auth",
    targetId: params.targetUser.id,
    targetName: params.targetUser.username,
    result: params.result,
    errorMessage: params.errorMessage,
    detail: {
      sourceUserId: params.sourceUser.id,
      sourceUsername: params.sourceUser.username,
      provider: params.provider,
      providerUserId: params.providerUserId,
      ...(params.detail || {}),
    },
    ip: params.actor.ip,
    userAgent: params.actor.userAgent,
    path: params.actor.path,
    method: params.actor.method,
  };
}

export async function confirmAccountMerge(params: {
  token: string;
  targetUserId: string;
  options: AccountMergeConfirmOptions;
  actor: AccountMergeActor;
}): Promise<{ success: true; preview: AccountMergePreview; migrated: Record<string, number> }> {
  cleanupExpiredMergeSessions();

  const mergeSession = mergeSessions.get(params.token);
  if (!mergeSession || mergeSession.targetUserId !== params.targetUserId || mergeSession.expiresAt <= Date.now()) {
    throw new Error("合并会话不存在或已过期");
  }

  const preview = await getMergePreviewByToken(params.token, params.targetUserId);
  const [sourceUser, targetUser] = await Promise.all([
    UserStorage.getUserById(mergeSession.sourceUserId),
    UserStorage.getUserById(mergeSession.targetUserId),
  ]);

  if (!sourceUser || !targetUser) {
    throw new Error("合并账号不存在或已被删除");
  }

  const blockingRisk = preview.riskItems.find((item) => item.blocking);
  if (blockingRisk) {
    await AuditLogService.log(
      buildAuditEntry({
        actor: params.actor,
        sourceUser,
        targetUser,
        provider: mergeSession.provider,
        providerUserId: mergeSession.providerUserId,
        result: "failure",
        errorMessage: blockingRisk.message,
      }),
    );
    throw new Error(blockingRisk.message);
  }

  if (preview.requiresRiskAcknowledgement && !params.options.acknowledgeRisks) {
    throw new Error("请先确认高风险项后再执行合并");
  }

  const migrated = await runMergeTransaction({ sourceUser, targetUser, options: params.options });
  mergeSessions.delete(params.token);

  await AuditLogService.log(
    buildAuditEntry({
      actor: params.actor,
      sourceUser,
      targetUser,
      provider: mergeSession.provider,
      providerUserId: mergeSession.providerUserId,
      result: "success",
      detail: {
        migrated,
        includeApiKeys: Boolean(params.options.includeApiKeys),
        includeOAuthClients: Boolean(params.options.includeOAuthClients),
      },
    }),
  );

  return {
    success: true,
    preview,
    migrated,
  };
}

export function resetAccountMergeSessionsForTests(): void {
  mergeSessions.clear();
}
