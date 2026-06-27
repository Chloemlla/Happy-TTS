import crypto from "node:crypto";
import bcrypt from "bcrypt";
import { config } from "../config/config";
import {
  type OAuthAuthorizationCodeDoc,
  OAuthAuthorizationCodeModel,
  type OAuthClientDoc,
  OAuthClientModel,
  type OAuthClientType,
  type OAuthGrantDoc,
  OAuthGrantModel,
  type OAuthTokenDoc,
  OAuthTokenModel,
} from "../models/oauthModel";
import {
  ADMIN_PERMISSION,
  API_KEY_PERMISSION_DEFINITIONS,
  type ApiKeyPermissionDefinition,
} from "./apiKeyService";
import logger from "../utils/logger";
import { stripTrailingSlashes } from "../utils/urlString";
import { type User, UserStorage } from "../utils/userStorage";

const CLIENT_ID_PREFIX = "syn_client_";
const CLIENT_SECRET_PREFIX = "syn_secret_";
const AUTH_CODE_PREFIX = "syn_oac_";
const ACCESS_TOKEN_PREFIX = "syn_oat_";
const REFRESH_TOKEN_PREFIX = "syn_ort_";

const AUTH_CODE_TTL_MS = 10 * 60 * 1000;
const ACCESS_TOKEN_TTL_SECONDS = 2 * 60 * 60;
const REFRESH_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60;
const MAX_REDIRECT_URIS = 10;
const MAX_SCOPES_PER_CLIENT = 32;

export type OAuthScopeCategory = "identity" | ApiKeyPermissionDefinition["category"];

export interface OAuthScopeDefinition {
  key: string;
  label: string;
  description: string;
  category: OAuthScopeCategory;
  endpoints: string[];
  identityScope?: boolean;
  costCredits?: number;
}

export interface OAuthClientView {
  clientId: string;
  type: OAuthClientType;
  name: string;
  description: string | null;
  homepageUrl: string | null;
  logoUrl: string | null;
  redirectUris: string[];
  allowedScopes: string[];
  ownerUserId: string;
  rateLimitPerMinute: number;
  enabled: boolean;
  lastUsedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  hasClientSecret: boolean;
  operationalStats?: OAuthClientOperationalStats;
}

export interface OAuthGrantView {
  grantId: string;
  clientId: string;
  userId: string;
  user?: {
    id: string;
    username: string;
    email: string;
  } | null;
  scopes: string[];
  revokedAt: Date | null;
  lastUsedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  client?: OAuthClientView | null;
}

export interface OAuthClientOperationalStats {
  activeGrantCount: number;
  revokedGrantCount: number;
  activeAccessTokenCount: number;
  activeRefreshTokenCount: number;
  revokedTokenCount: number;
  tokenUsageCount: number;
  lastTokenUsedAt: Date | null;
}

export interface OAuthAuthorizeRequest {
  response_type: string;
  client_id: string;
  redirect_uri: string;
  scope?: string | string[];
  state?: string;
  code_challenge?: string;
  code_challenge_method?: string;
}

export interface OAuthAuthorizePreview {
  client: OAuthClientView;
  scopes: string[];
  scopeDetails: OAuthScopeDefinition[];
  redirectUri: string;
  responseType: "code";
  state: string | null;
  codeChallengeMethod: "plain" | "S256" | null;
}

export interface OAuthTokenResponse {
  access_token: string;
  token_type: "Bearer";
  expires_in: number;
  refresh_token?: string;
  refresh_expires_in?: number;
  scope: string;
  user?: Record<string, unknown>;
}

export interface OAuthAccessContext {
  token: OAuthTokenDoc;
  client: OAuthClientDoc;
  grant: OAuthGrantDoc;
  user: User;
  scopes: string[];
}

export class OAuthError extends Error {
  statusCode: number;
  errorCode: string;
  errorDescription: string;

  constructor(statusCode: number, errorCode: string, errorDescription: string) {
    super(errorDescription);
    this.name = "OAuthError";
    this.statusCode = statusCode;
    this.errorCode = errorCode;
    this.errorDescription = errorDescription;
  }
}

const identityScopeDefinitions: OAuthScopeDefinition[] = [
  {
    key: "openid",
    label: "身份标识",
    description: "确认授权用户在 Synapse 中的唯一用户 ID。",
    category: "identity",
    endpoints: ["/api/oauth/userinfo"],
    identityScope: true,
  },
  {
    key: "profile",
    label: "基础资料",
    description: "读取 Synapse 用户名、头像、角色和当前管理员状态。",
    category: "identity",
    endpoints: ["/api/oauth/userinfo"],
    identityScope: true,
  },
  {
    key: "email",
    label: "邮箱地址",
    description: "读取授权用户绑定的 Synapse 邮箱。",
    category: "identity",
    endpoints: ["/api/oauth/userinfo"],
    identityScope: true,
  },
  {
    key: "admin:identity",
    label: "管理员身份",
    description: "返回当前账号是否仍是 Synapse 管理员；信用者授权时该字段返回 false。",
    category: "identity",
    endpoints: ["/api/oauth/userinfo", "/api/oauth/introspect"],
    identityScope: true,
  },
];

const apiScopeDefinitions: OAuthScopeDefinition[] = API_KEY_PERMISSION_DEFINITIONS.filter(
  (permission) => permission.key !== ADMIN_PERMISSION,
).map((permission) => ({
  key: permission.key,
  label: permission.label,
  description: permission.description,
  category: permission.category,
  endpoints: permission.endpoints,
  costCredits: permission.costCredits,
}));

export const OAUTH_SCOPE_DEFINITIONS: OAuthScopeDefinition[] = [
  ...identityScopeDefinitions,
  ...apiScopeDefinitions,
];

const scopeDefinitionMap = new Map(OAUTH_SCOPE_DEFINITIONS.map((scope) => [scope.key, scope]));
const knownScopeSet = new Set(OAUTH_SCOPE_DEFINITIONS.map((scope) => scope.key));
const apiScopeSet = new Set<string>(apiScopeDefinitions.map((scope) => scope.key));
const defaultClientScopes = ["openid", "profile", "email", "admin:identity", "status"];
const defaultRequestedScopes = ["openid", "profile", "admin:identity"];

