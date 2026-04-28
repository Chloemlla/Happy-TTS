import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import type { Express } from "express";
import { MongoClient } from "mongodb";
import { compileTimeConfig, config, startupConfig } from "../config/config";
import { runStartupDiagnostics } from "../config/startupDiagnostics";
import { schedulerService } from "../services/schedulerService";
import { wsService } from "../services/wsService";
import logger from "../utils/logger";
import { UserStorage } from "../utils/userStorage";

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
  logger.info("[启动] 检查用户存储模式...");
  const storageMode = config.userStorageMode;
  logger.info(`[启动] 当前存储模式: ${storageMode}`);

  if (storageMode === "mongo") {
    try {
      const { connectMongo } = require("../services/mongoService");
      await connectMongo();
      logger.info("[启动] MongoDB 连接成功");
      const initResult = await UserStorage.initializeDatabase();
      if (initResult.initialized) {
        logger.info(`[启动] ${initResult.message}`);
      } else {
        logger.error(`[启动] MongoDB 初始化失败: ${initResult.message}`);
      }
    } catch (error) {
      logger.warn("[启动] MongoDB 连接失败，建议切换到文件模式", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
    return;
  }

  if (storageMode === "mysql") {
    try {
      const { getMysqlConnection } = require("../utils/userStorage");
      const conn = await getMysqlConnection();
      await conn.execute("SELECT 1");
      await conn.end();
      logger.info("[启动] MySQL 连接成功");
      const initResult = await UserStorage.initializeDatabase();
      if (initResult.initialized) {
        logger.info(`[启动] ${initResult.message}`);
      } else {
        logger.error(`[启动] MySQL 初始化失败: ${initResult.message}`);
      }
    } catch (error) {
      logger.warn("[启动] MySQL 连接失败，建议切换到文件模式", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
    return;
  }

  try {
    const initResult = await UserStorage.initializeDatabase();
    if (initResult.initialized) {
      logger.info(`[启动] ${initResult.message}`);
    } else {
      logger.error(`[启动] 文件存储初始化失败: ${initResult.message}`);
    }
  } catch (error) {
    logger.error("[启动] 文件存储初始化失败", {
      error: error instanceof Error ? error.message : String(error),
    });
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

const migrateTtsCollection = async () => {
  const mongoUri = startupConfig.mongo.uri || "mongodb://localhost:27017";
  const dbName = startupConfig.mongo.database;
  const client = new MongoClient(mongoUri);

  try {
    await client.connect();
    const db = client.db(dbName);
    const ttsCollection = db.collection("tts");
    const userDatasCollection = db.collection("user_datas");
    const ttsCount = await ttsCollection.countDocuments();

    if (ttsCount === 0) {
      logger.info("[迁移] tts 集合为空，无需迁移");
      return;
    }

    const userDatasCount = await userDatasCollection.countDocuments();
    if (userDatasCount >= ttsCount) {
      logger.info("[迁移] user_datas 集合已包含全部数据，无需迁移");
      return;
    }

    const docs = await ttsCollection.find().toArray();
    if (docs.length === 0) {
      console.log("[迁移] tts 集合无数据");
      return;
    }

    const bulk = userDatasCollection.initializeUnorderedBulkOp();
    for (const doc of docs) {
      bulk.find({ _id: doc._id }).upsert().replaceOne(doc);
    }

    const result = await bulk.execute();
    const migratedCount = (result.upsertedCount || 0) + (result.modifiedCount || 0);
    console.log(`[迁移] 已迁移 ${migratedCount} 条数据到 user_datas`);

    const afterCount = await userDatasCollection.countDocuments();
    if (afterCount >= ttsCount) {
      await ttsCollection.drop();
      console.log(`[迁移] 校验通过，已删除原 tts 集合。user_datas 总数: ${afterCount}`);
    } else {
      console.error(`[迁移] 校验失败，user_datas 数量(${afterCount}) < tts 数量(${ttsCount})，未删除原集合`);
    }
  } catch (error) {
    console.error("[迁移] 发生错误:", error);
  } finally {
    await client.close();
  }
};

export async function startServer(app: Express): Promise<void> {
  configureEmailServices();
  await ensureDirectories();

  const diagnostics = await runStartupDiagnostics(compileTimeConfig);
  logger.info("[Config] 启动配置诊断完成", diagnostics);

  const port = Number(config.port);
  const server = app.listen(port, "::", async () => {
    wsService.init(server);

    logger.info(`服务器运行在 http://[::]:${port} (IPv4/IPv6 双栈)`);
    logger.info(`生成音频目录: ${path.join(__dirname, "../finish")}`);
    logger.info(`当前生成码: ${config.generationCode}`);

    await checkStartupFilePermissions();

    try {
      await initializeStorage();
      UserStorage.initializeMongoListener();

      try {
        schedulerService.start();
        logger.info("[启动] 定时任务服务已启动");
      } catch (error) {
        logger.warn("[启动] 定时任务服务启动失败，继续启动", {
          error: error instanceof Error ? error.message : String(error),
        });
      }

      await migrateTtsCollection();
    } catch (error) {
      logger.error("[启动] 数据库初始化和Passkey数据修复失败", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });
}
