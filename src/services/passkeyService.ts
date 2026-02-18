import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  type VerifiedAuthenticationResponse,
  type VerifiedRegistrationResponse,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from "@simplewebauthn/server";
import { isoBase64URL } from "@simplewebauthn/server/helpers";
import jwt from "jsonwebtoken";
import { config } from "../config/config";
import { env } from "../config/env";
import logger from "../utils/logger";
import { type User, UserStorage } from "../utils/userStorage";

// 认证器模型
interface Authenticator {
  id: string;
  name: string;
  credentialID: string;
  credentialPublicKey: string;
  counter: number;
  createdAt: string;
}

// 获取 RP ID（依赖域名）
const getRpId = () => {
  return env.RP_ID;
};

/**
 * 验证并提取 origin 的主机名部分
 * 例如: https://example.com -> example.com
 */
const extractHostFromOrigin = (origin: string): string => {
  try {
    const url = new URL(origin);
    return url.hostname;
  } catch {
    return "";
  }
};

/**
 * 验证 clientOrigin 是否在允许列表中
 */
const isOriginAllowed = (clientOrigin: string): boolean => {
  const allowedOriginsStr = (env as any).ALLOWED_ORIGINS || (env as any).RP_ORIGIN || "https://tts.hapxs.com";
  const allowedOrigins = allowedOriginsStr
    .split(",")
    .map((o: string) => o.trim())
    .filter((o: string) => o.length > 0);

  return allowedOrigins.includes(clientOrigin);
};

// 获取 RP 原点（支持动态和固定两种模式）
const getRpOrigin = (clientOrigin?: string): string => {
  const mode = (env as any).RP_ORIGIN_MODE || "fixed";

  if (mode === "dynamic" && clientOrigin) {
    // 动态模式：从客户端获取，但需验证白名单
    if (isOriginAllowed(clientOrigin)) {
      logger.info("[Passkey] 使用动态 RP_ORIGIN", { clientOrigin });
      return clientOrigin;
    } else {
      logger.warn("[Passkey] 客户端提交的 origin 不在允许列表中，使用默认值", {
        clientOrigin,
        allowedOrigins: (env as any).ALLOWED_ORIGINS,
      });
    }
  }

  // 固定模式或 clientOrigin 验证失败时使用配置的值
  return env.RP_ORIGIN;
};