function toPlain<T>(doc: T): T {
  return typeof (doc as any)?.toObject === "function" ? ((doc as any).toObject() as T) : doc;
}

function normalizeOptionalText(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, maxLength);
}

function randomSecret(prefix: string, bytes = 32): string {
  return `${prefix}${crypto.randomBytes(bytes).toString("base64url")}`;
}

function hashOpaqueToken(value: string): string {
  return crypto.createHmac("sha256", config.jwtSecret).update(value).digest("hex");
}

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

async function hashClientSecret(value: string): Promise<string> {
  return bcrypt.hash(value, config.bcryptSaltRounds);
}

function isBcryptHash(value: string): boolean {
  return value.startsWith("$2a$") || value.startsWith("$2b$") || value.startsWith("$2y$");
}

function legacyClientSecretHash(value: string): string {
  return hashOpaqueToken(value);
}

function hasAuthScheme(authHeader: string | undefined, scheme: string): boolean {
  if (!authHeader) return false;
  const trimmed = authHeader.trimStart();
  if (trimmed.length <= scheme.length) return false;
  const separator = trimmed.charCodeAt(scheme.length);
  const hasSeparator = separator === 0x20 || separator === 0x09;
  return hasSeparator && trimmed.slice(0, scheme.length).toLowerCase() === scheme.toLowerCase();
}

async function verifyClientSecret(client: OAuthClientDoc, clientSecret: string): Promise<boolean> {
  const storedHash = client.clientSecretHash;
  if (!storedHash) return false;

  if (isBcryptHash(storedHash)) {
    return bcrypt.compare(clientSecret, storedHash);
  }

  if (!safeEqual(legacyClientSecretHash(clientSecret), storedHash)) {
    return false;
  }

  const upgradedHash = await hashClientSecret(clientSecret);
  await OAuthClientModel.updateOne(
    { clientId: client.clientId, clientSecretHash: storedHash },
    { $set: { clientSecretHash: upgradedHash, updatedAt: new Date() } },
  );
  return true;
}

function isDuplicateKeyError(error: unknown): boolean {
  const code = (error as any)?.code;
  return code === 11000 || code === 11001;
}

function wasUpdateApplied(result: { modifiedCount?: number; matchedCount?: number; nModified?: number }): boolean {
  return Number(result.modifiedCount ?? result.nModified ?? result.matchedCount ?? 0) > 0;
}

function isLocalhostName(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return host === "localhost" || host === "127.0.0.1" || host === "::1" || host === "[::1]";
}

function isValidUrl(value: string, opts: { allowHttpLocalhost?: boolean } = {}): boolean {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") return false;
    if (url.protocol === "http:") {
      if (!opts.allowHttpLocalhost || !isLocalhostName(url.hostname)) return false;
    }
    if (url.hash) return false;
    return true;
  } catch {
    return false;
  }
}

function normalizeRedirectUris(value: unknown): string[] {
  const source = Array.isArray(value) ? value : typeof value === "string" ? value.split(/\r?\n|,/) : [];
  const normalized = Array.from(
    new Set(
      source
        .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
        .filter(Boolean),
    ),
  );

  if (normalized.length === 0 || normalized.length > MAX_REDIRECT_URIS) {
    throw new OAuthError(400, "invalid_client_metadata", `redirectUris 必须提供 1-${MAX_REDIRECT_URIS} 个回调地址`);
  }

  for (const uri of normalized) {
    if (!isValidUrl(uri, { allowHttpLocalhost: true })) {
      throw new OAuthError(400, "invalid_client_metadata", `无效的回调地址: ${uri}`);
    }
  }

  return normalized;
}

function normalizeUrlField(value: unknown, field: string): string | null {
  const normalized = normalizeOptionalText(value, 512);
  if (!normalized) return null;
  if (!isValidUrl(normalized)) {
    throw new OAuthError(400, "invalid_client_metadata", `${field} 必须是有效 URL`);
  }
  return normalized;
}

export function getOAuthScopeDefinitions(): OAuthScopeDefinition[] {
  return OAUTH_SCOPE_DEFINITIONS;
}

export function isOAuthAccessTokenValue(value: string | undefined): boolean {
  return typeof value === "string" && value.startsWith(ACCESS_TOKEN_PREFIX);
}

export function isApiScope(scope: string): boolean {
  return apiScopeSet.has(scope);
}

export function parseScopes(input: unknown): string[] {
  const source = Array.isArray(input)
    ? input
    : typeof input === "string"
      ? input.split(/[\s,]+/)
      : [];

  return Array.from(
    new Set(
      source
        .map((scope) => (typeof scope === "string" ? scope.trim() : ""))
        .filter(Boolean),
    ),
  );
}

export function normalizeOAuthScopes(
  input: unknown,
  opts: { fallback?: string[]; allowedScopes?: string[] } = {},
): string[] {
  const parsed = parseScopes(input);
  const source = parsed.length > 0 ? parsed : opts.fallback || defaultRequestedScopes;
  const allowed = opts.allowedScopes ? new Set(opts.allowedScopes) : null;
  const normalized: string[] = [];

  for (const scope of source) {
    if (!knownScopeSet.has(scope)) {
      throw new OAuthError(400, "invalid_scope", `不支持的 scope: ${scope}`);
    }
    if (allowed && !allowed.has(scope)) {
      throw new OAuthError(400, "invalid_scope", `客户端未启用 scope: ${scope}`);
    }
    if (!normalized.includes(scope)) normalized.push(scope);
  }

  if (normalized.length === 0 || normalized.length > MAX_SCOPES_PER_CLIENT) {
    throw new OAuthError(400, "invalid_scope", `scope 数量必须在 1-${MAX_SCOPES_PER_CLIENT} 之间`);
  }

  return normalized;
}

export function getScopeDetails(scopes: string[]): OAuthScopeDefinition[] {
  return scopes
    .map((scope) => scopeDefinitionMap.get(scope))
    .filter((scope): scope is OAuthScopeDefinition => Boolean(scope));
}

function emptyOAuthClientStats(): OAuthClientOperationalStats {
  return {
    activeGrantCount: 0,
    revokedGrantCount: 0,
    activeAccessTokenCount: 0,
    activeRefreshTokenCount: 0,
    revokedTokenCount: 0,
    tokenUsageCount: 0,
    lastTokenUsedAt: null,
  };
}

