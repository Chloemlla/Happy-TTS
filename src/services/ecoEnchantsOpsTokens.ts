import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import { v4 as uuidv4 } from "uuid";
import { config } from "../config/config";

export interface EcoEnchantsOpsActivationTokenPayload {
  productId: string;
  licenseId: string;
  activationId: string;
  scope: "ops.register";
  keyId: string;
}

export interface EcoEnchantsRpcSessionTokenPayload {
  productId: string;
  instanceId: string;
  activationId: string;
  scope: "ops.rpc";
  keyId: string;
}

export interface EcoEnchantsTokenSession {
  token: string;
  keyId: string;
  expiresAt: Date;
}

function getOpsTokenSecret(): string {
  return process.env.ECOENCHANTS_OPS_TOKEN_SECRET || config.jwtSecret;
}

function expiresAtFromSeconds(seconds: number): Date {
  return new Date(Date.now() + seconds * 1000);
}

export function hashEcoEnchantsOpsToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function createEcoEnchantsOpsActivationSession(params: {
  productId: string;
  licenseId: string;
  activationId: string;
}): EcoEnchantsTokenSession {
  const expiresInSeconds = Math.max(300, Number(process.env.ECOENCHANTS_OPS_ACTIVATION_TOKEN_TTL_SECONDS || 3600));
  const keyId = `activation:${params.activationId}`;
  const expiresAt = expiresAtFromSeconds(expiresInSeconds);
  const token = jwt.sign(
    {
      productId: params.productId,
      licenseId: params.licenseId,
      activationId: params.activationId,
      scope: "ops.register",
      keyId,
    },
    getOpsTokenSecret(),
    {
      expiresIn: expiresInSeconds,
      jwtid: `opsreg_${uuidv4()}`,
      subject: params.activationId,
    },
  );

  return { token, keyId, expiresAt };
}

export function verifyEcoEnchantsOpsActivationToken(token: string): EcoEnchantsOpsActivationTokenPayload {
  const decoded = jwt.verify(token, getOpsTokenSecret()) as Partial<EcoEnchantsOpsActivationTokenPayload>;
  if (
    decoded.scope !== "ops.register" ||
    typeof decoded.productId !== "string" ||
    typeof decoded.licenseId !== "string" ||
    typeof decoded.activationId !== "string" ||
    typeof decoded.keyId !== "string"
  ) {
    throw new Error("Invalid EcoEnchants ops activation token.");
  }

  return decoded as EcoEnchantsOpsActivationTokenPayload;
}

export function createEcoEnchantsRpcSessionToken(params: {
  productId: string;
  instanceId: string;
  activationId: string;
}): EcoEnchantsTokenSession {
  const expiresInSeconds = Math.max(300, Number(process.env.ECOENCHANTS_RPC_SESSION_TTL_SECONDS || 3600));
  const keyId = `session:${params.instanceId}:${crypto.randomBytes(6).toString("hex")}`;
  const expiresAt = expiresAtFromSeconds(expiresInSeconds);
  const token = jwt.sign(
    {
      productId: params.productId,
      instanceId: params.instanceId,
      activationId: params.activationId,
      scope: "ops.rpc",
      keyId,
    },
    getOpsTokenSecret(),
    {
      expiresIn: expiresInSeconds,
      jwtid: `opsrpc_${uuidv4()}`,
      subject: params.instanceId,
    },
  );

  return { token, keyId, expiresAt };
}

export function verifyEcoEnchantsRpcSessionToken(token: string): EcoEnchantsRpcSessionTokenPayload {
  const decoded = jwt.verify(token, getOpsTokenSecret()) as Partial<EcoEnchantsRpcSessionTokenPayload>;
  if (
    decoded.scope !== "ops.rpc" ||
    typeof decoded.productId !== "string" ||
    typeof decoded.instanceId !== "string" ||
    typeof decoded.activationId !== "string" ||
    typeof decoded.keyId !== "string"
  ) {
    throw new Error("Invalid EcoEnchants RPC session token.");
  }

  return decoded as EcoEnchantsRpcSessionTokenPayload;
}
