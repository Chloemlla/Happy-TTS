import axios from "axios";
import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import { config } from "../config/config";
import logger from "../utils/logger";
import { type User, UserStorage } from "../utils/userStorage";

export type LinuxDoAuthIntent = "login" | "register";

export interface LinuxDoConfigSummary {
  enabled: boolean;
  clientIdConfigured: boolean;
  callbackUrl: string;
  frontendCallbackUrl: string;
  discoveryUrl: string;
  scopes: string;
}

export interface LinuxDoNormalizedProfile {
  id: string;
  username: string;
  displayName?: string;
  email?: string;
  avatarUrl?: string;
  raw: unknown;
}

export interface LinuxDoExchangePayload {
  token: string;
  user: {
    id: string;
    username: string;
    email: string;
    role: string;
  };
  isNewUser: boolean;
  provider: "linuxdo";
}

export interface LinuxDoDiscoveryDocument {
  issuer?: string;
  authorization_endpoint?: string;
  token_endpoint?: string;
  userinfo_endpoint?: string;
  jwks_uri?: string;
  scopes_supported?: string[];
  code_challenge_methods_supported?: string[];
}

interface LinuxDoStateRecord {
  intent: LinuxDoAuthIntent;
  codeVerifier: string;
  expiresAt: number;
}

interface LinuxDoTicketRecord {
  payload: LinuxDoExchangePayload;
  expiresAt: number;
}

interface LinuxDoDiscoveryCacheRecord {
  document: LinuxDoDiscoveryDocument;
  expiresAt: number;
}

const STATE_TTL_MS = 10 * 60 * 1000;
const TICKET_TTL_MS = 60 * 1000;
const DISCOVERY_TTL_MS = 60 * 60 * 1000;
const PLACEHOLDER_EMAIL_DOMAIN = "linuxdo.oauth.local";
const RESERVED_USERNAMES = new Set([
  "admin",
  "administrator",
  "root",
  "system",
  "test",
]);

const oauthStateStore = new Map<string, LinuxDoStateRecord>();
const loginTicketStore = new Map<string, LinuxDoTicketRecord>();
let discoveryCache: LinuxDoDiscoveryCacheRecord | null = null;

function cleanupExpiredStates(now = Date.now()): void {
  for (const [state, record] of oauthStateStore.entries()) {
    if (record.expiresAt <= now) {
      oauthStateStore.delete(state);
    }
  }
}

function cleanupExpiredTickets(now = Date.now()): void {
  for (const [ticket, record] of loginTicketStore.entries()) {
    if (record.expiresAt <= now) {
      loginTicketStore.delete(ticket);
    }
  }
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function firstString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (trimmed) {
        return trimmed;
      }
    }

    if (typeof value === "number" && Number.isFinite(value)) {
      return String(value);
    }
  }

  return undefined;
}