export function toOAuthClientView(
  client: OAuthClientDoc,
  operationalStats?: OAuthClientOperationalStats,
): OAuthClientView {
  const doc = toPlain(client);
  const view: OAuthClientView = {
    clientId: doc.clientId,
    type: doc.type,
    name: doc.name,
    description: doc.description,
    homepageUrl: doc.homepageUrl,
    logoUrl: doc.logoUrl,
    redirectUris: doc.redirectUris || [],
    allowedScopes: doc.allowedScopes || [],
    ownerUserId: doc.ownerUserId,
    rateLimitPerMinute: doc.rateLimitPerMinute,
    enabled: doc.enabled,
    lastUsedAt: doc.lastUsedAt,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    hasClientSecret: Boolean(doc.clientSecretHash),
  };
  if (operationalStats) view.operationalStats = operationalStats;
  return view;
}

export function toOAuthGrantView(grant: OAuthGrantDoc, client?: OAuthClientDoc | null, user?: User | null): OAuthGrantView {
  const doc = toPlain(grant);
  return {
    grantId: doc.grantId,
    clientId: doc.clientId,
    userId: doc.userId,
    user: user
      ? {
          id: user.id,
          username: user.username,
          email: user.email,
        }
      : null,
    scopes: doc.scopes || [],
    revokedAt: doc.revokedAt,
    lastUsedAt: doc.lastUsedAt,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    client: client ? toOAuthClientView(client) : undefined,
  };
}

export function canAuthorizeOAuth(user: Pick<User, "role"> | null | undefined): boolean {
  return Boolean(user && (user.role === "admin" || user.role === "trusted"));
}

function assertOAuthAuthorizingUser(user: Pick<User, "role"> | null | undefined): void {
  if (!canAuthorizeOAuth(user)) {
    throw new OAuthError(403, "access_denied", "只有现有 Synapse 管理员或信用者可以授权第三方应用");
  }
}

function assertClientEnabled(client: OAuthClientDoc | null): OAuthClientDoc {
  if (!client || !client.enabled) {
    throw new OAuthError(400, "invalid_client", "OAuth 客户端不存在或已停用");
  }
  return client;
}

function assertRedirectUri(client: OAuthClientDoc, redirectUri: string): void {
  if (!client.redirectUris.includes(redirectUri)) {
    throw new OAuthError(400, "invalid_request", "redirect_uri 未在客户端白名单中");
  }
}

function normalizeCodeChallengeMethod(value: unknown): "plain" | "S256" | null {
  if (value === undefined || value === null || value === "") return null;
  if (value === "plain" || value === "S256") return value;
  throw new OAuthError(400, "invalid_request", "code_challenge_method 只支持 plain 或 S256");
}

function assertPkceRequest(client: OAuthClientDoc, codeChallenge: string | undefined, method: "plain" | "S256" | null): void {
  if (!codeChallenge) {
    if (client.type === "public") {
      throw new OAuthError(400, "invalid_request", "public OAuth 客户端必须使用 PKCE");
    }
    return;
  }

  if (codeChallenge.length < 43 || codeChallenge.length > 128) {
    throw new OAuthError(400, "invalid_request", "code_challenge 长度必须在 43-128 字符之间");
  }

  if (!/^[A-Za-z0-9._~-]+$/.test(codeChallenge)) {
    throw new OAuthError(400, "invalid_request", "code_challenge 包含非法字符");
  }

  if (!method) {
    throw new OAuthError(400, "invalid_request", "使用 PKCE 时必须提供 code_challenge_method");
  }
}

function verifyPkce(code: OAuthAuthorizationCodeDoc, codeVerifier: string | undefined): void {
  if (!code.codeChallenge) return;

  if (!codeVerifier || codeVerifier.length < 43 || codeVerifier.length > 128 || !/^[A-Za-z0-9._~-]+$/.test(codeVerifier)) {
    throw new OAuthError(400, "invalid_grant", "code_verifier 无效");
  }

  const expected =
    code.codeChallengeMethod === "S256"
      ? crypto.createHash("sha256").update(codeVerifier).digest("base64url")
      : codeVerifier;

  if (expected !== code.codeChallenge) {
    throw new OAuthError(400, "invalid_grant", "PKCE 校验失败");
  }
}

function appendRedirectParams(redirectUri: string, params: Record<string, string | null | undefined>): string {
  const url = new URL(redirectUri);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, value);
    }
  });
  return url.toString();
}

export function buildOAuthIdentityClaims(user: Pick<User, "role">): Record<string, unknown> {
  const isAdmin = user.role === "admin";
  const isTrusted = user.role === "trusted";

  return {
    role: user.role,
    roles: [user.role],
    isAdmin,
    is_admin: isAdmin,
    admin: isAdmin,
    synapseAdmin: isAdmin,
    synapse_admin: isAdmin,
    isTrusted,
    is_trusted: isTrusted,
    synapseTrusted: isTrusted,
    synapse_trusted: isTrusted,
  };
}

function buildUserProfile(user: User, scopes: string[]): Record<string, unknown> {
  const scopeSet = new Set(scopes);
  const profile: Record<string, unknown> = {
    sub: user.id,
    id: user.id,
  };

  if (scopeSet.has("profile") || scopeSet.has("admin:identity")) {
    profile.username = user.username;
    profile.name = user.username;
    profile.avatarUrl = user.avatarUrl || null;
    Object.assign(profile, buildOAuthIdentityClaims(user));
    profile.authProvider = user.authProvider || "local";
    profile.createdAt = user.createdAt;
    profile.accountStatus = user.accountStatus || "active";
  }

  if (scopeSet.has("email")) {
    profile.email = user.email;
    profile.emailVerified = true;
  }

  return profile;
}

async function loadActiveOAuthAuthorizingUser(userId: string): Promise<User> {
  const user = await UserStorage.getUserById(userId);
  if (!user) {
    throw new OAuthError(400, "invalid_grant", "授权用户不存在");
  }
  if ((user as any).accountStatus === "suspended") {
    throw new OAuthError(403, "access_denied", "授权用户已被封停");
  }
  assertOAuthAuthorizingUser(user);
  return user;
}

