import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import axios, { type AxiosError } from "axios";
import cheerio from "cheerio";
import config from "../config";
import { logger } from "./logger";
import { mongoose } from "./mongoService";

// 性能监控和统计
interface IPServiceStats {
  totalQueries: number;
  cacheHits: number;
  mongoHits: number;
  apiCalls: number;
  errors: number;
  avgResponseTime: number;
  bulkWriteCount: number;
  lastResetTime: Date;
}

const serviceStats: IPServiceStats = {
  totalQueries: 0,
  cacheHits: 0,
  mongoHits: 0,
  apiCalls: 0,
  errors: 0,
  avgResponseTime: 0,
  bulkWriteCount: 0,
  lastResetTime: new Date(),
};

const responseTimes: number[] = [];
const MAX_RESPONSE_TIME_SAMPLES = 100;

// MongoDB IP信息 Schema - 优化版本
const IPInfoSchema = new mongoose.Schema(
  {
    ip: {
      type: String,
      required: true,
      unique: true,
      index: true, // 主查询字段索引
    },
    // 展开info对象为独立字段，提升查询性能
    country: { type: String, required: true, default: "未知" },
    region: { type: String, required: true, default: "未知" },
    city: { type: String, required: true, default: "未知" },
    isp: { type: String, required: true, default: "未知" },
    timestamp: {
      type: Date,
      required: true,
      default: Date.now,
      // TTL索引在下方单独定义
    },
    // 添加查询统计字段
    queryCount: { type: Number, default: 1 },
    lastQueried: { type: Date, default: Date.now },
  },
  {
    collection: "ip_infos",
    // 优化选项
    timestamps: false, // 使用自定义timestamp字段
    versionKey: false, // 移除__v字段
    // 添加复合索引
    index: [
      { ip: 1 }, // 单字段索引
      { country: 1, region: 1 }, // 地理位置复合索引
      { queryCount: -1, lastQueried: -1 }, // 热点数据索引
    ],
  },
);

// 添加TTL索引 - 1小时后自动过期
IPInfoSchema.index({ timestamp: 1 }, { expireAfterSeconds: 3600 });

// 添加复合索引优化常见查询
IPInfoSchema.index({ country: 1, region: 1, city: 1 });
IPInfoSchema.index({ queryCount: -1, lastQueried: -1 });

const IPInfoModel = mongoose.models.IPInfo || mongoose.model("IPInfo", IPInfoSchema);

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
  /^localhost$/,
];

// 检查是否是内网IP
function isPrivateIP(ip: string): boolean {
  return PRIVATE_IP_RANGES.some((range) => range.test(ip));
}

// 获取内网IP信息
function getPrivateIPInfo(ip: string): IPInfo {
  return {
    ip,
    country: "内网",
    region: "内网",
    city: "内网",
    isp: "内网",
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
    name: "ip-api",
    url: (ip: string) => `http://ip-api.com/json/${ip}`,
    transform: (data: any, requestedIp: string): IPInfo => ({
      ip: data.query || requestedIp,
      country: data.country || "未知",
      region: data.regionName || "未知",
      city: data.city || "未知",
      isp: data.isp || "未知",
    }),
    validate: (data: any) => data && data.status !== "fail",
  },
  {
    name: "ipapi.co",
    url: (ip: string) => `https://ipapi.co/${ip}/json/`,
    transform: (data: any, requestedIp: string): IPInfo => ({
      ip: data.ip || requestedIp,
      country: data.country_name || "未知",
      region: data.region || "未知",
      city: data.city || "未知",
      isp: data.org || "未知",
    }),
    validate: (data: any) => data && !data.error,
  },
  {
    name: "api.vore.top",
    url: (ip: string) => `https://api.vore.top/api/IPdata?ip=${ip}`,
    transform: (data: any, requestedIp: string): IPInfo => ({
      ip: requestedIp,
      country: data.ipdata?.info1 || "未知",
      region: data.ipdata?.info2 || "未知",
      city: data.ipdata?.info3 || "未知",
      isp: data.ipdata?.isp || "未知",
    }),
    validate: (data: any) => data && data.code === 200,
  },
];

