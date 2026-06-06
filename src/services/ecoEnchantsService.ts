import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import { v4 as uuidv4 } from "uuid";
import { config } from "../config/config";
import {
  EcoEnchantsActivationModel,
  EcoEnchantsAuditLogModel,
  EcoEnchantsIdempotencyRecordModel,
  EcoEnchantsLicenseModel,
  type EcoEnchantsLicenseStatus,
  EcoEnchantsPlanModel,
  EcoEnchantsProductModel,
  EcoEnchantsReleaseBuildModel,
  EcoEnchantsRiskEventModel,
  EcoEnchantsTelemetryEventModel,
  EcoEnchantsWebhookEventModel,
  type IEcoEnchantsActivation,
  type IEcoEnchantsLicense,
  type IEcoEnchantsPlan,
  type IEcoEnchantsProduct,
  type IEcoEnchantsReleaseBuild,
} from "../models/ecoEnchantsModel";
import { createEcoEnchantsOpsActivationSession } from "./ecoEnchantsOpsTokens";
import logger from "../utils/logger";

export const ECO_ENCHANTS_PRODUCT_ID = "ecoenchants";

export type EcoEnchantsRuntimeStatus =
  | EcoEnchantsLicenseStatus
  | "activation_limit_exceeded"
  | "invalid"
  | "tampered"
  | "server_error";

export interface EcoEnchantsRequestContext {
  requestId: string;
  ip?: string;
  userAgent?: string;
  method?: string;
  path?: string;
  actorId?: string;
  actorType?: "customer" | "admin" | "license" | "webhook" | "system";
}

export interface LicenseVerifyRequest {
  productId: string;
  licenseKey: string;
  installationId: string;
  server?: {
    platform?: string;
    platformVersion?: string;
    minecraftVersion?: string;
    onlineMode?: boolean;
    javaVersion?: string;
    name?: string;
  };
  plugin?: {
    version?: string;
    channel?: string;
    buildFingerprint?: string;
  };
}

export interface LicenseActivateRequest {
  productId: string;
  licenseKey: string;
  installationId: string;
  instanceName?: string;
}

export interface LicenseDeactivateRequest {
  productId: string;
  licenseKey: string;
  installationId: string;
  reason?: string;
}

export interface RuntimeTelemetryEventsRequest {
  productId: string;
  installationId: string;
  activationId?: string;
  plugin?: Record<string, unknown>;
  server?: Record<string, unknown>;
  batch?: Record<string, unknown>;
  events?: unknown[];
}

export interface RuntimeTelemetryHeaders {
  authorization?: string;
  idempotencyKey?: string;
  productId?: string;
  installationId?: string;
  pluginVersion?: string;
}

export interface EcoEnchantsRuntimeActivationTokenPayload {
  productId: string;
  licenseId: string;
  activationId: string;
  installationIdHash: string;
  scope: "runtime.telemetry";
}

export interface IdempotentResponse<T extends Record<string, unknown>> {
  statusCode: number;
  body: T;
  replayed: boolean;
}

export interface ServiceResponse<T extends Record<string, unknown>> {
  statusCode: number;
  body: T;
}

export class EcoEnchantsServiceError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly retryAfterSeconds: number | null;

  constructor(statusCode: number, code: string, message: string, retryAfterSeconds: number | null = null) {
    super(message);
    this.name = "EcoEnchantsServiceError";
    this.statusCode = statusCode;
    this.code = code;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

function serviceError(
  statusCode: number,
  code: string,
  message: string,
  retryAfterSeconds: number | null = null,
): EcoEnchantsServiceError {
  return new EcoEnchantsServiceError(statusCode, code, message, retryAfterSeconds);
}

function getLicensePepper(): string {
  return (
    process.env.ECOENCHANTS_LICENSE_PEPPER ||
    process.env.LICENSE_KEY_PEPPER ||
    process.env.JWT_SECRET ||
    config.jwtSecret ||
    "ecoenchants-development-pepper"
  );
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }

  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, entryValue]) => entryValue !== undefined)
    .sort(([left], [right]) => left.localeCompare(right));
  return `{${entries.map(([key, entryValue]) => `${JSON.stringify(key)}:${stableStringify(entryValue)}`).join(",")}}`;
}

function hmacHex(value: string): string {
  return crypto.createHmac("sha256", getLicensePepper()).update(value).digest("hex");
}

function sha256Hex(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function normalizeLicenseKey(value: string): string {
  return value.trim().toUpperCase();
}

function normalizeInstallationId(value: string): string {
  return value.trim();
}

function normalizeProductId(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function keyLast4(licenseKey: string): string {
  const compact = licenseKey.replace(/[^a-zA-Z0-9]/g, "");
  return compact.slice(-4).toUpperCase();
}

function maskLicenseKey(last4: string): string {
  return `****-****-****-${last4}`;
}

function hashLicenseKey(licenseKey: string): string {
  return hmacHex(`license:${normalizeLicenseKey(licenseKey)}`);
}

function hashInstallationId(installationId: string): string {
  return hmacHex(`installation:${normalizeInstallationId(installationId)}`);
}

function getRuntimeActivationTokenSecret(): string {
  return process.env.ECOENCHANTS_ACTIVATION_TOKEN_SECRET || process.env.ECOENCHANTS_RUNTIME_TOKEN_SECRET || config.jwtSecret;
}

function getRuntimeActivationTokenTtlSeconds(): number {
  const parsed = Number(process.env.ECOENCHANTS_ACTIVATION_TOKEN_TTL_SECONDS || 24 * 60 * 60);
  if (!Number.isFinite(parsed) || parsed <= 0) return 24 * 60 * 60;
  return Math.min(Math.max(Math.floor(parsed), 5 * 60), 30 * 24 * 60 * 60);
}

function createEcoEnchantsRuntimeActivationSession(params: {
  productId: string;
  licenseId: string;
  activationId: string;
  installationId: string;
}): { token: string; expiresAt: Date } {
  const expiresInSeconds = getRuntimeActivationTokenTtlSeconds();
  const installationIdHash = hashInstallationId(params.installationId);
  const expiresAt = new Date(Date.now() + expiresInSeconds * 1000);
  const token = jwt.sign(
    {
      productId: params.productId,
      licenseId: params.licenseId,
      activationId: params.activationId,
      installationIdHash,
      scope: "runtime.telemetry",
    },
    getRuntimeActivationTokenSecret(),
    {
      expiresIn: expiresInSeconds,
      jwtid: `rtel_${uuidv4()}`,
      subject: params.activationId,
    },
  );

  return { token, expiresAt };
}

export function verifyEcoEnchantsRuntimeActivationToken(token: string): EcoEnchantsRuntimeActivationTokenPayload {
  const decoded = jwt.verify(token, getRuntimeActivationTokenSecret()) as Partial<EcoEnchantsRuntimeActivationTokenPayload>;
  if (
    decoded.scope !== "runtime.telemetry" ||
    typeof decoded.productId !== "string" ||
    typeof decoded.licenseId !== "string" ||
    typeof decoded.activationId !== "string" ||
    typeof decoded.installationIdHash !== "string"
  ) {
    throw new Error("Invalid EcoEnchants runtime activation token.");
  }

  return decoded as EcoEnchantsRuntimeActivationTokenPayload;
}

function generateLicenseKey(): string {
  const raw = crypto.randomBytes(6).toString("hex").toUpperCase();
  return `ECOE-${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}`;
}

function normalizeSha256(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase().replace(/^sha256:/, "");
  if (!/^[a-f0-9]{64}$/.test(normalized)) return null;
  return normalized;
}

function normalizeChannel(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) return "stable";
  return value.trim().toLowerCase();
}

function cleanString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value.trim() : fallback;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value) && !Buffer.isBuffer(value));
}

