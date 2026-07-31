import crypto from "node:crypto";
import { getBroadcastLogModel } from "../models/broadcastLogModel";
import { getConfigurationNoticeStateModel } from "../models/configurationNoticeStateModel";
import logger from "../utils/logger";
import {
  getMissingConfigurationIssues,
  type MissingConfigurationIssue,
} from "./configurationNoticeIssues";
import { wsService } from "./wsService";

export { getMissingConfigurationIssues, type MissingConfigurationIssue } from "./configurationNoticeIssues";

const NOTICE_STATE_KEY = "frontend-visit-missing-configuration";
const NOTICE_TITLE = "服务配置待完善";
const DELIVERY_CLAIM_TTL_MS = 30_000;

function buildFingerprint(issues: MissingConfigurationIssue[]): string {
  return crypto
    .createHash("sha256")
    .update(
      issues
        .map((item) => `${item.id}:${[...item.settingNames].sort().join(",")}`)
        .join("\n"),
    )
    .digest("hex");
}

function buildMessage(issues: MissingConfigurationIssue[]): string {
  const details = issues
    .map((item) => `${item.label}（${item.settingNames.join(" / ")}）：${item.impact}`)
    .join("；");
  return `检测到 ${issues.length} 项缺失配置。服务已继续启动，相关能力会按请求失败或降级。${details}`;
}

function isDuplicateKeyError(error: unknown): boolean {
  return Number((error as { code?: number })?.code) === 11000;
}

async function resolveNoticeState(): Promise<void> {
  const NoticeState = getConfigurationNoticeStateModel();
  await NoticeState.updateOne(
    { key: NOTICE_STATE_KEY, fingerprint: { $ne: "" } },
    {
      $set: {
        fingerprint: "",
        issueIds: [],
        resolvedAt: new Date(),
        updatedAt: new Date(),
      },
    },
  ).exec();
}

async function claimNotice(fingerprint: string, issueIds: string[]): Promise<boolean> {
  const NoticeState = getConfigurationNoticeStateModel();
  try {
    await NoticeState.findOneAndUpdate(
      { key: NOTICE_STATE_KEY, fingerprint: { $ne: fingerprint } },
      {
        $set: {
          fingerprint,
          issueIds,
          notifiedAt: new Date(),
          updatedAt: new Date(),
        },
        $unset: {
          deliveredAt: "",
          deliveryClaimId: "",
          deliveryClaimedAt: "",
          resolvedAt: "",
        },
        $setOnInsert: { key: NOTICE_STATE_KEY },
      },
      { upsert: true, returnDocument: "after" },
    ).exec();
    return true;
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      return false;
    }
    throw error;
  }
}

export async function notifyAdminsForFrontendVisit(): Promise<{
  notified: boolean;
  issueCount: number;
}> {
  const issues = await getMissingConfigurationIssues();
  if (issues.length === 0) {
    await resolveNoticeState();
    return { notified: false, issueCount: 0 };
  }

  const fingerprint = buildFingerprint(issues);
  const issueIds = issues.map((item) => item.id);
  const claimed = await claimNotice(fingerprint, issueIds);
  if (!claimed) {
    return { notified: false, issueCount: issues.length };
  }

  const message = buildMessage(issues);
  const BroadcastLog = getBroadcastLogModel();

  try {
    const expectedConnections = wsService.getConnectionStats().admins;
    await BroadcastLog.create({
      message,
      level: "warn",
      title: NOTICE_TITLE,
      duration: 15_000,
      display: "modal",
      format: "text",
      audience: "admins",
      targetUserIds: [],
      admin: "system:frontend-first-visit",
      connections: expectedConnections,
    });

    let connections = 0;
    if (expectedConnections > 0) {
      connections = wsService.notifyAdmins(message, {
        level: "warn",
        title: NOTICE_TITLE,
        duration: 15_000,
        display: "modal",
        format: "text",
        issueIds,
      });

      if (connections > 0) {
        const NoticeState = getConfigurationNoticeStateModel();
        await NoticeState.updateOne(
          { key: NOTICE_STATE_KEY, fingerprint },
          {
            $set: { deliveredAt: new Date(), updatedAt: new Date() },
            $unset: { deliveryClaimId: "", deliveryClaimedAt: "" },
          },
        ).exec();
      }
    }

    logger.warn("[Config] Missing configuration notice recorded for administrators", {
      issueIds,
      connections,
    });
    return { notified: true, issueCount: issues.length };
  } catch (error) {
    const NoticeState = getConfigurationNoticeStateModel();
    await NoticeState.deleteOne({ key: NOTICE_STATE_KEY, fingerprint }).exec().catch(() => undefined);
    throw error;
  }
}

export async function claimPendingConfigurationNoticeForAdminConnection(): Promise<{
  title: string;
  message: string;
  issueIds: string[];
  fingerprint: string;
  deliveryClaimId: string;
} | null> {
  const issues = await getMissingConfigurationIssues();
  if (issues.length === 0) {
    await resolveNoticeState();
    return null;
  }

  const fingerprint = buildFingerprint(issues);
  const deliveryClaimId = crypto.randomUUID();
  const staleClaimBefore = new Date(Date.now() - DELIVERY_CLAIM_TTL_MS);
  const NoticeState = getConfigurationNoticeStateModel();
  const claimed = await NoticeState.findOneAndUpdate(
    {
      key: NOTICE_STATE_KEY,
      fingerprint,
      deliveredAt: { $exists: false },
      $or: [
        { deliveryClaimedAt: { $exists: false } },
        { deliveryClaimedAt: { $lt: staleClaimBefore } },
      ],
    },
    {
      $set: {
        deliveryClaimId,
        deliveryClaimedAt: new Date(),
        updatedAt: new Date(),
      },
    },
    { returnDocument: "after" },
  )
    .lean()
    .exec();

  if (!claimed) {
    return null;
  }

  return {
    title: NOTICE_TITLE,
    message: buildMessage(issues),
    issueIds: issues.map((item) => item.id),
    fingerprint,
    deliveryClaimId,
  };
}

export async function completeConfigurationNoticeDelivery(
  fingerprint: string,
  deliveryClaimId: string,
): Promise<void> {
  const NoticeState = getConfigurationNoticeStateModel();
  await NoticeState.updateOne(
    { key: NOTICE_STATE_KEY, fingerprint, deliveryClaimId },
    {
      $set: { deliveredAt: new Date(), updatedAt: new Date() },
      $unset: { deliveryClaimId: "", deliveryClaimedAt: "" },
    },
  ).exec();
}

export async function releaseConfigurationNoticeDeliveryClaim(
  fingerprint: string,
  deliveryClaimId: string,
): Promise<void> {
  const NoticeState = getConfigurationNoticeStateModel();
  await NoticeState.updateOne(
    { key: NOTICE_STATE_KEY, fingerprint, deliveryClaimId, deliveredAt: { $exists: false } },
    {
      $unset: { deliveryClaimId: "", deliveryClaimedAt: "" },
      $set: { updatedAt: new Date() },
    },
  ).exec();
}