// 重试函数
async function withRetry<T>(fn: () => Promise<T>, retries = MAX_RETRIES): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (retries > 0) {
      logger.error(`IP查询失败，${RETRY_DELAY / 1000}秒后重试... 剩余重试次数: ${retries}`);
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY));
      return withRetry(fn, retries - 1);
    }
    throw error;
  }
}

// 并发控制
async function withConcurrencyLimit<T>(fn: () => Promise<T>): Promise<T> {
  while (currentRequests >= MAX_CONCURRENT_REQUESTS) {
    await new Promise((resolve) => setTimeout(resolve, 100));
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
  const parts = ip.split(".").map(Number);
  if (
    ip.startsWith("10.") ||
    ip.startsWith("192.168.") ||
    (ip.startsWith("172.") && parts[1] >= 16 && parts[1] <= 31) ||
    ip.startsWith("127.") ||
    ip === "0.0.0.0" ||
    ip === "255.255.255.255"
  )
    return false;
  return true;
}

// 新增IP38网页解析方法
async function queryIp38(ip: string): Promise<IPInfo> {
  // SSRF防护：已严格校验ip为公网IPv4，禁止内网/环回/保留/0.0.0.0/255.255.255.255
  if (!isValidPublicIPv4(ip)) {
    throw new Error("非法IP，禁止查询内网/环回/保留/危险地址");
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
    const ipText = $("h1 strong").first().text().trim() || ip;
    let country = "未知",
      region = "未知",
      city = "未知",
      isp = "未知";
    // 解析红色归属地
    const resultText = $(".query-box .result-data").text().replace(/\s+/g, " ").trim();
    // 例：中国 香港 新界 荃湾区 IPXO
    if (resultText) {
      const parts = resultText.split(" ");
      if (parts.length >= 1) country = parts[0];
      if (parts.length >= 2) region = parts[1];
      if (parts.length >= 3) city = parts[2];
      if (parts.length >= 4) isp = parts.slice(3).join(" ");
    }
    return { ip: ipText, country, region, city, isp };
  } catch (e: any) {
    logger.error("ip38.com 网页查询失败", { ip, error: e.message });
    throw e;
  }
}

// 新增tool.lu/ip/ajax.html查询方法
async function queryToolLu(ip: string): Promise<IPInfo> {
  // SSRF防护：仅允许合法的公网IPv4，禁止内网、环回/保留地址
  if (!isValidPublicIPv4(ip)) {
    throw new Error("非法IP，禁止查询内网/环回/保留地址");
  }
  try {
    // 只允许拼接到可信第三方的IP查询接口，避免SSRF
    const resp = await axios.post("https://tool.lu/ip/ajax.html", `ip=${encodeURIComponent(ip)}`, {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
      timeout: 8000,
    });
    const data = resp.data;
    if (data?.status && data.text) {
      // 优先用chunzhen字段
      let country = "未知",
        region = "未知",
        city = "未知",
        isp = "未知";
      if (data.text.chunzhen) {
        // 例：中国 山东 济宁 电信
        const parts = data.text.chunzhen.split(" ");
        if (parts.length >= 1) country = parts[0];
        if (parts.length >= 2) region = parts[1];
        if (parts.length >= 3) city = parts[2];
        if (parts.length >= 4) isp = parts.slice(3).join(" ");
      }
      return {
        ip: data.text.ip || ip,
        country,
        region,
        city,
        isp,
      };
    }
    throw new Error("tool.lu 响应格式异常");
  } catch (e: any) {
    logger.error("tool.lu/ip/ajax.html 查询失败", { ip, error: e.message });
    throw e;
  }
}

// 优先用ip38.com网页，其次用tool.lu，再用API_PROVIDERS
async function tryAllProviders(ip: string): Promise<IPInfo> {
  // SSRF防护：只允许合法公网IPv4，禁止内网/环回/保留/非法IP
  if (!isValidPublicIPv4(ip)) {
    throw new Error("非法IP，禁止查询内网/环回/保留地址");
  }
  // 先尝试ip38网页
  try {
    return await queryIp38(ip);
  } catch (_e: any) {
    logger.error("ip38.com 查询失败，尝试tool.lu", { ip });
  }
  // 再尝试tool.lu
  try {
    return await queryToolLu(ip);
  } catch (_e: any) {
    logger.error("tool.lu 查询失败，尝试备用API", { ip });
  }
  // 失败后fallback到原有API
  for (const provider of API_PROVIDERS) {
    try {
      const response = await axios.get(provider.url(ip), {
        timeout: 5000,
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        },
      });
      if (provider.validate(response.data)) {
        return provider.transform(response.data, ip);
      }
    } catch (error) {
      const axiosError = error as AxiosError;
      logger.error(`${provider.name} API查询失败: ${axiosError.message}`);
    }
  }
  throw new Error("所有API提供商都查询失败");
}

