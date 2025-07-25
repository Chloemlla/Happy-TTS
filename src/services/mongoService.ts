import mongoose from 'mongoose';
// 新增依赖
import { MongoClientOptions } from 'mongodb';
import logger from '../utils/logger';

// 优先使用环境变量 MONGO_URI，否则默认连接到本地 tts 数据库
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/tts';
const MONGO_PROXY_URL = process.env.MONGO_PROXY_URL; // 代理地址（如 socks5://127.0.0.1:1080 或 http://127.0.0.1:8888）
if (MONGO_PROXY_URL) {
  const msg = '你别看这代码中实现了用代理的方式实现mongodb数据库链接，实际上官方根本不支持这种方式！！！！！';
  console.log(msg);
  throw new Error(msg);
}

export const connectMongo = async () => {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      // 解析 URI，若无 database，强制加上 tts
      let uri = MONGO_URI;
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
      logger.info('MongoDB 连接成功', { uri });
      return;
    } catch (error) {
      lastError = error;
      logger.error(`[MongoDB] 第${attempt}次连接失败`, { error: error instanceof Error ? error.message : String(error) });
      if (attempt < 3) {
        await new Promise(res => setTimeout(res, 2000));
        logger.info(`[MongoDB] 等待2秒后重试... (第${attempt + 1}次)`);
      }
    }
  }
  logger.error('[MongoDB] 连接失败，已重试3次，放弃', { error: lastError instanceof Error ? lastError.message : String(lastError) });
  throw lastError;
};

export { mongoose }; 