async function upsertGrant(clientId: string, userId: string, scopes: string[]): Promise<OAuthGrantDoc> {
  const now = new Date();
  const update = {
    $set: {
      scopes,
      revokedAt: null,
      updatedAt: now,
    },
    $setOnInsert: {
      grantId: `og_${crypto.randomBytes(12).toString("hex")}`,
      clientId,
      userId,
      createdAt: now,
    },
  };

  let grant: OAuthGrantDoc | null = null;

  try {
    grant = (await OAuthGrantModel.findOneAndUpdate(
      { clientId, userId },
      update,
      { upsert: true, returnDocument: "after" },
    ).lean()) as OAuthGrantDoc | null;
  } catch (error) {
    if (!isDuplicateKeyError(error)) {
      throw error;
    }
    logger.warn("[OAuth] 授权记录并发创建冲突，重试更新", { clientId, userId });
    grant = (await OAuthGrantModel.findOneAndUpdate(
      { clientId, userId },
      update,
      { upsert: true, returnDocument: "after" },
    ).lean()) as OAuthGrantDoc | null;
  }

  if (!grant) {
    throw new OAuthError(500, "server_error", "创建授权记录失败");
  }

  return grant;
}

function getEffectiveTokenScopes(token: OAuthTokenDoc, grant: OAuthGrantDoc, client: OAuthClientDoc): string[] {
  const grantScopes = new Set(grant.scopes || []);
  const clientScopes = new Set(client.allowedScopes || []);
  return (token.scopes || []).filter((scope) => grantScopes.has(scope) && clientScopes.has(scope));
}

async function createTokenPair(opts: {
  client: OAuthClientDoc;
  grant: OAuthGrantDoc;
  user: User;
  scopes: string[];
}): Promise<OAuthTokenResponse> {
  const accessToken = randomSecret(ACCESS_TOKEN_PREFIX, 32);
  const refreshToken = opts.client.type === "confidential" ? randomSecret(REFRESH_TOKEN_PREFIX, 32) : randomSecret(REFRESH_TOKEN_PREFIX, 32);
  const now = Date.now();
  const accessTokenExpiresAt = new Date(now + ACCESS_TOKEN_TTL_SECONDS * 1000);
  const refreshTokenExpiresAt = new Date(now + REFRESH_TOKEN_TTL_SECONDS * 1000);

  await OAuthTokenModel.create({
    tokenId: `ot_${crypto.randomBytes(12).toString("hex")}`,
    accessTokenHash: hashOpaqueToken(accessToken),
    refreshTokenHash: hashOpaqueToken(refreshToken),
    clientId: opts.client.clientId,
    userId: opts.user.id,
    grantId: opts.grant.grantId,
    scopes: opts.scopes,
    accessTokenExpiresAt,
    refreshTokenExpiresAt,
    revokedAt: null,
  });

  await OAuthClientModel.updateOne(
    { clientId: opts.client.clientId },
    { $set: { lastUsedAt: new Date(), updatedAt: new Date() } },
  );

  return {
    access_token: accessToken,
    refresh_token: refreshToken,
    token_type: "Bearer",
    expires_in: ACCESS_TOKEN_TTL_SECONDS,
    refresh_expires_in: REFRESH_TOKEN_TTL_SECONDS,
    scope: opts.scopes.join(" "),
    user: buildUserProfile(opts.user, opts.scopes),
  };
}

async function revokeClientAuthorizations(
  clientId: string,
  opts: { revokeGrants?: boolean; scopes?: string[] } = {},
): Promise<void> {
  const now = new Date();
  const filter: Record<string, unknown> = { clientId };
  if (opts.scopes?.length) {
    filter.scopes = { $in: opts.scopes };
  }

  await Promise.all([
    OAuthTokenModel.updateMany(filter, { $set: { revokedAt: now, updatedAt: now } }),
    opts.revokeGrants
      ? OAuthGrantModel.updateMany(filter, { $set: { revokedAt: now, updatedAt: now } })
      : Promise.resolve(),
  ]);
}

export async function createOAuthClient(opts: {
  name: unknown;
  description?: unknown;
  homepageUrl?: unknown;
  logoUrl?: unknown;
  redirectUris: unknown;
  allowedScopes?: unknown;
  ownerUserId: string;
  type?: unknown;
  rateLimitPerMinute?: unknown;
}): Promise<{ client: OAuthClientView; clientSecret: string | null }> {
  const name = normalizeOptionalText(opts.name, 80);
  if (!name) {
    throw new OAuthError(400, "invalid_client_metadata", "客户端名称不能为空");
  }

  const type: OAuthClientType = opts.type === "public" ? "public" : "confidential";
  const clientSecret = type === "confidential" ? randomSecret(CLIENT_SECRET_PREFIX, 32) : null;
  const allowedScopes = normalizeOAuthScopes(opts.allowedScopes, { fallback: defaultClientScopes });
  const redirectUris = normalizeRedirectUris(opts.redirectUris);
  const rateLimitPerMinute = Math.min(Math.max(Number(opts.rateLimitPerMinute) || 120, 1), 1000);

  const client = (await OAuthClientModel.create({
    clientId: randomSecret(CLIENT_ID_PREFIX, 18),
    clientSecretHash: clientSecret ? await hashClientSecret(clientSecret) : null,
    type,
    name,
    description: normalizeOptionalText(opts.description, 500),
    homepageUrl: normalizeUrlField(opts.homepageUrl, "homepageUrl"),
    logoUrl: normalizeUrlField(opts.logoUrl, "logoUrl"),
    redirectUris,
    allowedScopes,
    ownerUserId: opts.ownerUserId,
    rateLimitPerMinute,
    enabled: true,
  })) as OAuthClientDoc;

  logger.info("[OAuth] 创建客户端", { clientId: client.clientId, ownerUserId: opts.ownerUserId, type });
  return { client: toOAuthClientView(client), clientSecret };
}

