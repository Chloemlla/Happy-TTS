import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { isIP } from "node:net";
import { join } from "node:path";
import axios, { type AxiosError } from "axios";
import { logger } from "./logger";
import { mongoose } from "./mongoService";
import { registerShutdownStep, installShutdownHandlers } from "./shutdown";

const IP_WHITELIST = (process.env.IP_WHITELIST || "").split(",").filter(Boolean);

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

const MAX_RESPONSE_TIME_SAMPLES = 100;
const responseTimes: number[] = new Array(MAX_RESPONSE_TIME_SAMPLES);
let responseTimeIndex = 0;
let responseTimeCount = 0;
let responseTimeSum = 0;

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
const CONCURRENCY_QUEUE_LIMIT = 200; // G5-10: 并发排队上限，超出直接走兜底而非无上限忙等
let currentRequests = 0;
let waitingRequests = 0;

// G5-10: 外部归属地查询总预算（毫秒），超时立即返回"未知"兜底，不再三层重试叠乘。
const TOTAL_QUERY_BUDGET_MS = 1500;

// G5-10: provider 熔断——连续失败冷却 N 分钟不再尝试。
const PROVIDER_COOLDOWN_MS = 5 * 60 * 1000;
const providerFailureUntil = new Map<string, number>();

function isProviderInCooldown(name: string): boolean {
  const until = providerFailureUntil.get(name);
  return until !== undefined && until > Date.now();
}

function markProviderFailure(name: string): void {
  providerFailureUntil.set(name, Date.now() + PROVIDER_COOLDOWN_MS);
}