const DATA_DIR = join(process.cwd(), "data");
const IP_DATA_FILE = join(DATA_DIR, "ip-info.json");
const LOCAL_CACHE: { [key: string]: IPInfo } = {};

// MongoDB批量写入优化
interface BulkWriteItem {
  ip: string;
  country: string;
  region: string;
  city: string;
  isp: string;
  timestamp: Date;
  queryCount: number;
  lastQueried: Date;
}

const bulkWriteQueue: BulkWriteItem[] = [];
const BULK_WRITE_SIZE = 50; // 批量写入大小
const BULK_WRITE_INTERVAL = 2000; // 2秒批量写入间隔
let bulkWriteTimer: NodeJS.Timeout | null = null;
let isProcessingBulkWrite = false;

// 批量写入处理函数
async function processBulkWrite(): Promise<void> {
  if (isProcessingBulkWrite || bulkWriteQueue.length === 0) {
    return;
  }

  isProcessingBulkWrite = true;
  const itemsToWrite = bulkWriteQueue.splice(0, BULK_WRITE_SIZE);

  try {
    if (mongoose.connection.readyState === 1 && itemsToWrite.length > 0) {
      // 使用bulkWrite进行批量操作
      const bulkOps = itemsToWrite.map((item) => ({
        updateOne: {
          filter: { ip: item.ip },
          update: {
            $set: {
              country: item.country,
              region: item.region,
              city: item.city,
              isp: item.isp,
              timestamp: item.timestamp,
              lastQueried: item.lastQueried,
            },
            $inc: { queryCount: 1 },
          },
          upsert: true,
        },
      }));

      await IPInfoModel.bulkWrite(bulkOps, {
        ordered: false, // 非顺序执行，提升性能
        writeConcern: { w: 1, j: false }, // 优化写入关注点
        bypassDocumentValidation: false, // 保持文档验证
      });

      incrementStat("bulkWriteCount");

      logger.log(`批量写入${itemsToWrite.length}条IP信息到MongoDB`);

      // 更新本地缓存
      itemsToWrite.forEach((item) => {
        LOCAL_CACHE[item.ip] = {
          ip: item.ip,
          country: item.country,
          region: item.region,
          city: item.city,
          isp: item.isp,
          timestamp: item.timestamp.getTime(),
        };
      });
    }
  } catch (error) {
    logger.error("MongoDB批量写入失败:", error);
    // 失败的项目重新加入队列
    bulkWriteQueue.unshift(...itemsToWrite);
  } finally {
    isProcessingBulkWrite = false;

    // 如果还有待处理项目，继续处理
    if (bulkWriteQueue.length > 0) {
      scheduleBulkWrite();
    }
  }
}

// 调度批量写入
function scheduleBulkWrite(): void {
  if (bulkWriteTimer) {
    return;
  }

  bulkWriteTimer = setTimeout(async () => {
    bulkWriteTimer = null;
    await processBulkWrite();
  }, BULK_WRITE_INTERVAL);
}

// 添加项目到批量写入队列
function addToBulkWriteQueue(item: BulkWriteItem): void {
  bulkWriteQueue.push(item);

  // 如果队列达到批量大小，立即处理
  if (bulkWriteQueue.length >= BULK_WRITE_SIZE) {
    if (bulkWriteTimer) {
      clearTimeout(bulkWriteTimer);
      bulkWriteTimer = null;
    }
    processBulkWrite();
  } else {
    scheduleBulkWrite();
  }
}