async function loadOAuthClientOperationalStats(clientIds: string[]): Promise<Map<string, OAuthClientOperationalStats>> {
  const uniqueClientIds = Array.from(new Set(clientIds.filter(Boolean)));
  const statsMap = new Map<string, OAuthClientOperationalStats>();
  uniqueClientIds.forEach((clientId) => statsMap.set(clientId, emptyOAuthClientStats()));
  if (uniqueClientIds.length === 0) return statsMap;

  const now = new Date();
  const [grantRows, tokenRows] = await Promise.all([
    OAuthGrantModel.aggregate([
      { $match: { clientId: { $in: uniqueClientIds } } },
      {
        $group: {
          _id: "$clientId",
          activeGrantCount: { $sum: { $cond: [{ $eq: ["$revokedAt", null] }, 1, 0] } },
          revokedGrantCount: { $sum: { $cond: [{ $ne: ["$revokedAt", null] }, 1, 0] } },
        },
      },
    ]),
    OAuthTokenModel.aggregate([
      { $match: { clientId: { $in: uniqueClientIds } } },
      {
        $group: {
          _id: "$clientId",
          activeAccessTokenCount: {
            $sum: {
              $cond: [
                { $and: [{ $eq: ["$revokedAt", null] }, { $gt: ["$accessTokenExpiresAt", now] }] },
                1,
                0,
              ],
            },
          },
          activeRefreshTokenCount: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $eq: ["$revokedAt", null] },
                    { $ne: ["$refreshTokenHash", null] },
                    { $gt: ["$refreshTokenExpiresAt", now] },
                  ],
                },
                1,
                0,
              ],
            },
          },
          revokedTokenCount: { $sum: { $cond: [{ $ne: ["$revokedAt", null] }, 1, 0] } },
          tokenUsageCount: { $sum: { $ifNull: ["$usageCount", 0] } },
          lastTokenUsedAt: { $max: "$lastUsedAt" },
        },
      },
    ]),
  ]);

  for (const row of grantRows as Array<Record<string, any>>) {
    const clientId = String(row._id || "");
    const current = statsMap.get(clientId) || emptyOAuthClientStats();
    statsMap.set(clientId, {
      ...current,
      activeGrantCount: Number(row.activeGrantCount || 0),
      revokedGrantCount: Number(row.revokedGrantCount || 0),
    });
  }

  for (const row of tokenRows as Array<Record<string, any>>) {
    const clientId = String(row._id || "");
    const current = statsMap.get(clientId) || emptyOAuthClientStats();
    statsMap.set(clientId, {
      ...current,
      activeAccessTokenCount: Number(row.activeAccessTokenCount || 0),
      activeRefreshTokenCount: Number(row.activeRefreshTokenCount || 0),
      revokedTokenCount: Number(row.revokedTokenCount || 0),
      tokenUsageCount: Number(row.tokenUsageCount || 0),
      lastTokenUsedAt: row.lastTokenUsedAt || null,
    });
  }

  return statsMap;
}

export async function listOAuthClients(): Promise<OAuthClientView[]> {
  const clients = (await OAuthClientModel.find().sort({ createdAt: -1 }).lean()) as OAuthClientDoc[];
  const statsMap = await loadOAuthClientOperationalStats(clients.map((client) => client.clientId));
  return clients.map((client) => toOAuthClientView(client, statsMap.get(client.clientId)));
}

export async function getOAuthClient(clientId: string): Promise<OAuthClientView | null> {
  const client = (await OAuthClientModel.findOne({ clientId }).lean()) as OAuthClientDoc | null;
  if (!client) return null;
  const statsMap = await loadOAuthClientOperationalStats([client.clientId]);
  return toOAuthClientView(client, statsMap.get(client.clientId));
}

export async function updateOAuthClient(
  clientId: string,
  updates: {
    name?: unknown;
    description?: unknown;
    homepageUrl?: unknown;
    logoUrl?: unknown;
    redirectUris?: unknown;
    allowedScopes?: unknown;
    rateLimitPerMinute?: unknown;
    enabled?: unknown;
  },
): Promise<OAuthClientView | null> {
  const current = (await OAuthClientModel.findOne({ clientId }).lean()) as OAuthClientDoc | null;
  if (!current) return null;

  const patch: Partial<OAuthClientDoc> = { updatedAt: new Date() };
  if (updates.name !== undefined) {
    const name = normalizeOptionalText(updates.name, 80);
    if (!name) throw new OAuthError(400, "invalid_client_metadata", "客户端名称不能为空");
    patch.name = name;
  }
  if (updates.description !== undefined) patch.description = normalizeOptionalText(updates.description, 500);
  if (updates.homepageUrl !== undefined) patch.homepageUrl = normalizeUrlField(updates.homepageUrl, "homepageUrl");
  if (updates.logoUrl !== undefined) patch.logoUrl = normalizeUrlField(updates.logoUrl, "logoUrl");
  if (updates.redirectUris !== undefined) patch.redirectUris = normalizeRedirectUris(updates.redirectUris);
  if (updates.allowedScopes !== undefined) patch.allowedScopes = normalizeOAuthScopes(updates.allowedScopes, { fallback: current.allowedScopes });
  if (updates.rateLimitPerMinute !== undefined) {
    patch.rateLimitPerMinute = Math.min(Math.max(Number(updates.rateLimitPerMinute) || current.rateLimitPerMinute, 1), 1000);
  }
  if (updates.enabled !== undefined) patch.enabled = Boolean(updates.enabled);

  const updated = (await OAuthClientModel.findOneAndUpdate({ clientId }, { $set: patch }, { returnDocument: "after" }).lean()) as OAuthClientDoc | null;
  if (!updated) return null;

  if (current.enabled && patch.enabled === false) {
    await revokeClientAuthorizations(clientId, { revokeGrants: true });
    logger.warn("[OAuth] 客户端已停用，相关授权和 token 已吊销", { clientId });
  } else if (patch.allowedScopes) {
    const nextScopes = new Set(patch.allowedScopes);
    const removedScopes = (current.allowedScopes || []).filter((scope) => !nextScopes.has(scope));
    if (removedScopes.length > 0) {
      await revokeClientAuthorizations(clientId, { revokeGrants: true, scopes: removedScopes });
      logger.warn("[OAuth] 客户端 scope 已收缩，含已移除 scope 的授权和 token 已吊销", {
        clientId,
        removedScopes,
      });
    }
  }

  return toOAuthClientView(updated);
}

