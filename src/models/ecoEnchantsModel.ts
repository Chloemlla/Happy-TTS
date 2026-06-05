import mongoose, { type Document, Schema } from "mongoose";

const MixedType = (Schema as any).Types?.Mixed || (mongoose as any).Schema?.Types?.Mixed || Object;
const existingModels = (mongoose as any).models || {};

function addIndex(schema: Schema, fields: Record<string, any>, options?: Record<string, any>): void {
  if (typeof (schema as any).index === "function") {
    schema.index(fields as any, options as any);
  }
}

export const ECO_ENCHANTS_LICENSE_STATUSES = [
  "valid",
  "trial",
  "expired",
  "suspended",
  "revoked",
] as const;

export const ECO_ENCHANTS_ACTIVATION_STATUSES = ["active", "deactivated", "revoked"] as const;
export const ECO_ENCHANTS_RISK_EVENT_STATUSES = ["open", "acknowledged", "resolved"] as const;
export const ECO_ENCHANTS_WEBHOOK_STATUSES = ["received", "processed", "ignored", "failed"] as const;
export const ECO_ENCHANTS_OPS_INSTANCE_STATUSES = ["registered", "online", "offline", "disabled"] as const;
export const ECO_ENCHANTS_OPS_JOB_STATUSES = [
  "queued",
  "dispatched",
  "acknowledged",
  "running",
  "succeeded",
  "failed",
  "canceled",
  "expired",
] as const;
export const ECO_ENCHANTS_OPS_RISK_LEVELS = ["low", "medium", "high"] as const;
export const ECO_ENCHANTS_OPS_BACKUP_STATUSES = ["pending", "available", "failed", "expired"] as const;

export type EcoEnchantsLicenseStatus = (typeof ECO_ENCHANTS_LICENSE_STATUSES)[number];
export type EcoEnchantsActivationStatus = (typeof ECO_ENCHANTS_ACTIVATION_STATUSES)[number];
export type EcoEnchantsRiskEventStatus = (typeof ECO_ENCHANTS_RISK_EVENT_STATUSES)[number];
export type EcoEnchantsWebhookStatus = (typeof ECO_ENCHANTS_WEBHOOK_STATUSES)[number];
export type EcoEnchantsOpsInstanceStatus = (typeof ECO_ENCHANTS_OPS_INSTANCE_STATUSES)[number];
export type EcoEnchantsOpsJobStatus = (typeof ECO_ENCHANTS_OPS_JOB_STATUSES)[number];
export type EcoEnchantsOpsRiskLevel = (typeof ECO_ENCHANTS_OPS_RISK_LEVELS)[number];
export type EcoEnchantsOpsBackupStatus = (typeof ECO_ENCHANTS_OPS_BACKUP_STATUSES)[number];