function parseOptionalDate(value: unknown): Date | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) {
    throw serviceError(400, "invalid_date", "Date value is invalid.");
  }
  return date;
}

function ensureProductId(productId: unknown): string {
  const normalized = normalizeProductId(productId);
  if (!normalized || normalized !== ECO_ENCHANTS_PRODUCT_ID) {
    throw serviceError(400, "invalid_product_id", "Product ID is invalid.");
  }
  return normalized;
}

function ensureRequiredText(value: unknown, field: string, maxLength = 256): string {
  if (typeof value !== "string") {
    throw serviceError(400, "invalid_request", `${field} is required.`);
  }
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > maxLength) {
    throw serviceError(400, "invalid_request", `${field} is invalid.`);
  }
  return trimmed;
}

function toIsoOrNull(date: Date | string | undefined | null): string | null {
  if (!date) return null;
  const parsed = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

function isDuplicateKeyError(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && (error as any).code === 11000);
}

function getMaxTelemetryBatchSize(): number {
  const parsed = Number(process.env.ECOENCHANTS_TELEMETRY_MAX_BATCH_SIZE || 500);
  if (!Number.isFinite(parsed) || parsed < 100) return 500;
  return Math.min(Math.floor(parsed), 5000);
}

function parseTelemetryTimestamp(value: unknown): Date | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function getTelemetrySensitiveRetentionUntil(payload: Record<string, unknown>): Date | undefined {
  const raw = stableStringify(payload).toLowerCase();
  const hasRawNetwork = raw.includes("raw-network") || raw.includes("rawnetwork") || raw.includes("raw_ip") || raw.includes("rawip");
  const hasRawText = raw.includes("raw-text") || raw.includes("rawtext") || raw.includes("captureraw");
  if (!hasRawNetwork && !hasRawText) return undefined;
  return new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
}

function getBearerToken(authorization: unknown): string {
  const header = cleanString(authorization);
  const [type, token] = header.split(" ");
  if (type !== "Bearer" || !token) {
    throw serviceError(401, "invalid_activation_token", "Activation token is missing, expired, or revoked.", 300);
  }
  return token;
}

function validateTelemetryEvent(
  value: unknown,
  index: number,
): { ok: true; event: { eventId: string; timestamp: Date; category: string; payload: Record<string, unknown> } } | {
  ok: false;
  rejected: { eventId: string | null; code: string; message: string; index: number };
} {
  if (!isPlainObject(value)) {
    return {
      ok: false,
      rejected: {
        eventId: null,
        code: "invalid_event",
        message: "Event must be an object.",
        index,
      },
    };
  }

  const eventId = cleanString(value.eventId);
  if (!eventId || eventId.length > 128) {
    return {
      ok: false,
      rejected: {
        eventId: eventId || null,
        code: "invalid_event_id",
        message: "eventId is required.",
        index,
      },
    };
  }

  const timestamp = parseTelemetryTimestamp(value.timestamp);
  if (!timestamp) {
    return {
      ok: false,
      rejected: {
        eventId,
        code: "invalid_timestamp",
        message: "timestamp must be an ISO-8601 date.",
        index,
      },
    };
  }

  const category = cleanString(value.category);
  if (!category || category.length > 120) {
    return {
      ok: false,
      rejected: {
        eventId,
        code: "invalid_category",
        message: "category is required.",
        index,
      },
    };
  }

  if (!isPlainObject(value.payload)) {
    return {
      ok: false,
      rejected: {
        eventId,
        code: "invalid_payload",
        message: "payload must be an object.",
        index,
      },
    };
  }

  return {
    ok: true,
    event: {
      eventId,
      timestamp,
      category,
      payload: value.payload,
    },
  };
}

function getRuntimeLicenseStatus(license: IEcoEnchantsLicense, now: Date): EcoEnchantsRuntimeStatus {
  if ((license.status === "valid" || license.status === "trial") && license.expiresAt && license.expiresAt < now) {
    return "expired";
  }
  return license.status;
}

function isAllowedRuntimeStatus(status: EcoEnchantsRuntimeStatus): boolean {
  return status === "valid" || status === "trial";
}

function getActivationSummary(activation: IEcoEnchantsActivation) {
  return {
    activationId: activation.activationId,
    installationIdHash: activation.installationIdHash,
    name: activation.name || null,
    status: activation.status,
    pluginVersion: activation.pluginVersion || null,
    platform: activation.platform || null,
    lastBuildFingerprint: activation.lastBuildFingerprint || null,
    lastSeenAt: toIsoOrNull(activation.lastSeenAt),
    createdAt: toIsoOrNull(activation.createdAt),
  };
}

function getLicenseSummary(license: IEcoEnchantsLicense) {
  return {
    licenseId: license.licenseId,
    productId: license.productId,
    customerId: license.customerId,
    plan: license.planId,
    key: maskLicenseKey(license.keyLast4),
    keyLast4: license.keyLast4,
    status: license.status,
    maxActivations: license.maxActivations,
    expiresAt: toIsoOrNull(license.expiresAt),
    createdAt: toIsoOrNull(license.createdAt),
    updatedAt: toIsoOrNull(license.updatedAt),
  };
}

function sanitizeHeaders(headers: Record<string, unknown>): Record<string, string> {
  const safe: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (Array.isArray(value)) {
      safe[key.toLowerCase()] = value.join(",");
    } else if (typeof value === "string") {
      safe[key.toLowerCase()] = value.slice(0, 1000);
    }
  }
  return safe;
}

function safeTimingEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left, "utf8");
  const rightBuffer = Buffer.from(right, "utf8");
  if (leftBuffer.length !== rightBuffer.length) return false;
  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function verifyGenericHmacSignature(rawPayload: string, signature: string, secret: string): boolean {
  const cleanedSignature = signature.trim().replace(/^sha256=/i, "");
  const digest = crypto.createHmac("sha256", secret).update(rawPayload).digest("hex");
  return safeTimingEqual(cleanedSignature, digest);
}

function verifyStripeSignature(rawPayload: string, signatureHeader: string, secret: string): boolean {
  const parts = signatureHeader.split(",").reduce<Record<string, string[]>>((acc, part) => {
    const [key, value] = part.split("=", 2);
    if (key && value) {
      acc[key] = [...(acc[key] || []), value];
    }
    return acc;
  }, {});
  const timestamp = parts.t?.[0];
  const signatures = parts.v1 || [];
  if (!timestamp || signatures.length === 0) return false;
  const digest = crypto.createHmac("sha256", secret).update(`${timestamp}.${rawPayload}`).digest("hex");
  return signatures.some((signature) => safeTimingEqual(signature, digest));
}

