import axios, { AxiosResponse, AxiosError } from 'axios';
import { readFile, writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';
import config from '../config';
import { logger } from './logger';
import cheerio from 'cheerio';
import { mongoose } from './mongoService';

// MongoDB IP信息 Schema
const IPInfoSchema = new mongoose.Schema({
  ip: { type: String, required: true, unique: true },
  info: { type: Object, required: true },
  timestamp: { type: Number, required: true },
}, { collection: 'ip_infos' });
const IPInfoModel = mongoose.models.IPInfo || mongoose.model('IPInfo', IPInfoSchema);

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

/**
 * SSRF防护：只允许合法公网IPv4，禁止内网、环回、保留、0.0.0.0、255.255.255.255等危险IP
 */
function isValidPublicIPv4(ip: string): boolean {
  const ipv4Regex = /^(25[0-5]|2[0-4][0-9]|1?[0-9]{1,2})(\.(25[0-5]|2[0-4][0-9]|1?[0-9]{1,2})){3}$/;
  if (!ipv4Regex.test(ip)) return false;
  const parts = ip.split('.').map(Number);
  if (
    ip.startsWith('10.') ||
    ip.startsWith('192.168.') ||
    (ip.startsWith('172.') && parts[1] >= 16 && parts[1] <= 31) ||
    ip.startsWith('127.') ||
    ip === '0.0.0.0' ||
    ip === '255.255.255.255'
  ) return false;
  return true;
}

// 新增IP38网页解析方法
async function queryIp38(ip: string): Promise<IPInfo> {
  // SSRF防护：已严格校验ip为公网IPv4，禁止内网/环回/保留/0.0.0.0/255.255.255.255
  if (!isValidPublicIPv4(ip)) {
    throw new Error('非法IP，禁止查询内网/环回/保留/危险地址');
  }
  try {
    // codeql[request-forgery]: ip已严格校验为公网IPv4
    const url = `https://www.ip38.com/ip/${encodeURIComponent(ip)}.htm`;
    const resp = await axios.get(url, { timeout: 8000 });
    const html = resp.data;
    const $ = cheerio.load(html);
    // 解析页面结构
    // IP: 页面h1下的 .query-box strong
    // 结果: .query-box .result-data
    // 兼容页面变动，优先找高亮IP和红色归属地
    const ipText = $('h1 strong').first().text().trim() || ip;
    let country = '未知', region = '未知', city = '未知', isp = '未知';
    // 解析红色归属地
    const resultText = $('.query-box .result-data').text().replace(/\s+/g, ' ').trim();
    // 例：中国 香港 新界 荃湾区 IPXO
    if (resultText) {
      const parts = resultText.split(' ');
      if (parts.length >= 1) country = parts[0];
      if (parts.length >= 2) region = parts[1];
      if (parts.length >= 3) city = parts[2];
      if (parts.length >= 4) isp = parts.slice(3).join(' ');
    }
    return { ip: ipText, country, region, city, isp };
  } catch (e: any) {
    logger.error('ip38.com 网页查询失败', { ip, error: e.message });
    throw e;
  }
}

// 新增tool.lu/ip/ajax.html查询方法
async function queryToolLu(ip: string): Promise<IPInfo> {
  // SSRF防护：仅允许合法的公网IPv4，禁止内网、环回/保留地址
  if (!isValidPublicIPv4(ip)) {
    throw new Error('非法IP，禁止查询内网/环回/保留地址');
  }
  try {
    // 只允许拼接到可信第三方的IP查询接口，避免SSRF
    const resp = await axios.post('https://tool.lu/ip/ajax.html', `ip=${encodeURIComponent(ip)}`, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      timeout: 8000
    });
    const data = resp.data;
    if (data && data.status && data.text) {
      // 优先用chunzhen字段
      let country = '未知', region = '未知', city = '未知', isp = '未知';
      if (data.text.chunzhen) {
        // 例：中国 山东 济宁 电信
        const parts = data.text.chunzhen.split(' ');
        if (parts.length >= 1) country = parts[0];
        if (parts.length >= 2) region = parts[1];
        if (parts.length >= 3) city = parts[2];
        if (parts.length >= 4) isp = parts.slice(3).join(' ');
      }
      return {
        ip: data.text.ip || ip,
        country,
        region,
        city,
        isp
      };
    }
    throw new Error('tool.lu 响应格式异常');
  } catch (e: any) {
    logger.error('tool.lu/ip/ajax.html 查询失败', { ip, error: e.message });
    throw e;
  }
}