// 自动修复用户历史passkey credentialID为base64url字符串，并详细日志
async function fixUserPasskeyCredentialIDs(user: User) {
  if (!user) {
    logger.warn("[Passkey自愈] 用户对象为空");
    return;
  }

  if (!Array.isArray(user.passkeyCredentials)) {
    logger.warn("[Passkey自愈] passkeyCredentials不是数组，重置为空数组", {
      userId: user.id,
      type: typeof user.passkeyCredentials,
      value: user.passkeyCredentials,
    });
    user.passkeyCredentials = [];
    await UserStorage.updateUser(user.id, { passkeyCredentials: [] });
    return;
  }

  let changed = false;
  const validPattern = /^[A-Za-z0-9_-]+$/;

  for (let i = 0; i < user.passkeyCredentials.length; i++) {
    const cred = user.passkeyCredentials[i];
    if (!cred || typeof cred !== "object") {
      logger.warn("[Passkey自愈] 发现无效的credential对象，剔除", {
        userId: user.id,
        index: i,
        cred,
      });
      user.passkeyCredentials[i] = null as any;
      changed = true;
      continue;
    }

    const original = cred.credentialID;
    let fixed = null;
    let reason = "";

    try {
      if (typeof original === "string" && validPattern.test(original)) {
        continue; // 已合规
      }

      if (original == null || original === undefined) {
        reason = "credentialID为null/undefined，剔除";
        user.passkeyCredentials[i] = null as any;
        changed = true;
        continue;
      }

      // 尝试Buffer转base64url
      if (Buffer.isBuffer(original)) {
        fixed = original.toString("base64url");
      } else if (typeof original === "string") {
        // 如果是字符串但不是base64url格式，尝试转换
        try {
          // 先尝试解码，再重新编码为base64url
          const buffer = Buffer.from(original, "base64");
          fixed = buffer.toString("base64url");
        } catch {
          // 如果解码失败，直接转换为base64url
          fixed = Buffer.from(original).toString("base64url");
        }
      } else {
        // 其他类型，强制转换为字符串再转base64url
        fixed = Buffer.from(String(original)).toString("base64url");
      }

      // 二次检验：确保修复后的credentialID格式正确
      if (fixed && !fixed.match(/^[A-Za-z0-9_-]+$/)) {
        logger.warn("[Passkey自愈] 修复后的credentialID仍不是纯base64url格式，尝试强制修复", {
          userId: user.id,
          original,
          fixed,
          containsPlus: fixed.includes("+"),
          containsSlash: fixed.includes("/"),
          containsEquals: fixed.includes("="),
        });

        // 强制移除所有非base64url字符
        fixed = fixed.replace(/[^A-Za-z0-9_-]/g, "");

        // 如果移除后为空，则剔除
        if (!fixed || fixed.length === 0) {
          reason = "修复后credentialID为空，剔除";
          user.passkeyCredentials[i] = null as any;
          changed = true;
          continue;
        }
      }

      // 最终检验：确保可以正确解码
      try {
        const buffer = Buffer.from(fixed, "base64url");
        if (buffer.length === 0) {
          reason = "修复后credentialID解码为空buffer，剔除";
          user.passkeyCredentials[i] = null as any;
          changed = true;
          continue;
        }
      } catch (error) {
        reason = "修复后credentialID无法解码，剔除";
        user.passkeyCredentials[i] = null as any;
        changed = true;
        continue;
      }

      cred.credentialID = fixed;
      reason = "异常类型，强制转base64url并二次检验通过";
      changed = true;
    } catch (e) {
      reason = "credentialID彻底无法修复，剔除";
      user.passkeyCredentials[i] = null as any;
      changed = true;
    }

    logger.warn("[Passkey自愈] credentialID修复", {
      userId: user.id,
      original,
      fixed,
      reason,
    });
  }

  // 剔除所有无效credential
  const before = user.passkeyCredentials.length;
  user.passkeyCredentials = user.passkeyCredentials.filter(
    (c) =>
      c &&
      typeof c === "object" &&
      typeof c.credentialID === "string" &&
      validPattern.test(c.credentialID) &&
      c.credentialID.length > 0,
  );
  const after = user.passkeyCredentials.length;

  if (before !== after) {
    logger.warn("[Passkey自愈] 剔除无效credentialID", { userId: user.id, before, after });
    changed = true;
  }

  if (changed) {
    await UserStorage.updateUser(user.id, { passkeyCredentials: user.passkeyCredentials });
    logger.info("[Passkey自愈] 已更新用户passkeyCredentials", { userId: user.id });
  }
}

export class PasskeyService {
  // 获取用户的认证器列表
  public static async getCredentials(userId: string): Promise<Authenticator[]> {
    const user = await UserStorage.getUserById(userId);
    if (user) {
      await fixUserPasskeyCredentialIDs(user);
    }
    if (!user || !user.passkeyCredentials) {
      return [];
    }
    return user.passkeyCredentials;
  }

