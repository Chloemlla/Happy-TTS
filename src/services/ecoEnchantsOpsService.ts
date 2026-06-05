import crypto from "node:crypto";
import type { IncomingMessage } from "node:http";
import { URL } from "node:url";
import { v4 as uuidv4 } from "uuid";
import { WebSocket, WebSocketServer } from "ws";
import { config } from "../config/config";
import {
  EcoEnchantsActivationModel,
  EcoEnchantsOpsAuditLogModel,
  EcoEnchantsOpsBackupModel,
  EcoEnchantsOpsCommandPolicyModel,
  EcoEnchantsOpsInstanceModel,
  EcoEnchantsOpsJobModel,
  EcoEnchantsOpsNonceModel,
  type EcoEnchantsOpsRiskLevel,
  type IEcoEnchantsActivation,
  type IEcoEnchantsOpsInstance,
  type IEcoEnchantsOpsJob,
} from "../models/ecoEnchantsModel";
import { EcoEnchantsService, EcoEnchantsServiceError, ECO_ENCHANTS_PRODUCT_ID, type EcoEnchantsRequestContext } from "./ecoEnchantsService";
import {
  createEcoEnchantsRpcSessionToken,
  hashEcoEnchantsOpsToken,
  verifyEcoEnchantsOpsActivationToken,
  verifyEcoEnchantsRpcSessionToken,
} from "./ecoEnchantsOpsTokens";
import logger from "../utils/logger";

type RpcConnection = {
  ws: WebSocket;
  instanceId: string;
  keyId: string;
  connectedAt: Date;
  supportedMethods: Set<string>;
};

type SignatureHeaders = {
  authorization?: string;
  keyId?: string;
  timestamp?: string;
  nonce?: string;
  signature?: string;
};

type RpcClientMessage =
  | {
      type: "rpc.hello";
      requestId?: string;
      instanceId?: string;
      policyVersion?: string;
      supportedMethods?: string[];
    }
  | {
      type: "rpc.ack";
      requestId?: string;
      jobId?: string;
      status?: string;
    }
  | {
      type: "rpc.progress";
      requestId?: string;
      jobId?: string;
      status?: string;
      progress?: Record<string, unknown>;
      output?: Record<string, unknown>;
    }
  | {
      type: "rpc.result";
      requestId?: string;
      jobId?: string;
      status?: "succeeded" | "failed" | "canceled";
      result?: Record<string, unknown>;
      output?: Record<string, unknown>;
      error?: Record<string, unknown>;
      completedAt?: string;
    }
  | { type: "ping" };

const POLICY_VERSION = process.env.ECOENCHANTS_OPS_POLICY_VERSION || "pol_2026_06_05";
const RPC_PATH = "/api/ecoenchants/v1/rpc/connect";
const SIGNATURE_MAX_SKEW_SECONDS = 300;
const MAX_FILE_READ_BYTES = 1024 * 1024;
const MAX_FILE_WRITE_BYTES = 10 * 1024 * 1024;
const MAX_JOB_OUTPUT_BYTES = 64 * 1024;
const MAX_ACTIVE_JOBS_PER_INSTANCE = 2;

const ALLOWED_MOUNTS = new Set(["server-root", "plugin-data", "config", "logs", "backups"]);
const REDACTION_POLICIES = new Set(["logs-default", "config-default", "players-debug"]);
const ARCHIVE_FORMATS = new Set(["tar.gz", "zip"]);
const DELETE_MODES = new Set(["quarantine", "recycle", "permanent"]);
const WRITE_MODES = new Set(["create", "overwrite"]);
const RESTORE_MODES = new Set(["staged", "direct"]);
const BLOCKED_WRITE_EXTENSIONS = new Set([
  ".jar",
  ".class",
  ".exe",
  ".dll",
  ".so",
  ".dylib",
  ".sh",
  ".bash",
  ".zsh",
  ".bat",
  ".cmd",
  ".ps1",
  ".vbs",
  ".js",
  ".mjs",
  ".cjs",
]);
const BLOCKED_WRITE_BASENAMES = new Set([
  "start.sh",
  "start.bat",
  "run.sh",
  "run.bat",
  "launch.sh",
  "launch.bat",
  "jvm.options",
  "java-args.txt",
]);
const PROTECTED_DELETE_ROOTS = new Set(["world", "world_nether", "world_the_end", "plugins", "backups"]);
const QUEUED_JOB_STATUSES = ["queued", "dispatched", "acknowledged", "running"];

function opsError(statusCode: number, code: string, message: string, retryAfterSeconds: number | null = null) {
  return new EcoEnchantsServiceError(statusCode, code, message, retryAfterSeconds);
}

function cleanString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value.trim() : fallback;
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, entryValue]) => entryValue !== undefined)
    .sort(([left], [right]) => left.localeCompare(right));
  return `{${entries.map(([key, entryValue]) => `${JSON.stringify(key)}:${stableStringify(entryValue)}`).join(",")}}`;
}

function sha256Hex(value: string | Buffer): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function hmacHex(secret: string, value: string): string {
  return crypto.createHmac("sha256", secret).update(value).digest("hex");
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

function hashInstallationId(installationId: string): string {
  return crypto.createHmac("sha256", getLicensePepper()).update(`installation:${installationId.trim()}`).digest("hex");
}

function timingEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left, "utf8");
  const rightBuffer = Buffer.from(right, "utf8");
  if (leftBuffer.length !== rightBuffer.length) return false;
  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function toIso(date: Date | string | undefined | null): string | null {
  if (!date) return null;
  const parsed = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

function parsePositiveInt(value: unknown, fallback: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(max, Math.floor(parsed));
}

function getActorId(context: EcoEnchantsRequestContext): string {
  return context.actorId || "unknown";
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value) && !Buffer.isBuffer(value));
}

function requireText(value: unknown, field: string, maxLength = 256): string {
  if (typeof value !== "string") throw opsError(400, "invalid_request", `${field} is required.`);
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > maxLength) throw opsError(400, "invalid_request", `${field} is invalid.`);
  return trimmed;
}