export async function rotateOAuthClientSecret(clientId: string): Promise<{ client: OAuthClientView; clientSecret: string } | null> {
  const clientSecret = randomSecret(CLIENT_SECRET_PREFIX, 32);
  const updated = (await OAuthClientModel.findOneAndUpdate(
    { clientId, type: "confidential" },
    { $set: { clientSecretHash: await hashClientSecret(clientSecret), updatedAt: new Date() } },
    { returnDocument: "after" },
  ).lean()) as OAuthClientDoc | null;

  if (!updated) return null;
  await OAuthTokenModel.updateMany({ clientId }, { $set: { revokedAt: new Date(), updatedAt: new Date() } });
  logger.warn("[OAuth] 客户端密钥已轮换，既有 token 已吊销", { clientId });
  return { client: toOAuthClientView(updated), clientSecret };
}

export async function deleteOAuthClient(clientId: string): Promise<boolean> {
  const now = new Date();
  const result = await OAuthClientModel.updateOne({ clientId }, { $set: { enabled: false, updatedAt: now } });
  await revokeClientAuthorizations(clientId, { revokeGrants: true });
  return result.matchedCount > 0;
}

export async function validateAuthorizeRequest(input: OAuthAuthorizeRequest): Promise<OAuthAuthorizePreview> {
  if (input.response_type !== "code") {
    throw new OAuthError(400, "unsupported_response_type", "response_type 只支持 code");
  }

  const clientId = normalizeOptionalText(input.client_id, 160);
  const redirectUri = normalizeOptionalText(input.redirect_uri, 2048);
  if (!clientId || !redirectUri) {
    throw new OAuthError(400, "invalid_request", "缺少 client_id 或 redirect_uri");
  }

  const client = assertClientEnabled((await OAuthClientModel.findOne({ clientId }).lean()) as OAuthClientDoc | null);
  assertRedirectUri(client, redirectUri);
  const codeChallengeMethod = normalizeCodeChallengeMethod(input.code_challenge_method);
  const codeChallenge = normalizeOptionalText(input.code_challenge, 128) || undefined;
  assertPkceRequest(client, codeChallenge, codeChallengeMethod);
  const scopes = normalizeOAuthScopes(input.scope, { fallback: defaultRequestedScopes, allowedScopes: client.allowedScopes });

  return {
    client: toOAuthClientView(client),
    scopes,
    scopeDetails: getScopeDetails(scopes),
    redirectUri,
    responseType: "code",
    state: normalizeOptionalText(input.state, 500),
    codeChallengeMethod,
  };
}

export async function approveAuthorization(
  input: OAuthAuthorizeRequest,
  user: User,
): Promise<{ redirectUri: string; scopes: string[] }> {
  assertOAuthAuthorizingUser(user);
  const preview = await validateAuthorizeRequest(input);
  const client = assertClientEnabled((await OAuthClientModel.findOne({ clientId: preview.client.clientId }).lean()) as OAuthClientDoc | null);
  const grant = await upsertGrant(client.clientId, user.id, preview.scopes);
  const code = randomSecret(AUTH_CODE_PREFIX, 32);

  await OAuthAuthorizationCodeModel.create({
    codeHash: hashOpaqueToken(code),
    clientId: client.clientId,
    userId: user.id,
    redirectUri: preview.redirectUri,
    scopes: preview.scopes,
    codeChallenge: normalizeOptionalText(input.code_challenge, 128),
    codeChallengeMethod: preview.codeChallengeMethod,
    expiresAt: new Date(Date.now() + AUTH_CODE_TTL_MS),
    usedAt: null,
  });

  logger.info("[OAuth] 授权用户同意授权", {
    clientId: client.clientId,
    userId: user.id,
    grantId: grant.grantId,
    scopes: preview.scopes,
  });

  return {
    redirectUri: appendRedirectParams(preview.redirectUri, {
      code,
      state: preview.state,
    }),
    scopes: preview.scopes,
  };
}

export async function denyAuthorization(input: OAuthAuthorizeRequest): Promise<{ redirectUri: string }> {
  const preview = await validateAuthorizeRequest(input);
  return {
    redirectUri: appendRedirectParams(preview.redirectUri, {
      error: "access_denied",
      error_description: "授权用户拒绝了请求",
      state: preview.state,
    }),
  };
}

export function parseClientBasicAuth(authHeader: string | undefined): { clientId: string; clientSecret: string } | null {
  if (!hasAuthScheme(authHeader, "Basic")) return null;
  const encoded = authHeader!.trimStart().slice("Basic".length).trim();
  if (!encoded) return null;
  try {
    const decoded = Buffer.from(encoded, "base64").toString("utf8");
    const splitAt = decoded.indexOf(":");
    if (splitAt <= 0) return null;
    return {
      clientId: decodeURIComponent(decoded.slice(0, splitAt)),
      clientSecret: decodeURIComponent(decoded.slice(splitAt + 1)),
    };
  } catch {
    return null;
  }
}

async function authenticateClient(opts: {
  authHeader?: string;
  clientId?: unknown;
  clientSecret?: unknown;
}): Promise<OAuthClientDoc> {
  const hasBasicAuth = hasAuthScheme(opts.authHeader, "Basic");
  const basic = parseClientBasicAuth(opts.authHeader);
  if (hasBasicAuth && !basic) {
    throw new OAuthError(401, "invalid_client", "client Basic 认证无效");
  }

  const basicClientId = normalizeOptionalText(basic?.clientId, 160);
  const basicClientSecret = normalizeOptionalText(basic?.clientSecret, 512);
  const bodyClientId = normalizeOptionalText(opts.clientId, 160);
  const bodyClientSecret = normalizeOptionalText(opts.clientSecret, 512);

  if (basicClientId && bodyClientId && basicClientId !== bodyClientId) {
    throw new OAuthError(400, "invalid_request", "client_id 与 Basic 认证不一致");
  }
  if (basicClientSecret && bodyClientSecret && basicClientSecret !== bodyClientSecret) {
    throw new OAuthError(400, "invalid_request", "client_secret 与 Basic 认证不一致");
  }

  const clientId = basicClientId || bodyClientId;
  const clientSecret = basicClientSecret || bodyClientSecret;

  if (!clientId) {
    throw new OAuthError(401, "invalid_client", "缺少 client_id");
  }

  const client = assertClientEnabled((await OAuthClientModel.findOne({ clientId }).lean()) as OAuthClientDoc | null);

  if (client.type === "public") {
    if (hasBasicAuth || clientSecret) {
      throw new OAuthError(401, "invalid_client", "public OAuth 客户端不能使用 client_secret 或 Basic 认证");
    }
    return client;
  }

  if (client.type === "confidential") {
    if (!clientSecret || !(await verifyClientSecret(client, clientSecret))) {
      throw new OAuthError(401, "invalid_client", "client_secret 无效");
    }
  }

  return client;
}