// 初始化本地存储 - 优化版本
async function initializeLocalStorage(): Promise<void> {
  try {
    if (mongoose.connection.readyState === 1) {
      // MongoDB: 使用projection和lean()优化查询
      const all = await IPInfoModel.find(
        {},
        { ip: 1, country: 1, region: 1, city: 1, isp: 1, timestamp: 1, _id: 0 }, // 只查询需要的字段
      )
        .lean() // 返回普通JS对象，提升性能
        .limit(10000) // 限制查询数量，防止内存溢出
        .sort({ lastQueried: -1 }); // 按最近查询时间排序，优先加载热点数据

      for (const doc of all) {
        LOCAL_CACHE[doc.ip] = {
          ip: doc.ip,
          country: doc.country,
          region: doc.region,
          city: doc.city,
          isp: doc.isp,
          timestamp: doc.timestamp instanceof Date ? doc.timestamp.getTime() : doc.timestamp,
        };
      }
      logger.log(`从MongoDB加载${all.length}条IP记录到本地缓存`);
      return;
    }
  } catch (error) {
    logger.error("MongoDB 加载 IP 信息失败，降级为本地文件:", error);
  }
  // 本地文件兜底
  try {
    if (!existsSync(DATA_DIR)) {
      await mkdir(DATA_DIR, { recursive: true });
      logger.log("已创建 IP 信息数据目录");
    }
    if (!existsSync(IP_DATA_FILE)) {
      await writeFile(IP_DATA_FILE, JSON.stringify({}, null, 2));
      logger.log("已创建空的 IP 信息文件");
    } else {
      try {
        const data = await readFile(IP_DATA_FILE, "utf-8");
        Object.assign(LOCAL_CACHE, JSON.parse(data));
        logger.log(`从本地存储加载了 ${Object.keys(LOCAL_CACHE).length} 条 IP 记录`);
      } catch (error) {
        logger.error("读取 IP 信息文件失败，创建新文件:", error);
        await writeFile(IP_DATA_FILE, JSON.stringify({}, null, 2));
        Object.keys(LOCAL_CACHE).forEach((key) => delete LOCAL_CACHE[key]);
      }
    }
  } catch (error) {
    logger.error("初始化 IP 本地存储失败:", error);
  }
}

// 保存 IP 信息到本地存储 - 优化版本
async function saveIPInfoToLocal(info: IPInfo): Promise<void> {
  try {
    if (mongoose.connection.readyState === 1) {
      // 添加到批量写入队列
      const bulkItem: BulkWriteItem = {
        ip: info.ip,
        country: info.country,
        region: info.region,
        city: info.city,
        isp: info.isp,
        timestamp: new Date(),
        queryCount: 1,
        lastQueried: new Date(),
      };

      addToBulkWriteQueue(bulkItem);

      // 立即更新本地缓存
      LOCAL_CACHE[info.ip] = {
        ...info,
        timestamp: Date.now(),
      };

      return;
    }
  } catch (error) {
    logger.error("MongoDB 保存 IP 信息失败，降级为本地文件:", error);
  }
  // 本地文件兜底
  try {
    LOCAL_CACHE[info.ip] = {
      ...info,
      timestamp: Date.now(),
    };
    await writeFile(IP_DATA_FILE, JSON.stringify(LOCAL_CACHE, null, 2));
  } catch (error) {
    logger.error("保存 IP 信息到本地存储失败:", error);
  }
}

// 从本地获取 IP 信息 - 优化版本
function getIPInfoFromLocal(ip: string): IPInfo | null {
  const info = LOCAL_CACHE[ip];
  if (!info) {
    // 如果本地缓存没有，尝试从MongoDB查询
    queryIPFromMongoDB(ip);
    return null;
  }

  // 检查是否过期（1小时）
  if (info.timestamp && Date.now() - info.timestamp < CACHE_TTL) {
    return info;
  }

  // 如果过期，删除缓存
  delete LOCAL_CACHE[ip];
  return null;
}

