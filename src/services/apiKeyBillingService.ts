import type { Request, Response } from "express";
import type { ApiKeyDoc } from "../models/apiKeyModel";
import { ApiKeyModel } from "../models/apiKeyModel";
import {
  type ApiKeyBillingEventDoc,
  ApiKeyBillingEventModel,
  type ApiKeyBillingMode,
} from "../models/apiKeyBillingModel";
import { API_KEY_PERMISSION_DEFINITIONS } from "./apiKeyService";
import logger from "../utils/logger";

interface ApiKeyBillingContext {
  keyId: string;
  userId: string;
  permission: string;
  billingMode: ApiKeyBillingMode;
  costCredits: number;
  reserved: boolean;
  balanceAfterReservation: number | null;
  method: string | null;
  route: string | null;
  requestId: string | null;
}

export interface ApiKeyBillingEventView
  extends Omit<ApiKeyBillingEventDoc, "updatedAt"> {}

const BILLABLE_STATUS_MIN = 200;
const BILLABLE_STATUS_MAX = 399;
const DEFAULT_BILLING_MODE: ApiKeyBillingMode = "metered";

function roundCredits(value: number): number {
  return Math.round((Number(value) || 0) * 10_000) / 10_000;
}

function normalizeBillingMode(value: unknown): ApiKeyBillingMode {
  return value === "prepaid" ? "prepaid" : DEFAULT_BILLING_MODE;
}

function isBillingEnabled(doc: Partial<ApiKeyDoc>): boolean {
  return doc.billingEnabled !== false;
}

export function getApiKeyBillingCost(permission: string): number {
  const definition = API_KEY_PERMISSION_DEFINITIONS.find((item) => item.key === permission);
  return roundCredits(definition?.costCredits ?? 0.1);
}

function getRequestRoute(req: Request): string {
  return req.originalUrl?.split("?")[0] || req.baseUrl || req.path || "";
}

function shouldBillStatus(statusCode: number): boolean {
  return statusCode >= BILLABLE_STATUS_MIN && statusCode <= BILLABLE_STATUS_MAX;
}

function toBillingEventView(doc: ApiKeyBillingEventDoc): ApiKeyBillingEventView {
  const { updatedAt: _updatedAt, ...view } = doc;
  return view;
}

export async function preauthorizeApiKeyBilling(
  doc: ApiKeyDoc,
  permission: string,
  req: Request,
): Promise<ApiKeyBillingContext | null> {
  const costCredits = getApiKeyBillingCost(permission);
  const billingMode = normalizeBillingMode(doc.billingMode);

  if (!isBillingEnabled(doc) || costCredits <= 0) {
    return null;
  }

  const context: ApiKeyBillingContext = {
    keyId: doc.keyId,
    userId: doc.userId,
    permission,
    billingMode,
    costCredits,
    reserved: false,
    balanceAfterReservation: null,
    method: req.method || null,
    route: getRequestRoute(req) || null,
    requestId: typeof (req as any).requestId === "string" ? (req as any).requestId : null,
  };

  if (billingMode !== "prepaid") {
    return context;
  }

  const updated = (await ApiKeyModel.findOneAndUpdate(
    {
      keyId: doc.keyId,
      billingMode: "prepaid",
      billingEnabled: { $ne: false },
      balanceCredits: { $gte: costCredits },
    },
    {
      $inc: { balanceCredits: -costCredits },
      $set: { updatedAt: new Date() },
    },
    { new: true },
  ).lean()) as ApiKeyDoc | null;

  if (!updated) {
    return Promise.reject(Object.assign(new Error("API Key 余额不足"), { statusCode: 402 }));
  }

  context.reserved = true;
  context.balanceAfterReservation = roundCredits(updated.balanceCredits);
  return context;
}