export interface IEcoEnchantsProduct extends Document {
  productId: string;
  name: string;
  latestVersion: string;
  minimumSupportedVersion: string;
  recommendedJava: number;
  supportedPlatforms: string[];
  notices: string[];
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface IEcoEnchantsPlan extends Document {
  planId: string;
  productId: string;
  name: string;
  maxActivations: number;
  durationDays?: number;
  priceCents?: number;
  currency?: string;
  features: string[];
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface IEcoEnchantsLicense extends Document {
  licenseId: string;
  productId: string;
  customerId: string;
  planId: string;
  keyHash: string;
  keyLast4: string;
  status: EcoEnchantsLicenseStatus;
  maxActivations: number;
  expiresAt?: Date;
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface IEcoEnchantsActivation extends Document {
  activationId: string;
  licenseId: string;
  installationIdHash: string;
  name?: string;
  status: EcoEnchantsActivationStatus;
  pluginVersion?: string;
  pluginChannel?: string;
  platform?: string;
  platformVersion?: string;
  minecraftVersion?: string;
  onlineMode?: boolean;
  javaVersion?: string;
  serverName?: string;
  lastBuildFingerprint?: string;
  lastSeenAt?: Date;
  deactivatedAt?: Date;
  revokedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface IEcoEnchantsReleaseBuild extends Document {
  buildId: string;
  productId: string;
  version: string;
  channel: string;
  sha256: string;
  signature: string;
  fileName: string;
  downloadUrl: string;
  releasedAt: Date;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface IEcoEnchantsIdempotencyRecord extends Document {
  scope: string;
  key: string;
  method: string;
  path: string;
  bodyHash: string;
  statusCode: number;
  responseBody: Record<string, unknown>;
  createdAt: Date;
}

export interface IEcoEnchantsAuditLog extends Document {
  auditId: string;
  actorType: "customer" | "admin" | "license" | "webhook" | "system";
  actorId: string;
  action: string;
  targetType?: string;
  targetId?: string;
  result: "success" | "failure";
  detail?: Record<string, unknown>;
  requestId?: string;
  ip?: string;
  userAgent?: string;
  createdAt: Date;
}

export interface IEcoEnchantsRiskEvent extends Document {
  riskEventId: string;
  productId: string;
  licenseId?: string;
  activationId?: string;
  type: string;
  severity: "low" | "medium" | "high";
  status: EcoEnchantsRiskEventStatus;
  message: string;
  detail?: Record<string, unknown>;
  createdAt: Date;
  resolvedAt?: Date;
}

export interface IEcoEnchantsWebhookEvent extends Document {
  webhookEventId: string;
  provider: "polymart" | "stripe" | "paypal";
  eventId: string;
  type: string;
  signatureVerified: boolean;
  status: EcoEnchantsWebhookStatus;
  rawPayload: string;
  headers?: Record<string, string>;
  data?: Record<string, unknown>;
  errorMessage?: string;
  receivedAt: Date;
  processedAt?: Date;
}

export interface IEcoEnchantsTelemetryEvent extends Document {
  telemetryEventId: string;
  productId: string;
  licenseId?: string;
  activationId?: string;
  installationIdHash: string;
  eventId: string;
  category: string;
  timestamp: Date;
  plugin?: Record<string, unknown>;
  server?: Record<string, unknown>;
  batch?: Record<string, unknown>;
  payload: Record<string, unknown>;
  requestId?: string;
  idempotencyKey?: string;
  receivedAt: Date;
  sensitiveRetentionUntil?: Date;
}

export interface IEcoEnchantsOpsInstance extends Document {
  instanceId: string;
  productId: string;
  activationId: string;
  licenseId?: string;
  installationIdHash?: string;
  name?: string;
  status: EcoEnchantsOpsInstanceStatus;
  server?: Record<string, unknown>;
  capabilities?: Record<string, unknown>;
  supportedMethods: string[];
  policyVersion: string;
  sessionTokenHash?: string;
  sessionExpiresAt?: Date;
  signingKeyId?: string;
  lastSeenAt?: Date;
  connectedAt?: Date;
  disconnectedAt?: Date;
  disabledAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface IEcoEnchantsOpsCommandPolicy extends Document {
  commandId: string;
  description: string;
  riskLevel: EcoEnchantsOpsRiskLevel;
  allowedRoles: string[];
  argumentSchema?: Record<string, unknown>;
  timeoutSeconds: number;
  maxOutputBytes: number;
  requiresApproval: boolean;
  minecraftConsoleTemplate: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface IEcoEnchantsOpsJob extends Document {
  jobId: string;
  requestId: string;
  instanceId: string;
  method: string;
  riskLevel: EcoEnchantsOpsRiskLevel;
  status: EcoEnchantsOpsJobStatus;
  reason: string;
  params: Record<string, unknown>;
  actorType: "admin" | "system";
  actorId: string;
  policyVersion: string;
  output?: Record<string, unknown>;
  result?: Record<string, unknown>;
  error?: Record<string, unknown>;
  issuedAt?: Date;
  expiresAt: Date;
  dispatchedAt?: Date;
  acknowledgedAt?: Date;
  startedAt?: Date;
  completedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface IEcoEnchantsOpsBackup extends Document {
  backupId: string;
  instanceId: string;
  jobId?: string;
  createdBy?: string;
  format: string;
  sizeBytes?: number;
  sha256?: string;
  scope: string[];
  status: EcoEnchantsOpsBackupStatus;
  manifest?: Record<string, unknown>;
  retentionDays?: number;
  expiresAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface IEcoEnchantsOpsNonce extends Document {
  keyId: string;
  nonce: string;
  expiresAt: Date;
  createdAt: Date;
}

export interface IEcoEnchantsOpsAuditLog extends Document {
  auditId: string;
  requestId?: string;
  jobId?: string;
  instanceId?: string;
  actorType: "admin" | "license" | "system";
  actorId: string;
  action: string;
  resource?: Record<string, unknown>;
  decision: "allowed" | "denied";
  result?: "success" | "failure";
  beforeSha256?: string;
  afterSha256?: string;
  policyVersion?: string;
  previousEntryHash?: string;
  entryHash: string;
  createdAt: Date;
}

const ProductSchema = new Schema<IEcoEnchantsProduct>(
  {
    productId: { type: String, required: true, unique: true, index: true },
    name: { type: String, required: true },
    latestVersion: { type: String, default: "13.0.0" },
    minimumSupportedVersion: { type: String, default: "12.5.0" },
    recommendedJava: { type: Number, default: 21 },
    supportedPlatforms: { type: [String], default: ["Paper", "Folia"] },
    notices: { type: [String], default: [] },
    isActive: { type: Boolean, default: true },
  },
  { collection: "ecoenchants_products", timestamps: true },
);

const PlanSchema = new Schema<IEcoEnchantsPlan>(
  {
    planId: { type: String, required: true, unique: true, index: true },
    productId: { type: String, required: true, index: true },
    name: { type: String, required: true },
    maxActivations: { type: Number, required: true, min: 1, default: 1 },
    durationDays: { type: Number, min: 1 },
    priceCents: { type: Number, min: 0 },
    currency: { type: String, default: "USD" },
    features: { type: [String], default: [] },
    isActive: { type: Boolean, default: true },
  },
  { collection: "ecoenchants_plans", timestamps: true },
);

const LicenseSchema = new Schema<IEcoEnchantsLicense>(
  {
    licenseId: { type: String, required: true, unique: true, index: true },
    productId: { type: String, required: true, index: true },
    customerId: { type: String, required: true, index: true },
    planId: { type: String, required: true, index: true },
    keyHash: { type: String, required: true, unique: true, index: true },
    keyLast4: { type: String, required: true },
    status: { type: String, required: true, enum: ECO_ENCHANTS_LICENSE_STATUSES, default: "valid", index: true },
    maxActivations: { type: Number, required: true, min: 1, default: 1 },
    expiresAt: { type: Date, index: true },
    metadata: { type: MixedType },
  },
  { collection: "ecoenchants_licenses", timestamps: true },
);

const ActivationSchema = new Schema<IEcoEnchantsActivation>(
  {
    activationId: { type: String, required: true, unique: true, index: true },
    licenseId: { type: String, required: true, index: true },
    installationIdHash: { type: String, required: true, index: true },
    name: { type: String },
    status: { type: String, required: true, enum: ECO_ENCHANTS_ACTIVATION_STATUSES, default: "active", index: true },
    pluginVersion: { type: String },
    pluginChannel: { type: String },
    platform: { type: String },
    platformVersion: { type: String },
    minecraftVersion: { type: String },
    onlineMode: { type: Boolean },
    javaVersion: { type: String },
    serverName: { type: String },
    lastBuildFingerprint: { type: String },
    lastSeenAt: { type: Date, index: true },
    deactivatedAt: { type: Date },
    revokedAt: { type: Date },
  },
  { collection: "ecoenchants_activations", timestamps: true },
);

const ReleaseBuildSchema = new Schema<IEcoEnchantsReleaseBuild>(
  {
    buildId: { type: String, required: true, unique: true, index: true },
    productId: { type: String, required: true, index: true },
    version: { type: String, required: true, index: true },
    channel: { type: String, required: true, index: true },
    sha256: { type: String, required: true, index: true },
    signature: { type: String, required: true },
    fileName: { type: String, required: true },
    downloadUrl: { type: String, required: true },
    releasedAt: { type: Date, required: true, default: Date.now, index: true },
    isActive: { type: Boolean, default: true, index: true },
  },
  { collection: "ecoenchants_release_builds", timestamps: true },
);

const IdempotencyRecordSchema = new Schema<IEcoEnchantsIdempotencyRecord>(
  {
    scope: { type: String, required: true },
    key: { type: String, required: true },
    method: { type: String, required: true },
    path: { type: String, required: true },
    bodyHash: { type: String, required: true },
    statusCode: { type: Number, required: true },
    responseBody: { type: MixedType, required: true },
    createdAt: { type: Date, default: Date.now },
  },
  { collection: "ecoenchants_idempotency_records", timestamps: false },
);

const AuditLogSchema = new Schema<IEcoEnchantsAuditLog>(
  {
    auditId: { type: String, required: true, unique: true, index: true },
    actorType: { type: String, required: true, enum: ["customer", "admin", "license", "webhook", "system"], index: true },
    actorId: { type: String, required: true, index: true },
    action: { type: String, required: true, index: true },
    targetType: { type: String },
    targetId: { type: String, index: true },
    result: { type: String, required: true, enum: ["success", "failure"], index: true },
    detail: { type: MixedType },
    requestId: { type: String, index: true },
    ip: { type: String },
    userAgent: { type: String },
    createdAt: { type: Date, default: Date.now, index: true },
  },
  { collection: "ecoenchants_audit_logs", timestamps: false },
);

const RiskEventSchema = new Schema<IEcoEnchantsRiskEvent>(
  {
    riskEventId: { type: String, required: true, unique: true, index: true },
    productId: { type: String, required: true, index: true },
    licenseId: { type: String, index: true },
    activationId: { type: String, index: true },
    type: { type: String, required: true, index: true },
    severity: { type: String, required: true, enum: ["low", "medium", "high"], default: "low", index: true },
    status: { type: String, required: true, enum: ECO_ENCHANTS_RISK_EVENT_STATUSES, default: "open", index: true },
    message: { type: String, required: true },
    detail: { type: MixedType },
    createdAt: { type: Date, default: Date.now, index: true },
    resolvedAt: { type: Date },
  },
  { collection: "ecoenchants_risk_events", timestamps: false },
);

const WebhookEventSchema = new Schema<IEcoEnchantsWebhookEvent>(
  {
    webhookEventId: { type: String, required: true, unique: true, index: true },
    provider: { type: String, required: true, enum: ["polymart", "stripe", "paypal"], index: true },
    eventId: { type: String, required: true, index: true },
    type: { type: String, required: true, index: true },
    signatureVerified: { type: Boolean, required: true },
    status: { type: String, required: true, enum: ECO_ENCHANTS_WEBHOOK_STATUSES, default: "received", index: true },
    rawPayload: { type: String, required: true },
    headers: { type: MixedType },
    data: { type: MixedType },
    errorMessage: { type: String },
    receivedAt: { type: Date, default: Date.now, index: true },
    processedAt: { type: Date },
  },
  { collection: "ecoenchants_webhook_events", timestamps: false },
);

const TelemetryEventSchema = new Schema<IEcoEnchantsTelemetryEvent>(
  {
    telemetryEventId: { type: String, required: true, unique: true, index: true },
    productId: { type: String, required: true, index: true },
    licenseId: { type: String, index: true },
    activationId: { type: String, index: true },
    installationIdHash: { type: String, required: true, index: true },
    eventId: { type: String, required: true, index: true },
    category: { type: String, required: true, index: true },
    timestamp: { type: Date, required: true, index: true },
    plugin: { type: MixedType },
    server: { type: MixedType },
    batch: { type: MixedType },
    payload: { type: MixedType, required: true },
    requestId: { type: String, index: true },
    idempotencyKey: { type: String, index: true },
    receivedAt: { type: Date, default: Date.now, index: true },
    sensitiveRetentionUntil: { type: Date, index: true },
  },
  { collection: "ecoenchants_telemetry_events", timestamps: false },
);

const OpsInstanceSchema = new Schema<IEcoEnchantsOpsInstance>(
  {
    instanceId: { type: String, required: true, unique: true, index: true },
    productId: { type: String, required: true, index: true },
    activationId: { type: String, required: true, index: true },
    licenseId: { type: String, index: true },
    installationIdHash: { type: String, index: true },
    name: { type: String },
    status: { type: String, required: true, enum: ECO_ENCHANTS_OPS_INSTANCE_STATUSES, default: "registered", index: true },
    server: { type: MixedType },
    capabilities: { type: MixedType },
    supportedMethods: { type: [String], default: [] },
    policyVersion: { type: String, required: true, default: "pol_2026_06_05", index: true },
    sessionTokenHash: { type: String },
    sessionExpiresAt: { type: Date, index: true },
    signingKeyId: { type: String, index: true },
    lastSeenAt: { type: Date, index: true },
    connectedAt: { type: Date },
    disconnectedAt: { type: Date },
    disabledAt: { type: Date },
  },
  { collection: "ecoenchants_ops_instances", timestamps: true },
);

const OpsCommandPolicySchema = new Schema<IEcoEnchantsOpsCommandPolicy>(
  {
    commandId: { type: String, required: true, unique: true, index: true },
    description: { type: String, required: true },
    riskLevel: { type: String, required: true, enum: ECO_ENCHANTS_OPS_RISK_LEVELS, default: "medium", index: true },
    allowedRoles: { type: [String], default: ["ops-admin"] },
    argumentSchema: { type: MixedType },
    timeoutSeconds: { type: Number, required: true, min: 1, max: 300, default: 10 },
    maxOutputBytes: { type: Number, required: true, min: 1024, max: 1048576, default: 65536 },
    requiresApproval: { type: Boolean, required: true, default: false },
    minecraftConsoleTemplate: { type: String, required: true },
    isActive: { type: Boolean, required: true, default: true, index: true },
  },
  { collection: "ecoenchants_ops_command_policies", timestamps: true },
);

const OpsJobSchema = new Schema<IEcoEnchantsOpsJob>(
  {
    jobId: { type: String, required: true, unique: true, index: true },
    requestId: { type: String, required: true, index: true },
    instanceId: { type: String, required: true, index: true },
    method: { type: String, required: true, index: true },
    riskLevel: { type: String, required: true, enum: ECO_ENCHANTS_OPS_RISK_LEVELS, default: "low", index: true },
    status: { type: String, required: true, enum: ECO_ENCHANTS_OPS_JOB_STATUSES, default: "queued", index: true },
    reason: { type: String, required: true },
    params: { type: MixedType, required: true },
    actorType: { type: String, required: true, enum: ["admin", "system"], default: "admin" },
    actorId: { type: String, required: true, index: true },
    policyVersion: { type: String, required: true, default: "pol_2026_06_05" },
    output: { type: MixedType },
    result: { type: MixedType },
    error: { type: MixedType },
    issuedAt: { type: Date },
    expiresAt: { type: Date, required: true, index: true },
    dispatchedAt: { type: Date },
    acknowledgedAt: { type: Date },
    startedAt: { type: Date },
    completedAt: { type: Date },
  },
  { collection: "ecoenchants_ops_jobs", timestamps: true },
);

const OpsBackupSchema = new Schema<IEcoEnchantsOpsBackup>(
  {
    backupId: { type: String, required: true, unique: true, index: true },
    instanceId: { type: String, required: true, index: true },
    jobId: { type: String, index: true },
    createdBy: { type: String, index: true },
    format: { type: String, required: true, default: "tar.gz" },
    sizeBytes: { type: Number, min: 0 },
    sha256: { type: String },
    scope: { type: [String], default: [] },
    status: { type: String, required: true, enum: ECO_ENCHANTS_OPS_BACKUP_STATUSES, default: "pending", index: true },
    manifest: { type: MixedType },
    retentionDays: { type: Number, min: 1 },
    expiresAt: { type: Date, index: true },
  },
  { collection: "ecoenchants_ops_backups", timestamps: true },
);

const OpsNonceSchema = new Schema<IEcoEnchantsOpsNonce>(
  {
    keyId: { type: String, required: true },
    nonce: { type: String, required: true },
    expiresAt: { type: Date, required: true, index: true },
    createdAt: { type: Date, default: Date.now },
  },
  { collection: "ecoenchants_ops_nonces", timestamps: false },
);

const OpsAuditLogSchema = new Schema<IEcoEnchantsOpsAuditLog>(
  {
    auditId: { type: String, required: true, unique: true, index: true },
    requestId: { type: String, index: true },
    jobId: { type: String, index: true },
    instanceId: { type: String, index: true },
    actorType: { type: String, required: true, enum: ["admin", "license", "system"], index: true },
    actorId: { type: String, required: true, index: true },
    action: { type: String, required: true, index: true },
    resource: { type: MixedType },
    decision: { type: String, required: true, enum: ["allowed", "denied"], index: true },
    result: { type: String, enum: ["success", "failure"], index: true },
    beforeSha256: { type: String },
    afterSha256: { type: String },
    policyVersion: { type: String },
    previousEntryHash: { type: String },
    entryHash: { type: String, required: true },
    createdAt: { type: Date, default: Date.now, index: true },
  },
  { collection: "ecoenchants_ops_audit_logs", timestamps: false },
);

addIndex(ActivationSchema, { licenseId: 1, installationIdHash: 1 }, { unique: true });
addIndex(ActivationSchema, { licenseId: 1, status: 1 });
addIndex(ReleaseBuildSchema, { productId: 1, version: 1, channel: 1, sha256: 1 }, { unique: true });
addIndex(ReleaseBuildSchema, { productId: 1, channel: 1, releasedAt: -1 });
addIndex(IdempotencyRecordSchema, { scope: 1, key: 1 }, { unique: true });
addIndex(IdempotencyRecordSchema, { createdAt: 1 }, { expireAfterSeconds: 24 * 60 * 60 });
addIndex(WebhookEventSchema, { provider: 1, eventId: 1 }, { unique: true });
addIndex(TelemetryEventSchema, { productId: 1, installationIdHash: 1, eventId: 1 }, { unique: true });
addIndex(TelemetryEventSchema, { activationId: 1, timestamp: -1 });
addIndex(TelemetryEventSchema, { category: 1, timestamp: -1 });
addIndex(OpsInstanceSchema, { activationId: 1, productId: 1 }, { unique: true });
addIndex(OpsInstanceSchema, { status: 1, lastSeenAt: -1 });
addIndex(OpsJobSchema, { instanceId: 1, status: 1, createdAt: -1 });
addIndex(OpsJobSchema, { actorId: 1, createdAt: -1 });
addIndex(OpsBackupSchema, { instanceId: 1, createdAt: -1 });
addIndex(OpsNonceSchema, { keyId: 1, nonce: 1 }, { unique: true });
addIndex(OpsNonceSchema, { expiresAt: 1 }, { expireAfterSeconds: 0 });
addIndex(OpsAuditLogSchema, { instanceId: 1, createdAt: -1 });
addIndex(OpsAuditLogSchema, { action: 1, createdAt: -1 });
addIndex(OpsAuditLogSchema, { actorId: 1, createdAt: -1 });
addIndex(OpsAuditLogSchema, { jobId: 1, createdAt: -1 });

export const EcoEnchantsProductModel =
  (existingModels.EcoEnchantsProduct as mongoose.Model<IEcoEnchantsProduct>) ||
  mongoose.model<IEcoEnchantsProduct>("EcoEnchantsProduct", ProductSchema);

export const EcoEnchantsPlanModel =
  (existingModels.EcoEnchantsPlan as mongoose.Model<IEcoEnchantsPlan>) ||
  mongoose.model<IEcoEnchantsPlan>("EcoEnchantsPlan", PlanSchema);

export const EcoEnchantsLicenseModel =
  (existingModels.EcoEnchantsLicense as mongoose.Model<IEcoEnchantsLicense>) ||
  mongoose.model<IEcoEnchantsLicense>("EcoEnchantsLicense", LicenseSchema);

export const EcoEnchantsActivationModel =
  (existingModels.EcoEnchantsActivation as mongoose.Model<IEcoEnchantsActivation>) ||
  mongoose.model<IEcoEnchantsActivation>("EcoEnchantsActivation", ActivationSchema);

export const EcoEnchantsReleaseBuildModel =
  (existingModels.EcoEnchantsReleaseBuild as mongoose.Model<IEcoEnchantsReleaseBuild>) ||
  mongoose.model<IEcoEnchantsReleaseBuild>("EcoEnchantsReleaseBuild", ReleaseBuildSchema);

export const EcoEnchantsIdempotencyRecordModel =
  (existingModels.EcoEnchantsIdempotencyRecord as mongoose.Model<IEcoEnchantsIdempotencyRecord>) ||
  mongoose.model<IEcoEnchantsIdempotencyRecord>("EcoEnchantsIdempotencyRecord", IdempotencyRecordSchema);

export const EcoEnchantsAuditLogModel =
  (existingModels.EcoEnchantsAuditLog as mongoose.Model<IEcoEnchantsAuditLog>) ||
  mongoose.model<IEcoEnchantsAuditLog>("EcoEnchantsAuditLog", AuditLogSchema);

export const EcoEnchantsRiskEventModel =
  (existingModels.EcoEnchantsRiskEvent as mongoose.Model<IEcoEnchantsRiskEvent>) ||
  mongoose.model<IEcoEnchantsRiskEvent>("EcoEnchantsRiskEvent", RiskEventSchema);

export const EcoEnchantsWebhookEventModel =
  (existingModels.EcoEnchantsWebhookEvent as mongoose.Model<IEcoEnchantsWebhookEvent>) ||
  mongoose.model<IEcoEnchantsWebhookEvent>("EcoEnchantsWebhookEvent", WebhookEventSchema);

export const EcoEnchantsTelemetryEventModel =
  (existingModels.EcoEnchantsTelemetryEvent as mongoose.Model<IEcoEnchantsTelemetryEvent>) ||
  mongoose.model<IEcoEnchantsTelemetryEvent>("EcoEnchantsTelemetryEvent", TelemetryEventSchema);

export const EcoEnchantsOpsInstanceModel =
  (existingModels.EcoEnchantsOpsInstance as mongoose.Model<IEcoEnchantsOpsInstance>) ||
  mongoose.model<IEcoEnchantsOpsInstance>("EcoEnchantsOpsInstance", OpsInstanceSchema);

export const EcoEnchantsOpsCommandPolicyModel =
  (existingModels.EcoEnchantsOpsCommandPolicy as mongoose.Model<IEcoEnchantsOpsCommandPolicy>) ||
  mongoose.model<IEcoEnchantsOpsCommandPolicy>("EcoEnchantsOpsCommandPolicy", OpsCommandPolicySchema);

export const EcoEnchantsOpsJobModel =
  (existingModels.EcoEnchantsOpsJob as mongoose.Model<IEcoEnchantsOpsJob>) ||
  mongoose.model<IEcoEnchantsOpsJob>("EcoEnchantsOpsJob", OpsJobSchema);

export const EcoEnchantsOpsBackupModel =
  (existingModels.EcoEnchantsOpsBackup as mongoose.Model<IEcoEnchantsOpsBackup>) ||
  mongoose.model<IEcoEnchantsOpsBackup>("EcoEnchantsOpsBackup", OpsBackupSchema);

export const EcoEnchantsOpsNonceModel =
  (existingModels.EcoEnchantsOpsNonce as mongoose.Model<IEcoEnchantsOpsNonce>) ||
  mongoose.model<IEcoEnchantsOpsNonce>("EcoEnchantsOpsNonce", OpsNonceSchema);

export const EcoEnchantsOpsAuditLogModel =
  (existingModels.EcoEnchantsOpsAuditLog as mongoose.Model<IEcoEnchantsOpsAuditLog>) ||
  mongoose.model<IEcoEnchantsOpsAuditLog>("EcoEnchantsOpsAuditLog", OpsAuditLogSchema);
