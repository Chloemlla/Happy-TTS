import crypto from "node:crypto";
import { promises as fsPromises } from "node:fs";
import path from "node:path";
import jwt from "jsonwebtoken";
import { OidcSigningKeyModel, type OidcPublicJwk } from "../models/oidcKeyModel";
import { buildOAuthIdentityClaims } from "./oauthService";
import type { User } from "../utils/userStorage";
import logger from "../utils/logger";

export type { OidcPublicJwk } from "../models/oidcKeyModel";

const DEFAULT_SIGNING_KEY_PATH = "secrets/signing_key.pem";
const RSA_MODULUS_LENGTH = 2048;
const RSA_PUBLIC_EXPONENT = 0x10001;
const SIGNING_ALGORITHM = "RS256";

export interface OidcSigningKeyMaterial {
  kid: string;
  privateKeyPem: string;
  publicJwk: OidcPublicJwk;
}

export interface SignIdTokenParams {
  user: User;
  scopes: string[];
  clientId: string;
  issuer: string;
  accessTokenTtlSeconds: number;
  nonce?: string | null;
}

let cachedSigningKey: OidcSigningKeyMaterial | null = null;
let pendingSigningKey: Promise<OidcSigningKeyMaterial> | null = null;

/**
 * 解析签署密钥文件路径。相对路径按进程工作目录解析，与
 * scripts/generate-signing-env.js 写入的 `secrets/signing_key.pem` 约定一致。
 */
function resolveSigningKeyPath(): string {
  const configured = (process.env.SIGNING_KEY || "").trim() || DEFAULT_SIGNING_KEY_PATH;
  return path.isAbsolute(configured) ? configured : path.resolve(process.cwd(), configured);
}

function readJwkMember(source: unknown, member: string): string {
  if (!source || typeof source !== "object") return "";
  const value = (source as Record<string, unknown>)[member];
  return typeof value === "string" ? value : "";
}

/** RFC 7638 JWK thumbprint：成员按字典序、无空白，取 sha256 的 base64url。 */
function computeKeyId(modulus: string, exponent: string): string {
  const thumbprintInput = JSON.stringify({ e: exponent, kty: "RSA", n: modulus });
  return crypto.createHash("sha256").update(thumbprintInput).digest("base64url");
}

function buildSigningKeyMaterial(privateKeyPem: string): OidcSigningKeyMaterial {
  const exportedJwk: unknown = crypto.createPublicKey(privateKeyPem).export({ format: "jwk" });
  const modulus = readJwkMember(exportedJwk, "n");
  const exponent = readJwkMember(exportedJwk, "e");
  if (!modulus || !exponent) {
    throw new Error("[OIDC] 无法从签名私钥导出 RSA 公钥参数");
  }

  const kid = computeKeyId(modulus, exponent);
  return {
    kid,
    privateKeyPem,
    publicJwk: { kty: "RSA", use: "sig", alg: "RS256", kid, n: modulus, e: exponent },
  };
}

function tryBuildSigningKeyMaterial(privateKeyPem: string): OidcSigningKeyMaterial | null {
  try {
    return buildSigningKeyMaterial(privateKeyPem);
  } catch (error) {
    logger.warn("[OIDC] 签名密钥不可用，已跳过该来源", {
      reason: error instanceof Error ? error.message : "unknown",
    });
    return null;
  }
}

async function loadSigningKeyFromFile(): Promise<OidcSigningKeyMaterial | null> {
  const filePath = resolveSigningKeyPath();
  let privateKeyPem: string;
  try {
    privateKeyPem = await fsPromises.readFile(filePath, "utf8");
  } catch {
    return null;
  }
  if (!privateKeyPem.trim()) return null;

  const material = tryBuildSigningKeyMaterial(privateKeyPem);
  if (material) {
    logger.info("[OIDC] 已从文件加载 id_token 签名密钥", { kid: material.kid });
  }
  return material;
}