function toBase64Url(input: Buffer): string {
  return input
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function createPkcePair(): { codeVerifier: string; codeChallenge: string } {
  const codeVerifier = toBase64Url(crypto.randomBytes(64));
  const codeChallenge = toBase64Url(
    crypto.createHash("sha256").update(codeVerifier).digest(),
  );

  return { codeVerifier, codeChallenge };
}

export function buildLinuxDoAvatarUrl(value?: string): string | undefined {
  const rawValue = firstString(value);
  if (!rawValue) {
    return undefined;
  }

  if (/^https?:\/\//i.test(rawValue)) {
    return rawValue;
  }

  if (rawValue.startsWith("//")) {
    return `https:${rawValue}`;
  }

  if (rawValue.includes("{size}")) {
    return `${config.linuxdo.forumBaseUrl}${rawValue.replace("{size}", "256")}`;
  }

  if (rawValue.startsWith("/")) {
    return `${config.linuxdo.forumBaseUrl}${rawValue}`;
  }

  return rawValue;
}

export function sanitizeLinuxDoUsername(
  rawUsername: string | undefined,
  fallbackId: string,
): string {
  const fallback = `linuxdo_${fallbackId}`.slice(0, 20);
  const normalized =
    (rawUsername || fallback)
      .replace(/[^a-zA-Z0-9_]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 20) || fallback;

  let candidate = normalized;

  if (candidate.length < 3) {
    candidate = `ld_${fallbackId}`
      .replace(/[^a-zA-Z0-9_]+/g, "_")
      .slice(0, 20);
  }

  if (RESERVED_USERNAMES.has(candidate.toLowerCase())) {
    candidate = `${candidate.slice(0, 17)}_ld`.slice(0, 20);
  }

  if (candidate.length < 3) {
    candidate = `linuxdo_${fallbackId}`.slice(0, 20);
  }

  return candidate;
}

export function normalizeLinuxDoProfile(rawProfile: unknown): LinuxDoNormalizedProfile {
  const root = asObject(rawProfile);
  const source = asObject(root.user ?? rawProfile);

  const id = firstString(source.id, source.sub, source.userId, source.user_id);
  if (!id) {
    throw new Error("Linux.do user payload did not include a stable user id");
  }

  const username = sanitizeLinuxDoUsername(
    firstString(source.username, source.login, source.name, source.nickname),
    id,
  );

  return {
    id,
    username,
    displayName: firstString(source.name, source.display_name, source.nickname),
    email: firstString(source.email),
    avatarUrl: buildLinuxDoAvatarUrl(
      firstString(source.avatar_url, source.avatar, source.avatar_template),
    ),
    raw: rawProfile,
  };
}

function buildPlaceholderEmail(linuxdoId: string): string {
  return `linuxdo_${linuxdoId}@${PLACEHOLDER_EMAIL_DOMAIN}`;
}

async function getAvailableLinuxDoUsername(baseUsername: string): Promise<string> {
  let candidate = baseUsername;
  let suffix = 1;

  while (await UserStorage.getUserByUsername(candidate)) {
    const suffixText = `_${suffix}`;
    candidate = `${baseUsername.slice(
      0,
      Math.max(3, 20 - suffixText.length),
    )}${suffixText}`;
    suffix += 1;

    if (suffix > 9999) {
      throw new Error("Unable to allocate a unique username for Linux.do sign-in");
    }
  }

  return candidate;
}

function buildJwtToken(user: User): string {
  return jwt.sign(
    { userId: user.id, username: user.username, role: user.role || "user" },
    config.jwtSecret,
    { expiresIn: "2h" },
  );
}

function toExchangePayload(user: User, isNewUser: boolean): LinuxDoExchangePayload {
  return {
    token: buildJwtToken(user),
    user: {
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
    },
    isNewUser,
    provider: "linuxdo",
  };
}

async function fetchLinuxDoDiscoveryDocument(): Promise<LinuxDoDiscoveryDocument> {
  const response = await axios.get(config.linuxdo.discoveryUrl, {
    headers: {
      Accept: "application/json",
    },
    timeout: 10000,
  });

  const document = response.data as LinuxDoDiscoveryDocument;
  if (
    !document ||
    !document.authorization_endpoint ||
    !document.token_endpoint ||
    !document.userinfo_endpoint
  ) {
    throw new Error("Linux.do discovery document is missing required endpoints");
  }

  return document;
}

export async function getLinuxDoDiscoveryDocument(): Promise<LinuxDoDiscoveryDocument> {
  if (discoveryCache && discoveryCache.expiresAt > Date.now()) {
    return discoveryCache.document;
  }

  const document = await fetchLinuxDoDiscoveryDocument();
  discoveryCache = {
    document,
    expiresAt: Date.now() + DISCOVERY_TTL_MS,
  };

  return document;
}

async function exchangeAuthorizationCode(params: {
  code: string;
  codeVerifier: string;
  tokenEndpoint: string;
}): Promise<string> {
  const payload = new URLSearchParams({
    grant_type: "authorization_code",
    code: params.code,
    redirect_uri: config.linuxdo.callbackUrl,
    code_verifier: params.codeVerifier,
  });

  const tokenResponse = await axios.post(params.tokenEndpoint, payload.toString(), {
    auth: {
      username: config.linuxdo.clientId,
      password: config.linuxdo.clientSecret,
    },
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    timeout: 10000,
  });

  const accessToken = firstString(asObject(tokenResponse.data).access_token);
  if (!accessToken) {
    throw new Error("Linux.do token endpoint did not return access_token");
  }

  return accessToken;
}

async function fetchLinuxDoUserProfile(
  accessToken: string,
  userinfoEndpoint: string,
): Promise<unknown> {
  const userResponse = await axios.get(userinfoEndpoint, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    },
    timeout: 10000,
  });

  return userResponse.data;
}