async function withTotalBudget<T>(promise: Promise<T>, fallback: T): Promise<T> {
  let timer: NodeJS.Timeout | null = null;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("IP 查询总预算超时")), TOTAL_QUERY_BUDGET_MS);
    timer.unref?.();
  });
  try {
    return await Promise.race([promise, timeout]);
  } catch {
    return fallback;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

// API提供商列表（G5-35: 只保留 https，ip-api.com 免费版不支持 HTTPS 已移除，避免访客 IP 明文外发）
const API_PROVIDERS: APIProvider[] = [
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

// 并发控制（G5-10: 有界等待——排队超限直接抛错走兜底，不做无上限忙等）
async function withConcurrencyLimit<T>(fn: () => Promise<T>): Promise<T> {
  if (currentRequests >= MAX_CONCURRENT_REQUESTS) {
    if (waitingRequests >= CONCURRENCY_QUEUE_LIMIT) {
      throw new Error("IP 查询并发排队超限");
    }
    waitingRequests++;
    try {
      while (currentRequests >= MAX_CONCURRENT_REQUESTS) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    } finally {
      waitingRequests--;
    }
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
    ip.startsWith("169.254.") || // 云元数据/链路本地
    (ip.startsWith("100.64.") && parts[1] >= 64 && parts[1] <= 127) || // CGNAT
    ip.startsWith("192.0.2.") || // TEST-NET-1
    parts[0] >= 224 || // 224.0.0.0/4 组播 + 240.0.0.0/4 保留
    ip === "0.0.0.0" ||
    ip === "255.255.255.255"
  )
    return false;
  return true;
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
      // G5-35: 响应体大小上限 + 禁重定向，防第三方返回超大响应/被劫持跳转。
      maxContentLength: 256 * 1024,
      maxBodyLength: 256 * 1024,
      maxRedirects: 0,
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

// 依次尝试 tool.lu 与 API_PROVIDERS（G5-35: 已移除 HTML 抓取分支 queryIp38）
async function tryAllProviders(ip: string): Promise<IPInfo> {
  // SSRF防护：只允许合法公网IPv4，禁止内网/环回/保留/非法IP
  if (!isValidPublicIPv4(ip)) {
    throw new Error("非法IP，禁止查询内网/环回/保留地址");
  }
  // 先尝试tool.lu
  if (!isProviderInCooldown("tool.lu")) {
    try {
      return await queryToolLu(ip);
    } catch (_e: any) {
      markProviderFailure("tool.lu");
      logger.error("tool.lu 查询失败，尝试备用API", { ip });
    }
  }
  // 失败后fallback到 API_PROVIDERS
  for (const provider of API_PROVIDERS) {
    if (isProviderInCooldown(provider.name)) {
      continue;
    }
    try {
      const response = await axios.get(provider.url(ip), {
        timeout: 5000,
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        },
        // G5-35: 响应体大小上限 + 禁重定向。
        maxContentLength: 256 * 1024,
        maxBodyLength: 256 * 1024,
        maxRedirects: 0,
      });
      if (provider.validate(response.data)) {
        return provider.transform(response.data, ip);
      }
    } catch (error) {
      markProviderFailure(provider.name);
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
const BULK_WRITE_MAX_QUEUE = 2000; // G5-11: 队列上界，超限丢弃最旧
let bulkWriteTimer: NodeJS.Timeout | null = null;
let isProcessingBulkWrite = false;
let bulkWriteBackoffMs = BULK_WRITE_INTERVAL; // G5-11: 失败指数退避

// G5-11: LOCAL_CACHE 加上界（5000），避免 IP 洪泛下线性增长 OOM。
const MAX_LOCAL_CACHE_SIZE = 5000;
const localCacheKeyOrder: string[] = [];

function setLocalCacheEntry(ip: string, info: IPInfo): void {
  if (!(ip in LOCAL_CACHE)) {
    localCacheKeyOrder.push(ip);
  }
  LOCAL_CACHE[ip] = info;
  if (localCacheKeyOrder.length > MAX_LOCAL_CACHE_SIZE) {
    const oldest = localCacheKeyOrder.shift();
    if (oldest !== undefined) delete LOCAL_CACHE[oldest];
  }
}

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
      bulkWriteBackoffMs = BULK_WRITE_INTERVAL;

      logger.log(`批量写入${itemsToWrite.length}条IP信息到MongoDB`);

      // 更新本地缓存
      itemsToWrite.forEach((item) => {
        setLocalCacheEntry(item.ip, {
          ip: item.ip,
          country: item.country,
          region: item.region,
          city: item.city,
          isp: item.isp,
          timestamp: item.timestamp.getTime(),
        });
      });
    }
  } catch (error) {
    logger.error("MongoDB批量写入失败:", error);
    // G5-11: 回灌改为 concat 避免 spread 撞参数上限；队列设上限，超限丢弃最旧并计数告警。
    bulkWriteBackoffMs = Math.min(bulkWriteBackoffMs * 2, 30_000);
    bulkWriteQueue.splice(0, 0, ...itemsToWrite);
    if (bulkWriteQueue.length > BULK_WRITE_MAX_QUEUE) {
      const dropped = bulkWriteQueue.length - BULK_WRITE_MAX_QUEUE;
      bulkWriteQueue.splice(0, dropped);
      logger.warn("[IPInfo] 批量写入队列超限，丢弃最旧 %d 条", dropped);
    }
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
  }, bulkWriteBackoffMs);
}

// 添加项目到批量写入队列
function addToBulkWriteQueue(item: BulkWriteItem): void {
  bulkWriteQueue.push(item);
  if (bulkWriteQueue.length > BULK_WRITE_MAX_QUEUE) {
    const dropped = bulkWriteQueue.length - BULK_WRITE_MAX_QUEUE;
    bulkWriteQueue.splice(0, dropped);
    logger.warn("[IPInfo] 批量写入队列超限，丢弃最旧 %d 条", dropped);
  }

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
        setLocalCacheEntry(doc.ip, {
          ip: doc.ip,
          country: doc.country,
          region: doc.region,
          city: doc.city,
          isp: doc.isp,
          timestamp: doc.timestamp instanceof Date ? doc.timestamp.getTime() : doc.timestamp,
        });
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
      setLocalCacheEntry(info.ip, {
        ...info,
        timestamp: Date.now(),
      });

      return;
    }
  } catch (error) {
    logger.error("MongoDB 保存 IP 信息失败，降级为本地文件:", error);
  }
  // 本地文件兜底
  try {
    setLocalCacheEntry(info.ip, {
      ...info,
      timestamp: Date.now(),
    });
    await writeFile(IP_DATA_FILE, JSON.stringify(LOCAL_CACHE, null, 2));
  } catch (error) {
    logger.error("保存 IP 信息到本地存储失败:", error);
  }
}

