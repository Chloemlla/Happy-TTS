import crypto from "node:crypto";

export type ProfileVerificationMethod = "password" | "totp" | "passkey";

interface ProfileVerificationSession {
  token: string;
  userId: string;
  method: ProfileVerificationMethod;
  createdAt: number;
  expiresAt: number;
}

interface PendingEmailChangeChallenge {
  userId: string;
  newEmail: string;
  code: string;
  createdAt: number;
  expiresAt: number;
  lastSentAt: number;
  attempts: number;
}

const PROFILE_VERIFICATION_TTL_MS = 10 * 60 * 1000;
const EMAIL_CHANGE_CODE_TTL_MS = 10 * 60 * 1000;
const EMAIL_CHANGE_RESEND_INTERVAL_MS = 60 * 1000;
const MAX_EMAIL_CHANGE_ATTEMPTS = 5;

const profileVerificationSessions = new Map<string, ProfileVerificationSession>();
const pendingEmailChangeChallenges = new Map<string, PendingEmailChangeChallenge>();

function cleanupExpiredSessions(now = Date.now()): void {
  for (const [token, session] of profileVerificationSessions.entries()) {
    if (session.expiresAt <= now) {
      profileVerificationSessions.delete(token);
    }
  }
}

function cleanupExpiredEmailChallenges(now = Date.now()): void {
  for (const [userId, challenge] of pendingEmailChangeChallenges.entries()) {
    if (challenge.expiresAt <= now) {
      pendingEmailChangeChallenges.delete(userId);
    }
  }
}

function generateVerificationToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

function generateEmailCode(length = 6): string {
  let code = "";
  for (let index = 0; index < length; index += 1) {
    code += Math.floor(Math.random() * 10).toString();
  }
  return code;
}

export function createProfileVerificationSession(
  userId: string,
  method: ProfileVerificationMethod,
): ProfileVerificationSession {
  const now = Date.now();
  cleanupExpiredSessions(now);

  for (const [token, session] of profileVerificationSessions.entries()) {
    if (session.userId === userId) {
      profileVerificationSessions.delete(token);
    }
  }

  const session: ProfileVerificationSession = {
    token: generateVerificationToken(),
    userId,
    method,
    createdAt: now,
    expiresAt: now + PROFILE_VERIFICATION_TTL_MS,
  };

  profileVerificationSessions.set(session.token, session);

  return session;
}

export function validateProfileVerificationSession(
  userId: string,
  token: string,
): ProfileVerificationSession | null {
  cleanupExpiredSessions();

  const session = profileVerificationSessions.get(token);
  if (!session || session.userId !== userId) {
    return null;
  }

  return session;
}

export function clearProfileVerificationSessions(userId: string): void {
  for (const [token, session] of profileVerificationSessions.entries()) {
    if (session.userId === userId) {
      profileVerificationSessions.delete(token);
    }
  }
}

export function createEmailChangeChallenge(userId: string, newEmail: string): {
  success: boolean;
  code?: string;
  retryAfterMs?: number;
  error?: string;
} {
  const now = Date.now();
  cleanupExpiredEmailChallenges(now);

  const existingChallenge = pendingEmailChangeChallenges.get(userId);
  if (
    existingChallenge &&
    existingChallenge.newEmail === newEmail &&
    now - existingChallenge.lastSentAt < EMAIL_CHANGE_RESEND_INTERVAL_MS
  ) {
    return {
      success: false,
      error: "验证码发送过于频繁，请稍后再试",
      retryAfterMs: EMAIL_CHANGE_RESEND_INTERVAL_MS - (now - existingChallenge.lastSentAt),
    };
  }

  const challenge: PendingEmailChangeChallenge = {
    userId,
    newEmail,
    code: generateEmailCode(),
    createdAt: now,
    expiresAt: now + EMAIL_CHANGE_CODE_TTL_MS,
    lastSentAt: now,
    attempts: 0,
  };

  pendingEmailChangeChallenges.set(userId, challenge);

  return {
    success: true,
    code: challenge.code,
  };
}

export function validateEmailChangeChallenge(
  userId: string,
  newEmail: string,
  code: string,
): {
  success: boolean;
  status: number;
  error?: string;
} {
  cleanupExpiredEmailChallenges();

  const challenge = pendingEmailChangeChallenges.get(userId);
  if (!challenge) {
    return {
      success: false,
      status: 400,
      error: "请先向新邮箱发送验证码",
    };
  }

  if (challenge.newEmail !== newEmail) {
    return {
      success: false,
      status: 400,
      error: "验证码与当前待验证邮箱不匹配，请重新发送",
    };
  }

  if (challenge.expiresAt <= Date.now()) {
    pendingEmailChangeChallenges.delete(userId);
    return {
      success: false,
      status: 400,
      error: "验证码已过期，请重新发送",
    };
  }

  if (challenge.attempts >= MAX_EMAIL_CHANGE_ATTEMPTS) {
    pendingEmailChangeChallenges.delete(userId);
    return {
      success: false,
      status: 429,
      error: "验证码尝试次数过多，请重新发送",
    };
  }

  if (challenge.code !== code) {
    challenge.attempts += 1;
    pendingEmailChangeChallenges.set(userId, challenge);

    if (challenge.attempts >= MAX_EMAIL_CHANGE_ATTEMPTS) {
      pendingEmailChangeChallenges.delete(userId);
      return {
        success: false,
        status: 429,
        error: "验证码尝试次数过多，请重新发送",
      };
    }

    return {
      success: false,
      status: 400,
      error: "验证码错误",
    };
  }

  return {
    success: true,
    status: 200,
  };
}

export function clearEmailChangeChallenge(userId: string): void {
  pendingEmailChangeChallenges.delete(userId);
}