function optionalStringArray(value: unknown, field: string, maxItems = 50): string[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw opsError(400, "invalid_request", `${field} must be an array.`);
  return value
    .map((item) => requireText(item, field, 512))
    .filter(Boolean)
    .slice(0, maxItems);
}

function normalizeRiskLevel(value: unknown, fallback: EcoEnchantsOpsRiskLevel = "low"): EcoEnchantsOpsRiskLevel {
  const normalized = cleanString(value, fallback).toLowerCase();
  if (normalized === "low" || normalized === "medium" || normalized === "high") return normalized;
  return fallback;
}

function normalizeMount(value: unknown): string {
  const mount = requireText(value, "mount", 80);
  if (!ALLOWED_MOUNTS.has(mount)) {
    throw opsError(422, "policy_rejected", "Mount is not allowed.");
  }
  return mount;
}

function normalizeOpsPath(value: unknown): string {
  const raw = requireText(value, "path", 1024);
  let decoded = raw;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    throw opsError(422, "path_outside_allowed_root", "Path must be URL-decodable.");
  }

  if (/[\u0000-\u001f\u007f]/.test(decoded)) {
    throw opsError(422, "path_outside_allowed_root", "Path contains control characters.");
  }
  const pathValue = decoded.replace(/\\/g, "/").replace(/\/+/g, "/");
  if (!pathValue || pathValue.startsWith("/") || pathValue.startsWith("//") || /^[a-zA-Z]:/.test(pathValue)) {
    throw opsError(422, "path_outside_allowed_root", "Path must be relative to the selected mount.");
  }
  const parts = pathValue.split("/").filter(Boolean);
  if (!parts.length || parts.some((part) => part === "." || part === "..")) {
    throw opsError(422, "path_outside_allowed_root", "Path traversal is not allowed.");
  }
  return parts.join("/");
}

function getLowerBasename(pathValue: string): string {
  const parts = pathValue.split("/");
  return (parts[parts.length - 1] || "").toLowerCase();
}

function getExtension(pathValue: string): string {
  const basename = getLowerBasename(pathValue);
  const dotIndex = basename.lastIndexOf(".");
  return dotIndex >= 0 ? basename.slice(dotIndex) : "";
}

function ensureWritableFilePath(pathValue: string): void {
  const basename = getLowerBasename(pathValue);
  if (BLOCKED_WRITE_EXTENSIONS.has(getExtension(pathValue)) || BLOCKED_WRITE_BASENAMES.has(basename)) {
    throw opsError(422, "file_type_blocked", "This file type is blocked for remote write operations.");
  }
}

function ensureDeletablePath(pathValue: string): void {
  const parts = pathValue.split("/");
  if (parts.length === 1 && PROTECTED_DELETE_ROOTS.has(parts[0].toLowerCase())) {
    throw opsError(422, "policy_rejected", "Protected root directories cannot be deleted.");
  }
}

function normalizeSha256(value: unknown, field: string): string {
  const normalized = requireText(value, field, 80).toLowerCase().replace(/^sha256:/, "");
  if (!/^[a-f0-9]{64}$/.test(normalized)) throw opsError(400, "invalid_sha256", `${field} must be a SHA-256 hex digest.`);
  return normalized;
}

function normalizeContentBase64(value: unknown, expectedSha256: string): string {
  const contentBase64 = requireText(value, "contentBase64", Math.ceil((MAX_FILE_WRITE_BYTES * 4) / 3) + 128);
  let decoded: Buffer;
  try {
    decoded = Buffer.from(contentBase64, "base64");
  } catch {
    throw opsError(400, "invalid_request", "contentBase64 must be valid base64.");
  }
  if (!decoded.length || decoded.length > MAX_FILE_WRITE_BYTES) {
    throw opsError(422, "policy_rejected", "File write size is outside the allowed limit.");
  }
  if (sha256Hex(decoded) !== expectedSha256) {
    throw opsError(422, "policy_rejected", "contentSha256 does not match contentBase64.");
  }
  return contentBase64;
}

function buildSignaturePayload(params: {
  method: string;
  path: string;
  query: string;
  timestamp: string;
  nonce: string;
  bodyHash: string;
}): string {
  return [params.method.toUpperCase(), params.path, params.query, params.timestamp, params.nonce, params.bodyHash].join("\n");
}

function sanitizeResource(resource: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (!resource) return undefined;
  const safe: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(resource)) {
    const lowered = key.toLowerCase();
    if (lowered.includes("token") || lowered.includes("secret") || lowered.includes("key")) continue;
    if (typeof value === "string") safe[key] = value.slice(0, 500);
    else if (typeof value === "number" || typeof value === "boolean" || value === null) safe[key] = value;
    else if (Array.isArray(value)) safe[key] = value.map((item) => (typeof item === "string" ? item.slice(0, 200) : item)).slice(0, 25);
    else if (isPlainObject(value)) safe[key] = sanitizeResource(value);
  }
  return safe;
}

function getRpcUrl(): string {
  const baseUrl = (process.env.ECOENCHANTS_PUBLIC_BASE_URL || config.baseUrl || "").replace(/\/+$/, "");
  if (!baseUrl) return RPC_PATH;
  return `${baseUrl.replace(/^http:/, "ws:").replace(/^https:/, "wss:")}${RPC_PATH}`;
}

function getJobSummary(job: IEcoEnchantsOpsJob) {
  return {
    jobId: job.jobId,
    requestId: job.requestId,
    instanceId: job.instanceId,
    method: job.method,
    riskLevel: job.riskLevel,
    status: job.status,
    reason: job.reason,
    params: job.params,
    actorType: job.actorType,
    actorId: job.actorId,
    policyVersion: job.policyVersion,
    output: job.output || null,
    result: job.result || null,
    error: job.error || null,
    issuedAt: toIso(job.issuedAt),
    expiresAt: toIso(job.expiresAt),
    dispatchedAt: toIso(job.dispatchedAt),
    acknowledgedAt: toIso(job.acknowledgedAt),
    startedAt: toIso(job.startedAt),
    completedAt: toIso(job.completedAt),
    createdAt: toIso(job.createdAt),
    updatedAt: toIso(job.updatedAt),
  };
}