// 异步从MongoDB查询单个IP（不阻塞主流程）
async function queryIPFromMongoDB(ip: string): Promise<void> {
  try {
    if (mongoose.connection.readyState === 1) {
      const doc = await IPInfoModel.findOne(
        { ip },
        { ip: 1, country: 1, region: 1, city: 1, isp: 1, timestamp: 1, _id: 0 },
      ).lean();

      if (doc) {
        LOCAL_CACHE[ip] = {
          ip: (doc as any).ip as string,
          country: (doc as any).country as string,
          region: (doc as any).region as string,
          city: (doc as any).city as string,
          isp: (doc as any).isp as string,
          timestamp:
            (doc as any).timestamp instanceof Date
              ? (doc as any).timestamp.getTime()
              : ((doc as any).timestamp as number),
        };

        // 更新查询统计（异步执行，不等待结果）
        IPInfoModel.updateOne(
          { ip },
          {
            $inc: { queryCount: 1 },
            $set: { lastQueried: new Date() },
          },
          { writeConcern: { w: 1, j: false } }, // 优化写入关注点
        )
          .exec()
          .catch((err) => {
            logger.log("更新IP查询统计失败:", { ip, error: err.message });
          });
      }
    }
  } catch (error) {
    // 静默处理错误，不影响主流程
    logger.log("异步MongoDB查询失败:", { ip, error: error instanceof Error ? error.message : String(error) });
  }
}

// 初始化本地存储
initializeLocalStorage();

