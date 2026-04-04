import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import { config } from "../config/config";
import logger from "../utils/logger";
import { type User, UserStorage } from "../utils/userStorage";

export interface GoogleAuthConfigSummary {
  enabled: boolean;
  clientIdConfigured: boolean;
  clientId: string;
}

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

interface GoogleProfile {
  id: string;
  email: string;
  name?: string;
  avatarUrl?: string;
}

const RESERVED_USERNAMES = new Set([
  "admin",
  "administrator",
  "root",
  "system",
  "test",
]);

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
    candidate = `gg_${fallbackId}`
      .replace(/[^a-zA-Z0-9_]+/g, "_")
      .slice(0, 20);
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
    candidate = `${baseUsername.slice(
      0,
      Math.max(3, 20 - suffixText.length),
    )}${suffixText}`;
    suffix += 1;

    if (suffix > 9999) {
      throw new Error("Unable to allocate a unique username for Google sign-in");
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
    users.find(
      (user) => typeof user.email === "string" && user.email.trim().toLowerCase() === normalizedEmail,
    ) || null
  );
}

function buildJwtToken(user: User): string {
  return jwt.sign(
    { userId: user.id, username: user.username, role: user.role || "user" },
    config.jwtSecret,
    { expiresIn: "2h" },
  );
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

async function verifyGoogleIdToken(idToken: string): Promise<GoogleProfile> {
  if (!isGoogleAuthEnabled()) {
    throw new Error("Google Auth is not configured");
  }

  const trimmedToken = firstString(idToken);
  if (!trimmedToken) {
    throw new Error("Google idToken is missing");
  }

  let OAuth2Client: any;
  try {
    ({ OAuth2Client } = await import("google-auth-library"));
  } catch (error) {
    logger.error("[Google Auth] Failed to load google-auth-library", error);
    throw new Error("Google Auth dependency is not available");
  }

  const client = new OAuth2Client(config.googleAuth.clientId);
  const ticket = await client.verifyIdToken({
    idToken: trimmedToken,
    audience: config.googleAuth.clientId,
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
  const existingUser = await findUserByEmail(profile.email);
  if (existingUser) {
    if ((existingUser as any).accountStatus === "suspended") {
      throw new Error("Account is suspended");
    }
    const updatedExistingUser =
      (await UserStorage.updateUser(existingUser.id, {
        avatarUrl: profile.avatarUrl || existingUser.avatarUrl,
        authProvider: existingUser.authProvider || "local",
      })) || {
        ...existingUser,
        avatarUrl: profile.avatarUrl || existingUser.avatarUrl,
        authProvider: existingUser.authProvider || "local",
      };

    return { user: updatedExistingUser, isNewUser: false };
  }

  const username = await getAvailableGoogleUsername(
    sanitizeGoogleUsername(profile.name || profile.email.split("@")[0], profile.id),
  );
  const randomPassword = crypto.randomBytes(32).toString("hex");

  const createdUser = await UserStorage.createUser(username, profile.email, randomPassword);
  if (!createdUser) {
    throw new Error("Failed to provision a local account for Google sign-in");
  }

  const finalizedUser =
    (await UserStorage.updateUser(createdUser.id, {
      authProvider: "google",
      avatarUrl: profile.avatarUrl,
    })) || {
      ...createdUser,
      authProvider: "google" as const,
      avatarUrl: profile.avatarUrl,
    };

  return { user: finalizedUser, isNewUser: true };
}

export function getGoogleAuthConfigSummary(): GoogleAuthConfigSummary {
  return {
    enabled: isGoogleAuthEnabled(),
    clientIdConfigured: Boolean(config.googleAuth.clientId),
    clientId: config.googleAuth.clientId,
  };
}

export function isGoogleAuthEnabled(): boolean {
  return Boolean(config.googleAuth.clientId);
}

export async function authenticateGoogleUser(params: {
  idToken: string;
  clientIp?: string;
}): Promise<GoogleAuthPayload> {
  const profile = await verifyGoogleIdToken(params.idToken);
  const { user, isNewUser } = await upsertGoogleUser(profile);
  if ((user as any).accountStatus === "suspended") {
    throw new Error("Account is suspended");
  }

  const finalizedUser =
    (await UserStorage.updateUser(user.id, {
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

  return toAuthPayload(finalizedUser, isNewUser);
}