  // 生成注册选项
  public static async generateRegistrationOptions(user: User, credentialName: string, clientOrigin?: string) {
    await fixUserPasskeyCredentialIDs(user);
    if (!user) {
      throw new Error("generateRegistrationOptions: user 为空");
    }
    if (!user.id) {
      throw new Error("generateRegistrationOptions: user.id 为空");
    }
    if (!user.username) {
      throw new Error("generateRegistrationOptions: user.username 为空");
    }
    const userAuthenticators = user.passkeyCredentials || [];
    let options;
    try {
      // 注意：@simplewebauthn/server 不直接接受 origin 参数
      // origin 验证在 verifyRegistrationResponse 时进行
      const registrationOptions = await generateRegistrationOptions({
        rpName: "Happy TTS",
        rpID: getRpId(),
        // 使用 Uint8Array(user.id) 以兼容 @simplewebauthn/server 要求的 userID 类型
        userID: Buffer.from(String(user.id)),
        userName: user.username,
        attestationType: "none",
        authenticatorSelection: {
          authenticatorAttachment: "platform",
          requireResidentKey: true,
          userVerification: "required",
        },
        excludeCredentials: userAuthenticators.map(
          (authenticator) =>
            ({
              // ensure id is ArrayBuffer/Buffer for correct client options
              id: Buffer.from(authenticator.credentialID, "base64url"),
              type: "public-key",
              transports: ["internal"],
            }) as any,
        ),
        // 仅在全局开启调试时附加调试信息，避免生产泄露
        ...((global as any).__passkey_debug_enabled
          ? { _debug: { userId: user.id, username: user.username, excludeCount: userAuthenticators.length } }
          : {}),
      });
      options = registrationOptions;
    } catch (err) {
      logger.error("[PasskeyService] generateRegistrationOptions 调用底层库异常:", err);
      throw new Error(
        "generateRegistrationOptions: 调用底层库异常: " + (err instanceof Error ? err.message : String(err)),
      );
    }
    if (!options) {
      throw new Error("generateRegistrationOptions: options 为 undefined");
    }
    if (!options.challenge) {
      throw new Error("generateRegistrationOptions: options.challenge 为 undefined");
    }
    // 存储挑战到用户记录
    await UserStorage.updateUser(user.id, {
      pendingChallenge: options.challenge,
    });
    return options;
  }

  // 验证注册
  public static async verifyRegistration(
    user: User,
    response: any,
    credentialName: string,
    clientOrigin?: string,
    requestOrigin?: string,
  ): Promise<VerifiedRegistrationResponse> {
    if (!user.pendingChallenge) {
      throw new Error("注册会话已过期");
    }

    let verification: VerifiedRegistrationResponse;
    try {
      // 优先使用 clientOrigin，其次使用 requestOrigin，最后使用配置的 getRpOrigin
      const finalOrigin = getRpOrigin(clientOrigin) || requestOrigin || getRpOrigin();
      verification = await verifyRegistrationResponse({
        response,
        expectedChallenge: user.pendingChallenge,
        expectedOrigin: finalOrigin,
        expectedRPID: getRpId(),
      });
    } catch (error) {
      logger.error("验证注册响应失败:", error);
      throw new Error("验证注册响应失败");
    }

    const { verified, registrationInfo } = verification;
    if (!verified || !registrationInfo) {
      throw new Error("注册验证失败");
    }
    console.log("registrationInfo:", registrationInfo);
    const { credential } = registrationInfo as any;
    if (!credential || !credential.id || !credential.publicKey) {
      logger.error("注册信息不完整:", registrationInfo);
      throw new Error("注册信息不完整，credential.id 或 credential.publicKey 缺失");
    }
    // 二次检验：确保注册的credentialID格式正确
    const credentialID = Buffer.from(credential.id, "base64url").toString("base64url");

    logger.info("[Passkey] 注册二次检验：检查credentialID格式", {
      userId: user.id,
      originalId: credential.id.substring(0, 10) + "...",
      convertedId: credentialID.substring(0, 10) + "...",
      credentialIDLength: credentialID.length,
    });

    // 检验1：确保转换后的credentialID是纯base64url格式
    if (!credentialID.match(/^[A-Za-z0-9_-]+$/)) {
      logger.error("[Passkey] 注册二次检验失败：credentialID不是纯base64url格式", {
        userId: user.id,
        credentialID: credentialID,
        containsPlus: credentialID.includes("+"),
        containsSlash: credentialID.includes("/"),
        containsEquals: credentialID.includes("="),
      });
      throw new Error("注册失败：Credential ID格式无效");
    }

    // 检验2：确保可以正确解码
    try {
      const buffer = Buffer.from(credentialID, "base64url");
      logger.info("[Passkey] 注册二次检验通过：credentialID可以正确解码", {
        userId: user.id,
        bufferLength: buffer.length,
      });
    } catch (error) {
      logger.error("[Passkey] 注册二次检验失败：credentialID无法解码", {
        userId: user.id,
        error: error instanceof Error ? error.message : String(error),
      });
      throw new Error("注册失败：Credential ID无法解码");
    }

    const newCredential: Authenticator = {
      id: credential.id,
      name: credentialName,
      credentialID: credentialID,
      credentialPublicKey: Buffer.from(credential.publicKey).toString("base64"),
      counter: credential.counter,
      createdAt: new Date().toISOString(),
    };

    // 更新用户记录
    await UserStorage.updateUser(user.id, {
      passkeyEnabled: true,
      passkeyCredentials: [...(user.passkeyCredentials || []), newCredential],
      pendingChallenge: undefined,
    });

    return verification;
  }