function getInstanceSummary(instance: IEcoEnchantsOpsInstance) {
  return {
    instanceId: instance.instanceId,
    productId: instance.productId,
    activationId: instance.activationId,
    licenseId: instance.licenseId || null,
    name: instance.name || null,
    status: instance.status,
    server: instance.server || {},
    capabilities: instance.capabilities || {},
    supportedMethods: instance.supportedMethods || [],
    policyVersion: instance.policyVersion,
    sessionExpiresAt: toIso(instance.sessionExpiresAt),
    lastSeenAt: toIso(instance.lastSeenAt),
    connectedAt: toIso(instance.connectedAt),
    disconnectedAt: toIso(instance.disconnectedAt),
    createdAt: toIso(instance.createdAt),
    updatedAt: toIso(instance.updatedAt),
  };
}

async function consumeNonce(keyId: string, nonce: string): Promise<void> {
  if (nonce.length < 16) throw opsError(401, "signature_invalid", "Nonce is too short.");
  try {
    await EcoEnchantsOpsNonceModel.create({
      keyId,
      nonce,
      expiresAt: new Date(Date.now() + SIGNATURE_MAX_SKEW_SECONDS * 1000),
      createdAt: new Date(),
    });
  } catch (error) {
    if (error && typeof error === "object" && (error as any).code === 11000) {
      throw opsError(401, "signature_invalid", "Nonce was already used.");
    }
    throw error;
  }
}

async function verifySignedRequest(params: {
  headers: SignatureHeaders;
  method: string;
  path: string;
  query?: string;
  body: unknown;
  secret: string;
  expectedKeyId: string;
  requireBearer?: boolean;
}): Promise<void> {
  const keyId = params.headers.keyId || "";
  const timestamp = params.headers.timestamp || "";
  const nonce = params.headers.nonce || "";
  const signature = (params.headers.signature || "").trim().replace(/^sha256=/i, "");

  if (params.requireBearer && !params.headers.authorization?.startsWith("Bearer ")) {
    throw opsError(401, "unauthorized", "Authorization bearer token is required.");
  }
  if (!keyId || !timestamp || !nonce || !signature) {
    throw opsError(401, "signature_invalid", "Signed EcoEnchants headers are required.");
  }
  if (keyId !== params.expectedKeyId) {
    throw opsError(401, "signature_invalid", "Signature key ID does not match the active token.");
  }

  const timestampNumber = Number(timestamp);
  const nowSeconds = Math.floor(Date.now() / 1000);
  if (!Number.isFinite(timestampNumber) || Math.abs(nowSeconds - timestampNumber) > SIGNATURE_MAX_SKEW_SECONDS) {
    throw opsError(401, "signature_invalid", "Request timestamp is outside the allowed skew.");
  }

  await consumeNonce(keyId, nonce);
  const bodyHash = sha256Hex(Buffer.isBuffer(params.body) ? params.body : stableStringify(params.body ?? {}));
  const payload = buildSignaturePayload({
    method: params.method,
    path: params.path,
    query: params.query || "",
    timestamp,
    nonce,
    bodyHash,
  });
  const expected = hmacHex(params.secret, payload);
  if (!timingEqual(expected, signature)) {
    throw opsError(401, "signature_invalid", "Request signature is invalid.");
  }
}

function validateSimpleJsonSchema(schema: unknown, value: unknown): void {
  if (!isPlainObject(schema)) return;
  if (schema.type && schema.type !== "object") return;
  if (!isPlainObject(value)) throw opsError(422, "policy_rejected", "Command arguments must be an object.");

  const required = Array.isArray(schema.required) ? schema.required.map(String) : [];
  for (const field of required) {
    if (value[field] === undefined) throw opsError(422, "policy_rejected", `Command argument ${field} is required.`);
  }

  const properties = isPlainObject(schema.properties) ? schema.properties : {};
  for (const [field, fieldSchema] of Object.entries(properties)) {
    if (value[field] === undefined || !isPlainObject(fieldSchema)) continue;
    const actual = value[field];
    const expectedType = cleanString(fieldSchema.type);
    if (expectedType && typeof actual !== expectedType) {
      throw opsError(422, "policy_rejected", `Command argument ${field} has an invalid type.`);
    }
    if (Array.isArray(fieldSchema.enum) && !fieldSchema.enum.includes(actual)) {
      throw opsError(422, "policy_rejected", `Command argument ${field} is not in the allowed set.`);
    }
  }
}

export class EcoEnchantsOpsService {
  private static rpcWss: WebSocketServer | null = null;
  private static rpcConnections = new Map<string, RpcConnection>();

  static initRpcWebSocket(server: import("node:http").Server): void {
    if (EcoEnchantsOpsService.rpcWss) return;
    EcoEnchantsOpsService.rpcWss = new WebSocketServer({ server, path: RPC_PATH });
    EcoEnchantsOpsService.rpcWss.on("connection", (ws, req) => {
      void EcoEnchantsOpsService.handleRpcConnection(ws, req);
    });
    logger.info("[EcoEnchantsOps] RPC WebSocket service started", { path: RPC_PATH });
  }