async function loadSigningKeyFromDatabase(): Promise<OidcSigningKeyMaterial | null> {
  const doc = await OidcSigningKeyModel.findOne({ active: true })
    .select("+privateKeyPem")
    .sort({ updatedAt: -1 })
    .lean();
  if (!doc) return null;

  const privateKeyPem = typeof doc.privateKeyPem === "string" ? doc.privateKeyPem : "";
  if (!privateKeyPem.trim()) return null;

  const material = tryBuildSigningKeyMaterial(privateKeyPem);
  if (material) {
    logger.info("[OIDC] 已从数据库加载 id_token 签名密钥", { kid: material.kid });
  }
  return material;
}

/**
 * 单例文档 upsert：过滤条件就是 active 标志本身，因此最多只会存在一条 active 记录，
 * 重新生成密钥时是替换而不是追加。
 */
async function persistSigningKey(material: OidcSigningKeyMaterial): Promise<void> {
  const now = new Date();
  await OidcSigningKeyModel.findOneAndUpdate(
    { active: true },
    {
      $set: {
        kid: material.kid,
        privateKeyPem: material.privateKeyPem,
        publicJwk: material.publicJwk,
        active: true,
        updatedAt: now,
      },
      $setOnInsert: { createdAt: now },
    },
    { upsert: true },
  );
}

async function generateSigningKey(): Promise<OidcSigningKeyMaterial> {
  const { privateKey } = crypto.generateKeyPairSync("rsa", {
    modulusLength: RSA_MODULUS_LENGTH,
    publicExponent: RSA_PUBLIC_EXPONENT,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });

  const material = buildSigningKeyMaterial(privateKey);
  await persistSigningKey(material);
  logger.info("[OIDC] 已生成并持久化新的 id_token 签名密钥", { kid: material.kid });
  return material;
}

async function resolveSigningKey(): Promise<OidcSigningKeyMaterial> {
  const fromFile = await loadSigningKeyFromFile();
  if (fromFile) return fromFile;

  const fromDatabase = await loadSigningKeyFromDatabase();
  if (fromDatabase) return fromDatabase;

  return generateSigningKey();
}

/**
 * 进程内缓存的签名密钥：文件优先，其次数据库，最后生成并落库。
 * 并发的首个调用者共享同一个 in-flight promise，不会各自生成一把密钥。
 */
export async function getOidcSigningKey(): Promise<OidcSigningKeyMaterial> {
  const cached = cachedSigningKey;
  if (cached) return cached;

  let inFlight = pendingSigningKey;
  if (!inFlight) {
    inFlight = resolveSigningKey()
      .then((material) => {
        cachedSigningKey = material;
        return material;
      })
      .finally(() => {
        pendingSigningKey = null;
      });
    pendingSigningKey = inFlight;
  }

  return inFlight;
}

export async function getOidcJwks(): Promise<{ keys: OidcPublicJwk[] }> {
  const material = await getOidcSigningKey();
  return { keys: [material.publicJwk] };
}

/**
 * 仅在 scope 含 openid 时签发 id_token，否则返回 null（调用方应完全省略该字段）。
 */
export async function signIdToken(params: SignIdTokenParams): Promise<string | null> {
  if (!params.scopes.includes("openid")) return null;

  const material = await getOidcSigningKey();
  const issuedAtSeconds = Math.floor(Date.now() / 1000);
  const payload: Record<string, unknown> = {
    iss: params.issuer,
    sub: String(params.user.id),
    aud: params.clientId,
    iat: issuedAtSeconds,
    exp: issuedAtSeconds + params.accessTokenTtlSeconds,
    auth_time: issuedAtSeconds,
  };

  const scopeSet = new Set(params.scopes);
  if (scopeSet.has("profile")) {
    payload.name = params.user.username;
    payload.preferred_username = params.user.username;
    const picture = params.user.avatarUrl;
    if (typeof picture === "string" && picture.trim()) {
      payload.picture = picture;
    }
  }

  if (scopeSet.has("email")) {
    payload.email = params.user.email;
    payload.email_verified = true;
  }

  Object.assign(payload, buildOAuthIdentityClaims(params.user));

  const nonce = typeof params.nonce === "string" ? params.nonce.trim() : "";
  if (nonce) {
    payload.nonce = nonce;
  }

  return jwt.sign(payload, material.privateKeyPem, {
    algorithm: SIGNING_ALGORITHM,
    keyid: material.kid,
  });
}