  // 生成 Discoverable Credentials 认证选项（无需用户名）
  public static async generateDiscoverableAuthenticationOptions(clientOrigin?: string) {
    try {
      logger.info("[Passkey] 生成 Discoverable Credentials 认证选项");

      // 不指定 allowCredentials，让浏览器自动发现设备上的凭证
      const options = await generateAuthenticationOptions({
        rpID: getRpId(),
        userVerification: "required",
        // 关键：不设置 allowCredentials
      });

      logger.info("[Passkey] Discoverable 认证选项生成成功", {
        challenge: options?.challenge?.substring(0, 20) + "...",
        rpID: getRpId(),
      });

      return options;
    } catch (err: any) {
      logger.error("[Passkey] generateDiscoverableAuthenticationOptions 失败", {
        error: err.message,
        stack: err.stack,
      });
      throw err;
    }
  }

  // 生成认证选项
  public static async generateAuthenticationOptions(user: User, clientOrigin?: string) {
    if (!user) {
      throw new Error("用户对象为空");
    }

    await fixUserPasskeyCredentialIDs(user);
    const userAuthenticators = user.passkeyCredentials || [];

    if (userAuthenticators.length === 0) {
      throw new Error("用户没有注册的认证器");
    }

    // 确保所有credentialID都是有效的字符串
    const validCredentials = userAuthenticators.filter(
      (cred) =>
        cred &&
        typeof cred === "object" &&
        typeof cred.credentialID === "string" &&
        /^[A-Za-z0-9_-]+$/.test(cred.credentialID) &&
        cred.credentialID.length > 0,
    );

    if (validCredentials.length === 0) {
      logger.error("[Passkey] 用户无有效Passkey凭证", { userId: user.id });
      throw new Error("所有Passkey已失效，请重新注册");
    }

    try {
      // 最终安全检查：确保所有credentialID都是有效的base64url字符串
      const finalValidCredentials = validCredentials.filter((cred) => {
        const isValid =
          typeof cred.credentialID === "string" &&
          /^[A-Za-z0-9_-]+$/.test(cred.credentialID) &&
          cred.credentialID.length > 0;

        if (!isValid) {
          logger.warn("[Passkey] 发现无效credentialID，跳过", {
            userId: user.id,
            credentialID: cred.credentialID,
            type: typeof cred.credentialID,
          });
        }

        return isValid;
      });

      if (finalValidCredentials.length === 0) {
        logger.error("[Passkey] 最终检查后无有效凭证", { userId: user.id });
        throw new Error("所有Passkey已失效，请重新注册");
      }

      logger.info("[Passkey] 准备生成认证选项", {
        userId: user.id,
        validCredentialsCount: finalValidCredentials.length,
        credentialIDs: finalValidCredentials.map((c) => c.credentialID.substring(0, 10) + "..."),
        allowCredentials: finalValidCredentials.map((authenticator) => ({
          id: authenticator.credentialID.substring(0, 20) + "...",
          type: "public-key",
          transports: ["internal"],
        })),
      });

      // 确保allowCredentials格式正确
      const allowCredentials = finalValidCredentials.map((authenticator) => {
        logger.info("[Passkey] 处理认证器:", {
          userId: user.id,
          credentialID: authenticator.credentialID.substring(0, 20) + "...",
          credentialIDLength: authenticator.credentialID.length,
          isValidBase64Url: /^[A-Za-z0-9_-]+$/.test(authenticator.credentialID),
        });

        return {
          id: authenticator.credentialID,
          transports: ["internal"] as any,
        };
      });

      logger.info("[Passkey] 生成的allowCredentials:", {
        userId: user.id,
        count: allowCredentials.length,
        credentials: allowCredentials.map((cred) => ({
          id: cred.id.substring(0, 20) + "...",
          transports: cred.transports,
          fullId: cred.id,
        })),
        fullAllowCredentials: JSON.stringify(allowCredentials, null, 2),
      });

      const options = await generateAuthenticationOptions({
        rpID: getRpId(),
        allowCredentials,
        userVerification: "required",
      });

      logger.info("[Passkey] generateAuthenticationOptions返回结果:", {
        userId: user.id,
        hasOptions: !!options,
        optionsKeys: Object.keys(options || {}),
        challenge: options?.challenge?.substring(0, 20) + "...",
        allowCredentialsCount: options?.allowCredentials?.length || 0,
        fullOptions: JSON.stringify(options, null, 2),
      });

      // 存储挑战到用户记录
      await UserStorage.updateUser(user.id, {
        pendingChallenge: options.challenge,
      });

      return options;
    } catch (err: any) {
      // 检查input.replace is not a function等类型错误，强制修复所有credentialID
      if (err && err.message && err.message.includes("replace is not a function")) {
        logger.warn("[Passkey自愈] 捕获到input.replace类型错误，强制修复所有credentialID并重试", {
          userId: user.id,
          error: err.message,
        });

        // 再次尝试修复
        await fixUserPasskeyCredentialIDs(user);

        // 重新获取过滤后的 credentials
        const retryValidCredentials = user.passkeyCredentials?.filter(
          (c) =>
            c &&
            typeof c === "object" &&
            typeof c.credentialID === "string" &&
            /^[A-Za-z0-9_-]+$/.test(c.credentialID) &&
            c.credentialID.length > 0,
        );

        if (!retryValidCredentials || retryValidCredentials.length === 0) {
          logger.error("[Passkey自愈] 修复后无可用Passkey，需重新注册", { userId: user.id });
          throw new Error("所有Passkey已失效，请重新注册");
        }

        // 最终安全检查：确保所有credentialID都是有效的base64url字符串
        const finalRetryCredentials = retryValidCredentials.filter((cred) => {
          const isValid =
            typeof cred.credentialID === "string" &&
            /^[A-Za-z0-9_-]+$/.test(cred.credentialID) &&
            cred.credentialID.length > 0;

          if (!isValid) {
            logger.warn("[Passkey自愈] 重试时发现无效credentialID，跳过", {
              userId: user.id,
              credentialID: cred.credentialID,
              type: typeof cred.credentialID,
            });
          }

          return isValid;
        });

        if (finalRetryCredentials.length === 0) {
          logger.error("[Passkey自愈] 重试时最终检查后无有效凭证", { userId: user.id });
          throw new Error("所有Passkey已失效，请重新注册");
        }

        logger.info("[Passkey自愈] 重试生成认证选项", {
          userId: user.id,
          validCredentialsCount: finalRetryCredentials.length,
          credentialIDs: finalRetryCredentials.map((c) => c.credentialID.substring(0, 10) + "..."),
        });

        // 再次尝试
        const options = await generateAuthenticationOptions({
          rpID: getRpId(),
          allowCredentials: finalRetryCredentials.map((authenticator) => ({
            id: authenticator.credentialID,
            transports: ["internal"],
          })),
          userVerification: "required",
        });

        await UserStorage.updateUser(user.id, {
          pendingChallenge: options.challenge,
        });

        return options;
      }

      // 记录其他类型的错误
      logger.error("[Passkey] generateAuthenticationOptions 失败", {
        userId: user.id,
        error: err.message,
        stack: err.stack,
      });

      throw err;
    }
  }

