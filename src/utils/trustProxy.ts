import type { IncomingMessage } from "node:http";
import type { Request } from "express";
import proxyaddr from "proxy-addr";
import { extractRealIP, isValidIP } from "./ipUtils";

/** 可直接交给 Express `app.set("trust proxy", ...)` 的设置值。 */
export type TrustProxySetting = boolean | number | string | string[];

type TrustFunction = (address: string, index: number) => boolean;

/** 信任全部代理：取 X-Forwarded-For 最左侧（最早写入）的地址。 */
const TRUST_ALL: TrustFunction = () => true;
/** 不信任任何代理：只认 TCP 对端地址。 */
const TRUST_NONE: TrustFunction = () => false;

/**
 * 解析 TRUST_PROXY 环境变量。
 *
 * 默认不信任任何代理：trust proxy 未显式配置时 req.ip === socket.remoteAddress，客户端无法
 * 通过伪造 X-Forwarded-For 控制 req.ip（影响 IP 封禁、限流、用量统计）。若部署在反向代理
 * 之后，请显式设置 TRUST_PROXY（如 TRUST_PROXY=1 表示信任一跳）。
 */
export function parseTrustProxySetting(): TrustProxySetting {
  const raw = process.env.TRUST_PROXY?.trim();
  if (!raw) {
    if (process.env.NODE_ENV === "production") {
      // 在模块顶层避免重复输出
      const key = "TRUST_PROXY_UNSET_WARNED";
      if (!(globalThis as any)[key]) {
        (globalThis as any)[key] = true;
        console.warn(
          "[trustProxy] WARNING: TRUST_PROXY is not set, defaulting to no trust. " +
            "If this server runs behind a reverse proxy, set TRUST_PROXY explicitly so req.ip reflects the real client.",
        );
      }
    }
    return false;
  }

  const normalized = raw.toLowerCase();
  if (["false", "0", "no", "off"].includes(normalized)) {
    return false;
  }
  if (["true", "yes", "on"].includes(normalized)) {
    return true;
  }

  const numeric = Number(raw);
  if (Number.isInteger(numeric) && numeric >= 0) {
    return numeric;
  }

  if (raw.includes(",")) {
    return raw
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean);
  }

  return raw;
}

/**
 * 编译成 proxy-addr 的 trust 判定函数，语义与 Express 内置的 compileTrust 一致：
 * true = 信任全部；数字 = 只信任最靠近本机的 N 跳；字符串/数组 = 信任这些 CIDR；false = 全不信任。
 */
function compileTrust(setting: TrustProxySetting): TrustFunction {
  if (typeof setting === "boolean") return setting ? TRUST_ALL : TRUST_NONE;
  if (typeof setting === "number") return (_address, index) => index < setting;
  const subnets = Array.isArray(setting) ? setting : [setting];
  return subnets.length > 0 ? proxyaddr.compile(subnets) : TRUST_NONE;
}

let cachedRawSetting: string | null = null;
let cachedTrust: TrustFunction = TRUST_NONE;

/** 按原始文本缓存编译结果：CIDR 列表的编译成本不该摊到每次升级请求上。 */
function currentTrustFunction(): TrustFunction {
  const raw = process.env.TRUST_PROXY?.trim() ?? "";
  if (raw !== cachedRawSetting) {
    cachedRawSetting = raw;
    cachedTrust = compileTrust(parseTrustProxySetting());
  }
  return cachedTrust;
}

/**
 * 解析 WS 升级请求（裸 IncomingMessage）的客户端地址，并把结果写回 req.ip。
 *
 * 升级路径在 Express 中间件栈之外，没有 req.ip，必须自己用 proxy-addr 走一遍代理链；
 * 信任策略与 HTTP 侧取自同一份 TRUST_PROXY，因此两侧口径一致。写回 req.ip 是关键：
 * 下游 extractRealIP / collectObservedAddresses（探测回显、审计）都先读 req.ip，写回后
 * 升级路径与 HTTP 路径看到的是同一个地址，不再一个是真实客户端、另一个是反代或容器网关的
 * 内网地址（Docker 桥接网关 172.18.0.1）——封禁、限流、同 IP 并发上限也才按真实客户端计数。
 *
 * 信任策略本身的安全含义与 HTTP 侧完全相同（HTTP 侧一直如此）：TRUST_PROXY=true 采信
 * X-Forwarded-For 最左侧的值，反代若只追加而不覆写该头，客户端就能自带伪造值绕过封禁/限流；
 * 用跳数（如 TRUST_PROXY=1）只采信反代自己写入的那一跳，可避免伪造。
 */
export function resolveUpgradeClientIp(req: IncomingMessage): string {
  const resolved = proxyaddr(req, currentTrustFunction());
  if (typeof resolved === "string" && isValidIP(resolved)) {
    (req as IncomingMessage & { ip?: string }).ip = resolved.replace(/^::ffff:/i, "");
  }

  // 与 HTTP 侧同一口径：优先 req.ip（上面已写回），其次 cf-connecting-ip，最后 socket。
  return extractRealIP(req as Request) ?? "unknown";
}