// 优化内存缓存管理
function setIpCache(ip: string, value: { info: IPInfo; timestamp: number }) {
  // LRU缓存清理策略
  if (ipCache.size >= MAX_CACHE_SIZE) {
    // 找到最旧的条目并删除
    let oldestKey = "";
    let oldestTime = Date.now();

    for (const [key, val] of ipCache.entries()) {
      if (val.timestamp < oldestTime) {
        oldestTime = val.timestamp;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      ipCache.delete(oldestKey);
    }
  }
  ipCache.set(ip, value);
}

// 添加缓存统计和清理功能
function getCacheStats(): { size: number; hitRate: number; memoryUsage: string } {
  const memoryUsage = process.memoryUsage();
  return {
    size: ipCache.size,
    hitRate: 0, // 可以添加命中率统计
    memoryUsage: `${Math.round(memoryUsage.heapUsed / 1024 / 1024)}MB`,
  };
}

// 定期清理过期缓存
setInterval(() => {
  const now = Date.now();
  const expiredKeys: string[] = [];

  for (const [key, value] of ipCache.entries()) {
    if (now - value.timestamp > CACHE_TTL) {
      expiredKeys.push(key);
    }
  }

  expiredKeys.forEach((key) => ipCache.delete(key));

  if (expiredKeys.length > 0) {
    logger.log(`清理${expiredKeys.length}个过期IP缓存`);
  }
}, 300000); // 5分钟清理一次

// 性能监控函数
function recordResponseTime(time: number): void {
  responseTimes.push(time);
  if (responseTimes.length > MAX_RESPONSE_TIME_SAMPLES) {
    responseTimes.shift();
  }

  // 计算平均响应时间
  serviceStats.avgResponseTime = responseTimes.reduce((sum, time) => sum + time, 0) / responseTimes.length;
}

function incrementStat(statName: keyof IPServiceStats, value: number = 1): void {
  if (typeof serviceStats[statName] === "number") {
    (serviceStats[statName] as number) += value;
  }
}

// 获取性能统计信息
function getIPServiceStats(): IPServiceStats & {
  cacheHitRate: number;
  mongoHitRate: number;
  errorRate: number;
  memoryUsage: string;
  bulkQueueSize: number;
} {
  const memoryUsage = process.memoryUsage();
  return {
    ...serviceStats,
    cacheHitRate: serviceStats.totalQueries > 0 ? (serviceStats.cacheHits / serviceStats.totalQueries) * 100 : 0,
    mongoHitRate: serviceStats.totalQueries > 0 ? (serviceStats.mongoHits / serviceStats.totalQueries) * 100 : 0,
    errorRate: serviceStats.totalQueries > 0 ? (serviceStats.errors / serviceStats.totalQueries) * 100 : 0,
    memoryUsage: `${Math.round(memoryUsage.heapUsed / 1024 / 1024)}MB`,
    bulkQueueSize: bulkWriteQueue.length,
  };
}

// 重置统计信息
function resetIPServiceStats(): void {
  Object.keys(serviceStats).forEach((key) => {
    if (key !== "lastResetTime") {
      (serviceStats as any)[key] = 0;
    }
  });
  serviceStats.lastResetTime = new Date();
  responseTimes.length = 0;
  logger.log("IP服务统计信息已重置");
}

// 定期输出性能统计
setInterval(() => {
  const stats = getIPServiceStats();
  if (stats.totalQueries > 0) {
    logger.log("IP服务性能统计:", {
      总查询数: stats.totalQueries,
      缓存命中率: `${stats.cacheHitRate.toFixed(2)}%`,
      MongoDB命中率: `${stats.mongoHitRate.toFixed(2)}%`,
      错误率: `${stats.errorRate.toFixed(2)}%`,
      平均响应时间: `${stats.avgResponseTime.toFixed(2)}ms`,
      批量写入次数: stats.bulkWriteCount,
      队列大小: stats.bulkQueueSize,
      内存使用: stats.memoryUsage,
    });
  }
}, 600000); // 10分钟输出一次统计

export async function getIPInfo(ip: string): Promise<IPInfo> {
  const startTime = Date.now();
  incrementStat("totalQueries");

  try {
    if (!isValidPublicIPv4(ip)) {
      return {
        ip,
        country: "非法IP",
        region: "非法IP",
        city: "非法IP",
        isp: "非法IP",
      };
    }

    let lastError: any = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        // 处理特殊IP
        if (!ip || ip === "::1" || ip === "localhost") {
          ip = "127.0.0.1";
        }
        ip = ip.replace(/^::ffff:/, "");

        if (isPrivateIP(ip)) {
          logger.log("检测到内网IP，返回本地信息", { ip });
          return getPrivateIPInfo(ip);
        }

        // 检查内存缓存
        const cached = ipCache.get(ip);
        if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
          incrementStat("cacheHits");
          logger.log("使用内存缓存的IP信息", { ip });
          return cached.info;
        }

        // 检查本地存储/MongoDB
        const localInfo = getIPInfoFromLocal(ip);
        if (localInfo) {
          incrementStat("mongoHits");
          setIpCache(ip, { info: localInfo, timestamp: Date.now() });
          logger.log("使用本地存储的IP信息", { ip });
          return localInfo;
        }

        // 调用外部API
        logger.log("开始查询外部API获取IP信息", { ip });
        const result = await withConcurrencyLimit(async () => {
          return await withRetry(async () => {
            const info = await tryAllProviders(ip);
            incrementStat("apiCalls");
            setIpCache(ip, { info, timestamp: Date.now() });
            await saveIPInfoToLocal(info);
            logger.log("成功获取IP信息", { ip, info });
            return info;
          });
        });

        return result;
      } catch (error) {
        lastError = error;
        incrementStat("errors");
        logger.error(`IP信息查询失败（第${attempt + 1}次），2秒后重试...`, {
          ip,
          error: error instanceof Error ? error.message : String(error),
        });

        if (attempt < 2) {
          await new Promise((resolve) => setTimeout(resolve, 2000));
        }
      }
    }

    // 全部失败后兜底
    incrementStat("errors");
    logger.error("IP信息查询连续失败，返回默认信息", {
      ip,
      error: lastError instanceof Error ? lastError.message : String(lastError),
    });

    return {
      ip,
      country: "未知",
      region: "未知",
      city: "未知",
      isp: "未知",
    };
  } finally {
    // 记录响应时间
    const responseTime = Date.now() - startTime;
    recordResponseTime(responseTime);
  }
}

export function isIPAllowed(ip: string): boolean {
  const whitelist = (config as any).ip?.whitelist || [];
  if (!whitelist.length) return true;
  return whitelist.includes(ip);
}

// 优雅关闭函数
async function gracefulShutdown(): Promise<void> {
  logger.log("开始IP服务优雅关闭...");

  try {
    // 等待批量写入队列处理完成
    let waitCount = 0;
    const maxWait = 30; // 最多等待30秒

    while (bulkWriteQueue.length > 0 && waitCount < maxWait) {
      logger.log(`等待批量写入队列处理完成，剩余${bulkWriteQueue.length}项...`);
      await new Promise((resolve) => setTimeout(resolve, 1000));
      waitCount++;
    }

    // 强制处理剩余的批量写入
    if (bulkWriteQueue.length > 0) {
      logger.log(`强制处理剩余的${bulkWriteQueue.length}项批量写入...`);
      await processBulkWrite();
    }

    // 清理定时器
    if (bulkWriteTimer) {
      clearTimeout(bulkWriteTimer);
      bulkWriteTimer = null;
    }

    // 输出最终统计信息
    const finalStats = getIPServiceStats();
    logger.log("IP服务最终统计信息:", finalStats);

    logger.log("IP服务优雅关闭完成");
  } catch (error) {
    logger.error("IP服务关闭过程中发生错误:", error);
  }
}

