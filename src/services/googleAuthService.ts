import crypto from "node:crypto";
import { OAuth2Client } from "google-auth-library";
import { config } from "../config/config";
import logger from "../utils/logger";
import { signLoginToken } from "../utils/authToken";
import { type User, UserStorage } from "../utils/userStorage";
import { findUserByProviderIdentity, upsertIdentityForUser } from "./accountIdentityService";
import { completeProviderLoginForBoundIdentity, issueProviderBindSession } from "./providerBindSessionService";
import { sendProviderGeneratedPasswordEmail } from "./providerCredentialEmailService";

export interface GoogleAuthConfigSummary {
  enabled: boolean;
  clientIdConfigured: boolean;
  clientId: string;
}

export type GoogleAuthConfigTarget = "web" | "synapse-android";

export interface GoogleAuthPayload {
  token: string;
  user: {
    id: string;
    username: string;
    email: string;
    role: string;
    isTranslationEnabled?: boolean;
    translationAccessUntil?: string;
    accountStatus?: string;
  };
  isNewUser: boolean;
  provider: "google";
}

export type GoogleBindSessionResult =
  | {
      requiresBinding: true;
      session: ReturnType<typeof issueProviderBindSession>;
      provider: "google";
    }
  | (GoogleAuthPayload & { requiresBinding: false });

export interface GoogleProfile {
  id: string;
  email: string;
  name?: string;
  avatarUrl?: string;
}

const RESERVED_USERNAMES = new Set(["admin", "administrator", "root", "system", "test"]);

function firstString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (trimmed) {
        return trimmed;
      }
    }
  }

  return undefined;
}

function sanitizeGoogleUsername(rawUsername: string | undefined, fallbackId: string): string {
  const fallback = `google_${fallbackId}`.slice(0, 20);
  const normalized =
    (rawUsername || fallback)
      .replace(/[^a-zA-Z0-9_]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 20) || fallback;

  let candidate = normalized;

  if (candidate.length < 3) {
    candidate = `gg_${fallbackId}`.replace(/[^a-zA-Z0-9_]+/g, "_").slice(0, 20);
  }

  if (RESERVED_USERNAMES.has(candidate.toLowerCase())) {
    candidate = `${candidate.slice(0, 17)}_gg`.slice(0, 20);
  }

  if (candidate.length < 3) {
    candidate = `google_${fallbackId}`.slice(0, 20);
  }

  return candidate;
}

async function getAvailableGoogleUsername(baseUsername: string): Promise<string> {
  let candidate = baseUsername;
  let suffix = 1;

  while (await UserStorage.getUserByUsername(candidate)) {
    const suffixText = `_${suffix}`;
    candidate = `${baseUsername.slice(0, Math.max(3, 20 - suffixText.length))}${suffixText}`;
    suffix += 1;

    if (suffix > 9999) {
      throw new Error("无法为 Google 登录分配唯一用户名");
    }
  }

  return candidate;
}

async function findUserByEmail(email: string): Promise<User | null> {
  const exactMatch = await UserStorage.getUserByEmail(email);
  if (exactMatch) {
    return exactMatch;
  }

  const normalizedEmail = email.trim().toLowerCase();
  const users = await UserStorage.getAllUsers();
  return (
    users.find((user) => typeof user.email === "string" && user.email.trim().toLowerCase() === normalizedEmail) || null
  );
}

function buildJwtToken(user: User): string {
  return signLoginToken(user);
}

function toAuthPayload(user: User, isNewUser: boolean): GoogleAuthPayload {
  return {
    token: buildJwtToken(user),
    user: {
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
      isTranslationEnabled: (user as any).isTranslationEnabled,
      translationAccessUntil: (user as any).translationAccessUntil,
      accountStatus: (user as any).accountStatus,
    },
    isNewUser,
    provider: "google",
  };
}

export async function verifyGoogleIdToken(idToken: string): Promise<GoogleProfile> {
  const clientIds = getAcceptedGoogleClientIds();
  if (clientIds.length === 0) {
    throw new Error("Google 登录未配置");
  }

  const trimmedToken = firstString(idToken);
  if (!trimmedToken) {
    throw new Error("缺少 Google idToken");
  }

  const client = new OAuth2Client(clientIds[0]);
  const ticket = await client.verifyIdToken({
    idToken: trimmedToken,
    audience: clientIds.length === 1 ? clientIds[0] : clientIds,
  });
  const payload = ticket.getPayload();

  const googleId = firstString(payload?.sub);
  const email = firstString(payload?.email)?.toLowerCase();
  const name = firstString(payload?.name, payload?.given_name);
  const avatarUrl = firstString(payload?.picture);
  const emailVerified = payload?.email_verified === true;

  if (!googleId || !email || !emailVerified) {
    throw new Error("Google account email is missing or unverified");
  }

  return {
    id: googleId,
    email,
    name,
    avatarUrl,
  };
}