  static async registerInstance(
    body: Record<string, unknown>,
    context: EcoEnchantsRequestContext,
    signature: {
      authorization: string | undefined;
      keyId: string | undefined;
      timestamp: string | undefined;
      nonce: string | undefined;
      signature: string | undefined;
      method: string;
      path: string;
      query: string;
    },
  ) {
    const authHeader = signature.authorization || "";
    const [type, token] = authHeader.split(" ");
    if (type !== "Bearer" || !token) throw opsError(401, "unauthorized", "Authorization bearer token is required.");

    let payload: ReturnType<typeof verifyEcoEnchantsOpsActivationToken>;
    try {
      payload = verifyEcoEnchantsOpsActivationToken(token);
    } catch {
      throw opsError(401, "unauthorized", "Activation token is invalid or expired.");
    }

    await verifySignedRequest({
      headers: signature,
      method: signature.method,
      path: signature.path,
      query: signature.query,
      body,
      secret: token,
      expectedKeyId: payload.keyId,
      requireBearer: true,
    });

    const productId = requireText(body.productId || payload.productId, "productId", 80).toLowerCase();
    const activationId = requireText(body.activationId || payload.activationId, "activationId", 120);
    const installationId = requireText(body.installationId, "installationId", 128);
    if (productId !== ECO_ENCHANTS_PRODUCT_ID || productId !== payload.productId || activationId !== payload.activationId) {
      throw opsError(403, "permission_denied", "Activation token is not valid for this instance.");
    }

    const activation = await EcoEnchantsActivationModel.findOne({
      activationId,
      licenseId: payload.licenseId,
      status: "active",
      installationIdHash: hashInstallationId(installationId),
    });
    if (!activation) {
      throw opsError(403, "permission_denied", "Active license activation was not found for this installation.");
    }

    const server = isPlainObject(body.server) ? body.server : {};
    const capabilities = isPlainObject(body.capabilities) ? body.capabilities : {};
    const existing = await EcoEnchantsOpsInstanceModel.findOne({ productId, activationId });
    const instanceId = existing?.instanceId || `ins_${uuidv4()}`;
    const session = createEcoEnchantsRpcSessionToken({ productId, instanceId, activationId });
    const patch = {
      productId,
      activationId,
      licenseId: payload.licenseId,
      installationIdHash: activation.installationIdHash,
      name: cleanString((server as any).name || (activation as IEcoEnchantsActivation).serverName || activation.name, "EcoEnchants Server"),
      status: "registered" as const,
      server,
      capabilities,
      policyVersion: POLICY_VERSION,
      sessionTokenHash: hashEcoEnchantsOpsToken(session.token),
      sessionExpiresAt: session.expiresAt,
      signingKeyId: session.keyId,
      lastSeenAt: new Date(),
    };

    const instance = existing
      ? await EcoEnchantsOpsInstanceModel.findOneAndUpdate({ instanceId: existing.instanceId }, { $set: patch }, { new: true })
      : await EcoEnchantsOpsInstanceModel.create({
          instanceId,
          supportedMethods: [],
          ...patch,
        });
    if (!instance) throw opsError(500, "server_error", "Failed to register ops instance.");

    await EcoEnchantsOpsService.logOpsAudit({
      context: { ...context, actorType: "license", actorId: payload.licenseId },
      action: "ops.instance.register",
      instanceId: instance.instanceId,
      decision: "allowed",
      result: "success",
      resource: { activationId, productId, capabilities },
      policyVersion: POLICY_VERSION,
    });

    return {
      requestId: context.requestId,
      instanceId: instance.instanceId,
      rpcUrl: getRpcUrl(),
      sessionToken: session.token,
      sessionExpiresAt: session.expiresAt.toISOString(),
      keyId: session.keyId,
      policyVersion: POLICY_VERSION,
    };
  }

  static async listInstances(params: { requestId: string; page?: number; pageSize?: number; status?: string }) {
    const page = Math.max(1, params.page || 1);
    const pageSize = Math.min(100, Math.max(1, params.pageSize || 20));
    const filter: Record<string, unknown> = {};
    if (params.status) filter.status = params.status;
    const [instances, total] = await Promise.all([
      EcoEnchantsOpsInstanceModel.find(filter).sort({ lastSeenAt: -1, createdAt: -1 }).skip((page - 1) * pageSize).limit(pageSize),
      EcoEnchantsOpsInstanceModel.countDocuments(filter),
    ]);
    return { requestId: params.requestId, instances: instances.map(getInstanceSummary), total, page, pageSize };
  }

  static async getInstance(instanceId: string, requestId: string) {
    const instance = await EcoEnchantsOpsService.requireInstance(instanceId);
    return { requestId, instance: getInstanceSummary(instance) };
  }

  static async listJobs(params: { requestId: string; instanceId?: string; page?: number; pageSize?: number; status?: string }) {
    const page = Math.max(1, params.page || 1);
    const pageSize = Math.min(100, Math.max(1, params.pageSize || 20));
    const filter: Record<string, unknown> = {};
    if (params.instanceId) filter.instanceId = params.instanceId;
    if (params.status) filter.status = params.status;
    const [jobs, total] = await Promise.all([
      EcoEnchantsOpsJobModel.find(filter).sort({ createdAt: -1 }).skip((page - 1) * pageSize).limit(pageSize),
      EcoEnchantsOpsJobModel.countDocuments(filter),
    ]);
    return { requestId: params.requestId, jobs: jobs.map(getJobSummary), total, page, pageSize };
  }

  static async getJob(jobId: string, requestId: string) {
    const job = await EcoEnchantsOpsJobModel.findOne({ jobId });
    if (!job) throw opsError(404, "job_not_found", "Ops job was not found.");
    return { requestId, ...getJobSummary(job) };
  }

  static async createManagedJob(instanceId: string, body: Record<string, unknown>, context: EcoEnchantsRequestContext) {
    const method = requireText(body.method, "method", 120);
    const params = isPlainObject(body.params) ? body.params : {};
    const riskLevel = normalizeRiskLevel(body.riskLevel, "medium");
    return EcoEnchantsOpsService.createJob({
      instanceId,
      method,
      params,
      riskLevel,
      reason: requireText(body.reason, "reason", 1000),
      confirmRisk: Boolean(body.confirmRisk),
      context,
    });
  }

  static async createFileReadJob(instanceId: string, body: Record<string, unknown>, context: EcoEnchantsRequestContext) {
    const mount = normalizeMount(body.mount);
    const path = normalizeOpsPath(body.path);
    const limitBytes = parsePositiveInt(body.limitBytes, 128 * 1024, MAX_FILE_READ_BYTES);
    const offset = Math.max(0, Number(body.offset || 0));
    const redactionPolicy = cleanString(body.redactionPolicy, "logs-default");
    if (redactionPolicy && !REDACTION_POLICIES.has(redactionPolicy)) throw opsError(422, "policy_rejected", "Redaction policy is not allowed.");
    return EcoEnchantsOpsService.createJob({
      instanceId,
      method: "ops.file.read",
      params: { mount, path, offset, limitBytes, redactionPolicy },
      riskLevel: "low",
      reason: cleanString(body.reason, "Read controlled file"),
      confirmRisk: true,
      context,
    });
  }

