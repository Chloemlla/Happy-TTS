import mongoose from "mongoose";
import logger from "../utils/logger";

// 优先使用环境变量 MONGO_URI，其次兼容 MONGODB_URI；未指定 database 时使用 MONGO_DB。
const DEFAULT_MONGO_DB = (process.env.MONGO_DB || "tts").trim() || "tts";
const RAW_MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI || `mongodb://localhost:27017/${DEFAULT_MONGO_DB}`;
const MONGO_PROXY_URL = process.env.MONGO_PROXY_URL; // 代理地址（如 socks5://127.0.0.1:1080 或 http://127.0.0.1:8888）

type MongoConnectOptions = mongoose.ConnectOptions;

// 检查代理配置（仅警告，不阻止连接）
if (MONGO_PROXY_URL) {
  logger.warn("[MongoDB] 检测到代理配置，仅支持 socks5:// 协议", { proxyUrl: MONGO_PROXY_URL });
}

/**
 * 解析 MONGO_PROXY_URL 为 node-mongodb-driver 可识别的 SOCKS5 代理选项。
 * 驱动只支持 SOCKS5（proxyHost/proxyPort/proxyUsername/proxyPassword），
 * 其它协议（http/https）直接视为配置错误返回 null。
 */
function parseMongoProxyConfig(proxyUrl: string): {
  proxyHost: string;
  proxyPort: number;
  proxyUsername?: string;
  proxyPassword?: string;
} | null {
  try {
    const url = new URL(proxyUrl);
    if (url.protocol !== "socks5:" && url.protocol !== "socks:") {
      logger.error("[MongoDB] MONGO_PROXY_URL 仅支持 socks5:// 协议", { proxyUrl });
      return null;
    }
    const port = Number(url.port || 1080);
    if (!Number.isFinite(port) || port <= 0 || port > 65535) {
      logger.error("[MongoDB] MONGO_PROXY_URL 端口无效", { proxyUrl });
      return null;
    }
    return {
      proxyHost: url.hostname,
      proxyPort: port,
      proxyUsername: url.username ? decodeURIComponent(url.username) : undefined,
      proxyPassword: url.password ? decodeURIComponent(url.password) : undefined,
    };
  } catch (error) {
    logger.error("[MongoDB] MONGO_PROXY_URL 解析失败", {
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

function maskMongoUri(uri: string): string {
  return uri.replace(/(mongodb(?:\+srv)?:\/\/)([^/@]+)@/i, "$1<credentials>@");
}

function hasDatabaseInUri(uri: string): boolean {
  const withoutScheme = uri.replace(/^mongodb(?:\+srv)?:\/\//i, "");
  const pathStart = withoutScheme.indexOf("/");
  if (pathStart === -1) {
    return false;
  }

  const database = withoutScheme.slice(pathStart + 1).split("?")[0];
  return database.length > 0;
}

function appendDefaultDatabase(uri: string): string {
  if (!/^mongodb(?:\+srv)?:\/\//i.test(uri) || hasDatabaseInUri(uri)) {
    return uri;
  }

  const queryStart = uri.indexOf("?");
  const base = queryStart >= 0 ? uri.slice(0, queryStart) : uri;
  const query = queryStart >= 0 ? uri.slice(queryStart) : "";
  return `${base.replace(/\/$/, "")}/${encodeURIComponent(DEFAULT_MONGO_DB)}${query}`;
}

export const connectMongo = async () => {
  let lastError;
  let parsedUri = RAW_MONGO_URI;

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      // 解析 URI，若无 database，补全 MONGO_DB。
      let uri = appendDefaultDatabase(parsedUri);

      if (uri !== parsedUri) {
        logger.info("[MongoDB] URI 未指定数据库，已补全默认数据库", { database: DEFAULT_MONGO_DB });
      }

      // 更新parsedUri以便在catch块中使用
      parsedUri = uri;

      logger.info("[MongoDB] 解析后的连接URI", {
        originalUri: maskMongoUri(RAW_MONGO_URI),
        parsedUri: maskMongoUri(uri),
      });

      // 代理支持
      const mongooseOptions: MongoConnectOptions = {
        serverSelectionTimeoutMS: 5000, // 5秒超时
        socketTimeoutMS: 45000, // 45秒超时
        // 连接池优化配置
        maxPoolSize: 20, // 最大连接池大小 - 提升并发处理能力
        minPoolSize: 5, // 最小连接池大小 - 保持基础连接
        maxIdleTimeMS: 30000, // 最大空闲时间 - 30秒后关闭空闲连接
        // 连接管理优化
        maxConnecting: 10, // 最大同时连接数
        waitQueueTimeoutMS: 10000, // 等待队列超时时间
        // 重试配置
        retryWrites: true,
        retryReads: true,
        // 写入关注点
        w: "majority",
        // 超时配置
        connectTimeoutMS: 10000,
        heartbeatFrequencyMS: 10000,
        // 缓冲配置优化 - 启用命令缓冲以确保连接完成前不执行查询
        bufferCommands: true, // 启用命令缓冲，等待连接完成
        // 压缩配置 - 仅在支持时启用
        // compressors: ['zlib'], // 可能在某些版本中不支持
        // zlibCompressionLevel: 6, // 可能在某些版本中不支持
        // 监控配置
        monitorCommands: false, // 生产环境关闭命令监控以提升性能
        // 其他兼容性配置
        directConnection: false, // 允许副本集和分片集群
        readPreference: "primary", // 优先从主节点读取
      };
      if (MONGO_PROXY_URL) {
        const proxyConfig = parseMongoProxyConfig(MONGO_PROXY_URL);
        if (proxyConfig) {
          const proxyOptions: mongoose.ConnectOptions = {
            proxyHost: proxyConfig.proxyHost,
            proxyPort: proxyConfig.proxyPort,
            directConnection: false,
          };
          if (proxyConfig.proxyUsername !== undefined) proxyOptions.proxyUsername = proxyConfig.proxyUsername;
          if (proxyConfig.proxyPassword !== undefined) proxyOptions.proxyPassword = proxyConfig.proxyPassword;
          Object.assign(mongooseOptions, proxyOptions);
          logger.info("[MongoDB] 使用 SOCKS5 代理", {
            proxyHost: proxyConfig.proxyHost,
            proxyPort: proxyConfig.proxyPort,
          });
        } else {
          throw new Error("MONGO_PROXY_URL 配置无效：仅支持 socks5:// 协议。请改用 SSH 隧道访问 MongoDB。");
        }
      }
      await mongoose.connect(uri, mongooseOptions);
      logger.info("MongoDB 连接成功", {
        uri: maskMongoUri(uri),
        database: mongoose.connection.name,
        host: mongoose.connection.host,
        port: mongoose.connection.port,
      });
      try {
        const runtimeConfigModule = await import("./runtimeConfigService.js");
        const RuntimeConfigService =
          runtimeConfigModule.RuntimeConfigService ?? runtimeConfigModule.default?.RuntimeConfigService;
        if (RuntimeConfigService?.initialize) {
          // G5-04: 非强制初始化（幂等），避免每次建连都全量重载配置、清空热缓存。
          await RuntimeConfigService.initialize();
        }
      } catch (runtimeConfigError) {
        logger.warn("[MongoDB] Runtime config initialization failed", {
          error: runtimeConfigError instanceof Error ? runtimeConfigError.message : String(runtimeConfigError),
        });
      }
      return;
    } catch (error) {
      lastError = error;
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorName = error instanceof Error ? error.name : "UnknownError";

      logger.error(`[MongoDB] 第${attempt}次连接失败`, {
        error: errorMessage,
        errorName: errorName,
        attempt: attempt,
        uri: maskMongoUri(parsedUri),
      });

      // 提供具体的错误诊断信息
      if (errorName === "MongoNetworkError") {
        logger.error("[MongoDB] 网络连接错误，请检查MongoDB服务是否运行");
      } else if (errorName === "MongoServerSelectionError") {
        logger.error("[MongoDB] 服务器选择错误，请检查连接字符串和认证信息");
      } else if (errorName === "MongoParseError") {
        logger.error("[MongoDB] 连接字符串解析错误，请检查 MONGO_URI / MONGODB_URI 格式");
      }

      if (attempt < 3) {
        await new Promise((res) => setTimeout(res, 2000));
        logger.info(`[MongoDB] 等待2秒后重试... (第${attempt + 1}次)`);
      }
    }
  }
  logger.error("[MongoDB] 连接失败，已重试3次，放弃", {
    error: lastError instanceof Error ? lastError.message : String(lastError),
  });
  throw lastError;
};

// 检查连接状态
export const isConnected = (): boolean => {
  return mongoose.connection.readyState === 1;
};

// 等待连接完成
export const waitForConnection = async (timeoutMs: number = 10000): Promise<boolean> => {
  // G5-22: 只等待现有连接就绪，不再发起重连。重连由驱动拓扑监控与启动流程负责，
  // 避免 Mongo 挂掉时请求侧各自 connectMongo() 形成连接风暴。
  if (mongoose.connection.readyState === 1) return true;

  return new Promise<boolean>((resolve) => {
    let settled = false;

    const cleanup = () => {
      mongoose.connection.off("connected", onConnected);
      mongoose.connection.off("error", onFailed);
      mongoose.connection.off("disconnected", onFailed);
    };

    const onConnected = () => {
      if (settled) return;
      settled = true;
      cleanup();
      clearTimeout(timer);
      resolve(true);
    };

    const onFailed = () => {
      if (settled) return;
      settled = true;
      cleanup();
      clearTimeout(timer);
      logger.error("[MongoDB] 等待连接失败", {
        timeoutMs,
        readyState: mongoose.connection.readyState,
      });
      resolve(false);
    };

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      cleanup();
      logger.error("[MongoDB] 等待连接超时", {
        timeoutMs,
        readyState: mongoose.connection.readyState,
      });
      resolve(false);
    }, timeoutMs);
    timer.unref?.();

    mongoose.connection.once("connected", onConnected);
    mongoose.connection.once("error", onFailed);
    mongoose.connection.once("disconnected", onFailed);

    // 竞态窗口内连接已就绪，立即返回
    if (mongoose.connection.readyState === 1) {
      onConnected();
    }
  });
};

// 确保连接可用的安全执行函数
export const ensureConnection = async <T>(operation: () => Promise<T>, timeoutMs: number = 10000): Promise<T> => {
  const connected = await waitForConnection(timeoutMs);
  if (!connected) {
    throw new Error("MongoDB 连接不可用");
  }
  return await operation();
};

// 获取连接信息
export const getConnectionInfo = () => {
  const stateNames = {
    0: "已断开",
    1: "已连接",
    2: "正在连接",
    3: "正在断开",
  };

  return {
    readyState: mongoose.connection.readyState,
    stateName: stateNames[mongoose.connection.readyState as keyof typeof stateNames] || "未知",
    database: mongoose.connection.name,
    host: mongoose.connection.host,
    port: mongoose.connection.port,
  };
};

// 获取连接池统计信息
export const getPoolStats = () => {
  if (!isConnected()) {
    return { error: "MongoDB 未连接" };
  }

  try {
    const connection = mongoose.connection;
    // G5-29: 不读取驱动私有内部路径（db.s.topology.s.pool 在 driver 6.x 已不存在）。
    // 公开 API 无法提供连接池细粒度指标，返回基础连接信息并显式标记池指标不可用，
    // 避免 startPoolMonitoring 每 60 秒稳定打一条假的"连接池状态异常"。
    return {
      connected: true,
      readyState: connection.readyState,
      host: connection.host,
      port: connection.port,
      name: connection.name,
      poolMetricsUnavailable: true,
    };
  } catch (error) {
    return {
      error: "获取连接池统计失败",
      details: error instanceof Error ? error.message : String(error),
    };
  }
};

// 连接池健康检查
export const checkPoolHealth = () => {
  const stats = getPoolStats();

  if ("error" in stats) {
    return {
      healthy: false,
      reason: stats.error,
      details: "details" in stats ? stats.details : undefined,
    };
  }

  // 连接就绪且公开信息可读即视为健康；驱动内部池指标不通过公开 API 提供。
  return {
    healthy: true,
    stats,
    warnings: [],
  };
};

// 测试连接
export const testConnection = async () => {
  try {
    // 确保连接完成
    const connected = await waitForConnection(15000);
    if (!connected) {
      throw new Error("MongoDB 连接超时");
    }

    const info = getConnectionInfo();
    const poolStats = getPoolStats();
    const poolHealth = checkPoolHealth();

    logger.info("[MongoDB] 连接测试成功", {
      ...info,
      poolStats,
      poolHealth: poolHealth.healthy ? "健康" : "异常",
      warnings: poolHealth.warnings,
    });

    // 测试基本操作
    if (!mongoose.connection.db) {
      throw new Error("数据库连接未初始化");
    }

    const collections = await mongoose.connection.db.listCollections().toArray();
    logger.info("[MongoDB] 集合列表获取成功", {
      collectionCount: collections.length,
      collections: collections.map((c) => c.name),
    });

    return {
      success: true,
      info,
      poolStats,
      poolHealth,
      collections: collections.map((c) => c.name),
    };
  } catch (error) {
    logger.error("[MongoDB] 连接测试失败", { error: error instanceof Error ? error.message : String(error) });
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
};

// 连接池监控
let poolMonitorInterval: NodeJS.Timeout | null = null;

// 启动连接池监控
export const startPoolMonitoring = (intervalMs: number = 60000) => {
  if (poolMonitorInterval) {
    logger.warn("[MongoDB] 连接池监控已在运行");
    return;
  }

  poolMonitorInterval = setInterval(() => {
    if (isConnected()) {
      const poolHealth = checkPoolHealth();
      const poolStats = getPoolStats();

      if (!poolHealth.healthy || (poolHealth.warnings && poolHealth.warnings.length > 0)) {
        logger.warn("[MongoDB] 连接池状态异常", {
          healthy: poolHealth.healthy,
          warnings: poolHealth.warnings || [],
          stats: poolStats,
        });
      } else {
        logger.debug("[MongoDB] 连接池状态正常", { stats: poolStats });
      }
    }
  }, intervalMs);
  poolMonitorInterval.unref?.();

  logger.info("[MongoDB] 连接池监控已启动", { intervalMs });
};

// 停止连接池监控
export const stopPoolMonitoring = () => {
  if (poolMonitorInterval) {
    clearInterval(poolMonitorInterval);
    poolMonitorInterval = null;
    logger.info("[MongoDB] 连接池监控已停止");
  }
};

// 获取连接池监控状态
export const getPoolMonitoringStatus = () => {
  return {
    isRunning: poolMonitorInterval !== null,
    interval: poolMonitorInterval ? "运行中" : "已停止",
  };
};

// 使用示例：
//
// // 在服务中使用 ensureConnection 确保连接可用
// import { ensureConnection } from './mongoService';
//
// export const getAllUsers = async () => {
//   return await ensureConnection(async () => {
//     return await UserModel.find({});
//   });
// };
//
// // 或者使用 waitForConnection 手动等待
// import { waitForConnection } from './mongoService';
//
// export const someDatabaseOperation = async () => {
//   const connected = await waitForConnection();
//   if (!connected) {
//     throw new Error('数据库连接不可用');
//   }
//   // 执行数据库操作
// };

export { mongoose };