async function upsertGoogleUser(profile: GoogleProfile): Promise<{
  user: User;
  isNewUser: boolean;
}> {
  const linkedIdentityUser = await findUserByProviderIdentity("google", profile.id);
  if (linkedIdentityUser) {
    if ((linkedIdentityUser as any).accountStatus === "suspended") {
      throw new Error("账户已被封停");
    }

    const updatedLinkedUser = (await UserStorage.updateUser(linkedIdentityUser.id, {
      avatarUrl: profile.avatarUrl || linkedIdentityUser.avatarUrl,
      authProvider: linkedIdentityUser.authProvider || "google",
    })) || {
      ...linkedIdentityUser,
      avatarUrl: profile.avatarUrl || linkedIdentityUser.avatarUrl,
      authProvider: linkedIdentityUser.authProvider || "google",
    };

    await upsertIdentityForUser(updatedLinkedUser, {
      provider: "google",
      providerUserId: profile.id,
      providerEmail: profile.email,
      providerUsername: profile.name,
      avatarUrl: profile.avatarUrl,
    });

    return { user: updatedLinkedUser, isNewUser: false };
  }

  const existingUser = await findUserByEmail(profile.email);
  if (existingUser) {
    if ((existingUser as any).accountStatus === "suspended") {
      throw new Error("账户已被封停");
    }
    const updatedExistingUser = (await UserStorage.updateUser(existingUser.id, {
      avatarUrl: profile.avatarUrl || existingUser.avatarUrl,
      authProvider: existingUser.authProvider || "local",
    })) || {
      ...existingUser,
      avatarUrl: profile.avatarUrl || existingUser.avatarUrl,
      authProvider: existingUser.authProvider || "local",
    };

    await upsertIdentityForUser(updatedExistingUser, {
      provider: "google",
      providerUserId: profile.id,
      providerEmail: profile.email,
      providerUsername: profile.name,
      avatarUrl: profile.avatarUrl,
    });

    return { user: updatedExistingUser, isNewUser: false };
  }

  const username = await getAvailableGoogleUsername(
    sanitizeGoogleUsername(profile.name || profile.email.split("@")[0], profile.id),
  );
  const randomPassword = crypto.randomBytes(32).toString("hex");

  const createdUser = await UserStorage.createUser(username, profile.email, randomPassword);
  if (!createdUser) {
    throw new Error("无法为 Google 登录创建本地账号");
  }

  const finalizedUser = (await UserStorage.updateUser(createdUser.id, {
    authProvider: "google",
    avatarUrl: profile.avatarUrl,
  })) || {
    ...createdUser,
    authProvider: "google" as const,
    avatarUrl: profile.avatarUrl,
  };

  await upsertIdentityForUser(finalizedUser, {
    provider: "google",
    providerUserId: profile.id,
    providerEmail: profile.email,
    providerUsername: profile.name,
    avatarUrl: profile.avatarUrl,
  });

  await sendProviderGeneratedPasswordEmail({
    email: profile.email,
    username: finalizedUser.username,
    password: randomPassword,
    providerLabel: "Google",
  });

  return { user: finalizedUser, isNewUser: true };
}

function getAcceptedGoogleClientIds(): string[] {
  return Array.from(
    new Set(
      [config.googleAuth.clientId, config.synapseAndroid.googleClientId]
        .map((clientId) => clientId.trim())
        .filter(Boolean),
    ),
  );
}

export function getGoogleAuthConfigSummary(target: GoogleAuthConfigTarget = "web"): GoogleAuthConfigSummary {
  const clientId =
    target === "synapse-android"
      ? config.synapseAndroid.googleClientId || config.googleAuth.clientId
      : config.googleAuth.clientId;

  return {
    enabled: Boolean(clientId),
    clientIdConfigured: Boolean(clientId),
    clientId,
  };
}

export function isGoogleAuthEnabled(): boolean {
  return getAcceptedGoogleClientIds().length > 0;
}

export async function authenticateGoogleUser(params: {
  idToken: string;
  clientIp?: string;
}): Promise<GoogleAuthPayload> {
  const profile = await verifyGoogleIdToken(params.idToken);
  const { user, isNewUser } = await upsertGoogleUser(profile);
  if ((user as any).accountStatus === "suspended") {
    throw new Error("账户已被封停");
  }

  const finalizedUser = (await UserStorage.updateUser(user.id, {
    lastLoginIp: params.clientIp || "unknown",
    lastLoginAt: new Date().toISOString(),
    avatarUrl: profile.avatarUrl || user.avatarUrl,
    authProvider: user.authProvider || "google",
  })) || {
    ...user,
    lastLoginIp: params.clientIp || "unknown",
    lastLoginAt: new Date().toISOString(),
    avatarUrl: profile.avatarUrl || user.avatarUrl,
    authProvider: user.authProvider || "google",
  };

  logger.info("[Google Auth] Login completed", {
    userId: finalizedUser.id,
    username: finalizedUser.username,
    isNewUser,
  });

  await upsertIdentityForUser(finalizedUser, {
    provider: "google",
    providerUserId: profile.id,
    providerEmail: profile.email,
    providerUsername: profile.name,
    avatarUrl: profile.avatarUrl,
  });

  return toAuthPayload(finalizedUser, isNewUser);
}

export async function startGoogleBindSession(params: {
  idToken: string;
  clientIp?: string;
}): Promise<GoogleBindSessionResult> {
  const profile = await verifyGoogleIdToken(params.idToken);
  const linkedUser = await findUserByProviderIdentity("google", profile.id);

  if (linkedUser) {
    const payload = await completeProviderLoginForBoundIdentity({
      user: linkedUser,
      profile: {
        provider: "google",
        providerUserId: profile.id,
        providerEmail: profile.email,
        providerUsername: profile.name,
        avatarUrl: profile.avatarUrl,
      },
      clientIp: params.clientIp,
    });

    return {
      ...payload,
      provider: "google",
      requiresBinding: false,
    };
  }

  const session = issueProviderBindSession({
    provider: "google",
    providerUserId: profile.id,
    providerEmail: profile.email,
    providerUsername: profile.name,
    avatarUrl: profile.avatarUrl,
  });

  return {
    requiresBinding: true,
    session,
    provider: "google",
  };
}