export async function finalizeApiKeyBilling(context: ApiKeyBillingContext, res: Response): Promise<void> {
  const billable = shouldBillStatus(res.statusCode);
  const now = new Date();

  if (!billable) {
    if (!context.reserved) {
      await ApiKeyBillingEventModel.create({
        keyId: context.keyId,
        userId: context.userId,
        type: "waived",
        permission: context.permission,
        billingMode: context.billingMode,
        costCredits: 0,
        balanceDelta: 0,
        balanceAfter: null,
        method: context.method,
        route: context.route,
        statusCode: res.statusCode,
        requestId: context.requestId,
        reason: "响应未成功，不计费",
        actorUserId: null,
      });
      return;
    }

    const refunded = (await ApiKeyModel.findOneAndUpdate(
      { keyId: context.keyId },
      {
        $inc: { balanceCredits: context.costCredits },
        $set: { updatedAt: now },
      },
      { new: true },
    ).lean()) as ApiKeyDoc | null;

    await ApiKeyBillingEventModel.create({
      keyId: context.keyId,
      userId: context.userId,
      type: "refund",
      permission: context.permission,
      billingMode: context.billingMode,
      costCredits: 0,
      balanceDelta: context.costCredits,
      balanceAfter: refunded ? roundCredits(refunded.balanceCredits) : null,
      method: context.method,
      route: context.route,
      statusCode: res.statusCode,
      requestId: context.requestId,
      reason: "响应未成功，退回预留费用",
      actorUserId: null,
    });
    return;
  }

  const updated = (await ApiKeyModel.findOneAndUpdate(
    { keyId: context.keyId },
    {
      $inc: {
        totalChargedCredits: context.costCredits,
        totalBillableRequests: 1,
      },
      $set: { lastBillingAt: now, updatedAt: now },
    },
    { new: true },
  ).lean()) as ApiKeyDoc | null;

  await ApiKeyBillingEventModel.create({
    keyId: context.keyId,
    userId: context.userId,
    type: "charge",
    permission: context.permission,
    billingMode: context.billingMode,
    costCredits: context.costCredits,
    balanceDelta: context.reserved ? -context.costCredits : 0,
    balanceAfter: context.reserved
      ? context.balanceAfterReservation
      : updated && context.billingMode === "prepaid"
        ? roundCredits(updated.balanceCredits)
        : null,
    method: context.method,
    route: context.route,
    statusCode: res.statusCode,
    requestId: context.requestId,
    reason: null,
    actorUserId: null,
  });
}

export function attachApiKeyBillingFinalizer(context: ApiKeyBillingContext | null, res: Response): void {
  if (!context) return;

  res.once("finish", () => {
    finalizeApiKeyBilling(context, res).catch((error) => {
      logger.error("[ApiKeyBilling] 结算失败", {
        keyId: context.keyId,
        permission: context.permission,
        error: error instanceof Error ? error.message : String(error),
      });
    });
  });
}

export async function adjustApiKeyBalance(opts: {
  keyId: string;
  credits: number;
  reason?: string;
  actorUserId: string;
}): Promise<{ balanceCredits: number } | null> {
  const credits = roundCredits(opts.credits);
  if (!Number.isFinite(credits) || credits === 0 || Math.abs(credits) > 1_000_000) {
    throw Object.assign(new Error("调整点数必须在 -1000000 到 1000000 之间且不能为 0"), { statusCode: 400 });
  }

  const filter =
    credits < 0
      ? { keyId: opts.keyId, balanceCredits: { $gte: Math.abs(credits) } }
      : { keyId: opts.keyId };

  const updated = (await ApiKeyModel.findOneAndUpdate(
    filter,
    {
      $inc: { balanceCredits: credits },
      $set: { updatedAt: new Date() },
    },
    { new: true },
  ).lean()) as ApiKeyDoc | null;

  if (!updated) {
    return null;
  }

  await ApiKeyBillingEventModel.create({
    keyId: updated.keyId,
    userId: updated.userId,
    type: "adjustment",
    permission: "billing",
    billingMode: normalizeBillingMode(updated.billingMode),
    costCredits: 0,
    balanceDelta: credits,
    balanceAfter: roundCredits(updated.balanceCredits),
    method: null,
    route: null,
    statusCode: null,
    requestId: null,
    reason: opts.reason?.trim().slice(0, 200) || "管理员调整余额",
    actorUserId: opts.actorUserId,
  });

  return { balanceCredits: roundCredits(updated.balanceCredits) };
}

export async function listApiKeyBillingEvents(opts: {
  keyId: string;
  limit?: number;
}): Promise<ApiKeyBillingEventView[]> {
  const limit = Math.min(Math.max(Number(opts.limit) || 20, 1), 100);
  const docs = (await ApiKeyBillingEventModel.find({ keyId: opts.keyId })
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean()) as ApiKeyBillingEventDoc[];
  return docs.map(toBillingEventView);
}