  static async createFileWriteJob(instanceId: string, body: Record<string, unknown>, context: EcoEnchantsRequestContext) {
    const mount = normalizeMount(body.mount);
    const path = normalizeOpsPath(body.path);
    ensureWritableFilePath(path);
    const mode = cleanString(body.mode, "overwrite");
    if (!WRITE_MODES.has(mode)) throw opsError(422, "policy_rejected", "Write mode is not allowed.");
    const contentSha256 = normalizeSha256(body.contentSha256, "contentSha256");
    const contentBase64 = normalizeContentBase64(body.contentBase64, contentSha256);
    return EcoEnchantsOpsService.createJob({
      instanceId,
      method: "ops.file.write",
      params: { mount, path, mode, contentSha256, contentBase64 },
      riskLevel: mode === "overwrite" ? "high" : "medium",
      reason: requireText(body.reason, "reason", 1000),
      confirmRisk: Boolean(body.confirmRisk),
      context,
    });
  }

  static async createFileDeleteJob(instanceId: string, body: Record<string, unknown>, context: EcoEnchantsRequestContext) {
    const mount = normalizeMount(body.mount);
    const path = normalizeOpsPath(body.path);
    ensureDeletablePath(path);
    const mode = cleanString(body.mode, "quarantine");
    if (!DELETE_MODES.has(mode)) throw opsError(422, "policy_rejected", "Delete mode is not allowed.");
    return EcoEnchantsOpsService.createJob({
      instanceId,
      method: "ops.file.delete",
      params: { mount, path, mode },
      riskLevel: mode === "permanent" ? "high" : "medium",
      reason: requireText(body.reason, "reason", 1000),
      confirmRisk: Boolean(body.confirmRisk),
      context,
    });
  }

  static async createExportJob(instanceId: string, body: Record<string, unknown>, context: EcoEnchantsRequestContext) {
    const source = isPlainObject(body.source) ? body.source : {};
    const mount = normalizeMount(source.mount);
    const paths = optionalStringArray(source.paths, "source.paths", 100).map(normalizeOpsPath);
    if (!paths.length) throw opsError(400, "invalid_request", "At least one source path is required.");
    const redactionPolicy = cleanString(body.redactionPolicy, "config-default");
    if (!REDACTION_POLICIES.has(redactionPolicy)) throw opsError(422, "policy_rejected", "Redaction policy is not allowed.");
    const archiveFormat = cleanString(body.archiveFormat, "tar.gz");
    if (!ARCHIVE_FORMATS.has(archiveFormat)) throw opsError(422, "policy_rejected", "Archive format is not allowed.");
    return EcoEnchantsOpsService.createJob({
      instanceId,
      method: "ops.export.redacted",
      params: { source: { mount, paths }, redactionPolicy, archiveFormat },
      riskLevel: "medium",
      reason: requireText(body.reason, "reason", 1000),
      confirmRisk: Boolean(body.confirmRisk),
      context,
    });
  }

  static async createBackupJob(instanceId: string, body: Record<string, unknown>, context: EcoEnchantsRequestContext) {
    const scope = isPlainObject(body.scope) ? body.scope : {};
    const mounts = optionalStringArray(scope.mounts, "scope.mounts", 20).map((mount) => normalizeMount(mount));
    const paths = optionalStringArray(scope.paths, "scope.paths", 100).map(normalizeOpsPath);
    if (!mounts.length || !paths.length) throw opsError(400, "invalid_request", "Backup scope mounts and paths are required.");
    const format = cleanString(body.format, "tar.gz");
    if (!ARCHIVE_FORMATS.has(format)) throw opsError(422, "policy_rejected", "Archive format is not allowed.");
    const retentionDays = parsePositiveInt(body.retentionDays, 30, 365);
    return EcoEnchantsOpsService.createJob({
      instanceId,
      method: "ops.backup.create",
      params: { scope: { mounts, paths }, format, retentionDays },
      riskLevel: "medium",
      reason: requireText(body.reason, "reason", 1000),
      confirmRisk: Boolean(body.confirmRisk),
      context,
      onCreated: async (job) => {
        await EcoEnchantsOpsBackupModel.create({
          backupId: `bak_${uuidv4()}`,
          instanceId,
          jobId: job.jobId,
          createdBy: getActorId(context),
          format,
          scope: [...mounts, ...paths],
          status: "pending",
          retentionDays,
          expiresAt: new Date(Date.now() + retentionDays * 24 * 60 * 60 * 1000),
        });
      },
    });
  }

  static async listBackups(params: { requestId: string; instanceId: string }) {
    const backups = await EcoEnchantsOpsBackupModel.find({ instanceId: params.instanceId }).sort({ createdAt: -1 }).limit(100);
    return {
      requestId: params.requestId,
      backups: backups.map((backup) => ({
        backupId: backup.backupId,
        jobId: backup.jobId || null,
        createdAt: toIso(backup.createdAt),
        format: backup.format,
        sizeBytes: backup.sizeBytes || 0,
        sha256: backup.sha256 || null,
        scope: backup.scope,
        status: backup.status,
        expiresAt: toIso(backup.expiresAt),
      })),
    };
  }

  static async createRestoreJob(instanceId: string, backupId: string, body: Record<string, unknown>, context: EcoEnchantsRequestContext) {
    const backup = await EcoEnchantsOpsBackupModel.findOne({ instanceId, backupId });
    if (!backup) throw opsError(404, "backup_not_found", "Backup was not found.");
    if (backup.status !== "available") throw opsError(422, "backup_integrity_failed", "Backup is not available for restore.");
    const mode = cleanString(body.mode, "staged");
    if (!RESTORE_MODES.has(mode)) throw opsError(422, "policy_rejected", "Restore mode is not allowed.");
    const restorePaths = optionalStringArray(body.restorePaths, "restorePaths", 100).map(normalizeOpsPath);
    if (!restorePaths.length) throw opsError(400, "invalid_request", "restorePaths is required.");
    return EcoEnchantsOpsService.createJob({
      instanceId,
      method: "ops.backup.restore",
      params: { backupId, mode, restorePaths, preRestoreBackup: body.preRestoreBackup !== false },
      riskLevel: "high",
      reason: requireText(body.reason, "reason", 1000),
      confirmRisk: Boolean(body.confirmRisk),
      context,
    });
  }