function extractNestedString(payload: any, keys: string[]): string | undefined {
  for (const key of keys) {
    const parts = key.split(".");
    let cursor = payload;
    for (const part of parts) {
      cursor = cursor?.[part];
    }
    if (typeof cursor === "string" && cursor.trim()) {
      return cursor.trim();
    }
  }
  return undefined;
}

function appendSignedDownloadParams(downloadUrl: string, expiresAt: Date, build: IEcoEnchantsReleaseBuild): string {
  const secret = process.env.ECOENCHANTS_DOWNLOAD_URL_SIGNING_SECRET;
  if (!secret) return downloadUrl;

  try {
    const url = new URL(downloadUrl);
    const expires = Math.floor(expiresAt.getTime() / 1000).toString();
    const payload = `${build.productId}:${build.version}:${build.channel}:${build.sha256}:${expires}`;
    const signature = crypto.createHmac("sha256", secret).update(payload).digest("hex");
    url.searchParams.set("eco_expires", expires);
    url.searchParams.set("eco_sig", signature);
    return url.toString();
  } catch {
    return downloadUrl;
  }
}

export function verifyEcoEnchantsDownloadToken(token: string): { customerId?: string; licenseId?: string; productId?: string } {
  const secret = process.env.ECOENCHANTS_DOWNLOAD_TOKEN_SECRET || config.jwtSecret;
  const decoded = jwt.verify(token, secret) as any;
  return {
    customerId: typeof decoded.customerId === "string" ? decoded.customerId : undefined,
    licenseId: typeof decoded.licenseId === "string" ? decoded.licenseId : undefined,
    productId: typeof decoded.productId === "string" ? decoded.productId : undefined,
  };
}

export class EcoEnchantsService {
  static docsUrl(code: string): string {
    return `https://docs.example.com/ecoenchants/errors#${code}`;
  }

  static formatError(error: unknown, requestId: string) {
    if (error instanceof EcoEnchantsServiceError) {
      return {
        statusCode: error.statusCode,
        body: {
          requestId,
          error: {
            code: error.code,
            message: error.message,
            docsUrl: EcoEnchantsService.docsUrl(error.code),
            retryAfterSeconds: error.retryAfterSeconds,
          },
        },
      };
    }

    if (isDuplicateKeyError(error)) {
      return {
        statusCode: 409,
        body: {
          requestId,
          error: {
            code: "duplicate_key",
            message: "A resource with the same unique identifier already exists.",
            docsUrl: EcoEnchantsService.docsUrl("duplicate_key"),
            retryAfterSeconds: null,
          },
        },
      };
    }

    logger.error("[EcoEnchants] Unhandled service error", {
      requestId,
      error: error instanceof Error ? error.message : String(error),
    });

    return {
      statusCode: 500,
      body: {
        requestId,
        error: {
          code: "server_error",
          message: "EcoEnchants service failed.",
          docsUrl: EcoEnchantsService.docsUrl("server_error"),
          retryAfterSeconds: null,
        },
      },
    };
  }

  static async withIdempotency<T extends Record<string, unknown>>(
    params: {
      scope: string;
      key: string | undefined;
      method: string;
      path: string;
      body: unknown;
    },
    producer: () => Promise<ServiceResponse<T>>,
  ): Promise<IdempotentResponse<T>> {
    const key = ensureRequiredText(params.key, "Idempotency-Key", 200);
    const bodyHash = sha256Hex(stableStringify(params.body));
    const existing = await EcoEnchantsIdempotencyRecordModel.findOne({ scope: params.scope, key });

    if (existing) {
      if (existing.bodyHash !== bodyHash || existing.method !== params.method || existing.path !== params.path) {
        throw serviceError(409, "idempotency_conflict", "Idempotency key was already used with a different request.");
      }
      return {
        statusCode: existing.statusCode,
        body: existing.responseBody as T,
        replayed: true,
      };
    }

    const produced = await producer();
    try {
      await EcoEnchantsIdempotencyRecordModel.create({
        scope: params.scope,
        key,
        method: params.method,
        path: params.path,
        bodyHash,
        statusCode: produced.statusCode,
        responseBody: produced.body,
        createdAt: new Date(),
      });
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        const replay = await EcoEnchantsIdempotencyRecordModel.findOne({ scope: params.scope, key });
        if (replay) {
          return {
            statusCode: replay.statusCode,
            body: replay.responseBody as T,
            replayed: true,
          };
        }
      }
      throw error;
    }

