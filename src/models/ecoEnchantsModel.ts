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

export type EcoEnchantsLicenseStatus = (typeof ECO_ENCHANTS_LICENSE_STATUSES)[number];
export type EcoEnchantsActivationStatus = (typeof ECO_ENCHANTS_ACTIVATION_STATUSES)[number];
export type EcoEnchantsRiskEventStatus = (typeof ECO_ENCHANTS_RISK_EVENT_STATUSES)[number];
export type EcoEnchantsWebhookStatus = (typeof ECO_ENCHANTS_WEBHOOK_STATUSES)[number];

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

addIndex(ActivationSchema, { licenseId: 1, installationIdHash: 1 }, { unique: true });
addIndex(ActivationSchema, { licenseId: 1, status: 1 });
addIndex(ReleaseBuildSchema, { productId: 1, version: 1, channel: 1, sha256: 1 }, { unique: true });
addIndex(ReleaseBuildSchema, { productId: 1, channel: 1, releasedAt: -1 });
addIndex(IdempotencyRecordSchema, { scope: 1, key: 1 }, { unique: true });
addIndex(IdempotencyRecordSchema, { createdAt: 1 }, { expireAfterSeconds: 24 * 60 * 60 });
addIndex(WebhookEventSchema, { provider: 1, eventId: 1 }, { unique: true });

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