  static async listCommandPolicies(params: { requestId: string }) {
    await EcoEnchantsOpsService.ensureDefaultCommandPolicies();
    const policies = await EcoEnchantsOpsCommandPolicyModel.find({}).sort({ commandId: 1 });
    return { requestId: params.requestId, policies };
  }

  static async upsertCommandPolicy(body: Record<string, unknown>, context: EcoEnchantsRequestContext) {
    const commandId = requireText(body.commandId, "commandId", 120);
    if (!/^[a-z0-9_.:-]+$/i.test(commandId)) throw opsError(400, "invalid_request", "commandId contains invalid characters.");
    const patch = {
      description: requireText(body.description, "description", 500),
      riskLevel: normalizeRiskLevel(body.riskLevel, "medium"),
      allowedRoles: optionalStringArray(body.allowedRoles, "allowedRoles", 20),
      argumentSchema: isPlainObject(body.argumentSchema) ? body.argumentSchema : { type: "object", properties: {} },
      timeoutSeconds: parsePositiveInt(body.timeoutSeconds, 10, 300),
      maxOutputBytes: parsePositiveInt(body.maxOutputBytes, MAX_JOB_OUTPUT_BYTES, 1024 * 1024),
      requiresApproval: Boolean(body.requiresApproval),
      minecraftConsoleTemplate: requireText(body.minecraftConsoleTemplate, "minecraftConsoleTemplate", 500),
      isActive: body.isActive === undefined ? true : Boolean(body.isActive),
    };
    const policy = await EcoEnchantsOpsCommandPolicyModel.findOneAndUpdate(
      { commandId },
      { $set: patch, $setOnInsert: { commandId } },
      { upsert: true, new: true },
    );
    await EcoEnchantsOpsService.logOpsAudit({
      context,
      action: "ops.policy.write",
      decision: "allowed",
      result: "success",
      resource: { commandId, fields: Object.keys(patch) },
      policyVersion: POLICY_VERSION,
    });
    return { requestId: context.requestId, policy };
  }

  static async listOpsAuditLogs(params: {
    requestId: string;
    instanceId?: string;
    action?: string;
    actorId?: string;
    jobId?: string;
    from?: string;
    to?: string;
    page?: number;
    pageSize?: number;
  }) {
    const page = Math.max(1, params.page || 1);
    const pageSize = Math.min(100, Math.max(1, params.pageSize || 20));
    const filter: Record<string, unknown> = {};
    if (params.instanceId) filter.instanceId = params.instanceId;
    if (params.action) filter.action = params.action;
    if (params.actorId) filter.actorId = params.actorId;
    if (params.jobId) filter.jobId = params.jobId;
    if (params.from || params.to) {
      filter.createdAt = {};
      if (params.from) (filter.createdAt as any).$gte = new Date(params.from);
      if (params.to) (filter.createdAt as any).$lte = new Date(params.to);
    }
    const [logs, total] = await Promise.all([
      EcoEnchantsOpsAuditLogModel.find(filter).sort({ createdAt: -1 }).skip((page - 1) * pageSize).limit(pageSize),
      EcoEnchantsOpsAuditLogModel.countDocuments(filter),
    ]);
    return { requestId: params.requestId, logs, total, page, pageSize };
  }

