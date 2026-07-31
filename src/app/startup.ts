import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import type { Express } from "express";
import { compileTimeConfig, config, startupConfig } from "../config/config";
import { runStartupDiagnostics } from "../config/startupDiagnostics";
import { startApiKeyBillingReconciliation } from "../services/apiKeyBillingService";
import { startEmbeddedRustServices } from "../services/embeddedRustServices";
import { connectMongo } from "../services/mongoService";
import { schedulerService } from "../services/schedulerService";
import { wsService } from "../services/wsService";
import logger from "../utils/logger";
import { UserStorage } from "../utils/userStorage";
import { assertMongoUserStorageMode } from "../utils/userStorageMode";

// eslint-disable-next-line no-var
var _EMAIL_ENABLED: boolean;
// eslint-disable-next-line no-var
var _EMAIL_SERVICE_STATUS: { available: boolean; error?: string };
// eslint-disable-next-line no-var
var _OUTEMAIL_SERVICE_STATUS: { available: boolean; error?: string };

const ensureDirectories = async () => {
  const dirs = ["logs", "finish", "data"];
  for (const dir of dirs) {
    if (!existsSync(dir)) {
      await mkdir(dir, { recursive: true });
    }
  }
};

const checkStartupFilePermissions = async () => {
  try {
    let checkFilePermissions;
    const possiblePaths = [
      "../scripts/check-file-permissions.js",
      "../../scripts/check-file-permissions.js",
      "./scripts/check-file-permissions.js",
      path.join(process.cwd(), "scripts", "check-file-permissions.js"),
    ];

    for (const scriptPath of possiblePaths) {
      try {
        const scriptModule = require(scriptPath);
        checkFilePermissions = scriptModule.checkFilePermissions;
        if (checkFilePermissions) {
          logger.info(`[启动] 找到文件权限检查脚本: ${scriptPath}`);
          break;
        }
      } catch (_error) {
        // continue search
      }
    }

    if (checkFilePermissions) {
      await Promise.resolve(checkFilePermissions());
    } else {
      logger.warn("[启动] 未找到文件权限检查脚本，跳过检查");
    }
  } catch (error) {
    logger.warn("[启动] 文件权限检查失败，继续启动", {
      error: error instanceof Error ? error.message : String(error),
    });
  }
};

const initializeStorage = async () => {
  logger.info("[启动] 初始化 MongoDB 存储...");
  try {
    await connectMongo();
    logger.info("[启动] MongoDB 连接成功");
    const initResult = await UserStorage.initializeDatabase();
    if (initResult.initialized) {
      logger.info(`[启动] ${initResult.message}`);
    } else {
      throw new Error(initResult.message);
    }
  } catch (error) {
    logger.error("[启动] MongoDB 初始化失败", {
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
};

const configureEmailServices = () => {
  if (!startupConfig.email.resendApiKey) {
    (globalThis as any).EMAIL_ENABLED = false;
    (globalThis as any).EMAIL_SERVICE_STATUS = {
      available: false,
      error: "未配置 RESEND_API_KEY",
    };
    (globalThis as any).OUTEMAIL_SERVICE_STATUS = {
      available: false,
      error: "未配置 RESEND_API_KEY",
    };
    console.warn("[邮件服务] 未检测到 RESEND_API_KEY，邮件发送功能已禁用");
    return;
  }

  (globalThis as any).EMAIL_ENABLED = true;

  void (async () => {
    try {
      require("../services/emailService");
      (globalThis as any).EMAIL_SERVICE_STATUS = { available: true };
      logger.info("[邮件服务] 配置检查完成：已启用");
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "未知错误";
      (globalThis as any).EMAIL_SERVICE_STATUS = {
        available: false,
        error: errorMessage,
      };
      logger.warn("[邮件服务] 配置检查失败：", errorMessage);
    }
  })();

  void (async () => {
    try {
      if (!startupConfig.email.outemail.enabled) {
        (globalThis as any).OUTEMAIL_SERVICE_STATUS = {
          available: false,
          error: "对外邮件服务未启用",
        };
        logger.warn("[对外邮件服务] 服务未启用");
        return;
      }
      if (!startupConfig.email.outemail.domain) {
        (globalThis as any).OUTEMAIL_SERVICE_STATUS = {
          available: false,
          error: "对外邮件服务未配置域名",
        };
        logger.warn("[对外邮件服务] 未配置域名");
        return;
      }
      const key = startupConfig.email.outemail.apiKey;
      if (!key || !/^re_\w{8,}/.test(key)) {
        (globalThis as any).OUTEMAIL_SERVICE_STATUS = {
          available: false,
          error: "未配置有效的对外邮件API密钥（re_ 开头）",
        };
        logger.warn("[对外邮件服务] 未配置有效API密钥");
        return;
      }
      (globalThis as any).OUTEMAIL_SERVICE_STATUS = { available: true };
      logger.info("[对外邮件服务] 配置检查完成：已启用");
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "未知错误";
      (globalThis as any).OUTEMAIL_SERVICE_STATUS = {
        available: false,
        error: errorMessage,
      };
      logger.warn("[对外邮件服务] 配置检查失败：", errorMessage);
    }
  })();
};

export async function startServer(app: Express): Promise<void> {
  assertMongoUserStorageMode();
  configureEmailServices();
  await ensureDirectories();

  try {
    const diagnostics = await runStartupDiagnostics(compileTimeConfig);
    logger.info("[Config] 启动配置诊断完成", diagnostics);
  } catch (error) {
    logger.warn("[Config] 启动配置诊断失败，继续启动", {
      error: error instanceof Error ? error.message : String(error),
    });
  }

  await startEmbeddedRustServices();
  await checkStartupFilePermissions();
  await initializeStorage();
  // Never log the generation code value — only whether shared/anonymous TTS gate is configured.
  logger.info("[Config] TTS generation code gate", {
    configured: Boolean(config.generationCodeConfigured),
  });
  UserStorage.initializeMongoListener();
  startApiKeyBillingReconciliation();

  try {
    schedulerService.start();
    logger.info("[启动] 定时任务服务已启动");
  } catch (error) {
    logger.warn("[启动] 定时任务服务启动失败，继续启动", {
      error: error instanceof Error ? error.message : String(error),
    });
  }

  const port = Number(config.port);
  const server = app.listen(port, "::", () => {
    wsService.init(server);

    logger.info(`服务器运行在 http://[::]:${port} (IPv4/IPv6 双栈)`);
    logger.info(`生成音频目录: ${path.join(__dirname, "../finish")}`);
  });
}
