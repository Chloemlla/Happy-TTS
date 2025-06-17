import axios, { AxiosResponse } from 'axios';
import config from '../config';
import { logger } from './logger';

interface IPInfo {
  ip: string;
  country: string;
  region: string;
  city: string;
  isp: string;
}

// 内网IP预定义信息
const PRIVATE_IP_RANGES = [
  /^10\./,
  /^172\.(1[6-9]|2[0-9]|3[0-1])\./,
  /^192\.168\./,
  /^127\./,
  /^169\.254\./,
  /^fc00::/,
  /^fe80::/,
  /^::1$/
];

// 检查是否是内网IP
function isPrivateIP(ip: string): boolean {
  return PRIVATE_IP_RANGES.some(range => range.test(ip));
}

// 获取内网IP信息
function getPrivateIPInfo(ip: string): IPInfo {
  return {
    ip,
    country: '内网',
    region: '内网',
    city: '内网',
    isp: '内网'
  };
}

// IP信息缓存
const ipCache = new Map<string, { info: IPInfo; timestamp: number }>();
const CACHE_TTL = 3600000; // 1小时缓存
const MAX_CONCURRENT_REQUESTS = 50; // 最大并发请求数
const MAX_RETRIES = 3; // 最大重试次数
const RETRY_DELAY = 2000; // 重试延迟（毫秒）
let currentRequests = 0;

// 重试函数
async function withRetry<T>(fn: () => Promise<T>, retries = MAX_RETRIES): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (retries > 0) {
      logger.error(`IP查询失败，${retries}秒后重试...`);
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
      return withRetry(fn, retries - 1);
    }
    throw error;
  }
}

// 并发控制
async function withConcurrencyLimit<T>(fn: () => Promise<T>): Promise<T> {
  if (currentRequests >= MAX_CONCURRENT_REQUESTS) {
    await new Promise(resolve => setTimeout(resolve, 1000)); // 等待1秒
    return withConcurrencyLimit(fn);
  }
  
  currentRequests++;
  try {
    return await fn();
  } finally {
    currentRequests--;
  }
}

export async function getIPInfo(ip: string): Promise<IPInfo> {
  try {
    // 检查是否是内网IP
    if (isPrivateIP(ip)) {
      return getPrivateIPInfo(ip);
    }

    // 检查缓存
    const cached = ipCache.get(ip);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return cached.info;
    }

    return await withConcurrencyLimit(async () => {
      return await withRetry(async () => {
        const response = await axios.get(`http://ip-api.com/json/${ip}`, {
          timeout: 5000, // 5秒超时
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
          }
        });
        
        const data = response.data;

        if (!data || data.status === 'fail') {
          logger.error('IP API returned error', data);
          throw new Error('IP 查询失败');
        }

        const info = {
          ip: data.query,
          country: data.country || '未知',
          region: data.regionName || '未知',
          city: data.city || '未知',
          isp: data.isp || '未知',
        };

        // 更新缓存
        ipCache.set(ip, { info, timestamp: Date.now() });
        
        return info;
      });
    });
  } catch (error) {
    logger.error('IP info error:', error);
    // 如果缓存中有旧数据，返回旧数据
    const cached = ipCache.get(ip);
    if (cached) {
      return cached.info;
    }
    throw new Error('获取 IP 信息失败');
  }
}

export function isIPAllowed(ip: string): boolean {
  const whitelist = (config as any).ip?.whitelist || [];
  if (!whitelist.length) return true;
  return whitelist.includes(ip);
} 