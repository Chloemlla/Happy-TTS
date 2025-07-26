import mongoose from 'mongoose';
// 新增依赖
import { MongoClientOptions } from 'mongodb';
import logger from '../utils/logger';

// 优先使用环境变量 MONGO_URI，否则默认连接到本地 tts 数据库
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/tts';
const MONGO_PROXY_URL = process.env.MONGO_PROXY_URL; // 代理地址（如 socks5://127.0.0.1:1080 或 http://127.0.0.1:8888）

// 检查代理配置（仅警告，不阻止连接）
if (MONGO_PROXY_URL) {
  logger.warn('[MongoDB] 检测到代理配置，但官方不支持通过代理连接MongoDB', { proxyUrl: MONGO_PROXY_URL });
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
        if (!/\/[a-zA-Z0-9_-]+(\?|$)/.test(uri.replace('mongodb+srv://', ''))) {
          uri = uri.replace(/\/?(\?.*)?$/, '/tts$1');
        }
      } else if (/^mongodb:\/\//.test(uri)) {
        // 普通 URI 没有指定 db，自动加 /tts
        // 允许 mongodb://host:port/tts 这种格式，只有没有 /db 时才补全
        const afterHost = uri.replace('mongodb://', '').replace(/^[^/]+/, '');
        if (!/^\/[^/?]+(\?|$)/.test(afterHost)) {
          uri = uri.replace(/\/?(\?.*)?$/, '/tts$1');
        }
      }
      
      // 检查是否已经连接到tts数据库
      if (uri.includes('/tts') || uri.includes('/tts?')) {
        logger.info('[MongoDB] 检测到tts数据库连接，跳过URI修改');
      }
      
      // 更新parsedUri以便在catch块中使用
      parsedUri = uri;
      
      logger.info('[MongoDB] 解析后的连接URI', { originalUri: MONGO_URI, parsedUri: uri });

      // 代理支持
      let mongooseOptions: any = {
        serverSelectionTimeoutMS: 5000, // 5秒超时
        socketTimeoutMS: 45000, // 45秒超时
      };
      if (MONGO_PROXY_URL) {
        // 仅支持 http/socks5 代理，需安装 mongodb-connection-string-url 和 socks-proxy-agent/http-proxy-agent
        const proxyUrl = MONGO_PROXY_URL;
        if (/^socks/.test(proxyUrl)) {
          const { SocksProxyAgent } = require('socks-proxy-agent');
          mongooseOptions.proxyAgent = new SocksProxyAgent(proxyUrl);
          mongooseOptions.directConnection = false;
          logger.info('[MongoDB] 使用 SOCKS 代理', { proxyUrl });
        } else if (/^http/.test(proxyUrl)) {
          const { HttpProxyAgent } = require('http-proxy-agent');
          mongooseOptions.proxyAgent = new HttpProxyAgent(proxyUrl);
          mongooseOptions.directConnection = false;
          logger.info('[MongoDB] 使用 HTTP 代理', { proxyUrl });
        } else {
          logger.warn('[MongoDB] 未识别的代理协议', { proxyUrl });
        }
      }
      await mongoose.connect(uri, mongooseOptions);
      logger.info('MongoDB 连接成功', { 
        uri: uri,
        database: mongoose.connection.name,
        host: mongoose.connection.host,
        port: mongoose.connection.port
      });
      return;
    } catch (error) {
      lastError = error;
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorName = error instanceof Error ? error.name : 'UnknownError';
      
      logger.error(`[MongoDB] 第${attempt}次连接失败`, { 
        error: errorMessage,
        errorName: errorName,
        attempt: attempt,
        uri: parsedUri
      });
      
      // 提供具体的错误诊断信息
      if (errorName === 'MongoNetworkError') {
        logger.error('[MongoDB] 网络连接错误，请检查MongoDB服务是否运行');
      } else if (errorName === 'MongoServerSelectionError') {
        logger.error('[MongoDB] 服务器选择错误，请检查连接字符串和认证信息');
      } else if (errorName === 'MongoParseError') {
        logger.error('[MongoDB] 连接字符串解析错误，请检查MONGO_URI格式');
      }
      
      if (attempt < 3) {
        await new Promise(res => setTimeout(res, 2000));
        logger.info(`[MongoDB] 等待2秒后重试... (第${attempt + 1}次)`);
      }
    }
  }
  logger.error('[MongoDB] 连接失败，已重试3次，放弃', { error: lastError instanceof Error ? lastError.message : String(lastError) });
  throw lastError;
};

// 检查连接状态
export const isConnected = (): boolean => {
  return mongoose.connection.readyState === 1;
};

// 获取连接信息
export const getConnectionInfo = () => {
  const stateNames = {
    0: '已断开',
    1: '已连接',
    2: '正在连接',
    3: '正在断开'
  };
  
  return {
    readyState: mongoose.connection.readyState,
    stateName: stateNames[mongoose.connection.readyState as keyof typeof stateNames] || '未知',
    database: mongoose.connection.name,
    host: mongoose.connection.host,
    port: mongoose.connection.port
  };
};

// 测试连接
export const testConnection = async () => {
  try {
    if (!isConnected()) {
      await connectMongo();
    }
    
    const info = getConnectionInfo();
    logger.info('[MongoDB] 连接测试成功', info);
    
    // 测试基本操作
    if (!mongoose.connection.db) {
      throw new Error('数据库连接未初始化');
    }
    
    const collections = await mongoose.connection.db.listCollections().toArray();
    logger.info('[MongoDB] 集合列表获取成功', { 
      collectionCount: collections.length,
      collections: collections.map(c => c.name)
    });
    
    return {
      success: true,
      info,
      collections: collections.map(c => c.name)
    };
  } catch (error) {
    logger.error('[MongoDB] 连接测试失败', { error: error instanceof Error ? error.message : String(error) });
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
};

export { mongoose }; 