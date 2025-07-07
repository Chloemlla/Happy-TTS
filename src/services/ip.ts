import axios, { AxiosResponse, AxiosError } from 'axios';
import { readFile, writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';
import config from '../config';
import { logger } from './logger';

interface IPInfo {
  ip: string;
  country: string;
  region: string;
  city: string;
  isp: string;
  timestamp?: number;
}

interface APIProvider {
  name: string;
  url: (ip: string) => string;
  transform: (data: any, requestedIp: string) => IPInfo;
  validate: (data: any) => boolean;
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
  /^::1$/,
  /^localhost$/
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
const MAX_CACHE_SIZE = 100; // 最大缓存条数，超出自动清理最早的key
const MAX_CONCURRENT_REQUESTS = 50; // 降低并发请求数
const MAX_RETRIES = 3;
const RETRY_DELAY = 1000; // 增加重试延迟到1秒
let currentRequests = 0;

// API提供商列表
const API_PROVIDERS: APIProvider[] = [
  {
    name: 'ip-api',
    url: (ip: string) => `http://ip-api.com/json/${ip}`,
    transform: (data: any, requestedIp: string): IPInfo => ({
      ip: data.query || requestedIp,
      country: data.country || '未知',
      region: data.regionName || '未知',
      city: data.city || '未知',
      isp: data.isp || '未知',
    }),
    validate: (data: any) => data && data.status !== 'fail'
  },
  {
    name: 'ipapi.co',
    url: (ip: string) => `https://ipapi.co/${ip}/json/`,
    transform: (data: any, requestedIp: string): IPInfo => ({
      ip: data.ip || requestedIp,
      country: data.country_name || '未知',
      region: data.region || '未知',
      city: data.city || '未知',
      isp: data.org || '未知',
    }),
    validate: (data: any) => data && !data.error
  },
  {
    name: 'api.vore.top',
    url: (ip: string) => `https://api.vore.top/api/IPdata?ip=${ip}`,
    transform: (data: any, requestedIp: string): IPInfo => ({
      ip: requestedIp,
      country: data.ipdata?.info1 || '未知',
      region: data.ipdata?.info2 || '未知',
      city: data.ipdata?.info3 || '未知',
      isp: data.ipdata?.isp || '未知',
    }),
    validate: (data: any) => data && data.code === 200
  }
];

// 重试函数
async function withRetry<T>(fn: () => Promise<T>, retries = MAX_RETRIES): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (retries > 0) {
      logger.error(`IP查询失败，${RETRY_DELAY/1000}秒后重试... 剩余重试次数: ${retries}`);
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
      return withRetry(fn, retries - 1);
    }
    throw error;
  }
}

