import crypto from "node:crypto";
import type { Request, Response } from "express";
import type { ClientSession } from "mongoose";
import type { ApiKeyDoc } from "../models/apiKeyModel";
import { ApiKeyModel } from "../models/apiKeyModel";
import {
  type ApiKeyBillingEventDoc,
  ApiKeyBillingEventModel,
  type ApiKeyBillingMode,
} from "../models/apiKeyBillingModel";
import { API_KEY_PERMISSION_DEFINITIONS } from "./apiKeyService";
import { mongoose } from "./mongoService";
import logger from "../utils/logger";

interface ApiKeyBillingContext {
  operationId: string;
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

type BillingFaultPoint =
  | "preauthorize.afterBalanceUpdate"
  | "preauthorize.afterEventWrite"
  | "finalize.afterBalanceUpdate"
  | "finalize.afterEventWrite"
  | "adjust.afterBalanceUpdate"
  | "adjust.afterEventWrite";

type BillingFaultInjector = (point: BillingFaultPoint) => void | Promise<void>;

const BILLABLE_STATUS_MIN = 200;
const BILLABLE_STATUS_MAX = 399;
const DEFAULT_BILLING_MODE: ApiKeyBillingMode = "metered";
const RESERVATION_TTL_MS = Math.max(Number(process.env.API_KEY_BILLING_RESERVATION_TTL_MS) || 30 * 60_000, 60_000);
const RECONCILIATION_INTERVAL_MS = Math.max(
  Number(process.env.API_KEY_BILLING_RECONCILIATION_INTERVAL_MS) || 60_000,
  10_000,
);
const TRANSACTION_OPTIONS = {
  readPreference: "primary" as const,
  readConcern: { level: "snapshot" as const },
  writeConcern: { w: "majority" as const },
};

let billingFaultInjector: BillingFaultInjector | null = null;
let reconciliationTimer: NodeJS.Timeout | null = null;

function roundCredits(value: number): number {
  return Math.round((Number(value) || 0) * 10_000) / 10_000;
}

function normalizeBillingMode(value: unknown): ApiKeyBillingMode {
  return value === "prepaid" ? "prepaid" : DEFAULT_BILLING_MODE;
}

function isBillingEnabled(doc: Partial<ApiKeyDoc>): boolean {
  return doc.billingEnabled !== false;
}

function billingError(message: string, statusCode: number, code: string): Error {
  return Object.assign(new Error(message), { statusCode, code });
}

function isTransactionUnsupportedError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return (
    /transaction numbers are only allowed/i.test(message) ||
    /transactions are not supported/i.test(message) ||
    /replica set member or mongos/i.test(message) ||
    /not supported on standalone/i.test(message)
  );
}

async function assertBillingTransactionsSupported(): Promise<void> {
  const db = mongoose.connection.db;
  if (!db) {
    throw billingError("MongoDB 连接不可用，API Key 计费已安全拒绝", 503, "BILLING_DATABASE_UNAVAILABLE");
  }

  let topology: Record<string, unknown>;
  try {
    topology = (await db.admin().command({ hello: 1 })) as Record<string, unknown>;
  } catch (error) {
    throw billingError(
      `无法确认 MongoDB 事务能力，API Key 计费已安全拒绝: ${error instanceof Error ? error.message : String(error)}`,
      503,
      "BILLING_TRANSACTION_CHECK_FAILED",
    );
  }

  if (!topology.setName && topology.msg !== "isdbgrid") {
    throw billingError(
      "API Key 计费要求 MongoDB replica set 或 sharded cluster；standalone 不会执行非事务写入",
      503,
      "BILLING_TRANSACTIONS_REQUIRED",
    );
  }
}

async function runBillingTransaction<T>(operation: (session: ClientSession) => Promise<T>): Promise<T> {
  await assertBillingTransactionsSupported();
  const session = await mongoose.startSession();
  try {
    let result: T | undefined;
    await session.withTransaction(async () => {
      result = await operation(session);
    }, TRANSACTION_OPTIONS);
    return result as T;
  } catch (error) {
    if (isTransactionUnsupportedError(error)) {
      throw billingError(
        "MongoDB 当前不支持事务，API Key 计费已回滚并安全拒绝",
        503,
        "BILLING_TRANSACTIONS_REQUIRED",
      );
    }
    throw error;
  } finally {
    await session.endSession();
  }
}