// 优先用ip38.com网页，其次用tool.lu，再用API_PROVIDERS
async function tryAllProviders(ip: string): Promise<IPInfo> {
  // SSRF防护：只允许合法公网IPv4，禁止内网/环回/保留/非法IP
  if (!isValidPublicIPv4(ip)) {
    throw new Error('非法IP，禁止查询内网/环回/保留地址');
  }
  // 先尝试ip38网页
  try {
    return await queryIp38(ip);
  } catch (e: any) {
    logger.error('ip38.com 查询失败，尝试tool.lu', { ip });
  }
  // 再尝试tool.lu
  try {
    return await queryToolLu(ip);
  } catch (e: any) {
    logger.error('tool.lu 查询失败，尝试备用API', { ip });
  }
  // 失败后fallback到原有API
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

// MongoDB写入速率限制队列
const mongoWriteQueue: (() => Promise<void>)[] = [];
let mongoWriteCount = 0;
let mongoWriteTimer: NodeJS.Timeout | null = null;

function scheduleMongoWrite(task: () => Promise<void>) {
  mongoWriteQueue.push(task);
  processMongoWriteQueue();
}

function processMongoWriteQueue() {
  if (mongoWriteCount >= 20) {
    if (!mongoWriteTimer) {
      mongoWriteTimer = setTimeout(() => {
        mongoWriteCount = 0;
        mongoWriteTimer = null;
        processMongoWriteQueue();
      }, 1000);
    }
    return;
  }
  while (mongoWriteQueue.length && mongoWriteCount < 20) {
    const task = mongoWriteQueue.shift();
    if (task) {
      mongoWriteCount++;
      task().catch(e => logger.error('MongoDB写入队列任务失败', e));
    }
  }
  if (mongoWriteQueue.length && !mongoWriteTimer) {
    mongoWriteTimer = setTimeout(() => {
      mongoWriteCount = 0;
      mongoWriteTimer = null;
      processMongoWriteQueue();
    }, 1000);
  }
}

// 初始化本地存储
async function initializeLocalStorage(): Promise<void> {
  try {
    if (mongoose.connection.readyState === 1) {
      // MongoDB: 加载所有IP到本地缓存
      const all = await IPInfoModel.find().lean();
      for (const doc of all) {
        LOCAL_CACHE[doc.ip] = { ...doc.info, timestamp: doc.timestamp };
      }
      logger.log(`Loaded ${all.length} IP records from MongoDB`);
      return;
    }
  } catch (error) {
    logger.error('MongoDB 加载 IP 信息失败，降级为本地文件:', error);
  }
  // 本地文件兜底
  try {
    if (!existsSync(DATA_DIR)) {
      await mkdir(DATA_DIR, { recursive: true });
      logger.log('Created data directory for IP info');
    }
    if (!existsSync(IP_DATA_FILE)) {
      await writeFile(IP_DATA_FILE, JSON.stringify({}, null, 2));
      logger.log('Created empty IP info file');
    } else {
      try {
        const data = await readFile(IP_DATA_FILE, 'utf-8');
        Object.assign(LOCAL_CACHE, JSON.parse(data));
        logger.log(`Loaded ${Object.keys(LOCAL_CACHE).length} IP records from local storage`);
      } catch (error) {
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
    if (mongoose.connection.readyState === 1) {
      // 限速写入MongoDB，后台排队
      scheduleMongoWrite(async () => {
        await IPInfoModel.findOneAndUpdate(
          { ip: info.ip },
          { info, timestamp: Date.now() },
          { upsert: true }
        );
        LOCAL_CACHE[info.ip] = { ...info, timestamp: Date.now() };
      });
      // 优先返回，不等待写入完成
      return;
    }
  } catch (error) {
    logger.error('MongoDB 保存 IP 信息失败，降级为本地文件:', error);
  }
  // 本地文件兜底
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
  if (!isValidPublicIPv4(ip)) {
    return {
      ip,
      country: '非法IP',
      region: '非法IP',
      city: '非法IP',
      isp: '非法IP'
    };
  }
  let lastError: any = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      // 处理特殊IP
      if (!ip || ip === '::1' || ip === 'localhost') {
        ip = '127.0.0.1';
      }
      ip = ip.replace(/^::ffff:/, '');
      if (isPrivateIP(ip)) {
        logger.log('检测到内网IP，返回本地信息', { ip });
        return getPrivateIPInfo(ip);
      }
      const cached = ipCache.get(ip);
      if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
        logger.log('使用内存缓存的IP信息', { ip });
        return cached.info;
      }
      const localInfo = getIPInfoFromLocal(ip);
      if (localInfo) {
        setIpCache(ip, { info: localInfo, timestamp: Date.now() });
        logger.log('使用本地存储的IP信息', { ip });
        return localInfo;
      }
      logger.log('开始查询外部API获取IP信息', { ip });
      return await withConcurrencyLimit(async () => {
        return await withRetry(async () => {
          const info = await tryAllProviders(ip);
          setIpCache(ip, { info, timestamp: Date.now() });
          await saveIPInfoToLocal(info);
          logger.log('成功获取IP信息', { ip, info });
          return info;
        });
      });
    } catch (error) {
      lastError = error;
      logger.error(`IP信息查询失败（第${attempt + 1}次），2秒后重试...`, { ip, error: error instanceof Error ? error.message : String(error) });
      if (attempt < 2) {
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
  }
  // 全部失败后兜底
  logger.error('IP信息查询连续失败，返回默认信息', { ip, error: lastError instanceof Error ? lastError.message : String(lastError) });
  return {
    ip,
    country: '未知',
    region: '未知',
    city: '未知',
    isp: '未知'
  };
}

export function isIPAllowed(ip: string): boolean {
  const whitelist = (config as any).ip?.whitelist || [];
  if (!whitelist.length) return true;
  return whitelist.includes(ip);
} 