// 并发控制
async function withConcurrencyLimit<T>(fn: () => Promise<T>): Promise<T> {
  while (currentRequests >= MAX_CONCURRENT_REQUESTS) {
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  currentRequests++;
  try {
    return await fn();
  } finally {
    currentRequests--;
  }
}

// 尝试使用所有API提供商
async function tryAllProviders(ip: string): Promise<IPInfo> {
  for (const provider of API_PROVIDERS) {
    try {
      const response = await axios.get(provider.url(ip), {
        timeout: 5000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });

      if (provider.validate(response.data)) {
        return provider.transform(response.data, ip);
      }
    } catch (error) {
      const axiosError = error as AxiosError;
      logger.error(`${provider.name} API查询失败: ${axiosError.message}`);
      continue;
    }
  }
  throw new Error('所有API提供商都查询失败');
}

// 本地存储相关配置
const DATA_DIR = join(process.cwd(), 'data');
const IP_DATA_FILE = join(DATA_DIR, 'ip-info.json');
const LOCAL_CACHE: { [key: string]: IPInfo } = {};

// 初始化本地存储
async function initializeLocalStorage(): Promise<void> {
  try {
    // 确保 data 目录存在
    if (!existsSync(DATA_DIR)) {
      await mkdir(DATA_DIR, { recursive: true });
      logger.log('Created data directory for IP info');
    }

    // 检查并初始化 IP 信息文件
    if (!existsSync(IP_DATA_FILE)) {
      await writeFile(IP_DATA_FILE, JSON.stringify({}, null, 2));
      logger.log('Created empty IP info file');
    } else {
      // 读取本地存储的 IP 信息
      try {
        const data = await readFile(IP_DATA_FILE, 'utf-8');
        Object.assign(LOCAL_CACHE, JSON.parse(data));
        logger.log(`Loaded ${Object.keys(LOCAL_CACHE).length} IP records from local storage`);
      } catch (error) {
        // 如果文件损坏或格式错误，重新创建
        logger.error('Error reading IP info file, creating new one:', error);
        await writeFile(IP_DATA_FILE, JSON.stringify({}, null, 2));
        Object.keys(LOCAL_CACHE).forEach(key => delete LOCAL_CACHE[key]);
      }
    }
  } catch (error) {
    logger.error('Error initializing IP local storage:', error);
  }
}

// 保存 IP 信息到本地文件
async function saveIPInfoToLocal(info: IPInfo): Promise<void> {
  try {
    LOCAL_CACHE[info.ip] = {
      ...info,
      timestamp: Date.now()
    };
    
    await writeFile(IP_DATA_FILE, JSON.stringify(LOCAL_CACHE, null, 2));
  } catch (error) {
    logger.error('Error saving IP info to local storage:', error);
  }
}

// 从本地获取 IP 信息
function getIPInfoFromLocal(ip: string): IPInfo | null {
  const info = LOCAL_CACHE[ip];
  if (!info) return null;

  // 检查是否过期（1小时）
  if (info.timestamp && Date.now() - info.timestamp < CACHE_TTL) {
    return info;
  }

  // 如果过期，删除缓存
  delete LOCAL_CACHE[ip];
  return null;
}

// 初始化本地存储
initializeLocalStorage();

function setIpCache(ip: string, value: { info: IPInfo; timestamp: number }) {
  if (ipCache.size >= MAX_CACHE_SIZE) {
    // 删除最早的key
    const firstKey = ipCache.keys().next().value;
    if (firstKey) ipCache.delete(firstKey);
  }
  ipCache.set(ip, value);
}

export async function getIPInfo(ip: string): Promise<IPInfo> {
  try {
    // 处理特殊IP
    if (!ip || ip === '::1' || ip === 'localhost') {
      ip = '127.0.0.1';
    }
    
    // 移除IPv6前缀
    ip = ip.replace(/^::ffff:/, '');

    // 检查是否是内网IP
    if (isPrivateIP(ip)) {
      return getPrivateIPInfo(ip);
    }

    // 先检查内存缓存
    const cached = ipCache.get(ip);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return cached.info;
    }

    // 检查本地存储
    const localInfo = getIPInfoFromLocal(ip);
    if (localInfo) {
      // 更新内存缓存
      setIpCache(ip, { info: localInfo, timestamp: Date.now() });
      return localInfo;
    }

    return await withConcurrencyLimit(async () => {
      return await withRetry(async () => {
        const info = await tryAllProviders(ip);
        
        // 更新内存缓存
        setIpCache(ip, { info, timestamp: Date.now() });
        
        // 保存到本地存储
        await saveIPInfoToLocal(info);
        
        return info;
      });
    });
  } catch (error) {
    logger.error('IP info error:', error);
    
    // 如果内存缓存中有旧数据，返回旧数据
    const cached = ipCache.get(ip);
    if (cached) {
      logger.log(`使用内存缓存的IP信息: ${ip}`);
      return cached.info;
    }
    
    // 如果本地存储中有数据（即使过期），也返回
    const localInfo = LOCAL_CACHE[ip];
    if (localInfo) {
      logger.log(`使用本地存储的IP信息: ${ip}`);
      return localInfo;
    }
    
    // 如果所有方法都失败，返回一个基本的信息
    return {
      ip,
      country: '未知',
      region: '未知',
      city: '未知',
      isp: '未知'
    };
  }
}

export function isIPAllowed(ip: string): boolean {
  const whitelist = (config as any).ip?.whitelist || [];
  if (!whitelist.length) return true;
  return whitelist.includes(ip);
} 