// 从本地获取 IP 信息 - 优化版本
async function getIPInfoFromLocal(ip: string): Promise<IPInfo | null> {
  const info: IPInfo | null = LOCAL_CACHE[ip] || (await queryIPFromMongoDB(ip));
  if (!info) {
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

// 从MongoDB查询单个IP，命中时回填本地缓存
async function queryIPFromMongoDB(ip: string): Promise<IPInfo | null> {
  try {
    if (mongoose.connection.readyState === 1) {
      const doc = await IPInfoModel.findOne(
        { ip },
        { ip: 1, country: 1, region: 1, city: 1, isp: 1, timestamp: 1, _id: 0 },
      ).lean();

      if (doc) {
        const info: IPInfo = {
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
        setLocalCacheEntry(ip, info);

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

        return info;
      }
    }
  } catch (error) {
    // 静默处理错误，不影响主流程
    logger.log("异步MongoDB查询失败:", { ip, error: error instanceof Error ? error.message : String(error) });
  }
  return null;
}

// 初始化本地存储
initializeLocalStorage();

// 优化内存缓存管理
function setIpCache(ip: string, value: { info: IPInfo; timestamp: number }) {
  // Map保持插入顺序，写入前先delete使队首恒为最久未刷新的条目，等价于原O(n)扫描的淘汰目标
  ipCache.delete(ip);
  if (ipCache.size >= MAX_CACHE_SIZE) {
    const oldestKey = ipCache.keys().next().value;
    if (oldestKey !== undefined) {
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
const cacheCleanupInterval = setInterval(() => {
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
cacheCleanupInterval.unref?.();

// 性能监控函数
function recordResponseTime(time: number): void {
  // 定长环形缓冲区 + running sum，避免每次查询都shift和全量reduce
  if (responseTimeCount === MAX_RESPONSE_TIME_SAMPLES) {
    responseTimeSum -= responseTimes[responseTimeIndex];
  } else {
    responseTimeCount++;
  }
  responseTimes[responseTimeIndex] = time;
  responseTimeSum += time;
  responseTimeIndex = (responseTimeIndex + 1) % MAX_RESPONSE_TIME_SAMPLES;

  serviceStats.avgResponseTime = responseTimeSum / responseTimeCount;
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
  responseTimeIndex = 0;
  responseTimeCount = 0;
  responseTimeSum = 0;
  logger.log("IP服务统计信息已重置");
}

// 定期输出性能统计
const statsInterval = setInterval(() => {
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
statsInterval.unref?.();

// 同IP并发查询的单飞去重：覆盖MongoDB回落与外部抓取整条冷路径
const inFlightLookups = new Map<string, Promise<IPInfo>>();

function resolveIPInfoDeduped(ip: string): Promise<IPInfo> {
  const existing = inFlightLookups.get(ip);
  if (existing) {
    return existing;
  }

  const task = (async () => {
    // 检查本地存储/MongoDB
    const localInfo = await getIPInfoFromLocal(ip);
    if (localInfo) {
      incrementStat("mongoHits");
      setIpCache(ip, { info: localInfo, timestamp: Date.now() });
      logger.log("使用本地存储的IP信息", { ip });
      return localInfo;
    }

    // 调用外部API（G5-10: 去掉 withRetry 嵌套重试，由 getIPInfo 的总预算兜底）
    logger.log("开始查询外部API获取IP信息", { ip });
    return await withConcurrencyLimit(async () => {
      const info = await tryAllProviders(ip);
      incrementStat("apiCalls");
      setIpCache(ip, { info, timestamp: Date.now() });
      await saveIPInfoToLocal(info);
      logger.log("成功获取IP信息", { ip, info });
      return info;
    });
  })().finally(() => {
    inFlightLookups.delete(ip);
  });

  inFlightLookups.set(ip, task);
  return task;
}

// G5-10: 短 TTL 负缓存，避免失败 IP 反复打外部查询。
const NEGATIVE_CACHE_TTL_MS = 60_000;
const negativeCache = new Map<string, number>();

export async function getIPInfo(ip: string): Promise<IPInfo> {
  const startTime = Date.now();
  incrementStat("totalQueries");

  try {
    // G5-16: 先归一化（::ffff: 剥离、::1→127.0.0.1）再校验，双栈部署下 IPv6 客户端不再恒为"非法IP"。
    let normalizedIp = (ip || "").trim();
    if (!normalizedIp || normalizedIp === "::1" || normalizedIp === "localhost") {
      normalizedIp = "127.0.0.1";
    }
    normalizedIp = normalizedIp.replace(/^::ffff:/i, "");

    const ipType = isIP(normalizedIp);
    if (ipType === 0) {
      return {
        ip: normalizedIp,
        country: "非法IP",
        region: "非法IP",
        city: "非法IP",
        isp: "非法IP",
      };
    }
    // 先判内网（IPv4/IPv6 都覆盖），再区分公网 IPv6 / 公网 IPv4。
    if (isPrivateIP(normalizedIp)) {
      logger.log("检测到内网IP，返回本地信息", { ip: normalizedIp });
      return getPrivateIPInfo(normalizedIp);
    }
    // G5-16: 公网 IPv6 现有 provider 不支持，明确返回"未知"而不是"非法IP"。
    if (ipType === 6) {
      return {
        ip: normalizedIp,
        country: "未知",
        region: "未知",
        city: "未知",
        isp: "未知",
      };
    }
    if (!isValidPublicIPv4(normalizedIp)) {
      return {
        ip: normalizedIp,
        country: "非法IP",
        region: "非法IP",
        city: "非法IP",
        isp: "非法IP",
      };
    }

    // 检查内存缓存（含后台任务成功写入的正向结果）
    const cached = ipCache.get(normalizedIp);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      incrementStat("cacheHits");
      logger.log("使用内存缓存的IP信息", { ip: normalizedIp });
      return cached.info;
    }

    // 负缓存命中
    const negExpire = negativeCache.get(normalizedIp);
    if (negExpire && negExpire > Date.now()) {
      return {
        ip: normalizedIp,
        country: "未知",
        region: "未知",
        city: "未知",
        isp: "未知",
      };
    }

    // G5-10: 单次查询 + 总预算，失败立即返回"未知"并短 TTL 负缓存，不再三层嵌套重试。
    const info = await withTotalBudget<IPInfo | null>(resolveIPInfoDeduped(normalizedIp), null);
    if (info) {
      return info;
    }
    incrementStat("errors");
    if (negativeCache.size > 5000) {
      const now = Date.now();
      for (const [negKey, exp] of negativeCache) {
        if (exp <= now) negativeCache.delete(negKey);
      }
    }
    negativeCache.set(normalizedIp, Date.now() + NEGATIVE_CACHE_TTL_MS);
    return {
      ip: normalizedIp,
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
  if (!IP_WHITELIST.length) return true;
  return IP_WHITELIST.includes(ip);
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

// G5-21: 不再自行注册信号处理器（那会让进程永远不退出），交给统一关闭编排。
registerShutdownStep("ip-graceful-shutdown", gracefulShutdown);
installShutdownHandlers();

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
  cleanupExpiredIPData,
  clearAllIPData,
  getCacheStats,
  getIPDataStats,
  getIPServiceStats,
  gracefulShutdown,
  resetIPServiceStats,
};