async function upsertLinuxDoUser(profile: LinuxDoNormalizedProfile): Promise<{
  user: User;
  isNewUser: boolean;
}> {
  const linkedUser = await UserStorage.getUserByLinuxDoId(profile.id);
  if (linkedUser) {
    const updatedLinkedUser =
      (await UserStorage.updateUser(linkedUser.id, {
        linuxdoUsername: profile.username,
        linuxdoAvatarUrl: profile.avatarUrl,
        avatarUrl: profile.avatarUrl || linkedUser.avatarUrl,
        authProvider: linkedUser.authProvider || "linuxdo",
      })) || {
        ...linkedUser,
        linuxdoUsername: profile.username,
        linuxdoAvatarUrl: profile.avatarUrl,
        avatarUrl: profile.avatarUrl || linkedUser.avatarUrl,
        authProvider: linkedUser.authProvider || "linuxdo",
      };

    return { user: updatedLinkedUser, isNewUser: false };
  }

  if (profile.email) {
    const userWithSameEmail = await UserStorage.getUserByEmail(profile.email);
    if (userWithSameEmail) {
      const updatedExistingUser =
        (await UserStorage.updateUser(userWithSameEmail.id, {
          linuxdoId: profile.id,
          linuxdoUsername: profile.username,
          linuxdoAvatarUrl: profile.avatarUrl,
          avatarUrl: profile.avatarUrl || userWithSameEmail.avatarUrl,
          authProvider: userWithSameEmail.authProvider || "local",
        })) || {
          ...userWithSameEmail,
          linuxdoId: profile.id,
          linuxdoUsername: profile.username,
          linuxdoAvatarUrl: profile.avatarUrl,
          avatarUrl: profile.avatarUrl || userWithSameEmail.avatarUrl,
          authProvider: userWithSameEmail.authProvider || "local",
        };

      return { user: updatedExistingUser, isNewUser: false };
    }
  }

  const username = await getAvailableLinuxDoUsername(profile.username);
  const email = profile.email || buildPlaceholderEmail(profile.id);
  const randomPassword = crypto.randomBytes(32).toString("hex");

  const createdUser = await UserStorage.createUser(username, email, randomPassword);
  if (!createdUser) {
    throw new Error("Failed to provision a local account for Linux.do sign-in");
  }

  const finalizedUser =
    (await UserStorage.updateUser(createdUser.id, {
      authProvider: "linuxdo",
      linuxdoId: profile.id,
      linuxdoUsername: profile.username,
      linuxdoAvatarUrl: profile.avatarUrl,
      avatarUrl: profile.avatarUrl,
    })) || {
      ...createdUser,
      authProvider: "linuxdo" as const,
      linuxdoId: profile.id,
      linuxdoUsername: profile.username,
      linuxdoAvatarUrl: profile.avatarUrl,
      avatarUrl: profile.avatarUrl,
    };

  return { user: finalizedUser, isNewUser: true };
}

function createLinuxDoErrorRedirect(message: string): string {
  const params = new URLSearchParams({ error: message });
  return `${config.linuxdo.frontendCallbackUrl}?${params.toString()}`;
}

export function getLinuxDoConfigSummary(): LinuxDoConfigSummary {
  return {
    enabled: isLinuxDoAuthEnabled(),
    clientIdConfigured: Boolean(config.linuxdo.clientId),
    callbackUrl: config.linuxdo.callbackUrl,
    frontendCallbackUrl: config.linuxdo.frontendCallbackUrl,
    discoveryUrl: config.linuxdo.discoveryUrl,
    scopes: config.linuxdo.scopes,
  };
}

export function isLinuxDoAuthEnabled(): boolean {
  return Boolean(
    config.linuxdo.clientId &&
      config.linuxdo.clientSecret &&
      config.linuxdo.callbackUrl &&
      config.linuxdo.frontendCallbackUrl,
  );
}

export async function createLinuxDoAuthorizationUrl(
  intent: LinuxDoAuthIntent,
): Promise<string> {
  if (!isLinuxDoAuthEnabled()) {
    throw new Error("Linux.do OAuth is not configured");
  }

  cleanupExpiredStates();

  const discoveryDocument = await getLinuxDoDiscoveryDocument();
  const state = crypto.randomBytes(24).toString("hex");
  const { codeVerifier, codeChallenge } = createPkcePair();

  oauthStateStore.set(state, {
    intent,
    codeVerifier,
    expiresAt: Date.now() + STATE_TTL_MS,
  });

  const params = new URLSearchParams({
    client_id: config.linuxdo.clientId,
    response_type: "code",
    response_mode: "form_post",
    redirect_uri: config.linuxdo.callbackUrl,
    scope: config.linuxdo.scopes,
    state,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
  });

  return `${discoveryDocument.authorization_endpoint}?${params.toString()}`;
}

