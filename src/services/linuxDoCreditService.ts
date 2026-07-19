import crypto from "node:crypto";
import axios from "axios";
import { config } from "../config/config";
import {
  LinuxDoCreditOrderModel,
  type LinuxDoCreditOrderDoc,
  type LinuxDoCreditProtocol,
} from "../models/linuxDoCreditOrderModel";
import { ApiKeyModel } from "../models/apiKeyModel";
import { adjustApiKeyBalance } from "./apiKeyBillingService";
import logger from "../utils/logger";

const ORDER_TTL_MS = 30 * 60 * 1000;
const MAX_MONEY = 100_000;
const MIN_MONEY = 0.01;

export interface LinuxDoCreditPublicConfig {
  enabled: boolean;
  protocol: LinuxDoCreditProtocol;
  gatewayBase: string;
  creditRate: number;
  minMoney: number;
  maxMoney: number;
  pidConfigured: boolean;
}

export interface CreateRechargeInput {
  userId: string;
  keyId: string;
  money: number;
  orderName?: string;
  isAdmin?: boolean;
}

export interface CreateRechargeResult {
  outTradeNo: string;
  money: number;
  credits: number;
  orderName: string;
  payUrl: string | null;
  formAction: string;
  formFields: Record<string, string>;
  expiresAt: string;
  status: string;
}

export interface LinuxDoCreditOrderView {
  outTradeNo: string;
  tradeNo: string | null;
  keyId: string;
  money: number;
  credits: number;
  orderName: string;
  status: string;
  payUrl: string | null;
  paidAt: string | null;
  creditedAt: string | null;
  expiresAt: string;
  createdAt: string;
}

function creditConfig() {
  return config.linuxdoCredit;
}