async function injectBillingFault(point: BillingFaultPoint): Promise<void> {
  await billingFaultInjector?.(point);
}

/** 仅供故障注入测试；非测试环境拒绝启用。 */
export function setApiKeyBillingFaultInjectorForTests(injector: BillingFaultInjector | null): void {
  if (process.env.NODE_ENV !== "test") {
    throw new Error("API Key billing fault injection is only available in tests");
  }
  billingFaultInjector = injector;
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

function createOperationId(parts: Array<string | null | undefined>): string {
  return crypto.createHash("sha256").update(parts.map((part) => part || "-").join("")).digest("hex");
}

function contextFromEvent(event: ApiKeyBillingEventDoc): ApiKeyBillingContext {
  return {
    operationId: event.operationId,
    keyId: event.keyId,
    userId: event.userId,
    permission: event.permission,
    billingMode: event.billingMode,
    costCredits: event.costCredits,
    reserved: event.billingMode === "prepaid",
    balanceAfterReservation: event.balanceAfter,
    method: event.method,
    route: event.route,
    requestId: event.requestId,
  };
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

  const method = req.method || null;
  const route = getRequestRoute(req) || null;
  const requestId = typeof req.requestId === "string" ? req.requestId.slice(0, 200) : crypto.randomUUID();
  const operationId = createOperationId(["request", doc.keyId, requestId, method, route, permission]);

  return runBillingTransaction(async (session) => {
    const existing = (await ApiKeyBillingEventModel.findOne({ operationId }).session(session).lean()) as
      | ApiKeyBillingEventDoc
      | null;
    if (existing) {
      if (existing.state === "pending") {
        return contextFromEvent(existing);
      }
      throw billingError("相同请求 ID 的 API Key 计费已完成，拒绝重复执行", 409, "BILLING_REQUEST_ALREADY_FINALIZED");
    }

    let balanceAfterReservation: number | null = null;
    if (billingMode === "prepaid") {
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
        { returnDocument: "after", session },
      ).lean()) as ApiKeyDoc | null;

      if (!updated) {
        throw billingError("API Key 余额不足", 402, "API_KEY_BALANCE_INSUFFICIENT");
      }
      balanceAfterReservation = roundCredits(updated.balanceCredits);
      await injectBillingFault("preauthorize.afterBalanceUpdate");
    }

    const now = new Date();
    const [event] = (await ApiKeyBillingEventModel.create(
      [
        {
          operationId,
          keyId: doc.keyId,
          userId: doc.userId,
          type: "reservation",
          state: "pending",
          permission,
          billingMode,
          costCredits,
          balanceDelta: billingMode === "prepaid" ? -costCredits : 0,
          balanceAfter: balanceAfterReservation,
          method,
          route,
          statusCode: null,
          requestId,
          reason: null,
          actorUserId: null,
          reservationExpiresAt: new Date(now.getTime() + RESERVATION_TTL_MS),
          finalizedAt: null,
        },
      ],
      { session },
    )) as unknown as ApiKeyBillingEventDoc[];
    await injectBillingFault("preauthorize.afterEventWrite");

    return contextFromEvent(event);
  });
}