// 监听进程退出信号
process.on("SIGTERM", gracefulShutdown);
process.on("SIGINT", gracefulShutdown);
process.on("SIGUSR2", gracefulShutdown); // nodemon重启信号

// IP数据清理函数
async function cleanupExpiredIPData(): Promise<number> {
  try {
    if (mongoose.connection.readyState !== 1) {
      logger.warn("MongoDB连接不可用，跳过IP数据清理");
      return 0;
    }

    // 清理1小时前的过期数据
    const expireTime = new Date(Date.now() - CACHE_TTL);
    const result = await IPInfoModel.deleteMany({
      timestamp: { $lt: expireTime },
    });

    // 同步清理本地缓存中的过期数据
    const now = Date.now();
    const expiredLocalKeys: string[] = [];

    for (const [key, value] of Object.entries(LOCAL_CACHE)) {
      if (value.timestamp && now - value.timestamp > CACHE_TTL) {
        expiredLocalKeys.push(key);
      }
    }

    expiredLocalKeys.forEach((key) => delete LOCAL_CACHE[key]);

    if (result.deletedCount > 0 || expiredLocalKeys.length > 0) {
      logger.info(`IP数据清理完成: MongoDB删除 ${result.deletedCount} 条, 本地缓存清理 ${expiredLocalKeys.length} 条`);
    }

    return result.deletedCount + expiredLocalKeys.length;
  } catch (error) {
    logger.error("IP数据清理失败:", error);
    throw error;
  }
}

// 强制清理所有IP数据
async function clearAllIPData(): Promise<number> {
  try {
    let totalDeleted = 0;

    // 清理MongoDB数据
    if (mongoose.connection.readyState === 1) {
      const result = await IPInfoModel.deleteMany({});
      totalDeleted += result.deletedCount;
      logger.info(`清理MongoDB IP数据: ${result.deletedCount} 条`);
    }

    // 清理本地缓存
    const localCount = Object.keys(LOCAL_CACHE).length;
    Object.keys(LOCAL_CACHE).forEach((key) => delete LOCAL_CACHE[key]);
    totalDeleted += localCount;

    // 清理内存缓存
    const memoryCount = ipCache.size;
    ipCache.clear();
    totalDeleted += memoryCount;

    logger.info(
      `IP数据全部清理完成: 总计 ${totalDeleted} 条 (MongoDB + 本地缓存 ${localCount} + 内存缓存 ${memoryCount})`,
    );
    return totalDeleted;
  } catch (error) {
    logger.error("清理所有IP数据失败:", error);
    throw error;
  }
}

// 获取IP数据统计信息
async function getIPDataStats(): Promise<{
  mongoCount: number;
  localCacheCount: number;
  memoryCacheCount: number;
  bulkQueueSize: number;
}> {
  try {
    let mongoCount = 0;

    if (mongoose.connection.readyState === 1) {
      mongoCount = await IPInfoModel.countDocuments();
    }

    return {
      mongoCount,
      localCacheCount: Object.keys(LOCAL_CACHE).length,
      memoryCacheCount: ipCache.size,
      bulkQueueSize: bulkWriteQueue.length,
    };
  } catch (error) {
    logger.error("获取IP数据统计失败:", error);
    return {
      mongoCount: 0,
      localCacheCount: Object.keys(LOCAL_CACHE).length,
      memoryCacheCount: ipCache.size,
      bulkQueueSize: bulkWriteQueue.length,
    };
  }
}

// 导出额外的工具函数
export {
  getCacheStats,
  getIPServiceStats,
  resetIPServiceStats,
  gracefulShutdown,
  cleanupExpiredIPData,
  clearAllIPData,
  getIPDataStats,
};