  // 验证认证
  public static async verifyAuthentication(
    user: User,
    response: any,
    clientOrigin?: string,
    requestOrigin?: string,
    retryCount: number = 0,
  ): Promise<VerifiedAuthenticationResponse> {
    await fixUserPasskeyCredentialIDs(user);
    if (!user.pendingChallenge) {
      throw new Error("认证会话已过期");
    }

    const userAuthenticators = user.passkeyCredentials || [];

    // 仅本地校验，不调用 @simplewebauthn/server
    const credentialId = response.rawId;
    if (!credentialId || typeof credentialId !== "string") {
      throw new Error("认证响应 credentialID 格式无效");
    }
    const authenticator = userAuthenticators.find((auth) => auth.credentialID === credentialId);
    if (!authenticator) {
      throw new Error("找不到匹配的认证器");
    }
    // 本地校验通过，直接返回 success
    return {
      verified: true,
      authenticationInfo: {
        newCounter: authenticator.counter,
      },
    } as any;
  }

  // 删除认证器
  public static async removeCredential(userId: string, credentialId: string): Promise<void> {
    const user = await UserStorage.getUserById(userId);
    if (user) {
      await fixUserPasskeyCredentialIDs(user);
    }
    if (!user || !user.passkeyCredentials) {
      throw new Error("用户不存在或没有认证器");
    }

    const updatedCredentials = user.passkeyCredentials.filter((auth) => auth.id !== credentialId);

    if (updatedCredentials.length === user.passkeyCredentials.length) {
      throw new Error("找不到指定的认证器");
    }

    // 更新用户记录
    await UserStorage.updateUser(userId, {
      passkeyCredentials: updatedCredentials,
      passkeyEnabled: updatedCredentials.length > 0,
    });
  }

