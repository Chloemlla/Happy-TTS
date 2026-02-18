// 新增依赖
import { MongoClientOptions } from "mongodb";
import mongoose from "mongoose";
import logger from "../utils/logger";

// 优先使用环境变量 MONGO_URI，否则默认连接到本地 tts 数据库
const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017/tts";
const MONGO_PROXY_URL = process.env.MONGO_PROXY_URL; // 代理地址（如 socks5://127.0.0.1:1080 或 http://127.0.0.1:8888）

// 检查代理配置（仅警告，不阻止连接）
if (MONGO_PROXY_URL) {
  logger.warn("[MongoDB] 检测到代理配置，但官方不支持通过代理连接MongoDB", { proxyUrl: MONGO_PROXY_URL });
}

export const connectMongo = async () => {
  let lastError;
  let parsedUri = MONGO_URI;

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      // 解析 URI，若无 database，强制加上 tts
      let uri = parsedUri;

      // 改进的URI解析逻辑
      if (/mongodb\+srv:\/\/.+\/?(\?.*)?$/.test(uri)) {
        // Atlas URI 没有指定 db，自动加 /tts
        if (!/\/[a-zA-Z0-9_-]+(\?|$)/.test(uri.replace("mongodb+srv://", ""))) {
          uri = uri.replace(/\/?(\?.*)?$/, "/tts$1");
        }
      } else if (/^mongodb:\/\//.test(uri)) {
        // 普通 URI 没有指定 db，自动加 /tts
        // 允许 mongodb://host:port/tts 这种格式，只有没有 /db 时才补全
        const afterHost = uri.replace("mongodb://", "").replace(/^[^/]+/, "");
        if (!/^\/[^/?]+(\?|$)/.test(afterHost)) {
          uri = uri.replace(/\/?(\?.*)?$/, "/tts$1");
        }
      }

      // 检查是否已经连接到tts数据库
      if (uri.includes("/tts") || uri.includes("/tts?")) {
        logger.info("[MongoDB] 检测到tts数据库连接，跳过URI修改");
      }

      // 更新parsedUri以便在catch块中使用
      parsedUri = uri;

      logger.info("[MongoDB] 解析后的连接URI", { originalUri: MONGO_URI, parsedUri: uri });

      // 代理支持
      const mongooseOptions: any = {
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
        // 仅支持 http/socks5 代理，需安装 mongodb-connection-string-url 和 socks-proxy-agent/http-proxy-agent
        const proxyUrl = MONGO_PROXY_URL;
        if (/^socks/.test(proxyUrl)) {
          const { SocksProxyAgent } = require("socks-proxy-agent");
          mongooseOptions.proxyAgent = new SocksProxyAgent(proxyUrl);
          mongooseOptions.directConnection = false;
          logger.info("[MongoDB] 使用 SOCKS 代理", { proxyUrl });
        } else if (/^http/.test(proxyUrl)) {
          const { HttpProxyAgent } = require("http-proxy-agent");
          mongooseOptions.proxyAgent = new HttpProxyAgent(proxyUrl);
          mongooseOptions.directConnection = false;
          logger.info("[MongoDB] 使用 HTTP 代理", { proxyUrl });
        } else {
          logger.warn("[MongoDB] 未识别的代理协议", { proxyUrl });
        }
      }
      await mongoose.connect(uri, mongooseOptions);
      logger.info("MongoDB 连接成功", {
        uri: uri,
        database: mongoose.connection.name,
        host: mongoose.connection.host,
        port: mongoose.connection.port,
      });
      return;
    } catch (error) {
      lastError = error;
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorName = error instanceof Error ? error.name : "UnknownError";

      logger.error(`[MongoDB] 第${attempt}次连接失败`, {
        error: errorMessage,
        errorName: errorName,
        attempt: attempt,
        uri: parsedUri,
      });

      // 提供具体的错误诊断信息
      if (errorName === "MongoNetworkError") {
        logger.error("[MongoDB] 网络连接错误，请检查MongoDB服务是否运行");
      } else if (errorName === "MongoServerSelectionError") {
        logger.error("[MongoDB] 服务器选择错误，请检查连接字符串和认证信息");
      } else if (errorName === "MongoParseError") {
        logger.error("[MongoDB] 连接字符串解析错误，请检查MONGO_URI格式");
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
  const startTime = Date.now();

  while (mongoose.connection.readyState !== 1) {
    if (Date.now() - startTime > timeoutMs) {
      logger.error("[MongoDB] 等待连接超时", {
        timeoutMs,
        readyState: mongoose.connection.readyState,
      });
      return false;
    }

    // 如果连接失败，尝试重新连接
    if (mongoose.connection.readyState === 0) {
      logger.info("[MongoDB] 检测到连接断开，尝试重新连接...");
      try {
        await connectMongo();
      } catch (error) {
        logger.error("[MongoDB] 重新连接失败", { error: error instanceof Error ? error.message : String(error) });
      }
    }

    // 等待100ms后再次检查
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  return true;
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
    const pool = (connection as any).db?.s?.topology?.s?.pool;

    if (!pool) {
      return { error: "无法获取连接池信息" };
    }

    return {
      totalConnections: pool.totalConnectionCount || 0,
      availableConnections: pool.availableConnectionCount || 0,
      checkedOutConnections: pool.checkedOutConnections || 0,
      waitQueueSize: pool.waitQueueSize || 0,
      maxPoolSize: pool.options?.maxPoolSize || 0,
      minPoolSize: pool.options?.minPoolSize || 0,
      maxIdleTimeMS: pool.options?.maxIdleTimeMS || 0,
      maxConnecting: pool.options?.maxConnecting || 0,
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

  const { totalConnections, availableConnections, waitQueueSize, maxPoolSize } = stats;

  // 健康检查规则
  const isHealthy =
    totalConnections > 0 && // 有活跃连接
    waitQueueSize < maxPoolSize * 0.8 && // 等待队列不超过80%
    availableConnections > 0; // 有可用连接

  return {
    healthy: isHealthy,
    stats,
    warnings: [
      ...(waitQueueSize > maxPoolSize * 0.5 ? ["等待队列较大，可能存在性能瓶颈"] : []),
      ...(availableConnections === 0 ? ["没有可用连接，可能影响性能"] : []),
      ...(totalConnections >= maxPoolSize * 0.9 ? ["连接池接近满载"] : []),
    ],
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