function roundMoney(value: number): number {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function formatMoney(value: number): string {
  return roundMoney(value).toFixed(2);
}

function isFinitePositiveMoney(value: number): boolean {
  return Number.isFinite(value) && value >= MIN_MONEY && value <= MAX_MONEY;
}

function buildOutTradeNo(): string {
  const stamp = new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
  const rand = crypto.randomBytes(4).toString("hex");
  return `LDC${stamp}${rand}`.slice(0, 32);
}

function sortAndJoin(params: Record<string, string>): string {
  return Object.keys(params)
    .filter((key) => key !== "sign" && key !== "sign_type" && params[key] !== "" && params[key] != null)
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join("&");
}

export function signEpayParams(params: Record<string, string>, secret: string): string {
  const payload = `${sortAndJoin(params)}${secret}`;
  return crypto.createHash("md5").update(payload, "utf8").digest("hex");
}

export function signLdcParams(params: Record<string, string>, secret: string, privateKeyPem: string): string {
  const payload = `${sortAndJoin(params)}${secret}`;
  const key = crypto.createPrivateKey(privateKeyPem);
  const signature = crypto.sign(null, Buffer.from(payload, "utf8"), key);
  return signature.toString("base64");
}

export function verifyEpayNotify(params: Record<string, string>, secret: string): boolean {
  const provided = params.sign;
  if (!provided) return false;
  const expected = signEpayParams(params, secret);
  const left = Buffer.from(expected);
  const right = Buffer.from(String(provided).toLowerCase());
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

function toOrderView(doc: LinuxDoCreditOrderDoc): LinuxDoCreditOrderView {
  return {
    outTradeNo: doc.outTradeNo,
    tradeNo: doc.tradeNo,
    keyId: doc.keyId,
    money: doc.money,
    credits: doc.credits,
    orderName: doc.orderName,
    status: doc.status,
    payUrl: doc.payUrl,
    paidAt: doc.paidAt ? doc.paidAt.toISOString() : null,
    creditedAt: doc.creditedAt ? doc.creditedAt.toISOString() : null,
    expiresAt: doc.expiresAt.toISOString(),
    createdAt: doc.createdAt.toISOString(),
  };
}

export function getLinuxDoCreditPublicConfig(): LinuxDoCreditPublicConfig {
  const cfg = creditConfig();
  return {
    enabled: cfg.enabled && Boolean(cfg.pid && cfg.key),
    protocol: cfg.protocol,
    gatewayBase: cfg.gatewayBase,
    creditRate: cfg.creditRate,
    minMoney: MIN_MONEY,
    maxMoney: Math.min(MAX_MONEY, cfg.maxMoney),
    pidConfigured: Boolean(cfg.pid),
  };
}

function buildNotifyUrl(): string {
  const cfg = creditConfig();
  if (cfg.notifyUrl) return cfg.notifyUrl;
  return `${config.baseUrl.replace(/\/+$/, "")}/api/linuxdo-credit/notify`;
}

function buildReturnUrl(outTradeNo: string): string {
  const cfg = creditConfig();
  if (cfg.returnUrl) {
    const base = cfg.returnUrl.replace(/\/+$/, "");
    const joiner = base.includes("?") ? "&" : "?";
    return `${base}${joiner}out_trade_no=${encodeURIComponent(outTradeNo)}`;
  }
  return `${config.frontendBaseUrl.replace(/\/+$/, "")}/api-keys?linuxdo_credit=1&out_trade_no=${encodeURIComponent(outTradeNo)}`;
}

function buildSubmitParams(input: {
  outTradeNo: string;
  money: number;
  orderName: string;
}): { protocol: LinuxDoCreditProtocol; formFields: Record<string, string>; formAction: string } {
  const cfg = creditConfig();
  const money = formatMoney(input.money);
  const notifyUrl = buildNotifyUrl();
  const returnUrl = buildReturnUrl(input.outTradeNo);
  const formAction = `${cfg.gatewayBase.replace(/\/+$/, "")}/pay/submit.php`;

  if (cfg.protocol === "ldc") {
    if (!cfg.privateKey) {
      throw Object.assign(new Error("LINUX DO Credit 官方协议需要配置 Ed25519 商户私钥"), {
        statusCode: 503,
        code: "LINUXDO_CREDIT_PRIVATE_KEY_MISSING",
      });
    }
    const base: Record<string, string> = {
      client_id: cfg.pid,
      type: "ldcpay",
      out_trade_no: input.outTradeNo,
      money,
      order_name: input.orderName,
      notify_url: notifyUrl,
      return_url: returnUrl,
    };
    const sign = signLdcParams(base, cfg.key, cfg.privateKey);
    return { protocol: "ldc", formAction, formFields: { ...base, sign } };
  }

  const base: Record<string, string> = {
    pid: cfg.pid,
    type: "epay",
    out_trade_no: input.outTradeNo,
    name: input.orderName,
    money,
    notify_url: notifyUrl,
    return_url: returnUrl,
    sign_type: "MD5",
  };
  const sign = signEpayParams(base, cfg.key);
  return { protocol: "epay", formAction, formFields: { ...base, sign } };
}

async function resolvePayUrl(formAction: string, formFields: Record<string, string>): Promise<string | null> {
  try {
    const body = new URLSearchParams(formFields).toString();
    const response = await axios.post(formAction, body, {
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json,text/html" },
      maxRedirects: 0,
      validateStatus: () => true,
      timeout: 15_000,
    });

    const location = response.headers?.location || response.headers?.Location;
    if (typeof location === "string" && location.trim()) {
      if (location.startsWith("http://") || location.startsWith("https://")) return location.trim();
      if (location.startsWith("/")) return `https://credit.linux.do${location}`;
      return location.trim();
    }

    if (response.data && typeof response.data === "object") {
      const data = response.data as Record<string, unknown>;
      if (typeof data.error_msg === "string" && data.error_msg) {
        throw Object.assign(new Error(data.error_msg), {
          statusCode: 400,
          code: "LINUXDO_CREDIT_SUBMIT_FAILED",
        });
      }
      if (typeof data.payurl === "string") return data.payurl;
      if (typeof data.payUrl === "string") return data.payUrl;
      if (typeof data.url === "string") return data.url;
    }

    if (typeof response.data === "string") {
      const match = response.data.match(/https:\/\/credit\.linux\.do\/paying\?[^"'<\s]+/i);
      if (match?.[0]) return match[0];
    }
  } catch (error) {
    if ((error as any)?.code === "LINUXDO_CREDIT_SUBMIT_FAILED") throw error;
    logger.warn("[LinuxDoCredit] submit probe failed, falling back to client form post", {
      message: error instanceof Error ? error.message : String(error),
    });
  }
  return null;
}

export async function createLinuxDoCreditRecharge(input: CreateRechargeInput): Promise<CreateRechargeResult> {
  const publicCfg = getLinuxDoCreditPublicConfig();
  if (!publicCfg.enabled) {
    throw Object.assign(new Error("LINUX DO Credit 未启用或未配置商户凭据"), {
      statusCode: 503,
      code: "LINUXDO_CREDIT_DISABLED",
    });
  }

  const money = roundMoney(input.money);
  if (!isFinitePositiveMoney(money) || money > publicCfg.maxMoney) {
    throw Object.assign(new Error(`充值积分必须在 ${MIN_MONEY} ~ ${publicCfg.maxMoney} 之间`), {
      statusCode: 400,
      code: "INVALID_MONEY",
    });
  }

  const key = await ApiKeyModel.findOne({ keyId: input.keyId }).lean();
  if (!key) {
    throw Object.assign(new Error("API Key 不存在"), { statusCode: 404, code: "API_KEY_NOT_FOUND" });
  }
  if (!input.isAdmin && key.userId !== input.userId) {
    throw Object.assign(new Error("无权为该 API Key 充值"), { statusCode: 403, code: "API_KEY_FORBIDDEN" });
  }
  if (key.billingMode !== "prepaid") {
    throw Object.assign(new Error("仅预付费（prepaid）API Key 支持 LINUX DO Credit 充值"), {
      statusCode: 400,
      code: "API_KEY_NOT_PREPAID",
    });
  }
  if (key.billingEnabled === false) {
    throw Object.assign(new Error("该 API Key 已关闭计费，无法充值"), {
      statusCode: 400,
      code: "API_KEY_BILLING_DISABLED",
    });
  }

  const credits = roundMoney(money * publicCfg.creditRate);
  const orderName = (input.orderName || `API Key 充值 ${input.keyId}`).trim().slice(0, 64) || "API Key 充值";
  const outTradeNo = buildOutTradeNo();
  const { protocol, formAction, formFields } = buildSubmitParams({ outTradeNo, money, orderName });
  const payUrl = await resolvePayUrl(formAction, formFields);
  const expiresAt = new Date(Date.now() + ORDER_TTL_MS);

  await LinuxDoCreditOrderModel.create({
    outTradeNo,
    tradeNo: null,
    userId: input.userId,
    keyId: input.keyId,
    protocol,
    money,
    credits,
    orderName,
    status: "pending",
    payUrl,
    notifyPayload: null,
    paidAt: null,
    creditedAt: null,
    creditOperationId: null,
    failReason: null,
    expiresAt,
  });

  logger.info("[LinuxDoCredit] order created", {
    outTradeNo,
    userId: input.userId,
    keyId: input.keyId,
    money,
    credits,
    protocol,
    hasPayUrl: Boolean(payUrl),
  });

  return {
    outTradeNo,
    money,
    credits,
    orderName,
    payUrl,
    formAction,
    formFields,
    expiresAt: expiresAt.toISOString(),
    status: "pending",
  };
}

async function creditOrderIfNeeded(order: LinuxDoCreditOrderDoc, tradeNo: string | null): Promise<LinuxDoCreditOrderDoc> {
  if (order.status === "paid" && order.creditedAt) {
    return order;
  }

  const result = await adjustApiKeyBalance({
    keyId: order.keyId,
    credits: order.credits,
    reason: `LINUX DO Credit 充值 ${order.outTradeNo}`,
    actorUserId: order.userId,
    requestId: `linuxdo-credit:${order.outTradeNo}`,
  });

  if (!result) {
    throw Object.assign(new Error("充值入账失败：API Key 不存在或余额更新失败"), {
      statusCode: 500,
      code: "CREDIT_APPLY_FAILED",
    });
  }

  const updated = (await LinuxDoCreditOrderModel.findOneAndUpdate(
    { outTradeNo: order.outTradeNo, status: { $ne: "paid" } },
    {
      $set: {
        status: "paid",
        tradeNo: tradeNo || order.tradeNo,
        paidAt: new Date(),
        creditedAt: new Date(),
        creditOperationId: `linuxdo-credit:${order.outTradeNo}`,
        failReason: null,
      },
    },
    { returnDocument: "after" },
  ).lean()) as LinuxDoCreditOrderDoc | null;

  if (updated) return updated;

  const existing = (await LinuxDoCreditOrderModel.findOne({ outTradeNo: order.outTradeNo }).lean()) as
    | LinuxDoCreditOrderDoc
    | null;
  if (!existing) {
    throw Object.assign(new Error("订单不存在"), { statusCode: 404, code: "ORDER_NOT_FOUND" });
  }
  return existing;
}

export async function handleLinuxDoCreditNotify(
  rawParams: Record<string, unknown>,
): Promise<{ ok: boolean; message: string }> {
  const cfg = creditConfig();
  if (!cfg.enabled || !cfg.pid || !cfg.key) {
    return { ok: false, message: "credit disabled" };
  }

  const params: Record<string, string> = {};
  for (const [key, value] of Object.entries(rawParams)) {
    if (value == null) continue;
    if (Array.isArray(value)) {
      params[key] = String(value[0] ?? "");
    } else {
      params[key] = String(value);
    }
  }

  const pid = params.pid || params.client_id;
  if (pid && pid !== cfg.pid) {
    logger.warn("[LinuxDoCredit] notify pid mismatch", { pid });
    return { ok: false, message: "pid mismatch" };
  }

  if (params.sign && !verifyEpayNotify(params, cfg.key)) {
    logger.warn("[LinuxDoCredit] notify signature invalid", { outTradeNo: params.out_trade_no });
    return { ok: false, message: "bad sign" };
  }

  if (params.trade_status && params.trade_status !== "TRADE_SUCCESS") {
    return { ok: false, message: "trade not success" };
  }

  const outTradeNo = params.out_trade_no;
  if (!outTradeNo) {
    return { ok: false, message: "missing out_trade_no" };
  }

  const order = (await LinuxDoCreditOrderModel.findOne({ outTradeNo }).lean()) as LinuxDoCreditOrderDoc | null;
  if (!order) {
    logger.warn("[LinuxDoCredit] notify for unknown order", { outTradeNo });
    return { ok: false, message: "order not found" };
  }

  if (order.status === "paid") {
    return { ok: true, message: "already paid" };
  }

  if (params.money != null && params.money !== "") {
    const notifiedMoney = roundMoney(Number(params.money));
    if (Number.isFinite(notifiedMoney) && Math.abs(notifiedMoney - order.money) > 0.001) {
      logger.error("[LinuxDoCredit] notify money mismatch", {
        outTradeNo,
        expected: order.money,
        got: notifiedMoney,
      });
      await LinuxDoCreditOrderModel.updateOne(
        { outTradeNo },
        { $set: { failReason: `money mismatch: expected ${order.money}, got ${notifiedMoney}`, notifyPayload: params } },
      );
      return { ok: false, message: "money mismatch" };
    }
  }

  await LinuxDoCreditOrderModel.updateOne({ outTradeNo }, { $set: { notifyPayload: params } });

  try {
    await creditOrderIfNeeded(order, params.trade_no || null);
    logger.info("[LinuxDoCredit] order paid and credited", {
      outTradeNo,
      keyId: order.keyId,
      credits: order.credits,
    });
    return { ok: true, message: "success" };
  } catch (error) {
    logger.error("[LinuxDoCredit] credit apply failed on notify", {
      outTradeNo,
      error: error instanceof Error ? error.message : String(error),
    });
    await LinuxDoCreditOrderModel.updateOne(
      { outTradeNo },
      { $set: { failReason: error instanceof Error ? error.message : String(error) } },
    );
    return { ok: false, message: "credit failed" };
  }
}

export async function queryLinuxDoCreditOrder(opts: {
  outTradeNo: string;
  userId: string;
  isAdmin?: boolean;
}): Promise<LinuxDoCreditOrderView | null> {
  const order = (await LinuxDoCreditOrderModel.findOne({ outTradeNo: opts.outTradeNo }).lean()) as
    | LinuxDoCreditOrderDoc
    | null;
  if (!order) return null;
  if (!opts.isAdmin && order.userId !== opts.userId) return null;

  if (order.status === "pending") {
    await syncOrderFromRemote(order).catch((error) => {
      logger.debug("[LinuxDoCredit] remote poll failed", {
        outTradeNo: order.outTradeNo,
        error: error instanceof Error ? error.message : String(error),
      });
    });
    const refreshed = (await LinuxDoCreditOrderModel.findOne({ outTradeNo: opts.outTradeNo }).lean()) as
      | LinuxDoCreditOrderDoc
      | null;
    return refreshed ? toOrderView(refreshed) : null;
  }

  return toOrderView(order);
}

export async function listLinuxDoCreditOrders(opts: {
  userId: string;
  isAdmin?: boolean;
  keyId?: string;
  limit?: number;
}): Promise<LinuxDoCreditOrderView[]> {
  const filter: Record<string, unknown> = {};
  if (!opts.isAdmin) filter.userId = opts.userId;
  if (opts.keyId) filter.keyId = opts.keyId;
  const limit = Math.min(Math.max(Number(opts.limit) || 20, 1), 100);
  const docs = (await LinuxDoCreditOrderModel.find(filter)
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean()) as LinuxDoCreditOrderDoc[];
  return docs.map(toOrderView);
}

async function syncOrderFromRemote(order: LinuxDoCreditOrderDoc): Promise<void> {
  const cfg = creditConfig();
  if (!cfg.pid || !cfg.key) return;

  const apiUrl = `${cfg.gatewayBase.replace(/\/+$/, "")}/api.php`;
  const response = await axios.get(apiUrl, {
    params: {
      act: "order",
      pid: cfg.pid,
      key: cfg.key,
      out_trade_no: order.outTradeNo,
    },
    timeout: 10_000,
    validateStatus: () => true,
  });

  if (response.status === 404) return;
  const data = response.data as Record<string, unknown> | undefined;
  if (!data || Number(data.code) !== 1) return;

  if (Number(data.status) === 1) {
    await creditOrderIfNeeded(order, typeof data.trade_no === "string" ? data.trade_no : null);
    return;
  }

  if (order.expiresAt.getTime() < Date.now()) {
    await LinuxDoCreditOrderModel.updateOne(
      { outTradeNo: order.outTradeNo, status: "pending" },
      { $set: { status: "expired" } },
    );
  }
}