  private static async createJob(params: {
    instanceId: string;
    method: string;
    params: Record<string, unknown>;
    riskLevel: EcoEnchantsOpsRiskLevel;
    reason: string;
    confirmRisk: boolean;
    context: EcoEnchantsRequestContext;
    onCreated?: (job: IEcoEnchantsOpsJob) => Promise<void>;
  }) {
    const instance = await EcoEnchantsOpsService.requireInstance(params.instanceId);
    if (instance.status === "disabled") throw opsError(403, "permission_denied", "Ops instance is disabled.");
    await EcoEnchantsOpsService.validateJobPolicy(params.method, params.params, params.riskLevel, params.confirmRisk);

    const activeJobs = await EcoEnchantsOpsJobModel.countDocuments({
      instanceId: params.instanceId,
      status: { $in: QUEUED_JOB_STATUSES },
      expiresAt: { $gt: new Date() },
    });
    if (activeJobs >= MAX_ACTIVE_JOBS_PER_INSTANCE) {
      throw opsError(409, "instance_busy", "Instance has too many active ops jobs.");
    }

    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);
    const job = await EcoEnchantsOpsJobModel.create({
      jobId: `job_${uuidv4()}`,
      requestId: params.context.requestId,
      instanceId: params.instanceId,
      method: params.method,
      riskLevel: params.riskLevel,
      status: "queued",
      reason: params.reason,
      params: params.params,
      actorType: "admin",
      actorId: getActorId(params.context),
      policyVersion: instance.policyVersion || POLICY_VERSION,
      expiresAt,
    });
    if (params.onCreated) await params.onCreated(job);
    await EcoEnchantsOpsService.logOpsAudit({
      context: params.context,
      action: params.method,
      instanceId: params.instanceId,
      jobId: job.jobId,
      decision: "allowed",
      result: "success",
      resource: { method: params.method, riskLevel: params.riskLevel, params: params.params },
      policyVersion: job.policyVersion,
    });
    await EcoEnchantsService.logAudit(params.context, {
      action: params.method,
      targetType: "ecoenchants_ops_job",
      targetId: job.jobId,
      result: "success",
      detail: { instanceId: params.instanceId, riskLevel: params.riskLevel },
    });
    await EcoEnchantsOpsService.tryDispatchJob(job);
    const refreshed = await EcoEnchantsOpsJobModel.findOne({ jobId: job.jobId });
    return {
      requestId: params.context.requestId,
      jobId: job.jobId,
      status: refreshed?.status || job.status,
      createdAt: toIso(job.createdAt),
    };
  }

  private static async validateJobPolicy(
    method: string,
    params: Record<string, unknown>,
    riskLevel: EcoEnchantsOpsRiskLevel,
    confirmRisk: boolean,
  ): Promise<void> {
    const allowedMethods = new Set([
      "ops.diagnostics.snapshot",
      "ops.command.runManaged",
      "ops.file.read",
      "ops.file.write",
      "ops.file.delete",
      "ops.export.redacted",
      "ops.backup.create",
      "ops.backup.restore",
    ]);
    if (!allowedMethods.has(method)) throw opsError(422, "policy_rejected", "Ops method is not allowed.");

    if (method === "ops.command.runManaged") {
      await EcoEnchantsOpsService.ensureDefaultCommandPolicies();
      const commandId = requireText(params.commandId, "commandId", 120);
      const policy = await EcoEnchantsOpsCommandPolicyModel.findOne({ commandId, isActive: true });
      if (!policy) throw opsError(422, "policy_rejected", "Command is not in the managed command whitelist.");
      validateSimpleJsonSchema(policy.argumentSchema, params.arguments || {});
      if (policy.requiresApproval && !confirmRisk) {
        throw opsError(403, "approval_required", "This managed command requires approval confirmation.");
      }
    }

    if ((riskLevel === "high" || method === "ops.file.delete" || method === "ops.backup.restore") && !confirmRisk) {
      throw opsError(403, "approval_required", "High-risk operation requires explicit confirmation.");
    }
  }

  private static async tryDispatchJob(job: IEcoEnchantsOpsJob): Promise<void> {
    const connection = EcoEnchantsOpsService.rpcConnections.get(job.instanceId);
    if (!connection || connection.ws.readyState !== WebSocket.OPEN) return;
    if (connection.supportedMethods.size && !connection.supportedMethods.has(job.method)) return;

    const now = new Date();
    const envelope = {
      type: "rpc.request",
      requestId: job.requestId,
      jobId: job.jobId,
      method: job.method,
      issuedAt: now.toISOString(),
      expiresAt: job.expiresAt.toISOString(),
      params: job.params,
    };
    connection.ws.send(JSON.stringify(envelope));
    await EcoEnchantsOpsJobModel.updateOne(
      { jobId: job.jobId, status: "queued" },
      { $set: { status: "dispatched", issuedAt: now, dispatchedAt: now } },
    );
  }

  private static async dispatchPendingJobs(instanceId: string): Promise<void> {
    const jobs = await EcoEnchantsOpsJobModel.find({
      instanceId,
      status: "queued",
      expiresAt: { $gt: new Date() },
    })
      .sort({ createdAt: 1 })
      .limit(MAX_ACTIVE_JOBS_PER_INSTANCE);
    for (const job of jobs) {
      await EcoEnchantsOpsService.tryDispatchJob(job);
    }
  }

  private static async requireInstance(instanceId: string): Promise<IEcoEnchantsOpsInstance> {
    const instance = await EcoEnchantsOpsInstanceModel.findOne({ instanceId });
    if (!instance) throw opsError(404, "instance_not_found", "Ops instance was not found.");
    return instance;
  }

  private static async handleRpcConnection(ws: WebSocket, req: IncomingMessage): Promise<void> {
    try {
      const url = new URL(req.url || RPC_PATH, `http://${req.headers.host || "localhost"}`);
      const authHeader = cleanString(req.headers.authorization);
      const [type, token] = authHeader.split(" ");
      if (type !== "Bearer" || !token) throw opsError(401, "unauthorized", "RPC session token is required.");

      const payload = verifyEcoEnchantsRpcSessionToken(token);
      const instance = await EcoEnchantsOpsInstanceModel.findOne({
        instanceId: payload.instanceId,
        activationId: payload.activationId,
        productId: payload.productId,
      });
      if (!instance || instance.status === "disabled") throw opsError(403, "permission_denied", "RPC instance is not allowed.");
      if (!instance.sessionTokenHash || instance.sessionTokenHash !== hashEcoEnchantsOpsToken(token)) {
        throw opsError(401, "unauthorized", "RPC session token was rotated.");
      }
      if (!instance.sessionExpiresAt || instance.sessionExpiresAt.getTime() <= Date.now()) {
        throw opsError(401, "unauthorized", "RPC session token is expired.");
      }

      await verifySignedRequest({
        headers: {
          authorization: authHeader,
          keyId: cleanString(req.headers["x-eco-key-id"]),
          timestamp: cleanString(req.headers["x-eco-timestamp"]),
          nonce: cleanString(req.headers["x-eco-nonce"]),
          signature: cleanString(req.headers["x-eco-signature"]),
        },
        method: "GET",
        path: url.pathname,
        query: url.search ? url.search.slice(1) : "",
        body: Buffer.alloc(0),
        secret: token,
        expectedKeyId: instance.signingKeyId || payload.keyId,
        requireBearer: true,
      });

      const connection: RpcConnection = {
        ws,
        instanceId: instance.instanceId,
        keyId: payload.keyId,
        connectedAt: new Date(),
        supportedMethods: new Set(instance.supportedMethods || []),
      };
      EcoEnchantsOpsService.rpcConnections.set(instance.instanceId, connection);
      await EcoEnchantsOpsInstanceModel.updateOne(
        { instanceId: instance.instanceId },
        { $set: { status: "online", connectedAt: connection.connectedAt, lastSeenAt: connection.connectedAt } },
      );

      ws.on("message", (raw) => {
        void EcoEnchantsOpsService.handleRpcMessage(connection, raw.toString());
      });
      ws.on("close", () => {
        EcoEnchantsOpsService.rpcConnections.delete(instance.instanceId);
        void EcoEnchantsOpsInstanceModel.updateOne(
          { instanceId: instance.instanceId, status: "online" },
          { $set: { status: "offline", disconnectedAt: new Date(), lastSeenAt: new Date() } },
        );
      });
      ws.on("error", (error) => {
        logger.warn("[EcoEnchantsOps] RPC WebSocket error", { instanceId: instance.instanceId, error: error.message });
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "RPC authorization failed.";
      logger.warn("[EcoEnchantsOps] Rejected RPC connection", { message });
      try {
        ws.close(4001, "Unauthorized");
      } catch {
        // ignore close failures
      }
    }
  }

  private static async handleRpcMessage(connection: RpcConnection, raw: string): Promise<void> {
    let message: RpcClientMessage;
    try {
      message = JSON.parse(raw);
    } catch {
      return;
    }
    const now = new Date();
    await EcoEnchantsOpsInstanceModel.updateOne({ instanceId: connection.instanceId }, { $set: { lastSeenAt: now, status: "online" } });

    if (message.type === "ping") {
      connection.ws.send(JSON.stringify({ type: "pong", timestamp: now.toISOString() }));
      return;
    }

    if (message.type === "rpc.hello") {
      const supportedMethods = Array.isArray(message.supportedMethods) ? message.supportedMethods.map(String).slice(0, 50) : [];
      connection.supportedMethods = new Set(supportedMethods);
      await EcoEnchantsOpsInstanceModel.updateOne(
        { instanceId: connection.instanceId },
        {
          $set: {
            supportedMethods,
            policyVersion: cleanString(message.policyVersion, POLICY_VERSION),
            lastSeenAt: now,
            status: "online",
          },
        },
      );
      await EcoEnchantsOpsService.dispatchPendingJobs(connection.instanceId);
      return;
    }

    if (!message.jobId) return;
    const job = await EcoEnchantsOpsJobModel.findOne({ jobId: message.jobId, instanceId: connection.instanceId });
    if (!job) return;

    if (message.type === "rpc.ack") {
      await EcoEnchantsOpsJobModel.updateOne(
        { jobId: job.jobId },
        { $set: { status: "acknowledged", acknowledgedAt: now, startedAt: now } },
      );
      return;
    }

    if (message.type === "rpc.progress") {
      await EcoEnchantsOpsJobModel.updateOne(
        { jobId: job.jobId },
        {
          $set: {
            status: message.status === "running" ? "running" : job.status === "queued" ? "running" : job.status,
            startedAt: job.startedAt || now,
            output: message.output || { progress: message.progress || {} },
          },
        },
      );
      return;
    }

    if (message.type === "rpc.result") {
      const finalStatus = message.status === "succeeded" ? "succeeded" : message.status === "canceled" ? "canceled" : "failed";
      const completedAt = message.completedAt ? new Date(message.completedAt) : now;
      await EcoEnchantsOpsJobModel.updateOne(
        { jobId: job.jobId },
        {
          $set: {
            status: finalStatus,
            result: message.result || {},
            output: message.output || null,
            error: message.error || null,
            completedAt,
          },
        },
      );
      await EcoEnchantsOpsService.updateBackupFromJobResult(job, message.result || {}, finalStatus);
      await EcoEnchantsOpsService.logOpsAudit({
        context: {
          requestId: job.requestId,
          actorType: "system",
          actorId: connection.instanceId,
        },
        action: `${job.method}.result`,
        instanceId: connection.instanceId,
        jobId: job.jobId,
        decision: "allowed",
        result: finalStatus === "succeeded" ? "success" : "failure",
        resource: { status: finalStatus },
        policyVersion: job.policyVersion,
      });
    }
  }

  private static async updateBackupFromJobResult(
    job: IEcoEnchantsOpsJob,
    result: Record<string, unknown>,
    status: "succeeded" | "failed" | "canceled",
  ): Promise<void> {
    if (job.method !== "ops.backup.create") return;
    const backup = await EcoEnchantsOpsBackupModel.findOne({ jobId: job.jobId });
    if (!backup) return;
    if (status !== "succeeded") {
      backup.status = "failed";
      await backup.save();
      return;
    }
    const sha256 = typeof result.sha256 === "string" ? result.sha256 : undefined;
    const sizeBytes = Number(result.sizeBytes || 0);
    backup.status = "available";
    backup.sha256 = sha256;
    backup.sizeBytes = Number.isFinite(sizeBytes) ? sizeBytes : undefined;
    backup.manifest = isPlainObject(result.manifest) ? result.manifest : undefined;
    await backup.save();
  }

  private static async ensureDefaultCommandPolicies(): Promise<void> {
    await EcoEnchantsOpsCommandPolicyModel.updateOne(
      { commandId: "ecoenchants.reload" },
      {
        $setOnInsert: {
          commandId: "ecoenchants.reload",
          description: "Reload EcoEnchants configuration through the managed Minecraft console template.",
          riskLevel: "medium",
          allowedRoles: ["ops-admin"],
          argumentSchema: {
            type: "object",
            properties: {
              scope: { type: "string", enum: ["plugin-config"] },
            },
            required: ["scope"],
          },
          timeoutSeconds: 10,
          maxOutputBytes: MAX_JOB_OUTPUT_BYTES,
          requiresApproval: false,
          minecraftConsoleTemplate: "ecoenchants reload",
          isActive: true,
        },
      },
      { upsert: true },
    );
  }

  private static async logOpsAudit(params: {
    context: EcoEnchantsRequestContext;
    action: string;
    instanceId?: string;
    jobId?: string;
    decision: "allowed" | "denied";
    result?: "success" | "failure";
    resource?: Record<string, unknown>;
    policyVersion?: string;
    beforeSha256?: string;
    afterSha256?: string;
  }): Promise<void> {
    try {
      const previous = await EcoEnchantsOpsAuditLogModel.findOne({}).sort({ createdAt: -1 });
      const base = {
        auditId: `aud_${uuidv4()}`,
        requestId: params.context.requestId,
        jobId: params.jobId,
        instanceId: params.instanceId,
        actorType: params.context.actorType === "license" ? "license" : params.context.actorType === "system" ? "system" : "admin",
        actorId: params.context.actorId || "unknown",
        action: params.action,
        resource: sanitizeResource(params.resource),
        decision: params.decision,
        result: params.result,
        beforeSha256: params.beforeSha256,
        afterSha256: params.afterSha256,
        policyVersion: params.policyVersion,
        previousEntryHash: previous?.entryHash,
        createdAt: new Date(),
      };
      const entryHash = sha256Hex(stableStringify({ ...base, previousEntryHash: previous?.entryHash || null }));
      await EcoEnchantsOpsAuditLogModel.create({ ...base, entryHash });
    } catch (error) {
      logger.warn("[EcoEnchantsOps] Failed to write ops audit log", {
        requestId: params.context.requestId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