export async function exchangeAuthorizationCode(opts: {
  authHeader?: string;
  clientId?: unknown;
  clientSecret?: unknown;
  code?: unknown;
  redirectUri?: unknown;
  codeVerifier?: unknown;
}): Promise<OAuthTokenResponse> {
  const client = await authenticateClient({
    authHeader: opts.authHeader,
    clientId: opts.clientId,
    clientSecret: opts.clientSecret,
  });
  const codeValue = normalizeOptionalText(opts.code, 512);
  const redirectUri = normalizeOptionalText(opts.redirectUri, 2048);
  if (!codeValue || !redirectUri) {
    throw new OAuthError(400, "invalid_request", "缺少 code 或 redirect_uri");
  }

  const codeDoc = (await OAuthAuthorizationCodeModel.findOne({ codeHash: hashOpaqueToken(codeValue) }).lean()) as OAuthAuthorizationCodeDoc | null;
  if (!codeDoc || codeDoc.expiresAt.getTime() <= Date.now()) {
    throw new OAuthError(400, "invalid_grant", "授权码无效或已过期");
  }
  if (codeDoc.usedAt) {
    throw new OAuthError(400, "invalid_grant", "授权码已被使用");
  }
  if (codeDoc.clientId !== client.clientId || codeDoc.redirectUri !== redirectUri) {
    throw new OAuthError(400, "invalid_grant", "授权码与客户端或回调地址不匹配");
  }
  if (client.type === "public" && !codeDoc.codeChallenge) {
    throw new OAuthError(400, "invalid_grant", "public 客户端授权码缺少 PKCE 绑定");
  }
  if (!codeDoc.scopes.every((scope) => (client.allowedScopes || []).includes(scope))) {
    throw new OAuthError(400, "invalid_grant", "授权码 scope 已不再被客户端允许");
  }
  verifyPkce(codeDoc, normalizeOptionalText(opts.codeVerifier, 128) || undefined);

  const consumed = await OAuthAuthorizationCodeModel.updateOne(
    {
      codeHash: codeDoc.codeHash,
      clientId: client.clientId,
      redirectUri,
      usedAt: null,
      expiresAt: { $gt: new Date() },
    },
    { $set: { usedAt: new Date(), updatedAt: new Date() } },
  );
  if (!wasUpdateApplied(consumed)) {
    throw new OAuthError(400, "invalid_grant", "授权码无效、已过期或已被使用");
  }

  const user = await loadActiveOAuthAuthorizingUser(codeDoc.userId);
  const grant = await upsertGrant(client.clientId, user.id, codeDoc.scopes);
  return createTokenPair({ client, grant, user, scopes: codeDoc.scopes });
}

export async function refreshAccessToken(opts: {
  authHeader?: string;
  clientId?: unknown;
  clientSecret?: unknown;
  refreshToken?: unknown;
}): Promise<OAuthTokenResponse> {
  const client = await authenticateClient({
    authHeader: opts.authHeader,
    clientId: opts.clientId,
    clientSecret: opts.clientSecret,
  });
  const refreshToken = normalizeOptionalText(opts.refreshToken, 512);
  if (!refreshToken) {
    throw new OAuthError(400, "invalid_request", "缺少 refresh_token");
  }

  const refreshTokenHash = hashOpaqueToken(refreshToken);
  const tokenDoc = (await OAuthTokenModel.findOne({
    refreshTokenHash,
    clientId: client.clientId,
    revokedAt: null,
    refreshTokenExpiresAt: { $gt: new Date() },
  }).lean()) as OAuthTokenDoc | null;
  if (
    !tokenDoc ||
    !tokenDoc.refreshTokenExpiresAt ||
    tokenDoc.refreshTokenExpiresAt.getTime() <= Date.now()
  ) {
    throw new OAuthError(400, "invalid_grant", "refresh_token 无效或已过期");
  }

  const grant = (await OAuthGrantModel.findOne({ grantId: tokenDoc.grantId }).lean()) as OAuthGrantDoc | null;
  if (!grant || grant.revokedAt) {
    throw new OAuthError(400, "invalid_grant", "授权记录已撤销");
  }

  const user = await loadActiveOAuthAuthorizingUser(tokenDoc.userId);
  const refreshScopes = getEffectiveTokenScopes(tokenDoc, grant, client);
  if (refreshScopes.length === 0) {
    throw new OAuthError(400, "invalid_grant", "授权记录不再包含有效 scope");
  }

  const consumed = await OAuthTokenModel.updateOne(
    {
      tokenId: tokenDoc.tokenId,
      refreshTokenHash,
      revokedAt: null,
      refreshTokenExpiresAt: { $gt: new Date() },
    },
    { $set: { revokedAt: new Date(), updatedAt: new Date() } },
  );
  if (!wasUpdateApplied(consumed)) {
    throw new OAuthError(400, "invalid_grant", "refresh_token 已被使用或已过期");
  }

  return createTokenPair({ client, grant, user, scopes: refreshScopes });
}