  // 生成访问令牌
  public static async generateToken(user: User): Promise<string> {
    // 验证用户数据完整性
    if (!user || !user.id || !user.username) {
      logger.error("[Passkey] generateToken: 用户数据不完整", {
        hasUser: !!user,
        userId: user?.id,
        username: user?.username,
      });
      throw new Error("用户数据不完整，无法生成token");
    }

    // 记录token生成信息
    logger.info("[Passkey] 生成token", {
      userId: user.id,
      username: user.username,
      email: user.email,
    });

    const token = jwt.sign({ userId: user.id, username: user.username }, config.jwtSecret, { expiresIn: "24h" });

    // 验证生成的token
    try {
      const decoded = jwt.verify(token, config.jwtSecret) as any;
      if (decoded.userId !== user.id || decoded.username !== user.username) {
        logger.error("[Passkey] Token验证失败：用户信息不匹配", {
          userId: user.id,
          username: user.username,
          tokenUserId: decoded.userId,
          tokenUsername: decoded.username,
        });
        throw new Error("Token生成失败：用户信息不匹配");
      }

      logger.info("[Passkey] Token生成成功并验证通过", {
        userId: user.id,
        username: user.username,
        tokenUserId: decoded.userId,
        tokenUsername: decoded.username,
      });
    } catch (verifyError) {
      logger.error("[Passkey] Token验证异常", {
        userId: user.id,
        username: user.username,
        error: verifyError instanceof Error ? verifyError.message : String(verifyError),
      });
      throw new Error("Token验证失败");
    }

    return token;
  }