function consumeLinuxDoState(state: string): {
  intent: LinuxDoAuthIntent;
  codeVerifier: string;
} {
  cleanupExpiredStates();

  const record = oauthStateStore.get(state);
  oauthStateStore.delete(state);

  if (!record) {
    throw new Error("Linux.do state is invalid or has expired");
  }

  if (record.expiresAt <= Date.now()) {
    throw new Error("Linux.do state is invalid or has expired");
  }

  return {
    intent: record.intent,
    codeVerifier: record.codeVerifier,
  };
}

export function issueLinuxDoLoginTicket(payload: LinuxDoExchangePayload): string {
  cleanupExpiredTickets();

  const ticket = crypto.randomBytes(24).toString("hex");
  loginTicketStore.set(ticket, {
    payload,
    expiresAt: Date.now() + TICKET_TTL_MS,
  });

  return ticket;
}

export function consumeLinuxDoLoginTicket(
  ticket: string,
): LinuxDoExchangePayload | null {
  cleanupExpiredTickets();

  const record = loginTicketStore.get(ticket);
  loginTicketStore.delete(ticket);

  if (!record || record.expiresAt <= Date.now()) {
    return null;
  }

  return record.payload;
}

export async function completeLinuxDoAuthorization(params: {
  code: string;
  state: string;
  clientIp?: string;
}): Promise<{
  redirectUrl: string;
  payload: LinuxDoExchangePayload;
}> {
  const { code, state, clientIp } = params;

  if (!isLinuxDoAuthEnabled()) {
    throw new Error("Linux.do OAuth is not configured");
  }

  const { intent, codeVerifier } = consumeLinuxDoState(state);
  const discoveryDocument = await getLinuxDoDiscoveryDocument();
  const accessToken = await exchangeAuthorizationCode({
    code,
    codeVerifier,
    tokenEndpoint: discoveryDocument.token_endpoint || config.linuxdo.tokenEndpoint,
  });
  const rawProfile = await fetchLinuxDoUserProfile(
    accessToken,
    discoveryDocument.userinfo_endpoint || config.linuxdo.userEndpoint,
  );
  const normalizedProfile = normalizeLinuxDoProfile(rawProfile);
  const { user, isNewUser } = await upsertLinuxDoUser(normalizedProfile);

  const finalizedUser =
    (await UserStorage.updateUser(user.id, {
      lastLoginIp: clientIp || "unknown",
      lastLoginAt: new Date().toISOString(),
      linuxdoId: normalizedProfile.id,
      linuxdoUsername: normalizedProfile.username,
      linuxdoAvatarUrl: normalizedProfile.avatarUrl,
      avatarUrl: normalizedProfile.avatarUrl || user.avatarUrl,
      authProvider: user.authProvider || "linuxdo",
    })) || {
      ...user,
      lastLoginIp: clientIp || "unknown",
      lastLoginAt: new Date().toISOString(),
      linuxdoId: normalizedProfile.id,
      linuxdoUsername: normalizedProfile.username,
      linuxdoAvatarUrl: normalizedProfile.avatarUrl,
      avatarUrl: normalizedProfile.avatarUrl || user.avatarUrl,
      authProvider: user.authProvider || "linuxdo",
    };

  const payload = toExchangePayload(finalizedUser, isNewUser);
  const ticket = issueLinuxDoLoginTicket(payload);
  const redirectParams = new URLSearchParams({
    ticket,
    intent,
  });

  logger.info("[Linux.do Auth] OAuth callback completed", {
    userId: finalizedUser.id,
    username: finalizedUser.username,
    intent,
    isNewUser,
    usedPkce: true,
    scopes: config.linuxdo.scopes,
  });

  return {
    redirectUrl: `${config.linuxdo.frontendCallbackUrl}?${redirectParams.toString()}`,
    payload,
  };
}

export function getLinuxDoErrorRedirect(message: string): string {
  return createLinuxDoErrorRedirect(message);
}

export function resetLinuxDoAuthStateForTests(): void {
  oauthStateStore.clear();
  loginTicketStore.clear();
  discoveryCache = null;
}