export async function validateOAuthAccessToken(plainToken: string, requiredScope?: string): Promise<OAuthAccessContext> {
  if (!isOAuthAccessTokenValue(plainToken)) {
    throw new OAuthError(401, "invalid_token", "不是 Synapse OAuth access token");
  }

  const tokenDoc = (await OAuthTokenModel.findOne({ accessTokenHash: hashOpaqueToken(plainToken) }).lean()) as OAuthTokenDoc | null;
  if (!tokenDoc || tokenDoc.revokedAt || tokenDoc.accessTokenExpiresAt.getTime() <= Date.now()) {
    throw new OAuthError(401, "invalid_token", "OAuth access token 无效或已过期");
  }

  const [client, grant, user] = await Promise.all([
    OAuthClientModel.findOne({ clientId: tokenDoc.clientId }).lean() as Promise<OAuthClientDoc | null>,
    OAuthGrantModel.findOne({ grantId: tokenDoc.grantId }).lean() as Promise<OAuthGrantDoc | null>,
    UserStorage.getUserById(tokenDoc.userId),
  ]);

  assertClientEnabled(client);
  if (!grant || grant.revokedAt) {
    throw new OAuthError(401, "invalid_token", "OAuth 授权已撤销");
  }
  if (!user || (user as any).accountStatus === "suspended" || !canAuthorizeOAuth(user)) {
    throw new OAuthError(403, "access_denied", "授权用户状态无效");
  }

  const scopes = getEffectiveTokenScopes(tokenDoc, grant, client as OAuthClientDoc);
  if (scopes.length === 0) {
    throw new OAuthError(401, "invalid_token", "OAuth 授权没有有效 scope");
  }
  if (requiredScope && !scopes.includes(requiredScope)) {
    throw new OAuthError(403, "insufficient_scope", `OAuth token 缺少 "${requiredScope}" scope`);
  }

  return {
    token: tokenDoc,
    client: client as OAuthClientDoc,
    grant,
    user,
    scopes,
  };
}

export async function recordOAuthTokenUsage(context: OAuthAccessContext, ip: string): Promise<void> {
  const now = new Date();
  await Promise.all([
    OAuthTokenModel.updateOne(
      { tokenId: context.token.tokenId },
      { $set: { lastUsedAt: now, lastUsedIp: ip, updatedAt: now }, $inc: { usageCount: 1 } },
    ),
    OAuthGrantModel.updateOne({ grantId: context.grant.grantId }, { $set: { lastUsedAt: now, updatedAt: now } }),
    OAuthClientModel.updateOne({ clientId: context.client.clientId }, { $set: { lastUsedAt: now, updatedAt: now } }),
  ]);
}

export function getOAuthUserInfo(context: OAuthAccessContext): Record<string, unknown> {
  return buildUserProfile(context.user, context.scopes);
}

export async function introspectOAuthToken(opts: {
  authHeader?: string;
  clientId?: unknown;
  clientSecret?: unknown;
  token?: unknown;
}): Promise<Record<string, unknown>> {
  const client = await authenticateClient({
    authHeader: opts.authHeader,
    clientId: opts.clientId,
    clientSecret: opts.clientSecret,
  });
  const token = normalizeOptionalText(opts.token, 512);
  if (!token) return { active: false };

  try {
    const context = await validateOAuthAccessToken(token);
    if (context.client.clientId !== client.clientId) {
      return { active: false };
    }
    return {
      active: true,
      client_id: context.client.clientId,
      sub: context.user.id,
      username: context.user.username,
      scope: context.scopes.join(" "),
      exp: Math.floor(context.token.accessTokenExpiresAt.getTime() / 1000),
      token_type: "Bearer",
      ...buildOAuthIdentityClaims(context.user),
    };
  } catch {
    return { active: false };
  }
}

export async function revokeOAuthToken(opts: {
  authHeader?: string;
  clientId?: unknown;
  clientSecret?: unknown;
  token?: unknown;
}): Promise<void> {
  const client = await authenticateClient({
    authHeader: opts.authHeader,
    clientId: opts.clientId,
    clientSecret: opts.clientSecret,
  });
  const token = normalizeOptionalText(opts.token, 512);
  if (!token) return;

  const hash = hashOpaqueToken(token);
  await OAuthTokenModel.updateMany(
    {
      clientId: client.clientId,
      $or: [{ accessTokenHash: hash }, { refreshTokenHash: hash }],
    },
    { $set: { revokedAt: new Date(), updatedAt: new Date() } },
  );
}

export async function listOAuthGrants(): Promise<OAuthGrantView[]> {
  const grants = (await OAuthGrantModel.find().sort({ updatedAt: -1 }).lean()) as OAuthGrantDoc[];
  const clientIds = Array.from(new Set(grants.map((grant) => grant.clientId)));
  const userIds = Array.from(new Set(grants.map((grant) => grant.userId)));
  const clientDocsPromise = OAuthClientModel.find({ clientId: { $in: clientIds } }).lean() as Promise<OAuthClientDoc[]>;
  const usersPromise = Promise.all(userIds.map((userId) => UserStorage.getUserById(userId))) as Promise<Array<User | null>>;
  const [clientDocs, users] = await Promise.all([
    clientDocsPromise,
    usersPromise,
  ]);
  const clientMap = new Map(clientDocs.map((client) => [client.clientId, client]));
  const userMap = new Map(users.filter((user): user is User => Boolean(user)).map((user) => [user.id, user]));
  return grants.map((grant) => toOAuthGrantView(grant, clientMap.get(grant.clientId) || null, userMap.get(grant.userId) || null));
}

export async function revokeOAuthGrant(grantId: string): Promise<boolean> {
  const now = new Date();
  const grant = (await OAuthGrantModel.findOneAndUpdate(
    { grantId },
    { $set: { revokedAt: now, updatedAt: now } },
    { returnDocument: "after" },
  ).lean()) as OAuthGrantDoc | null;
  if (!grant) return false;
  await OAuthTokenModel.updateMany({ grantId }, { $set: { revokedAt: now, updatedAt: now } });
  return true;
}

export function getOAuthServerMetadata(baseUrl: string) {
  const normalizedBase = stripTrailingSlashes(baseUrl);
  return {
    issuer: normalizedBase,
    authorization_endpoint: `${normalizedBase}/oauth/authorize`,
    token_endpoint: `${normalizedBase}/api/oauth/token`,
    userinfo_endpoint: `${normalizedBase}/api/oauth/userinfo`,
    introspection_endpoint: `${normalizedBase}/api/oauth/introspect`,
    revocation_endpoint: `${normalizedBase}/api/oauth/revoke`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    token_endpoint_auth_methods_supported: ["client_secret_basic", "client_secret_post", "none"],
    code_challenge_methods_supported: ["S256", "plain"],
    scopes_supported: OAUTH_SCOPE_DEFINITIONS.map((scope) => scope.key),
  };
}