export async function finalizeApiKeyBilling(context: ApiKeyBillingContext, res: Response): Promise<void> {
  const billable = shouldBillStatus(res.statusCode);
  const now = new Date();

  await runBillingTransaction(async (session) => {
    const event = (await ApiKeyBillingEventModel.findOne({ operationId: context.operationId })
      .session(session)
      .lean()) as ApiKeyBillingEventDoc | null;

    if (!event) {
      throw billingError("API Key 计费预留记录不存在，拒绝产生孤立余额变更", 500, "BILLING_RESERVATION_MISSING");
    }
    if (event.state === "completed") {
      return;
    }

    let balanceAfter = event.balanceAfter;
    if (!billable && event.billingMode === "prepaid") {
      const refunded = (await ApiKeyModel.findOneAndUpdate(
        { keyId: event.keyId },
        {
          $inc: { balanceCredits: event.costCredits },
          $set: { updatedAt: now },
        },
        { returnDocument: "after", session },
      ).lean()) as ApiKeyDoc | null;
      if (!refunded) {
        throw billingError("API Key 不存在，无法原子退回预留费用", 500, "BILLING_REFUND_KEY_MISSING");
      }
      balanceAfter = roundCredits(refunded.balanceCredits);
      await injectBillingFault("finalize.afterBalanceUpdate");
    } else if (billable) {
      const updated = (await ApiKeyModel.findOneAndUpdate(
        { keyId: event.keyId },
        {
          $inc: {
            totalChargedCredits: event.costCredits,
            totalBillableRequests: 1,
          },
          $set: { lastBillingAt: now, updatedAt: now },
        },
        { returnDocument: "after", session },
      ).lean()) as ApiKeyDoc | null;
      if (!updated) {
        throw billingError("API Key 不存在，无法原子结算", 500, "BILLING_CHARGE_KEY_MISSING");
      }
      if (event.billingMode === "prepaid") {
        balanceAfter = roundCredits(updated.balanceCredits);
      }
      await injectBillingFault("finalize.afterBalanceUpdate");
    }

    const finalized = await ApiKeyBillingEventModel.findOneAndUpdate(
      { operationId: event.operationId, state: "pending" },
      {
        $set: {
          type: billable ? "charge" : event.billingMode === "prepaid" ? "refund" : "waived",
          state: "completed",
          costCredits: billable ? event.costCredits : 0,
          balanceDelta: billable ? (event.billingMode === "prepaid" ? -event.costCredits : 0) : event.billingMode === "prepaid" ? event.costCredits : 0,
          balanceAfter,
          statusCode: res.statusCode,
          reason: billable ? null : event.billingMode === "prepaid" ? "响应未成功，退回预留费用" : "响应未成功，不计费",
          finalizedAt: now,
          reservationExpiresAt: null,
        },
      },
      { returnDocument: "after", session },
    ).lean();
    if (!finalized) {
      throw billingError("API Key 计费预留已被并发处理，事务已回滚", 409, "BILLING_RESERVATION_CONFLICT");
    }
    await injectBillingFault("finalize.afterEventWrite");
  });
}

async function finalizeWithRetry(context: ApiKeyBillingContext, res: Response): Promise<void> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      await finalizeApiKeyBilling(context, res);
      return;
    } catch (error) {
      lastError = error;
      const statusCode = (error as { statusCode?: number })?.statusCode;
      if (statusCode === 409 || statusCode === 503 || attempt === 3) break;
      await new Promise((resolve) => setTimeout(resolve, attempt * 100));
    }
  }
  throw lastError;
}