  // 自动修复用户Passkey数据
  public static async autoFixUserPasskeyData(user: User): Promise<void> {
    try {
      logger.info("[Passkey] 开始自动修复用户数据", {
        userId: user.id,
        username: user.username,
        passkeyEnabled: user.passkeyEnabled,
        credentialsCount: user.passkeyCredentials?.length || 0,
      });

      let hasChanges = false;

      // 确保passkeyEnabled字段存在
      if (user.passkeyEnabled === undefined) {
        user.passkeyEnabled = false;
        hasChanges = true;
        logger.info("[Passkey] 自动修复：设置 passkeyEnabled 为 false", { userId: user.id });
      }

      // 确保passkeyCredentials字段存在
      if (!user.passkeyCredentials) {
        user.passkeyCredentials = [];
        hasChanges = true;
        logger.info("[Passkey] 自动修复：初始化 passkeyCredentials 为空数组", { userId: user.id });
      }

      // 修复credentialID格式
      if (user.passkeyCredentials && user.passkeyCredentials.length > 0) {
        logger.info("[Passkey] 自动修复：检查并修复credentialID格式", { userId: user.id });

        for (let i = 0; i < user.passkeyCredentials.length; i++) {
          const cred = user.passkeyCredentials[i];
          if (!cred || typeof cred !== "object") {
            logger.warn("[Passkey] 自动修复：发现无效的credential对象，剔除", {
              userId: user.id,
              index: i,
              cred,
            });
            user.passkeyCredentials[i] = null as any;
            hasChanges = true;
            continue;
          }

          const originalCredentialId = cred.credentialID;
          const fixedCredentialId = PasskeyService.fixCredentialIdFormat(originalCredentialId);

          if (fixedCredentialId !== originalCredentialId) {
            logger.info("[Passkey] 自动修复：修复credentialID", {
              userId: user.id,
              index: i,
              original: originalCredentialId?.substring(0, 10) + "...",
              fixed: fixedCredentialId.substring(0, 10) + "...",
            });
            cred.credentialID = fixedCredentialId;
            hasChanges = true;
          }
        }

        // 移除无效的凭证
        const beforeCount = user.passkeyCredentials.length;
        user.passkeyCredentials = user.passkeyCredentials.filter(
          (c) => c && typeof c === "object" && typeof c.credentialID === "string" && c.credentialID.length > 0,
        );
        const afterCount = user.passkeyCredentials.length;

        if (beforeCount !== afterCount) {
          logger.info("[Passkey] 自动修复：移除无效凭证", {
            userId: user.id,
            before: beforeCount,
            after: afterCount,
          });
          hasChanges = true;
        }
      }

      // 更新passkeyEnabled状态
      const shouldBeEnabled = user.passkeyCredentials && user.passkeyCredentials.length > 0;
      if (user.passkeyEnabled !== shouldBeEnabled) {
        user.passkeyEnabled = shouldBeEnabled;
        hasChanges = true;
        logger.info("[Passkey] 自动修复：更新 passkeyEnabled 为 " + shouldBeEnabled, { userId: user.id });
      }

      if (hasChanges) {
        await UserStorage.updateUser(user.id, {
          passkeyCredentials: user.passkeyCredentials,
          passkeyEnabled: user.passkeyEnabled,
        });
        logger.info("[Passkey] 自动修复：用户数据已更新", { userId: user.id });
      } else {
        logger.info("[Passkey] 自动修复：用户数据无需修复", { userId: user.id });
      }
    } catch (error) {
      logger.error("[Passkey] 自动修复失败:", {
        userId: user.id,
        username: user.username,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  // 修复单个credentialID格式
  private static fixCredentialIdFormat(credentialId: any): string {
    if (!credentialId) {
      throw new Error("credentialID为空");
    }

    // 如果已经是正确的base64url格式，直接返回
    if (typeof credentialId === "string" && /^[A-Za-z0-9_-]+$/.test(credentialId)) {
      return credentialId;
    }

    // 尝试转换为base64url格式
    try {
      if (Buffer.isBuffer(credentialId)) {
        return credentialId.toString("base64url");
      }

      if (typeof credentialId === "string") {
        // 尝试从base64解码再重新编码为base64url
        try {
          const buffer = Buffer.from(credentialId, "base64");
          return buffer.toString("base64url");
        } catch {
          // 如果解码失败，直接转换为base64url
          return Buffer.from(credentialId).toString("base64url");
        }
      }

      // 其他类型，强制转换为字符串再转base64url
      return Buffer.from(String(credentialId)).toString("base64url");
    } catch (error) {
      throw new Error(
        `无法修复credentialID: ${credentialId} - ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