    return { ...produced, replayed: false };
  }

  static async logAudit(
    context: EcoEnchantsRequestContext,
    entry: {
      action: string;
      targetType?: string;
      targetId?: string;
      result: "success" | "failure";
      detail?: Record<string, unknown>;
    },
  ): Promise<void> {
    try {
      await EcoEnchantsAuditLogModel.create({
        auditId: `aud_${uuidv4()}`,
        actorType: context.actorType || "system",
        actorId: context.actorId || "unknown",
        action: entry.action,
        targetType: entry.targetType,
        targetId: entry.targetId,
        result: entry.result,
        detail: entry.detail,
        requestId: context.requestId,
        ip: context.ip,
        userAgent: context.userAgent,
        createdAt: new Date(),
      });
    } catch (error) {
      logger.warn("[EcoEnchants] Failed to write audit log", {
        requestId: context.requestId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  static async getProductPolicy(productId = ECO_ENCHANTS_PRODUCT_ID, requestId: string = crypto.randomUUID()) {
    const normalizedProductId = ensureProductId(productId);
    const product = await EcoEnchantsProductModel.findOne({ productId: normalizedProductId, isActive: true });

    return {
      requestId,
      productId: normalizedProductId,
      latestVersion: product?.latestVersion || "13.0.0",
      minimumSupportedVersion: product?.minimumSupportedVersion || "12.5.0",
      recommendedJava: product?.recommendedJava || 21,
      supportedPlatforms: product?.supportedPlatforms?.length ? product.supportedPlatforms : ["Paper", "Folia"],
      notices: product?.notices || [],
    };
  }

  static async verifyLicense(request: LicenseVerifyRequest, context: EcoEnchantsRequestContext) {
    const productId = ensureProductId(request.productId);
    const licenseKey = ensureRequiredText(request.licenseKey, "licenseKey", 128);
    const installationId = ensureRequiredText(request.installationId, "installationId", 128);
    const requestId = context.requestId;
    const now = new Date();

    const license = await EcoEnchantsLicenseModel.findOne({
      productId,
      keyHash: hashLicenseKey(licenseKey),
    });

    if (!license) {
      return {
        requestId,
        status: "invalid" as EcoEnchantsRuntimeStatus,
        message: "License key is invalid.",
      };
    }

    const runtimeStatus = getRuntimeLicenseStatus(license, now);
    if (!isAllowedRuntimeStatus(runtimeStatus)) {
      await EcoEnchantsService.logAudit(
        { ...context, actorType: "license", actorId: license.licenseId },
        {
          action: "license.verify",
          targetType: "license",
          targetId: license.licenseId,
          result: "failure",
          detail: { status: runtimeStatus },
        },
      );
      return {
        requestId,
        status: runtimeStatus,
        message: "License is not allowed to run.",
      };
    }

    const buildStatus = await EcoEnchantsService.verifyBuildFingerprint(productId, request.plugin);
    if (buildStatus === "tampered") {
      await EcoEnchantsService.recordRiskEvent({
        productId,
        licenseId: license.licenseId,
        type: "build_fingerprint_mismatch",
        severity: "high",
        message: "Build fingerprint does not match an official release.",
        detail: {
          version: request.plugin?.version,
          channel: request.plugin?.channel,
          buildFingerprint: request.plugin?.buildFingerprint,
        },
      });
      return {
        requestId,
        status: "tampered" as EcoEnchantsRuntimeStatus,
        message: "Build fingerprint does not match an official release.",
      };
    }

    const activationResult = await EcoEnchantsService.ensureActivation(license, installationId, request, now);
    if (activationResult.status !== "active") {
      await EcoEnchantsService.logAudit(
        { ...context, actorType: "license", actorId: license.licenseId },
        {
          action: "license.verify",
          targetType: "license",
          targetId: license.licenseId,
          result: "failure",
          detail: { status: activationResult.responseStatus },
        },
      );
      return {
        requestId,
        status: activationResult.responseStatus,
        message: activationResult.message,
      };
    }

    await EcoEnchantsService.logAudit(
      { ...context, actorType: "license", actorId: license.licenseId },
      {
        action: "license.verify",
        targetType: "license",
        targetId: license.licenseId,
        result: "success",
        detail: {
          activationId: activationResult.activation.activationId,
          pluginVersion: request.plugin?.version,
          channel: request.plugin?.channel,
        },
      },
    );

    const activationSession = createEcoEnchantsRuntimeActivationSession({
      productId,
      licenseId: license.licenseId,
      activationId: activationResult.activation.activationId,
      installationId,
    });

    return {
      requestId,
      status: runtimeStatus,
      activationId: activationResult.activation.activationId,
      activationToken: activationSession.token,
      activationTokenExpiresAt: activationSession.expiresAt.toISOString(),
      license: {
        licenseId: license.licenseId,
        plan: license.planId,
        expiresAt: toIsoOrNull(license.expiresAt),
        maxActivations: license.maxActivations,
      },
      activation: {
        activationId: activationResult.activation.activationId,
        lastSeenAt: toIsoOrNull(activationResult.activation.lastSeenAt),
      },
    };
  }

  static async activateLicense(request: LicenseActivateRequest, context: EcoEnchantsRequestContext) {
    const productId = ensureProductId(request.productId);
    const licenseKey = ensureRequiredText(request.licenseKey, "licenseKey", 128);
    const installationId = ensureRequiredText(request.installationId, "installationId", 128);
    const license = await EcoEnchantsLicenseModel.findOne({
      productId,
      keyHash: hashLicenseKey(licenseKey),
    });

    if (!license) {
      throw serviceError(401, "invalid_license_key", "License key is invalid.");
    }

    const runtimeStatus = getRuntimeLicenseStatus(license, new Date());
    if (!isAllowedRuntimeStatus(runtimeStatus)) {
      throw serviceError(403, runtimeStatus, "License is not allowed to activate.");
    }

    const activationResult = await EcoEnchantsService.ensureActivation(
      license,
      installationId,
      {
        productId,
        licenseKey,
        installationId,
        server: { name: request.instanceName },
      },
      new Date(),
    );

    if (activationResult.status !== "active") {
      throw serviceError(403, activationResult.responseStatus, activationResult.message || "Activation failed.");
    }

    await EcoEnchantsService.logAudit(
      { ...context, actorType: "license", actorId: license.licenseId },
      {
        action: "license.activate",
        targetType: "activation",
        targetId: activationResult.activation.activationId,
        result: "success",
      },
    );

    const opsActivation = createEcoEnchantsOpsActivationSession({
      productId,
      licenseId: license.licenseId,
      activationId: activationResult.activation.activationId,
    });

    return {
      requestId: context.requestId,
      status: runtimeStatus,
      activationId: activationResult.activation.activationId,
      opsActivation: {
        token: opsActivation.token,
        keyId: opsActivation.keyId,
        expiresAt: opsActivation.expiresAt.toISOString(),
      },
    };
  }

  static async deactivateLicense(request: LicenseDeactivateRequest, context: EcoEnchantsRequestContext) {
    const productId = ensureProductId(request.productId);
    const licenseKey = ensureRequiredText(request.licenseKey, "licenseKey", 128);
    const installationId = ensureRequiredText(request.installationId, "installationId", 128);
    const license = await EcoEnchantsLicenseModel.findOne({
      productId,
      keyHash: hashLicenseKey(licenseKey),
    });

    if (!license) {
      throw serviceError(401, "invalid_license_key", "License key is invalid.");
    }

    const activation = await EcoEnchantsActivationModel.findOne({
      licenseId: license.licenseId,
      installationIdHash: hashInstallationId(installationId),
    });

    if (!activation) {
      throw serviceError(404, "activation_not_found", "Activation was not found.");
    }

    activation.status = "deactivated";
    activation.deactivatedAt = new Date();
    await activation.save();

    await EcoEnchantsService.logAudit(
      { ...context, actorType: "license", actorId: license.licenseId },
      {
        action: "license.deactivate",
        targetType: "activation",
        targetId: activation.activationId,
        result: "success",
        detail: { reason: request.reason },
      },
    );

    return {
      requestId: context.requestId,
      deactivated: true,
      deactivatedAt: activation.deactivatedAt.toISOString(),
    };
  }

  private static async ensureActivation(
    license: IEcoEnchantsLicense,
    installationId: string,
    request: LicenseVerifyRequest,
    now: Date,
  ): Promise<
    | { status: "active"; activation: IEcoEnchantsActivation }
    | { status: "denied"; responseStatus: EcoEnchantsRuntimeStatus; message: string }
  > {
    const installationIdHash = hashInstallationId(installationId);
    const existing = await EcoEnchantsActivationModel.findOne({
      licenseId: license.licenseId,
      installationIdHash,
    });

    if (existing?.status === "revoked") {
      return {
        status: "denied",
        responseStatus: "revoked",
        message: "Activation was revoked.",
      };
    }

    const activeCount = await EcoEnchantsActivationModel.countDocuments({
      licenseId: license.licenseId,
      status: "active",
    });

    if (!existing && activeCount >= license.maxActivations) {
      return {
        status: "denied",
        responseStatus: "activation_limit_exceeded",
        message: "Activation limit exceeded.",
      };
    }

    if (existing && existing.status !== "active" && activeCount >= license.maxActivations) {
      return {
        status: "denied",
        responseStatus: "activation_limit_exceeded",
        message: "Activation limit exceeded.",
      };
    }

    const patch = {
      status: "active" as const,
      name: request.server?.name || existing?.name || undefined,
      pluginVersion: request.plugin?.version,
      pluginChannel: request.plugin?.channel,
      platform: request.server?.platform,
      platformVersion: request.server?.platformVersion,
      minecraftVersion: request.server?.minecraftVersion,
      onlineMode: request.server?.onlineMode,
      javaVersion: request.server?.javaVersion,
      serverName: request.server?.name,
      lastBuildFingerprint: request.plugin?.buildFingerprint,
      lastSeenAt: now,
      deactivatedAt: undefined,
    };

    if (existing) {
      Object.assign(existing, patch);
      await existing.save();
      return { status: "active", activation: existing };
    }

    const created = await EcoEnchantsActivationModel.create({
      activationId: `act_${uuidv4()}`,
      licenseId: license.licenseId,
      installationIdHash,
      ...patch,
      createdAt: now,
      updatedAt: now,
    });
    return { status: "active", activation: created };
  }

  private static async verifyBuildFingerprint(
    productId: string,
    plugin: LicenseVerifyRequest["plugin"],
  ): Promise<"ok" | "tampered"> {
    const fingerprint = cleanString(plugin?.buildFingerprint);
    if (!fingerprint) return "ok";

    if (fingerprint === "development-directory") {
      return process.env.ECOENCHANTS_ALLOW_DEVELOPMENT_BUILDS === "true" ? "ok" : "tampered";
    }

    const sha256 = normalizeSha256(fingerprint);
    if (!sha256) return "tampered";

    const query: Record<string, unknown> = {
      productId,
      sha256,
      isActive: true,
    };
    const version = cleanString(plugin?.version);
    const channel = normalizeChannel(plugin?.channel);
    if (version) query.version = version;
    if (channel) query.channel = channel;

    const build = await EcoEnchantsReleaseBuildModel.findOne(query);
    return build ? "ok" : "tampered";
  }

  static async recordRiskEvent(event: {
    productId: string;
    licenseId?: string;
    activationId?: string;
    type: string;
    severity: "low" | "medium" | "high";
    message: string;
    detail?: Record<string, unknown>;
  }): Promise<void> {
    try {
      await EcoEnchantsRiskEventModel.create({
        riskEventId: `risk_${uuidv4()}`,
        status: "open",
        createdAt: new Date(),
        ...event,
      });
    } catch (error) {
      logger.warn("[EcoEnchants] Failed to record risk event", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  static async reportRuntimeTelemetryEvents(
    request: RuntimeTelemetryEventsRequest,
    headers: RuntimeTelemetryHeaders,
    context: EcoEnchantsRequestContext,
  ) {
    if (!isPlainObject(request)) {
      throw serviceError(400, "invalid_telemetry_batch", "Telemetry request body must be a JSON object.");
    }

    const headerProductId = ensureProductId(headers.productId);
    const productId = ensureProductId(request.productId || headerProductId);
    if (productId !== headerProductId) {
      throw serviceError(400, "invalid_product_id", "Product ID header and body do not match.");
    }

    const headerInstallationId = ensureRequiredText(headers.installationId, "X-Eco-Installation-Id", 128);
    const installationId = ensureRequiredText(request.installationId || headerInstallationId, "installationId", 128);
    if (installationId !== headerInstallationId) {
      throw serviceError(400, "invalid_installation_id", "Installation ID header and body do not match.");
    }

    const pluginVersion = ensureRequiredText(headers.pluginVersion, "X-Eco-Plugin-Version", 80);
    const idempotencyKey = ensureRequiredText(headers.idempotencyKey, "Idempotency-Key", 200);
    if (!Array.isArray(request.events)) {
      throw serviceError(400, "invalid_telemetry_batch", "events must be an array.");
    }

    const maxBatchSize = getMaxTelemetryBatchSize();
    if (request.events.length > maxBatchSize) {
      throw serviceError(422, "telemetry_batch_too_large", `events must contain at most ${maxBatchSize} items.`);
    }

    let tokenPayload: EcoEnchantsRuntimeActivationTokenPayload;
    try {
      tokenPayload = verifyEcoEnchantsRuntimeActivationToken(getBearerToken(headers.authorization));
    } catch (error) {
      if (error instanceof EcoEnchantsServiceError) throw error;
      throw serviceError(401, "invalid_activation_token", "Activation token is missing, expired, or revoked.", 300);
    }

    const installationIdHash = hashInstallationId(installationId);
    const activationId = cleanString(request.activationId);
    if (
      tokenPayload.productId !== productId ||
      tokenPayload.installationIdHash !== installationIdHash ||
      (activationId && activationId !== tokenPayload.activationId)
    ) {
      throw serviceError(403, "invalid_activation_token", "Activation token is not valid for this telemetry batch.", 300);
    }

    const [license, activation] = await Promise.all([
      EcoEnchantsLicenseModel.findOne({
        productId,
        licenseId: tokenPayload.licenseId,
      }),
      EcoEnchantsActivationModel.findOne({
        activationId: tokenPayload.activationId,
        licenseId: tokenPayload.licenseId,
        installationIdHash,
        status: "active",
      }),
    ]);

    const runtimeStatus = license ? getRuntimeLicenseStatus(license, new Date()) : "invalid";
    if (!license || !isAllowedRuntimeStatus(runtimeStatus) || !activation) {
      throw serviceError(403, "invalid_activation_token", "Activation token is missing, expired, or revoked.", 300);
    }

    const plugin = isPlainObject(request.plugin) ? { ...request.plugin } : {};
    plugin.version = cleanString(plugin.version, pluginVersion) || pluginVersion;
    const server = isPlainObject(request.server) ? request.server : {};
    const batch = isPlainObject(request.batch) ? request.batch : {};
    const rejectedEvents: Array<{ eventId: string | null; code: string; message: string; index: number }> = [];
    const validEvents: Array<{
      eventId: string;
      timestamp: Date;
      category: string;
      payload: Record<string, unknown>;
    }> = [];

    request.events.forEach((event, index) => {
      const validated = validateTelemetryEvent(event, index);
      if (validated.ok) {
        validEvents.push(validated.event);
      } else {
        rejectedEvents.push(validated.rejected);
      }
    });

    let acceptedEvents = 0;
    let duplicateEvents = 0;
    const receivedAt = new Date();

    for (const event of validEvents) {
      try {
        await EcoEnchantsTelemetryEventModel.create({
          telemetryEventId: `tel_${uuidv4()}`,
          productId,
          licenseId: tokenPayload.licenseId,
          activationId: tokenPayload.activationId,
          installationIdHash,
          eventId: event.eventId,
          category: event.category,
          timestamp: event.timestamp,
          plugin,
          server,
          batch,
          payload: event.payload,
          requestId: context.requestId,
          idempotencyKey,
          receivedAt,
          sensitiveRetentionUntil: getTelemetrySensitiveRetentionUntil(event.payload),
        });
        acceptedEvents += 1;
      } catch (error) {
        if (isDuplicateKeyError(error)) {
          duplicateEvents += 1;
          continue;
        }
        throw error;
      }
    }

    activation.lastSeenAt = receivedAt;
    try {
      await activation.save();
    } catch (error) {
      logger.warn("[EcoEnchants] Failed to update telemetry activation heartbeat", {
        requestId: context.requestId,
        activationId: tokenPayload.activationId,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    return {
      requestId: context.requestId,
      status: "accepted",
      acceptedEvents,
      duplicateEvents,
      rejectedEvents,
      serverTime: new Date().toISOString(),
    };
  }

  static async createProduct(body: Record<string, unknown>, context: EcoEnchantsRequestContext) {
    const productId = ensureProductId(body.productId || ECO_ENCHANTS_PRODUCT_ID);
    let product: IEcoEnchantsProduct;
    try {
      product = await EcoEnchantsProductModel.create({
        productId,
        name: ensureRequiredText(body.name || "EcoEnchants", "name", 120),
        latestVersion: cleanString(body.latestVersion, "13.0.0"),
        minimumSupportedVersion: cleanString(body.minimumSupportedVersion, "12.5.0"),
        recommendedJava: Number(body.recommendedJava || 21),
        supportedPlatforms: Array.isArray(body.supportedPlatforms) ? body.supportedPlatforms.map(String) : ["Paper", "Folia"],
        notices: Array.isArray(body.notices) ? body.notices.map(String) : [],
        isActive: body.isActive === undefined ? true : Boolean(body.isActive),
      });
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        throw serviceError(409, "product_already_exists", "Product already exists.");
      }
      throw error;
    }

    await EcoEnchantsService.logAudit(context, {
      action: "admin.product.create",
      targetType: "product",
      targetId: product.productId,
      result: "success",
    });

    return { product: product.toObject ? product.toObject() : product };
  }

  static async updateProduct(productId: string, body: Record<string, unknown>, context: EcoEnchantsRequestContext) {
    const normalizedProductId = ensureProductId(productId);
    const allowed: Record<string, unknown> = {};
    for (const key of [
      "name",
      "latestVersion",
      "minimumSupportedVersion",
      "recommendedJava",
      "supportedPlatforms",
      "notices",
      "isActive",
    ]) {
      if (body[key] !== undefined) allowed[key] = body[key];
    }

    const product = await EcoEnchantsProductModel.findOneAndUpdate(
      { productId: normalizedProductId },
      { $set: allowed },
      { new: true },
    );
    if (!product) throw serviceError(404, "product_not_found", "Product was not found.");

    await EcoEnchantsService.logAudit(context, {
      action: "admin.product.update",
      targetType: "product",
      targetId: normalizedProductId,
      result: "success",
      detail: { fields: Object.keys(allowed) },
    });

    return { product: product.toObject ? product.toObject() : product };
  }

  static async createPlan(body: Record<string, unknown>, context: EcoEnchantsRequestContext) {
    const productId = ensureProductId(body.productId || ECO_ENCHANTS_PRODUCT_ID);
    const planId = ensureRequiredText(body.planId || `plan_${uuidv4()}`, "planId", 80);
    let plan: IEcoEnchantsPlan;
    try {
      plan = await EcoEnchantsPlanModel.create({
        planId,
        productId,
        name: ensureRequiredText(body.name, "name", 120),
        maxActivations: Math.max(1, Number(body.maxActivations || 1)),
        durationDays: body.durationDays === undefined ? undefined : Math.max(1, Number(body.durationDays)),
        priceCents: body.priceCents === undefined ? undefined : Math.max(0, Number(body.priceCents)),
        currency: cleanString(body.currency, "USD").toUpperCase(),
        features: Array.isArray(body.features) ? body.features.map(String) : [],
        isActive: body.isActive === undefined ? true : Boolean(body.isActive),
      });
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        throw serviceError(409, "plan_already_exists", "Plan already exists.");
      }
      throw error;
    }

    await EcoEnchantsService.logAudit(context, {
      action: "admin.plan.create",
      targetType: "plan",
      targetId: plan.planId,
      result: "success",
    });

    return { plan: plan.toObject ? plan.toObject() : plan };
  }

  static async createReleaseBuild(productId: string, body: Record<string, unknown>, context: EcoEnchantsRequestContext) {
    const normalizedProductId = ensureProductId(productId);
    const version = ensureRequiredText(body.version, "version", 80);
    const channel = normalizeChannel(body.channel);
    const sha256 = normalizeSha256(body.sha256);
    if (!sha256) throw serviceError(400, "invalid_sha256", "sha256 must be a hex SHA-256 digest.");

    const build = await EcoEnchantsReleaseBuildModel.create({
      buildId: `build_${uuidv4()}`,
      productId: normalizedProductId,
      version,
      channel,
      sha256,
      signature: ensureRequiredText(body.signature, "signature", 5000),
      fileName: cleanString(body.fileName, `EcoEnchants-${version}.jar`),
      downloadUrl: ensureRequiredText(body.downloadUrl, "downloadUrl", 2000),
      releasedAt: parseOptionalDate(body.releasedAt) || new Date(),
      isActive: body.isActive === undefined ? true : Boolean(body.isActive),
    });

    await EcoEnchantsService.logAudit(context, {
      action: "admin.release.create",
      targetType: "release_build",
      targetId: build.buildId,
      result: "success",
      detail: { version, channel, sha256 },
    });

    return { build: build.toObject ? build.toObject() : build };
  }

  static async createLicense(body: Record<string, unknown>, context: EcoEnchantsRequestContext) {
    const productId = ensureProductId(body.productId || ECO_ENCHANTS_PRODUCT_ID);
    const planId = ensureRequiredText(body.planId, "planId", 80);
    const plan = await EcoEnchantsPlanModel.findOne({ planId, productId });
    const licenseKey = typeof body.licenseKey === "string" && body.licenseKey.trim() ? body.licenseKey.trim() : generateLicenseKey();
    const maxActivations =
      body.maxActivations === undefined ? Number(plan?.maxActivations || 1) : Math.max(1, Number(body.maxActivations));
    const status = cleanString(body.status, "valid") as EcoEnchantsLicenseStatus;

    const license = await EcoEnchantsLicenseModel.create({
      licenseId: `lic_${uuidv4()}`,
      productId,
      customerId: ensureRequiredText(body.customerId, "customerId", 128),
      planId,
      keyHash: hashLicenseKey(licenseKey),
      keyLast4: keyLast4(licenseKey),
      status,
      maxActivations,
      expiresAt: parseOptionalDate(body.expiresAt),
      metadata: typeof body.metadata === "object" && body.metadata !== null ? body.metadata : undefined,
    });

    await EcoEnchantsService.logAudit(context, {
      action: "admin.license.create",
      targetType: "license",
      targetId: license.licenseId,
      result: "success",
      detail: { customerId: license.customerId, planId, status },
    });

    return {
      license: getLicenseSummary(license),
      licenseKey,
    };
  }

  static async updateLicense(licenseId: string, body: Record<string, unknown>, context: EcoEnchantsRequestContext) {
    const allowed: Record<string, unknown> = {};
    for (const key of ["status", "maxActivations", "expiresAt", "planId", "customerId", "metadata"]) {
      if (body[key] !== undefined) allowed[key] = key === "expiresAt" ? parseOptionalDate(body[key]) : body[key];
    }
    if (allowed.maxActivations !== undefined) {
      allowed.maxActivations = Math.max(1, Number(allowed.maxActivations));
    }

    const license = await EcoEnchantsLicenseModel.findOneAndUpdate({ licenseId }, { $set: allowed }, { new: true });
    if (!license) throw serviceError(404, "license_not_found", "License was not found.");

    await EcoEnchantsService.logAudit(context, {
      action: "admin.license.update",
      targetType: "license",
      targetId: licenseId,
      result: "success",
      detail: { fields: Object.keys(allowed) },
    });

    return { license: getLicenseSummary(license) };
  }

  static async revokeLicense(licenseId: string, context: EcoEnchantsRequestContext) {
    const license = await EcoEnchantsLicenseModel.findOneAndUpdate(
      { licenseId },
      { $set: { status: "revoked" } },
      { new: true },
    );
    if (!license) throw serviceError(404, "license_not_found", "License was not found.");

    await EcoEnchantsActivationModel.updateMany(
      { licenseId, status: "active" },
      { $set: { status: "revoked", revokedAt: new Date() } },
    );

    await EcoEnchantsService.logAudit(context, {
      action: "admin.license.revoke",
      targetType: "license",
      targetId: licenseId,
      result: "success",
    });

    return { revoked: true, license: getLicenseSummary(license) };
  }

  static async listCustomerLicenses(customerId: string, requestId: string) {
    const licenses = await EcoEnchantsLicenseModel.find({ customerId, productId: ECO_ENCHANTS_PRODUCT_ID }).sort({
      createdAt: -1,
    });
    return {
      requestId,
      licenses: licenses.map(getLicenseSummary),
    };
  }

  static async getCustomerLicense(customerId: string, licenseId: string, requestId: string) {
    const license = await EcoEnchantsLicenseModel.findOne({ customerId, licenseId, productId: ECO_ENCHANTS_PRODUCT_ID });
    if (!license) throw serviceError(404, "license_not_found", "License was not found.");
    const activations = await EcoEnchantsActivationModel.find({ licenseId }).sort({ lastSeenAt: -1 });
    return {
      requestId,
      license: getLicenseSummary(license),
      activations: activations.map(getActivationSummary),
    };
  }

  static async revokeCustomerActivation(
    customerId: string,
    licenseId: string,
    activationId: string,
    context: EcoEnchantsRequestContext,
  ) {
    const license = await EcoEnchantsLicenseModel.findOne({ customerId, licenseId, productId: ECO_ENCHANTS_PRODUCT_ID });
    if (!license) throw serviceError(404, "license_not_found", "License was not found.");
    const activation = await EcoEnchantsActivationModel.findOneAndUpdate(
      { licenseId, activationId },
      { $set: { status: "deactivated", deactivatedAt: new Date() } },
      { new: true },
    );
    if (!activation) throw serviceError(404, "activation_not_found", "Activation was not found.");

    await EcoEnchantsService.logAudit(context, {
      action: "customer.activation.revoke",
      targetType: "activation",
      targetId: activationId,
      result: "success",
    });

    return {
      requestId: context.requestId,
      revoked: true,
      activation: getActivationSummary(activation),
    };
  }

  static async rotateCustomerLicenseKey(customerId: string, licenseId: string, context: EcoEnchantsRequestContext) {
    const license = await EcoEnchantsLicenseModel.findOne({ customerId, licenseId, productId: ECO_ENCHANTS_PRODUCT_ID });
    if (!license) throw serviceError(404, "license_not_found", "License was not found.");

    const oldLast4 = license.keyLast4;
    const licenseKey = generateLicenseKey();
    license.keyHash = hashLicenseKey(licenseKey);
    license.keyLast4 = keyLast4(licenseKey);
    await license.save();

    await EcoEnchantsService.logAudit(context, {
      action: "customer.license.rotate_key",
      targetType: "license",
      targetId: licenseId,
      result: "success",
      detail: { oldLast4, newLast4: license.keyLast4 },
    });

    return {
      requestId: context.requestId,
      licenseId,
      licenseKey,
      key: maskLicenseKey(license.keyLast4),
      oldKey: maskLicenseKey(oldLast4),
    };
  }

  static async listCustomerDownloads(customerId: string, requestId: string) {
    const activeLicense = await EcoEnchantsLicenseModel.findOne({
      customerId,
      productId: ECO_ENCHANTS_PRODUCT_ID,
      status: { $in: ["valid", "trial"] },
      $or: [{ expiresAt: { $exists: false } }, { expiresAt: null }, { expiresAt: { $gt: new Date() } }],
    });
    if (!activeLicense) throw serviceError(403, "no_active_license", "No active EcoEnchants license was found.");

    const builds = await EcoEnchantsReleaseBuildModel.find({
      productId: ECO_ENCHANTS_PRODUCT_ID,
      isActive: true,
    }).sort({ releasedAt: -1 });

    return {
      requestId,
      downloads: builds.map((build) => ({
        productId: build.productId,
        version: build.version,
        channel: build.channel,
        fileName: build.fileName,
        sha256: build.sha256,
        signature: build.signature,
        releasedAt: toIsoOrNull(build.releasedAt),
      })),
    };
  }

  static async getLatestDownload(channel: string, requestId: string) {
    const normalizedChannel = normalizeChannel(channel);
    const build = await EcoEnchantsReleaseBuildModel.findOne({
      productId: ECO_ENCHANTS_PRODUCT_ID,
      channel: normalizedChannel,
      isActive: true,
    }).sort({ releasedAt: -1 });

    if (!build) throw serviceError(404, "download_not_found", "No downloadable build was found.");

    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
    return {
      requestId,
      productId: build.productId,
      version: build.version,
      channel: build.channel,
      fileName: build.fileName,
      sha256: build.sha256,
      signature: build.signature,
      downloadUrl: appendSignedDownloadParams(build.downloadUrl, expiresAt, build),
      expiresAt: expiresAt.toISOString(),
    };
  }

  static async listAdminAuditLogs(params: {
    requestId: string;
    page: number;
    pageSize: number;
    action?: string;
    actorType?: string;
    result?: string;
  }) {
    const page = Math.max(1, params.page || 1);
    const pageSize = Math.min(100, Math.max(1, params.pageSize || 20));
    const filter: Record<string, unknown> = {};
    if (params.action) filter.action = params.action;
    if (params.actorType) filter.actorType = params.actorType;
    if (params.result) filter.result = params.result;

    const [logs, total] = await Promise.all([
      EcoEnchantsAuditLogModel.find(filter).sort({ createdAt: -1 }).skip((page - 1) * pageSize).limit(pageSize),
      EcoEnchantsAuditLogModel.countDocuments(filter),
    ]);

    return { requestId: params.requestId, logs, total, page, pageSize };
  }

  static async listAdminRiskEvents(params: {
    requestId: string;
    page: number;
    pageSize: number;
    status?: string;
    severity?: string;
    type?: string;
  }) {
    const page = Math.max(1, params.page || 1);
    const pageSize = Math.min(100, Math.max(1, params.pageSize || 20));
    const filter: Record<string, unknown> = {};
    if (params.status) filter.status = params.status;
    if (params.severity) filter.severity = params.severity;
    if (params.type) filter.type = params.type;

    const [riskEvents, total] = await Promise.all([
      EcoEnchantsRiskEventModel.find(filter).sort({ createdAt: -1 }).skip((page - 1) * pageSize).limit(pageSize),
      EcoEnchantsRiskEventModel.countDocuments(filter),
    ]);

    return { requestId: params.requestId, riskEvents, total, page, pageSize };
  }

  static async handleWebhook(
    provider: "polymart" | "stripe" | "paypal",
    rawPayload: string,
    headers: Record<string, unknown>,
    context: EcoEnchantsRequestContext,
  ) {
    const signatureVerified = EcoEnchantsService.verifyWebhookSignature(provider, rawPayload, headers);
    if (!signatureVerified) {
      throw serviceError(401, "invalid_webhook_signature", "Webhook signature is invalid.");
    }

    let parsed: any;
    try {
      parsed = JSON.parse(rawPayload);
    } catch {
      throw serviceError(400, "invalid_webhook_payload", "Webhook payload must be valid JSON.");
    }

    const eventId =
      extractNestedString(parsed, ["id", "eventId", "event_id", "data.id", "data.object.id", "resource.id"]) ||
      sha256Hex(rawPayload);
    const type = extractNestedString(parsed, ["type", "event", "event_type", "data.type"]) || "unknown";
    const existing = await EcoEnchantsWebhookEventModel.findOne({ provider, eventId });
    if (existing) {
      return {
        requestId: context.requestId,
        received: true,
        duplicate: true,
        eventId,
        status: existing.status,
      };
    }

    const webhookEvent = await EcoEnchantsWebhookEventModel.create({
      webhookEventId: `wh_${uuidv4()}`,
      provider,
      eventId,
      type,
      signatureVerified,
      status: "received",
      rawPayload,
      headers: sanitizeHeaders(headers),
      data: parsed,
      receivedAt: new Date(),
    });

    try {
      const processed = await EcoEnchantsService.applyWebhookBusinessRules(provider, type, parsed, context);
      webhookEvent.status = processed ? "processed" : "ignored";
      webhookEvent.processedAt = new Date();
      await webhookEvent.save();
    } catch (error) {
      webhookEvent.status = "failed";
      webhookEvent.errorMessage = error instanceof Error ? error.message : String(error);
      webhookEvent.processedAt = new Date();
      await webhookEvent.save();
      throw error;
    }

    await EcoEnchantsService.logAudit(
      { ...context, actorType: "webhook", actorId: provider },
      {
        action: `webhook.${provider}.${type}`,
        targetType: "webhook_event",
        targetId: webhookEvent.webhookEventId,
        result: "success",
        detail: { eventId, status: webhookEvent.status },
      },
    );

    return {
      requestId: context.requestId,
      received: true,
      duplicate: false,
      eventId,
      status: webhookEvent.status,
    };
  }

  private static verifyWebhookSignature(
    provider: "polymart" | "stripe" | "paypal",
    rawPayload: string,
    headers: Record<string, unknown>,
  ): boolean {
    if (provider === "stripe") {
      const secret = process.env.ECOENCHANTS_STRIPE_WEBHOOK_SECRET || process.env.STRIPE_WEBHOOK_SECRET;
      const signature = cleanString(headers["stripe-signature"]);
      if (!secret || !signature) return false;
      return verifyStripeSignature(rawPayload, signature, secret);
    }

    if (provider === "polymart") {
      const secret = process.env.ECOENCHANTS_POLYMART_WEBHOOK_SECRET || process.env.POLYMART_WEBHOOK_SECRET;
      const signature = cleanString(headers["x-polymart-signature"]) || cleanString(headers["x-signature"]);
      if (!secret || !signature) return false;
      return verifyGenericHmacSignature(rawPayload, signature, secret);
    }

    const secret = process.env.ECOENCHANTS_PAYPAL_WEBHOOK_SECRET || process.env.PAYPAL_WEBHOOK_SECRET;
    const signature = cleanString(headers["paypal-transmission-sig"]) || cleanString(headers["x-paypal-signature"]);
    if (!secret || !signature) return false;
    return verifyGenericHmacSignature(rawPayload, signature, secret);
  }

  private static async applyWebhookBusinessRules(
    provider: "polymart" | "stripe" | "paypal",
    type: string,
    payload: any,
    context: EcoEnchantsRequestContext,
  ): Promise<boolean> {
    const lowered = type.toLowerCase();
    const license = await EcoEnchantsService.findLicenseFromWebhookPayload(payload);

    if (lowered.includes("refund") || lowered.includes("refunded") || lowered.includes("cancel")) {
      if (!license) return false;
      license.status = "revoked";
      await license.save();
      await EcoEnchantsService.logAudit(
        { ...context, actorType: "webhook", actorId: provider },
        {
          action: "webhook.license.revoked",
          targetType: "license",
          targetId: license.licenseId,
          result: "success",
          detail: { provider, type },
        },
      );
      return true;
    }

    if (lowered.includes("dispute") || lowered.includes("chargeback")) {
      if (!license) return false;
      license.status = "suspended";
      await license.save();
      await EcoEnchantsService.logAudit(
        { ...context, actorType: "webhook", actorId: provider },
        {
          action: "webhook.license.suspended",
          targetType: "license",
          targetId: license.licenseId,
          result: "success",
          detail: { provider, type },
        },
      );
      return true;
    }

    if (lowered.includes("paid") || lowered.includes("purchase") || lowered.includes("checkout.session.completed")) {
      if (license) {
        license.status = "valid";
        await license.save();
        return true;
      }

      const customerId = extractNestedString(payload, [
        "customerId",
        "customer_id",
        "metadata.customerId",
        "data.object.metadata.customerId",
      ]);
      const planId = extractNestedString(payload, ["planId", "plan_id", "metadata.planId", "data.object.metadata.planId"]);
      if (!customerId || !planId) return false;

      await EcoEnchantsService.createLicense(
        {
          productId: ECO_ENCHANTS_PRODUCT_ID,
          customerId,
          planId,
          status: "valid",
        },
        { ...context, actorType: "webhook", actorId: provider },
      );
      return true;
    }

    return false;
  }

  private static async findLicenseFromWebhookPayload(payload: any): Promise<IEcoEnchantsLicense | null> {
    const licenseId = extractNestedString(payload, [
      "licenseId",
      "license_id",
      "metadata.licenseId",
      "data.object.metadata.licenseId",
      "resource.metadata.licenseId",
    ]);
    if (licenseId) {
      const byId = await EcoEnchantsLicenseModel.findOne({ licenseId, productId: ECO_ENCHANTS_PRODUCT_ID });
      if (byId) return byId;
    }

    const licenseKey = extractNestedString(payload, [
      "licenseKey",
      "license_key",
      "metadata.licenseKey",
      "data.object.metadata.licenseKey",
      "resource.metadata.licenseKey",
    ]);
    if (!licenseKey) return null;

    return EcoEnchantsLicenseModel.findOne({
      productId: ECO_ENCHANTS_PRODUCT_ID,
      keyHash: hashLicenseKey(licenseKey),
    });
  }
}