export function attachApiKeyBillingFinalizer(context: ApiKeyBillingContext | null, res: Response): void {
  if (!context) return;

  res.once("finish", () => {
    finalizeWithRetry(context, res).catch((error) => {
      logger.error("[ApiKeyBilling] 结算失败，待 reconciliation 安全处理", {
        operationId: context.operationId,
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
  requestId?: string;
}): Promise<{ balanceCredits: number } | null> {
  const credits = roundCredits(opts.credits);
  if (!Number.isFinite(credits) || credits === 0 || Math.abs(credits) > 1_000_000) {
    throw billingError("调整点数必须在 -1000000 到 1000000 之间且不能为 0", 400, "INVALID_BILLING_ADJUSTMENT");
  }

  const requestId = opts.requestId?.slice(0, 200) || crypto.randomUUID();
  const operationId = createOperationId(["adjustment", opts.keyId, opts.actorUserId, requestId]);

  return runBillingTransaction(async (session) => {
    const existing = (await ApiKeyBillingEventModel.findOne({ operationId }).session(session).lean()) as
      | ApiKeyBillingEventDoc
      | null;
    if (existing?.state === "completed") {
      return existing.balanceAfter === null ? null : { balanceCredits: roundCredits(existing.balanceAfter) };
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
      { returnDocument: "after", session },
    ).lean()) as ApiKeyDoc | null;

    if (!updated) {
      return null;
    }
    await injectBillingFault("adjust.afterBalanceUpdate");

    await ApiKeyBillingEventModel.create(
      [
        {
          operationId,
          keyId: updated.keyId,
          userId: updated.userId,
          type: "adjustment",
          state: "completed",
          permission: "billing",
          billingMode: normalizeBillingMode(updated.billingMode),
          costCredits: 0,
          balanceDelta: credits,
          balanceAfter: roundCredits(updated.balanceCredits),
          method: null,
          route: null,
          statusCode: null,
          requestId,
          reason: opts.reason?.trim().slice(0, 200) || "管理员调整余额",
          actorUserId: opts.actorUserId,
          reservationExpiresAt: null,
          finalizedAt: new Date(),
        },
      ],
      { session },
    );
    await injectBillingFault("adjust.afterEventWrite");

    return { balanceCredits: roundCredits(updated.balanceCredits) };
  });
}

async function reconcileReservation(operationId: string): Promise<void> {
  const now = new Date();
  await runBillingTransaction(async (session) => {
    const event = (await ApiKeyBillingEventModel.findOne({ operationId, state: "pending" })
      .session(session)
      .lean()) as ApiKeyBillingEventDoc | null;
    if (!event || !event.reservationExpiresAt || event.reservationExpiresAt > now) return;

    let balanceAfter = event.balanceAfter;
    if (event.billingMode === "prepaid") {
      const refunded = (await ApiKeyModel.findOneAndUpdate(
        { keyId: event.keyId },
        { $inc: { balanceCredits: event.costCredits }, $set: { updatedAt: now } },
        { returnDocument: "after", session },
      ).lean()) as ApiKeyDoc | null;
      if (!refunded) {
        throw billingError("过期预留对应的 API Key 不存在", 500, "BILLING_RECONCILIATION_KEY_MISSING");
      }
      balanceAfter = roundCredits(refunded.balanceCredits);
    }

    const reconciled = await ApiKeyBillingEventModel.findOneAndUpdate(
      { operationId, state: "pending" },
      {
        $set: {
          type: event.billingMode === "prepaid" ? "refund" : "waived",
          state: "completed",
          costCredits: 0,
          balanceDelta: event.billingMode === "prepaid" ? event.costCredits : 0,
          balanceAfter,
          reason: "计费结算超时，由 reconciliation 安全取消预留",
          finalizedAt: now,
          reservationExpiresAt: null,
        },
      },
      { returnDocument: "after", session },
    ).lean();
    if (!reconciled) {
      throw billingError("过期预留已被并发处理，事务已回滚", 409, "BILLING_RECONCILIATION_CONFLICT");
    }
  });
}

export async function reconcileStaleApiKeyBillingReservations(limit = 100): Promise<number> {
  const stale = (await ApiKeyBillingEventModel.find({
    type: "reservation",
    state: "pending",
    reservationExpiresAt: { $lte: new Date() },
  })
    .sort({ reservationExpiresAt: 1 })
    .limit(Math.min(Math.max(limit, 1), 500))
    .lean()) as ApiKeyBillingEventDoc[];

  let reconciled = 0;
  for (const event of stale) {
    try {
      await reconcileReservation(event.operationId);
      reconciled++;
    } catch (error) {
      if ((error as { statusCode?: number })?.statusCode === 409) continue;
      throw error;
    }
  }
  return reconciled;
}

export function startApiKeyBillingReconciliation(): void {
  if (reconciliationTimer) return;

  const run = () => {
    reconcileStaleApiKeyBillingReservations().catch((error) => {
      logger.error("[ApiKeyBilling] reconciliation 失败", {
        error: error instanceof Error ? error.message : String(error),
      });
    });
  };
  run();
  reconciliationTimer = setInterval(run, RECONCILIATION_INTERVAL_MS);
  reconciliationTimer.unref?.();
}

export function stopApiKeyBillingReconciliation(): void {
  if (!reconciliationTimer) return;
  clearInterval(reconciliationTimer);
  reconciliationTimer = null;
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
