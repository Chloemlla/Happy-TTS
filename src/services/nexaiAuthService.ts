/**
 * NexAI 鉴权服务
 * 独立于原系统，提供 JWT、密码哈希、Google/GitHub OAuth 验证
 */

import crypto from "node:crypto";
import {
  type AuthenticationResponseJSON,
  type AuthenticatorTransport,
  generateAuthenticationOptions,
  generateRegistrationOptions,
  type RegistrationResponseJSON,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from "@simplewebauthn/server";
import axios from "axios";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import validator from "validator";
import { config } from "../config/config";
import { type INexaiUser, NexaiUserModel } from "../models/nexaiUserModel";
import logger from "../utils/logger";
import { getNexaiWebAuthnConfig } from "../utils/nexaiWebAuthn";
import { uuidv4 } from "../utils/uuid";
import { SINGLE_PASSKEY_ERROR_MESSAGE } from "./passkeyService";
import { sendProviderGeneratedPasswordEmail } from "./providerCredentialEmailService";
import { sendEmail } from "./emailSender";
import { generatePasswordResetLinkEmailHtml } from "../templates/emailTemplates";

export const NEXAI_PASSKEY_UNKNOWN_CREDENTIAL_CODE = "unknown_credential";

/** In-memory discoverable (usernameless) challenge store with TTL. */
const DISCOVERABLE_CHALLENGE_TTL_MS = 5 * 60 * 1000;
// G2-19: 容量上限，防内存无限增长。
const MAX_DISCOVERABLE_CHALLENGES = 5000;
const discoverableChallenges = new Map<string, number>();

function pruneDiscoverableChallenges(now = Date.now()): void {
  for (const [challenge, createdAt] of discoverableChallenges.entries()) {
    if (now - createdAt > DISCOVERABLE_CHALLENGE_TTL_MS) {
      discoverableChallenges.delete(challenge);
    }
  }
  if (discoverableChallenges.size > MAX_DISCOVERABLE_CHALLENGES) {
    const ordered = [...discoverableChallenges.entries()].sort((a, b) => a[1] - b[1]);
    for (const [challenge] of ordered.slice(0, discoverableChallenges.size - MAX_DISCOVERABLE_CHALLENGES)) {
      discoverableChallenges.delete(challenge);
    }
  }
}

function storeDiscoverableChallenge(challenge: string): void {
  const now = Date.now();
  pruneDiscoverableChallenges(now);
  discoverableChallenges.set(challenge, now);
}

function consumeDiscoverableChallenge(challenge: string): boolean {
  const now = Date.now();
  pruneDiscoverableChallenges(now);
  const createdAt = discoverableChallenges.get(challenge);
  if (createdAt === undefined) {
    return false;
  }
  discoverableChallenges.delete(challenge);
  return now - createdAt <= DISCOVERABLE_CHALLENGE_TTL_MS;
}


// ========== 配置 ==========

function getNexaiJwtSecret(): string {
  return config.nexai.jwtSecret;
}
function getNexaiJwtExpires(): string {
  return config.nexai.jwtExpiresIn;
}
function getNexaiRefreshExpires(): string {
  return config.nexai.refreshExpiresIn;
}
const BCRYPT_ROUNDS = 12;

// Google OAuth
function getGoogleClientId(): string {
  return config.nexai.google.clientId;
}

// GitHub OAuth
function getGithubClientId(): string {
  return config.nexai.github.clientId;
}

function getGithubClientSecret(): string {
  return config.nexai.github.clientSecret;
}

// ========== 工具函数 ==========

/** 生成 JWT Access Token */
function generateAccessToken(user: INexaiUser): string {
  return jwt.sign(
    {
      userId: user.id,
      username: user.username,
      email: user.email,
      provider: user.authProvider,
      scope: "nexai",
      // G2-24: tokenVersion claim，改密后 $inc 使旧 access token 立即失效。
      // G2-25: 不再在 token 里签发 role，鉴权一律读 DB 用户，避免降权后旧 token 继续生效。
      tokenVersion: (user as any).tokenVersion || 0,
    },
    getNexaiJwtSecret(),
    { expiresIn: getNexaiJwtExpires() as jwt.SignOptions["expiresIn"] },
  );
}

/** 生成 Refresh Token */
function generateRefreshToken(): string {
  return `${uuidv4()}-${uuidv4()}`;
}

/** Refresh Token 的确定性查找值：只用于把候选集收敛到单条，最终仍由 bcrypt.compare 判定 */
function computeRefreshTokenLookup(refreshToken: string): string {
  return crypto.createHmac("sha256", getNexaiJwtSecret()).update(refreshToken).digest("hex");
}

function generateSystemPassword(): string {
  return crypto.randomBytes(32).toString("hex");
}

/** 计算 Refresh Token 过期时间 */
function getRefreshTokenExpiry(): number {
  const match = getNexaiRefreshExpires().match(/^(\d+)([dhms])$/);
  if (!match) return Date.now() + 30 * 24 * 60 * 60 * 1000; // 默认30天
  const val = parseInt(match[1], 10);
  const unit = match[2];
  const ms = unit === "d" ? val * 86400000 : unit === "h" ? val * 3600000 : unit === "m" ? val * 60000 : val * 1000;
  return Date.now() + ms;
}

/** 验证 JWT Token */
function verifyAccessToken(token: string): any {
  return jwt.verify(token, getNexaiJwtSecret(), { algorithms: ["HS256"] });
}

/** 合并 authProvider */
function mergeAuthProvider(existing: string, newProvider: "local" | "google" | "github"): string {
  const providers = new Set(existing.split("+"));
  providers.add(newProvider);
  // 规范化排序
  const sorted = Array.from(providers).sort();
  if (sorted.length === 3) return "all";
  return sorted.join("+");
}

/** 移除 authProvider */
function removeAuthProvider(existing: string, provider: "google" | "github"): string {
  if (existing === "all") {
    const all = ["local", "google", "github"].filter((p) => p !== provider);
    return all.join("+");
  }
  const providers = existing.split("+").filter((p) => p !== provider);
  return providers.length > 0 ? providers.join("+") : "local";
}

// ========== 输入验证 ==========

interface ValidationError {
  field: string;
  message: string;
}

function toWebAuthnUserId(userId: string): string {
  return Buffer.from(userId, "utf8").toString("base64url");
}

function normalizeBase64Url(value: string): string {
  let out = "";
  for (let index = 0; index < value.length; index += 1) {
    const char = value.charAt(index);
    if (char === "+") {
      out += "-";
      continue;
    }
    if (char === "/") {
      out += "_";
      continue;
    }
    if (char === "=") {
      continue;
    }
    out += char;
  }
  return out;
}

function getAuthenticationCredentialId(response: AuthenticationResponseJSON): string | null {
  const maybeResponse = response as AuthenticationResponseJSON & { rawId?: unknown };
  const credentialId = typeof maybeResponse.id === "string" ? maybeResponse.id : maybeResponse.rawId;
  return typeof credentialId === "string" && credentialId.length > 0 ? credentialId : null;
}

async function findUserByPasskeyCredentialId(credentialId: string): Promise<INexaiUser | null> {
  const normalized = normalizeBase64Url(credentialId);
  if (!normalized) return null;

  // New records store unpadded base64url ids.
  const exact = (await NexaiUserModel.findOne({ "passkeys.id": normalized }).lean()) as INexaiUser | null;
  if (exact) return exact;

  // Legacy padded base64url variants.
  const padLen = (4 - (normalized.length % 4)) % 4;
  if (padLen === 0) return null;
  const padded = normalized + "=".repeat(padLen);
  return (await NexaiUserModel.findOne({ "passkeys.id": padded }).lean()) as INexaiUser | null;
}

function validateUsername(username: string): ValidationError[] {
  const errors: ValidationError[] = [];
  if (!username || typeof username !== "string") {
    errors.push({ field: "username", message: "用户名不能为空" });
    return errors;
  }
  if (username.length < 3 || username.length > 30) {
    errors.push({ field: "username", message: "用户名长度应为 3-30 个字符" });
  }
  if (!/^[a-zA-Z0-9_-]+$/.test(username)) {
    errors.push({ field: "username", message: "用户名只能包含字母、数字、下划线和连字符" });
  }
  return errors;
}

function validateEmail(email: string): ValidationError[] {
  const errors: ValidationError[] = [];
  if (!email || typeof email !== "string") {
    errors.push({ field: "email", message: "邮箱不能为空" });
    return errors;
  }
  if (!validator.isEmail(email)) {
    errors.push({ field: "email", message: "邮箱格式不正确" });
  }
  return errors;
}

function validatePassword(password: string): ValidationError[] {
  const errors: ValidationError[] = [];
  if (!password || typeof password !== "string") {
    errors.push({ field: "password", message: "密码不能为空" });
    return errors;
  }
  if (password.length < 6) {
    errors.push({ field: "password", message: "密码长度不能少于 6 个字符" });
  }
  if (password.length > 128) {
    errors.push({ field: "password", message: "密码长度不能超过 128 个字符" });
  }
  return errors;
}

// ========== 核心服务 ==========

export class NexaiAuthService {
  // ---------- 注册 ----------
  static async register(data: {
    username: string;
    email: string;
    password: string;
    displayName?: string;
    ip?: string;
  }): Promise<{ user: INexaiUser; accessToken: string; refreshToken: string }> {
    // 输入验证
    const errors = [
      ...validateUsername(data.username),
      ...validateEmail(data.email),
      ...validatePassword(data.password),
    ];
    if (errors.length > 0) {
      throw Object.assign(new Error("输入验证失败"), { statusCode: 400, validationErrors: errors });
    }

    // 检查用户名和邮箱是否已存在（使用已验证过的安全值）
    const safeUsername = String(data.username).replace(/[^a-zA-Z0-9_-]/g, "");
    const safeEmail = String(data.email).trim().toLowerCase();
    const existingByUsername = await NexaiUserModel.findOne({ username: safeUsername }).lean();
    if (existingByUsername) {
      throw Object.assign(new Error("用户名已被使用"), { statusCode: 409 });
    }

    const existingByEmail = await NexaiUserModel.findOne({ email: safeEmail }).lean();
    if (existingByEmail) {
      throw Object.assign(new Error("邮箱已被注册"), { statusCode: 409 });
    }

    // 创建用户
    const hashedPassword = await bcrypt.hash(data.password, BCRYPT_ROUNDS);
    const refreshToken = generateRefreshToken();
    const hashedRefreshToken = await bcrypt.hash(refreshToken, 10);

    const newUser: any = {
      id: uuidv4(),
      username: data.username,
      email: data.email.trim().toLowerCase(),
      password: hashedPassword,
      displayName: data.displayName || data.username,
      authProvider: "local",
      emailVerified: false,
      role: "user",
      refreshToken: hashedRefreshToken,
      refreshTokenLookup: computeRefreshTokenLookup(refreshToken),
      refreshTokenExpiresAt: getRefreshTokenExpiry(),
      lastLoginAt: new Date(),
      lastLoginIp: data.ip || "",
      loginCount: 1,
    };

    const doc = await NexaiUserModel.create(newUser);
    const user = doc.toObject() as INexaiUser;
    const accessToken = generateAccessToken(user);

    logger.info("[NexAI] 用户注册成功", { userId: user.id, username: user.username, provider: "local" });

    return { user, accessToken, refreshToken };
  }

  // ---------- 登录 ----------
  static async login(data: {
    identifier: string; // 用户名或邮箱
    password: string;
    ip?: string;
  }): Promise<{ user: INexaiUser; accessToken: string; refreshToken: string }> {
    if (!data.identifier || !data.password) {
      throw Object.assign(new Error("请提供用户名/邮箱和密码"), { statusCode: 400 });
    }

    // 查找用户（支持用户名或邮箱）— 显式清理输入防止 NoSQL 注入
    const identifier = String(data.identifier).trim();
    const isEmail = validator.isEmail(identifier);
    const safeValue = isEmail ? identifier.toLowerCase() : identifier.replace(/[^a-zA-Z0-9_-]/g, "");
    const query = isEmail ? { email: safeValue } : { username: safeValue };

    const user = (await NexaiUserModel.findOne(query).lean()) as INexaiUser | null;
    if (!user) {
      throw Object.assign(new Error("用户名或密码错误"), { statusCode: 401 });
    }

    // 检查是否有密码（OAuth 专属用户可能没有密码）
    if (!user.password) {
      throw Object.assign(new Error("该账号通过第三方登录创建，请使用 Google 或 GitHub 登录，或先设置密码"), {
        statusCode: 401,
      });
    }

    // 验证密码
    const isMatch = await bcrypt.compare(data.password, user.password);
    if (!isMatch) {
      throw Object.assign(new Error("用户名或密码错误"), { statusCode: 401 });
    }

    // 生成新 token
    const refreshToken = generateRefreshToken();
    const hashedRefreshToken = await bcrypt.hash(refreshToken, 10);

    await NexaiUserModel.findOneAndUpdate(
      { id: user.id },
      {
        $set: {
          refreshToken: hashedRefreshToken,
          refreshTokenLookup: computeRefreshTokenLookup(refreshToken),
          refreshTokenExpiresAt: getRefreshTokenExpiry(),
          lastLoginAt: new Date(),
          lastLoginIp: data.ip || "",
        },
        $inc: { loginCount: 1 },
      },
    );

    const accessToken = generateAccessToken(user);

    logger.info("[NexAI] 用户登录成功", { userId: user.id, username: user.username, method: "password" });

    return { user, accessToken, refreshToken };
  }

  // ---------- Google OAuth ----------
  static async googleAuth(data: {
    idToken: string;
    ip?: string;
  }): Promise<{ user: INexaiUser; accessToken: string; refreshToken: string; isNewUser: boolean }> {
    const googleClientId = getGoogleClientId();
    if (!googleClientId) {
      throw Object.assign(new Error("Google OAuth 未配置"), { statusCode: 503 });
    }

    // 验证 Google ID Token
    let googlePayload: any;
    try {
      // 动态导入 google-auth-library（可能未安装时优雅降级）
      const googleAuthModule = await import("google-auth-library");
      const OAuth2Client = googleAuthModule.OAuth2Client ?? googleAuthModule.default?.OAuth2Client;
      const client = new OAuth2Client(googleClientId);
      const ticket = await client.verifyIdToken({
        idToken: data.idToken,
        audience: googleClientId,
      });
      googlePayload = ticket.getPayload();
    } catch (err: any) {
      logger.error("[NexAI] Google Token 验证失败", { error: err.message });
      throw Object.assign(new Error("Google 身份验证失败"), { statusCode: 401 });
    }

    if (!googlePayload?.sub) {
      throw Object.assign(new Error("无效的 Google Token"), { statusCode: 401 });
    }

    const googleId = googlePayload.sub;
    const googleEmail = googlePayload.email;
    const googleName = googlePayload.name || googlePayload.email?.split("@")[0] || "User";
    const googleAvatar = googlePayload.picture || "";
    const emailVerified = googlePayload.email_verified || false;

    // 查找是否已存在关联的用户
    let user = (await NexaiUserModel.findOne({ googleId }).lean()) as INexaiUser | null;
    let isNewUser = false;

    if (!user) {
      // G2-04: 未验证邮箱不再作为并号依据。邮箱已被其他用户占用时明确拒绝，
      // 引导用户登录后通过 linkGoogle 显式绑定。
      if (!emailVerified) {
        throw Object.assign(new Error("Google 邮箱未验证，无法登录"), { statusCode: 401 });
      }
      if (googleEmail) {
        const emailTaken = await NexaiUserModel.findOne({ email: googleEmail.toLowerCase() }).lean();
        if (emailTaken) {
          throw Object.assign(new Error("该邮箱已注册，请先登录后绑定 Google 账号"), { statusCode: 409 });
        }
      }
      // 创建新用户
      isNewUser = true;
      const username = await generateUniqueUsername(googleName);
      const systemPassword = generateSystemPassword();
      const hashedPassword = await bcrypt.hash(systemPassword, BCRYPT_ROUNDS);
      const refreshToken = generateRefreshToken();
      const hashedRefreshToken = await bcrypt.hash(refreshToken, 10);

      const newUser: any = {
        id: uuidv4(),
        username,
        email: (googleEmail || `${googleId}@google.nexai`).toLowerCase(),
        password: hashedPassword,
        displayName: googleName,
        avatarUrl: googleAvatar,
        googleId,
        googleEmail,
        googleAvatarUrl: googleAvatar,
        authProvider: "google",
        emailVerified,
        role: "user",
        refreshToken: hashedRefreshToken,
        refreshTokenLookup: computeRefreshTokenLookup(refreshToken),
        refreshTokenExpiresAt: getRefreshTokenExpiry(),
        lastLoginAt: new Date(),
        lastLoginIp: data.ip || "",
        loginCount: 1,
      };

      const doc = await NexaiUserModel.create(newUser);
      user = doc.toObject() as INexaiUser;

      logger.info("[NexAI] Google OAuth 新用户创建", { userId: user.id, username, googleId });
      await sendProviderGeneratedPasswordEmail({
        email: user.email,
        username: user.username,
        password: systemPassword,
        providerLabel: "Google",
      });

      return {
        user,
        accessToken: generateAccessToken(user),
        refreshToken,
        isNewUser,
      };
    }

    // 已有用户，更新登录信息
    const refreshToken = generateRefreshToken();
    const hashedRefreshToken = await bcrypt.hash(refreshToken, 10);

    await NexaiUserModel.findOneAndUpdate(
      { id: user?.id },
      {
        $set: {
          refreshToken: hashedRefreshToken,
          refreshTokenLookup: computeRefreshTokenLookup(refreshToken),
          refreshTokenExpiresAt: getRefreshTokenExpiry(),
          lastLoginAt: new Date(),
          lastLoginIp: data.ip || "",
          googleAvatarUrl: googleAvatar,
        },
        $inc: { loginCount: 1 },
      },
    );

    logger.info("[NexAI] Google OAuth 登录成功", { userId: user?.id, googleId });

    return {
      user: user!,
      accessToken: generateAccessToken(user!),
      refreshToken,
      isNewUser,
    };
  }

  // ---------- GitHub OAuth ----------
  static async githubAuth(data: {
    code: string;
    ip?: string;
  }): Promise<{ user: INexaiUser; accessToken: string; refreshToken: string; isNewUser: boolean }> {
    const githubClientId = getGithubClientId();
    const githubClientSecret = getGithubClientSecret();
    if (!githubClientId || !githubClientSecret) {
      throw Object.assign(new Error("GitHub OAuth 未配置"), { statusCode: 503 });
    }

    // 1. 用授权码换取 access_token
    let githubAccessToken: string;
    try {
      const tokenRes = await axios.post(
        "https://github.com/login/oauth/access_token",
        {
          client_id: githubClientId,
          client_secret: githubClientSecret,
          code: data.code,
        },
        {
          headers: { Accept: "application/json" },
          timeout: 10000,
        },
      );
      githubAccessToken = tokenRes.data.access_token;
      if (!githubAccessToken) {
        throw new Error(tokenRes.data.error_description || "Failed to get access token");
      }
    } catch (err: any) {
      logger.error("[NexAI] GitHub OAuth 获取 token 失败", { error: err.message });
      throw Object.assign(new Error("GitHub 授权失败"), { statusCode: 401 });
    }

    // 2. 获取 GitHub 用户信息
    let githubUser: any;
    try {
      const userRes = await axios.get("https://api.github.com/user", {
        headers: {
          Authorization: `Bearer ${githubAccessToken}`,
          Accept: "application/vnd.github+json",
        },
        timeout: 10000,
      });
      githubUser = userRes.data;
    } catch (err: any) {
      logger.error("[NexAI] GitHub 获取用户信息失败", { error: err.message });
      throw Object.assign(new Error("获取 GitHub 用户信息失败"), { statusCode: 401 });
    }

    // 3. 获取 GitHub 用户邮箱（如果公开邮箱为空）
    let githubEmail = githubUser.email;
    if (!githubEmail) {
      try {
        const emailsRes = await axios.get("https://api.github.com/user/emails", {
          headers: {
            Authorization: `Bearer ${githubAccessToken}`,
            Accept: "application/vnd.github+json",
          },
          timeout: 10000,
        });
        const primaryEmail = emailsRes.data.find((e: any) => e.primary && e.verified);
        githubEmail = primaryEmail?.email || null;
      } catch (_) {
        // 邮箱获取失败不阻塞流程
      }
    }

    const githubId = String(githubUser.id);
    const githubUsername = githubUser.login;
    const githubAvatar = githubUser.avatar_url || "";
    const githubName = githubUser.name || githubUsername;

    // 查找是否已存在关联的用户
    let user = (await NexaiUserModel.findOne({ githubId }).lean()) as INexaiUser | null;
    let isNewUser = false;

    if (!user) {
      // G2-04: 不再按邮箱自动并号。邮箱已被其他用户占用时明确拒绝，
      // 引导用户登录后通过 linkGithub 显式绑定。
      if (githubEmail) {
        const emailTaken = await NexaiUserModel.findOne({ email: githubEmail.toLowerCase() }).lean();
        if (emailTaken) {
          throw Object.assign(new Error("该邮箱已注册，请先登录后绑定 GitHub 账号"), { statusCode: 409 });
        }
      }
      // 创建新用户
      isNewUser = true;
      const username = await generateUniqueUsername(githubUsername || githubName);
      const systemPassword = generateSystemPassword();
      const hashedPassword = await bcrypt.hash(systemPassword, BCRYPT_ROUNDS);
      const refreshToken = generateRefreshToken();
      const hashedRefreshToken = await bcrypt.hash(refreshToken, 10);

      const newUser: any = {
        id: uuidv4(),
        username,
        email: (githubEmail || `${githubId}@github.nexai`).toLowerCase(),
        password: hashedPassword,
        displayName: githubName,
        avatarUrl: githubAvatar,
        githubId,
        githubUsername,
        githubEmail,
        githubAvatarUrl: githubAvatar,
        authProvider: "github",
        emailVerified: !!githubEmail,
        role: "user",
        refreshToken: hashedRefreshToken,
        refreshTokenLookup: computeRefreshTokenLookup(refreshToken),
        refreshTokenExpiresAt: getRefreshTokenExpiry(),
        lastLoginAt: new Date(),
        lastLoginIp: data.ip || "",
        loginCount: 1,
      };

      const doc = await NexaiUserModel.create(newUser);
      user = doc.toObject() as INexaiUser;

      logger.info("[NexAI] GitHub OAuth 新用户创建", { userId: user.id, username, githubId });
      await sendProviderGeneratedPasswordEmail({
        email: user.email,
        username: user.username,
        password: systemPassword,
        providerLabel: "GitHub",
      });

      return {
        user,
        accessToken: generateAccessToken(user),
        refreshToken,
        isNewUser,
      };
    }

    // 已有用户，更新登录信息
    const refreshToken = generateRefreshToken();
    const hashedRefreshToken = await bcrypt.hash(refreshToken, 10);

    await NexaiUserModel.findOneAndUpdate(
      { id: user?.id },
      {
        $set: {
          refreshToken: hashedRefreshToken,
          refreshTokenLookup: computeRefreshTokenLookup(refreshToken),
          refreshTokenExpiresAt: getRefreshTokenExpiry(),
          lastLoginAt: new Date(),
          lastLoginIp: data.ip || "",
          githubAvatarUrl: githubAvatar,
          githubUsername,
        },
        $inc: { loginCount: 1 },
      },
    );

    logger.info("[NexAI] GitHub OAuth 登录成功", { userId: user?.id, githubId });

    return {
      user: user!,
      accessToken: generateAccessToken(user!),
      refreshToken,
      isNewUser,
    };
  }

  // ---------- WebAuthn (Passkeys) ----------

  static getWebAuthnConfig(ip?: string) {
    void ip;
    return getNexaiWebAuthnConfig();
  }

  /** 1. 生成 Passkey 注册选项 (必须已登录) */
  static async generatePasskeyRegistrationOptions(userId: string) {
    const user = (await NexaiUserModel.findOne({ id: userId }).lean()) as INexaiUser;
    if (!user) throw Object.assign(new Error("用户不存在"), { statusCode: 404 });
    if ((user.passkeys || []).length > 0) {
      throw Object.assign(new Error(SINGLE_PASSKEY_ERROR_MESSAGE), { statusCode: 400 });
    }

    const { rpName, rpID } = NexaiAuthService.getWebAuthnConfig();
    const existingCredentials = (user.passkeys || []).map((pk) => ({
      id: pk.id,
      type: "public-key" as const,
    }));

    const options = await generateRegistrationOptions({
      rpName,
      rpID,
      userID: new TextEncoder().encode(user.id), // 用用户唯一ID作为userID
      userName: user.email, // 登录名通常用email或username
      attestationType: "none",
      excludeCredentials: existingCredentials,
      authenticatorSelection: {
        // required improves usernameless discoverable login on Android Credential Manager
        residentKey: "required",
        requireResidentKey: true,
        userVerification: "required",
        authenticatorAttachment: "platform", // 优先使用设备内置，如 FaceID/TouchID/Android Passkeys
      },
    });

    // 存储 challenge 到用户文档，用于稍后验证
    await NexaiUserModel.updateOne({ id: userId }, { $set: { currentChallenge: options.challenge } });

    return options;
  }

  /** 2. 验证 Passkey 注册响应 */
  static async verifyPasskeyRegistration(userId: string, response: RegistrationResponseJSON) {
    const user = (await NexaiUserModel.findOne({ id: userId }).lean()) as INexaiUser;
    if (!user?.currentChallenge) {
      throw Object.assign(new Error("无效的注册请求或挑战已过期"), { statusCode: 400 });
    }
    if ((user.passkeys || []).length > 0) {
      throw Object.assign(new Error(SINGLE_PASSKEY_ERROR_MESSAGE), { statusCode: 400 });
    }

    const { rpID, expectedOrigins } = NexaiAuthService.getWebAuthnConfig();
    const expectedOrigin = expectedOrigins.length === 1 ? expectedOrigins[0] : expectedOrigins;
    // 取出挑战后清空
    const expectedChallenge = user.currentChallenge;
    await NexaiUserModel.updateOne({ id: userId }, { $unset: { currentChallenge: "" } });

    let verification;
    try {
      verification = await verifyRegistrationResponse({
        response,
        expectedChallenge,
        expectedOrigin,
        expectedRPID: rpID,
        requireUserVerification: true,
      });
    } catch (error: any) {
      logger.error("[NexAI] Passkey 注册验证失败", { error: error.message });
      throw Object.assign(new Error(`注册验证失败: ${error.message}`), { statusCode: 400 });
    }

    const { verified, registrationInfo } = verification;
    if (verified && registrationInfo) {
      const { credential } = registrationInfo;
      // 将新通行密钥添加到用户记录
      const newPasskey = {
        id: normalizeBase64Url(credential.id),
        publicKey: Buffer.from(credential.publicKey),
        counter: credential.counter,
        deviceType: registrationInfo.credentialDeviceType,
        backedUp: registrationInfo.credentialBackedUp,
        transports: response.response.transports || [],
      };

      await NexaiUserModel.updateOne({ id: userId }, { $push: { passkeys: newPasskey } });
      logger.info("[NexAI] Passkey 绑定成功", { userId });
      return true;
    }
    throw Object.assign(new Error("Passkey 绑定未通过验证"), { statusCode: 400 });
  }

  /** 3. 生成 Passkey 登录选项 */
  static async generatePasskeyAuthenticationOptions(identifier: string) {
    // 支持根据用户名或邮箱查找
    const safeValue = validator.isEmail(identifier.trim())
      ? identifier.trim().toLowerCase()
      : identifier.trim().replace(/[^a-zA-Z0-9_-]/g, "");

    const query = validator.isEmail(identifier.trim()) ? { email: safeValue } : { username: safeValue };
    const user = (await NexaiUserModel.findOne(query).lean()) as INexaiUser;

    const { rpID } = NexaiAuthService.getWebAuthnConfig();

    // G2-27: 用户不存在时也返回一份用随机 allowCredentials 构造的合法 options，
    // 且不落库 challenge，避免 404/200 差异暴露用户是否存在。后续 finish 一律失败。
    if (!user) {
      const randomAllowCredentials = Array.from({ length: 3 }, () => ({
        id: Buffer.from(crypto.randomBytes(32)).toString("base64url"),
        type: "public-key" as const,
        transports: ["internal" as AuthenticatorTransport],
      }));
      const decoyOptions = await generateAuthenticationOptions({
        rpID,
        allowCredentials: randomAllowCredentials,
        userVerification: "required",
      });
      return { options: decoyOptions, userId: "" };
    }

    const allowCredentials = (user.passkeys || []).map((pk) => ({
      id: normalizeBase64Url(pk.id),
      type: "public-key" as const,
      transports: pk.transports as AuthenticatorTransport[],
    }));

    const options = await generateAuthenticationOptions({
      rpID,
      allowCredentials,
      userVerification: "required",
    });

    // 存储 challenge
    await NexaiUserModel.updateOne({ id: user.id }, { $set: { currentChallenge: options.challenge } });

    return { options, userId: user.id };
  }

  /** 3b. 生成 Discoverable (无用户名) Passkey 登录选项 */
  static async generateDiscoverablePasskeyAuthenticationOptions() {
    const { rpID } = NexaiAuthService.getWebAuthnConfig();
    const options = await generateAuthenticationOptions({
      rpID,
      // Empty allowCredentials enables Conditional UI / usernameless discoverable credentials.
      allowCredentials: [],
      userVerification: "preferred",
    });

    storeDiscoverableChallenge(options.challenge);
    return options;
  }

  /** 4. 验证 Passkey 登录响应 */
  static async verifyPasskeyAuthentication(userId: string, response: AuthenticationResponseJSON, ip?: string) {
    const user = (await NexaiUserModel.findOne({ id: userId }).lean()) as INexaiUser;
    if (!user?.currentChallenge) {
      throw Object.assign(new Error("挑战不存在，请重试"), { statusCode: 400 });
    }

    const expectedChallenge = user.currentChallenge;
    // 使用后立即清除
    await NexaiUserModel.updateOne({ id: userId }, { $unset: { currentChallenge: "" } });

    // 找到使用的 passkey
    const credentialId = getAuthenticationCredentialId(response);
    if (!credentialId) {
      throw Object.assign(new Error("Passkey 响应缺少 credential id"), { statusCode: 400 });
    }

    const normalizedCredentialId = normalizeBase64Url(credentialId);
    const passkey = (user.passkeys || []).find(
      (pk) => typeof pk.id === "string" && normalizeBase64Url(pk.id) === normalizedCredentialId,
    );
    if (!passkey) {
      throw Object.assign(new Error("未找到对应通行密钥记录"), {
        statusCode: 400,
        code: NEXAI_PASSKEY_UNKNOWN_CREDENTIAL_CODE,
      });
    }

    const { rpID, expectedOrigins } = NexaiAuthService.getWebAuthnConfig();
    const expectedOrigin = expectedOrigins.length === 1 ? expectedOrigins[0] : expectedOrigins;

    let verification;
    try {
      verification = await verifyAuthenticationResponse({
        response,
        expectedChallenge,
        expectedOrigin,
        expectedRPID: rpID,
        credential: {
          id: normalizeBase64Url(passkey.id),
          publicKey: new Uint8Array(passkey.publicKey),
          counter: passkey.counter,
          transports: passkey.transports as AuthenticatorTransport[],
        },
        requireUserVerification: true,
      });
    } catch (error: any) {
      logger.error("[NexAI] Passkey 登录验证失败", { error: error.message });
      throw Object.assign(new Error(`登录验证失败: ${error.message}`), { statusCode: 400 });
    }

    if (verification.verified) {
      const { authenticationInfo } = verification;

      // 更新该 passkey 的 counter
      await NexaiUserModel.updateOne(
        { id: userId, "passkeys.id": passkey.id },
        { $set: { "passkeys.$.counter": authenticationInfo.newCounter } },
      );

      // 签发 Token
      const refreshToken = generateRefreshToken();
      const hashedRefreshToken = await bcrypt.hash(refreshToken, 10);

      await NexaiUserModel.findOneAndUpdate(
        { id: userId },
        {
          $set: {
            refreshToken: hashedRefreshToken,
            refreshTokenLookup: computeRefreshTokenLookup(refreshToken),
            refreshTokenExpiresAt: getRefreshTokenExpiry(),
            lastLoginAt: new Date(),
            lastLoginIp: ip || "",
          },
          $inc: { loginCount: 1 },
        },
      );

      const accessToken = generateAccessToken(user);
      logger.info("[NexAI] 用户通过 Passkey 登录成功", { userId: user.id });

      return { user, accessToken, refreshToken };
    }
    throw Object.assign(new Error("Passkey 验证未通过"), { statusCode: 401 });
  }

  /** 4b. 验证 Discoverable Passkey 登录（通过 credential id 反查用户） */
  static async verifyDiscoverablePasskeyAuthentication(
    response: AuthenticationResponseJSON,
    challenge: string,
    ip?: string,
  ) {
    if (!challenge || typeof challenge !== "string") {
      throw Object.assign(new Error("缺少 challenge"), { statusCode: 400 });
    }
    if (!consumeDiscoverableChallenge(challenge)) {
      throw Object.assign(new Error("挑战不存在或已过期，请重试"), { statusCode: 400 });
    }

    const credentialId = getAuthenticationCredentialId(response);
    if (!credentialId) {
      throw Object.assign(new Error("Passkey 响应缺少 credential id"), { statusCode: 400 });
    }

    const user = await findUserByPasskeyCredentialId(credentialId);
    if (!user) {
      throw Object.assign(new Error("未找到对应通行密钥记录"), {
        statusCode: 400,
        code: NEXAI_PASSKEY_UNKNOWN_CREDENTIAL_CODE,
      });
    }

    const normalizedCredentialId = normalizeBase64Url(credentialId);
    const passkey = (user.passkeys || []).find(
      (pk) => typeof pk.id === "string" && normalizeBase64Url(pk.id) === normalizedCredentialId,
    );
    if (!passkey) {
      throw Object.assign(new Error("未找到对应通行密钥记录"), {
        statusCode: 400,
        code: NEXAI_PASSKEY_UNKNOWN_CREDENTIAL_CODE,
      });
    }

    const { rpID, expectedOrigins } = NexaiAuthService.getWebAuthnConfig();
    const expectedOrigin = expectedOrigins.length === 1 ? expectedOrigins[0] : expectedOrigins;

    let verification;
    try {
      verification = await verifyAuthenticationResponse({
        response,
        expectedChallenge: challenge,
        expectedOrigin,
        expectedRPID: rpID,
        credential: {
          id: normalizeBase64Url(passkey.id),
          publicKey: new Uint8Array(passkey.publicKey),
          counter: passkey.counter,
          transports: passkey.transports as AuthenticatorTransport[],
        },
        requireUserVerification: true,
      });
    } catch (error: any) {
      logger.error("[NexAI] Discoverable Passkey 登录验证失败", { error: error.message });
      throw Object.assign(new Error(`登录验证失败: ${error.message}`), { statusCode: 400 });
    }

    if (!verification.verified) {
      throw Object.assign(new Error("Passkey 验证未通过"), { statusCode: 401 });
    }

    const { authenticationInfo } = verification;
    await NexaiUserModel.updateOne(
      { id: user.id, "passkeys.id": passkey.id },
      { $set: { "passkeys.$.counter": authenticationInfo.newCounter } },
    );

    const refreshToken = generateRefreshToken();
    const hashedRefreshToken = await bcrypt.hash(refreshToken, 10);
    await NexaiUserModel.findOneAndUpdate(
      { id: user.id },
      {
        $set: {
          refreshToken: hashedRefreshToken,
          refreshTokenLookup: computeRefreshTokenLookup(refreshToken),
          refreshTokenExpiresAt: getRefreshTokenExpiry(),
          lastLoginAt: new Date(),
          lastLoginIp: ip || "",
        },
        $inc: { loginCount: 1 },
      },
    );

    const accessToken = generateAccessToken(user);
    logger.info("[NexAI] 用户通过 Discoverable Passkey 登录成功", { userId: user.id });
    return { user, accessToken, refreshToken };
  }

  static async getPasskeySignalOptions(userId: string) {
    const user = (await NexaiUserModel.findOne({ id: userId })
      .select("id username email displayName passkeys")
      .lean()) as INexaiUser | null;
    if (!user) {
      throw Object.assign(new Error("用户不存在"), { statusCode: 404 });
    }

    const { rpID } = NexaiAuthService.getWebAuthnConfig();
    const allAcceptedCredentialIds = (user.passkeys || [])
      .map((passkey) => (typeof passkey.id === "string" ? normalizeBase64Url(passkey.id) : ""))
      .filter((credentialId) => credentialId.length > 0);
    const signalUserId = toWebAuthnUserId(user.id);

    return {
      allAcceptedCredentials: {
        rpId: rpID,
        userId: signalUserId,
        allAcceptedCredentialIds,
      },
      currentUserDetails: {
        rpId: rpID,
        userId: signalUserId,
        name: user.email,
        displayName: user.displayName || user.username || user.email,
      },
    };
  }

  // ---------- Token 刷新 ----------
  static async refreshAccessToken(data: {
    refreshToken: string;
    ip?: string;
  }): Promise<{ accessToken: string; refreshToken: string }> {
    if (!data.refreshToken) {
      throw Object.assign(new Error("缺少 refreshToken"), { statusCode: 400 });
    }

    // refreshTokenLookup 是 HMAC 索引列，只负责把候选集收敛为单条；是否放行仍由 bcrypt.compare 决定
    const matchByBcrypt = async (candidates: INexaiUser[]): Promise<INexaiUser | null> => {
      for (const candidate of candidates) {
        if (candidate.refreshToken && (await bcrypt.compare(data.refreshToken, candidate.refreshToken))) {
          return candidate;
        }
      }
      return null;
    };

    let matchedUser = await matchByBcrypt(
      (await NexaiUserModel.find({
        refreshTokenLookup: computeRefreshTokenLookup(data.refreshToken),
        refreshTokenExpiresAt: { $gt: Date.now() },
      }).lean()) as INexaiUser[],
    );

    // G2-07: 已删除「refreshTokenLookup 未命中时全表 bcrypt 比对」的兜底。
    // 该兜底会让任意伪造的 refreshToken 触发全库 N 次 bcrypt.compare，占满 libuv 线程池。
    // 未轮换的旧文档通过一次性迁移 $unset refreshToken 强制重登，这里只走索引收敛后的单条判定。
    if (!matchedUser) {
      throw Object.assign(new Error("无效或已过期的 refreshToken"), { statusCode: 401 });
    }

    // 生成新的 token 对
    const newRefreshToken = generateRefreshToken();
    const hashedRefreshToken = await bcrypt.hash(newRefreshToken, 10);

    await NexaiUserModel.findOneAndUpdate(
      { id: matchedUser.id },
      {
        $set: {
          refreshToken: hashedRefreshToken,
          refreshTokenLookup: computeRefreshTokenLookup(newRefreshToken),
          refreshTokenExpiresAt: getRefreshTokenExpiry(),
        },
      },
    );

    const accessToken = generateAccessToken(matchedUser);

    logger.info("[NexAI] Token 刷新成功", { userId: matchedUser.id });

    return { accessToken, refreshToken: newRefreshToken };
  }

  // ---------- 获取用户信息 ----------
  static async getUserById(userId: string): Promise<INexaiUser | null> {
    if (!userId || typeof userId !== "string") return null;
    return (await NexaiUserModel.findOne({ id: userId })
      .select("-password -refreshToken -refreshTokenExpiresAt")
      .lean()) as INexaiUser | null;
  }

  static async getUserByIdFull(userId: string): Promise<INexaiUser | null> {
    if (!userId || typeof userId !== "string") return null;
    return (await NexaiUserModel.findOne({ id: userId }).lean()) as INexaiUser | null;
  }

  // ---------- 更新个人资料 ----------
  static async updateProfile(
    userId: string,
    updates: { displayName?: string; username?: string; avatarUrl?: string },
  ): Promise<INexaiUser | null> {
    const setFields: any = {};

    if (updates.displayName !== undefined) {
      if (updates.displayName.length > 50) {
        throw Object.assign(new Error("显示名称不能超过 50 个字符"), { statusCode: 400 });
      }
      setFields.displayName = updates.displayName;
    }

    if (updates.username !== undefined) {
      const errors = validateUsername(updates.username);
      if (errors.length > 0) {
        throw Object.assign(new Error(errors[0].message), { statusCode: 400 });
      }
      // 显式清理：仅允许通过验证的安全字符集
      const sanitizedUsername = String(updates.username).replace(/[^a-zA-Z0-9_-]/g, "");
      const existing = await NexaiUserModel.findOne({
        username: sanitizedUsername,
        id: { $ne: userId },
      }).lean();
      if (existing) {
        throw Object.assign(new Error("用户名已被使用"), { statusCode: 409 });
      }
      setFields.username = sanitizedUsername;
    }

    if (updates.avatarUrl !== undefined) {
      setFields.avatarUrl = updates.avatarUrl;
    }

    if (Object.keys(setFields).length === 0) {
      throw Object.assign(new Error("没有可更新的字段"), { statusCode: 400 });
    }

    const doc = await NexaiUserModel.findOneAndUpdate({ id: userId }, { $set: setFields }, { returnDocument: "after" })
      .select("-password -refreshToken -refreshTokenExpiresAt")
      .lean();

    return doc as INexaiUser | null;
  }

  // ---------- 关联/取消关联 OAuth ----------
  static async linkGoogle(userId: string, idToken: string): Promise<INexaiUser> {
    const googleClientId = getGoogleClientId();
    if (!googleClientId) {
      throw Object.assign(new Error("Google OAuth 未配置"), { statusCode: 503 });
    }

    let googlePayload: any;
    try {
      const googleAuthModule = await import("google-auth-library");
      const OAuth2Client = googleAuthModule.OAuth2Client ?? googleAuthModule.default?.OAuth2Client;
      const client = new OAuth2Client(googleClientId);
      const ticket = await client.verifyIdToken({
        idToken,
        audience: googleClientId,
      });
      googlePayload = ticket.getPayload();
    } catch (_err: any) {
      throw Object.assign(new Error("Google 身份验证失败"), { statusCode: 401 });
    }

    const googleId = googlePayload.sub;

    // 检查该 Google 账号是否已关联其他用户
    const existingGoogle = await NexaiUserModel.findOne({
      googleId,
      id: { $ne: userId },
    }).lean();
    if (existingGoogle) {
      throw Object.assign(new Error("该 Google 账号已关联到其他用户"), { statusCode: 409 });
    }

    const user = (await NexaiUserModel.findOne({ id: userId }).lean()) as INexaiUser;
    if (!user) {
      throw Object.assign(new Error("用户不存在"), { statusCode: 404 });
    }

    const doc = await NexaiUserModel.findOneAndUpdate(
      { id: userId },
      {
        $set: {
          googleId,
          googleEmail: googlePayload.email,
          googleAvatarUrl: googlePayload.picture || "",
          authProvider: mergeAuthProvider(user.authProvider, "google"),
        },
      },
      { returnDocument: "after" },
    )
      .select("-password -refreshToken -refreshTokenExpiresAt")
      .lean();

    logger.info("[NexAI] Google 账号已关联", { userId, googleId });
    return doc as INexaiUser;
  }

  static async unlinkGoogle(userId: string): Promise<INexaiUser> {
    const user = (await NexaiUserModel.findOne({ id: userId }).lean()) as INexaiUser;
    if (!user) {
      throw Object.assign(new Error("用户不存在"), { statusCode: 404 });
    }

    // 确保至少保留一种登录方式
    const newProvider = removeAuthProvider(user.authProvider, "google");
    if (newProvider === "local" && !user.password) {
      throw Object.assign(new Error("取消关联前请先设置密码，以确保至少有一种登录方式"), { statusCode: 400 });
    }

    const doc = await NexaiUserModel.findOneAndUpdate(
      { id: userId },
      {
        $set: { authProvider: newProvider },
        $unset: { googleId: "", googleEmail: "", googleAvatarUrl: "" },
      },
      { returnDocument: "after" },
    )
      .select("-password -refreshToken -refreshTokenExpiresAt")
      .lean();

    logger.info("[NexAI] Google 账号已取消关联", { userId });
    return doc as INexaiUser;
  }

  static async linkGithub(userId: string, code: string): Promise<INexaiUser> {
    const githubClientId = getGithubClientId();
    const githubClientSecret = getGithubClientSecret();
    if (!githubClientId || !githubClientSecret) {
      throw Object.assign(new Error("GitHub OAuth 未配置"), { statusCode: 503 });
    }

    // 用 code 换 token
    let githubAccessToken: string;
    try {
      const tokenRes = await axios.post(
        "https://github.com/login/oauth/access_token",
        {
          client_id: githubClientId,
          client_secret: githubClientSecret,
          code,
        },
        { headers: { Accept: "application/json" }, timeout: 10000 },
      );
      githubAccessToken = tokenRes.data.access_token;
      if (!githubAccessToken) throw new Error("No access token");
    } catch (_err: any) {
      throw Object.assign(new Error("GitHub 授权失败"), { statusCode: 401 });
    }

    // 获取 GitHub 用户信息
    const userRes = await axios.get("https://api.github.com/user", {
      headers: {
        Authorization: `Bearer ${githubAccessToken}`,
        Accept: "application/vnd.github+json",
      },
      timeout: 10000,
    });
    const githubId = String(userRes.data.id);
    const githubUsername = userRes.data.login;
    const githubAvatar = userRes.data.avatar_url || "";

    // 获取邮箱
    let githubEmail = userRes.data.email;
    if (!githubEmail) {
      try {
        const emailsRes = await axios.get("https://api.github.com/user/emails", {
          headers: { Authorization: `Bearer ${githubAccessToken}`, Accept: "application/vnd.github+json" },
          timeout: 10000,
        });
        const primary = emailsRes.data.find((e: any) => e.primary && e.verified);
        githubEmail = primary?.email || null;
      } catch (_) {}
    }

    // 检查该 GitHub 账号是否已关联其他用户
    const existingGithub = await NexaiUserModel.findOne({
      githubId,
      id: { $ne: userId },
    }).lean();
    if (existingGithub) {
      throw Object.assign(new Error("该 GitHub 账号已关联到其他用户"), { statusCode: 409 });
    }

    const user = (await NexaiUserModel.findOne({ id: userId }).lean()) as INexaiUser;
    if (!user) {
      throw Object.assign(new Error("用户不存在"), { statusCode: 404 });
    }

    const doc = await NexaiUserModel.findOneAndUpdate(
      { id: userId },
      {
        $set: {
          githubId,
          githubUsername,
          githubEmail,
          githubAvatarUrl: githubAvatar,
          authProvider: mergeAuthProvider(user.authProvider, "github"),
        },
      },
      { returnDocument: "after" },
    )
      .select("-password -refreshToken -refreshTokenExpiresAt")
      .lean();

    logger.info("[NexAI] GitHub 账号已关联", { userId, githubId });
    return doc as INexaiUser;
  }

  static async unlinkGithub(userId: string): Promise<INexaiUser> {
    const user = (await NexaiUserModel.findOne({ id: userId }).lean()) as INexaiUser;
    if (!user) {
      throw Object.assign(new Error("用户不存在"), { statusCode: 404 });
    }

    const newProvider = removeAuthProvider(user.authProvider, "github");
    if (newProvider === "local" && !user.password) {
      throw Object.assign(new Error("取消关联前请先设置密码，以确保至少有一种登录方式"), { statusCode: 400 });
    }

    const doc = await NexaiUserModel.findOneAndUpdate(
      { id: userId },
      {
        $set: { authProvider: newProvider },
        $unset: { githubId: "", githubUsername: "", githubEmail: "", githubAvatarUrl: "" },
      },
      { returnDocument: "after" },
    )
      .select("-password -refreshToken -refreshTokenExpiresAt")
      .lean();

    logger.info("[NexAI] GitHub 账号已取消关联", { userId });
    return doc as INexaiUser;
  }

  // ---------- 登出 ----------
  static async logout(userId: string): Promise<void> {
    await NexaiUserModel.findOneAndUpdate(
      { id: userId },
      { $unset: { refreshToken: "", refreshTokenLookup: "", refreshTokenExpiresAt: "" } },
    );
    logger.info("[NexAI] 用户登出", { userId });
  }

  // ---------- 忘记密码 ----------
  static async forgotPassword(email: string): Promise<{ message: string; resetToken: string }> {
    const errors = validateEmail(email);
    if (errors.length > 0) {
      throw Object.assign(new Error(errors[0].message), { statusCode: 400 });
    }

    const user = (await NexaiUserModel.findOne({ email: email.trim().toLowerCase() }).lean()) as INexaiUser | null;
    if (!user) {
      // 不泄露用户是否存在
      return { message: "如果该邮箱已注册，您将收到密码重置指引", resetToken: "" };
    }

    // G2-24: 一次性持久化重置令牌（存哈希 + 过期时间），不再用 JWT（可重放）。
    const resetToken = crypto.randomBytes(32).toString("hex");
    const resetTokenHash = crypto.createHash("sha256").update(resetToken).digest("hex");
    const expiresAt = Date.now() + 30 * 60 * 1000; // 30 分钟

    await NexaiUserModel.updateOne(
      { id: user.id },
      {
        $set: {
          passwordResetTokenHash: resetTokenHash,
          passwordResetTokenExpiresAt: expiresAt,
        },
      },
    );

    // 真发信（复用原系统邮件通道）
    const frontendBaseUrl = process.env.FRONTEND_URL || "https://tts.chloemlla.com";
    const resetLink = `${frontendBaseUrl}/nexai/reset-password?token=${resetToken}`;
    try {
      const emailHtml = generatePasswordResetLinkEmailHtml(user.username, resetLink);
      const result = await sendEmail({
        to: user.email,
        subject: "NexAI 账号密码重置",
        html: emailHtml,
        logTag: "NexAI 密码重置",
      });
      if (!result.success) {
        logger.warn("[NexAI] 密码重置邮件发送失败", { userId: user.id, email: user.email, error: result.error });
      }
    } catch (error) {
      logger.warn("[NexAI] 密码重置邮件发送异常", {
        userId: user.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    logger.info("[NexAI] 密码重置请求", { userId: user.id, email });

    // G2-24: resetToken 不随响应返回（含开发环境），只存在于邮件链接里。
    return { message: "如果该邮箱已注册，您将收到密码重置指引", resetToken: "" };
  }

  // ---------- 重置密码 ----------
  static async resetPassword(data: { token: string; newPassword: string }): Promise<void> {
    const errors = validatePassword(data.newPassword);
    if (errors.length > 0) {
      throw Object.assign(new Error(errors[0].message), { statusCode: 400 });
    }

    if (typeof data.token !== "string" || !/^[a-f0-9]{64}$/i.test(data.token)) {
      throw Object.assign(new Error("重置链接已过期或无效"), { statusCode: 400 });
    }

    const resetTokenHash = crypto.createHash("sha256").update(data.token).digest("hex");
    const user = (await NexaiUserModel.findOne({
      passwordResetTokenHash: resetTokenHash,
      passwordResetTokenExpiresAt: { $gt: Date.now() },
    }).lean()) as INexaiUser | null;

    if (!user) {
      throw Object.assign(new Error("重置链接已过期或无效"), { statusCode: 400 });
    }

    const hashedPassword = await bcrypt.hash(data.newPassword, BCRYPT_ROUNDS);

    // G2-24: 一次性消费令牌 + 撤销 refresh token + tokenVersion 递增使旧 access token 失效。
    await NexaiUserModel.findOneAndUpdate(
      { id: user.id },
      {
        $set: {
          password: hashedPassword,
          authProvider: mergeAuthProvider(user.authProvider, "local"),
        },
        $unset: {
          passwordResetTokenHash: "",
          passwordResetTokenExpiresAt: "",
          refreshToken: "",
          refreshTokenLookup: "",
          refreshTokenExpiresAt: "",
        },
        $inc: { tokenVersion: 1 },
      },
    );

    logger.info("[NexAI] 密码重置成功", { userId: user.id });
  }

  // ---------- 验证 Token（中间件用） ----------
  static verifyToken(token: string): any {
    const decoded = verifyAccessToken(token);
    if (decoded.scope !== "nexai") {
      throw new Error("Token scope 不匹配");
    }
    return decoded;
  }
}

// ========== 辅助函数 ==========

/** 生成唯一用户名（处理冲突） */
async function generateUniqueUsername(baseName: string): Promise<string> {
  // 清理非法字符
  let name = baseName.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 20);
  if (name.length < 3) name = `user_${name}`;

  let username = name;
  let attempt = 0;
  while (await NexaiUserModel.findOne({ username }).lean()) {
    attempt++;
    username = `${name}_${crypto.randomBytes(3).toString("hex")}`;
    if (attempt > 10) {
      username = `user_${uuidv4().slice(0, 8)}`;
      break;
    }
  }
  return username;
}
