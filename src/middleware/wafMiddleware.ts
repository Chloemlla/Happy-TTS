import { Request, Response, NextFunction } from 'express';
import logger from '../utils/logger';

// ========== 缓存环境变量（避免每次请求读 process.env） ==========
const WAF_DISABLED = process.env.WAF_ENABLED === 'false';

// 跳过 WAF 检查的路径
const WAF_SKIP_PATHS = new Set([
  '/api/auth/login',
  '/api/auth/register',
]);

// 跳过 WAF 检查的路径前缀
const WAF_SKIP_PREFIXES = [
  '/api/webhooks',
  '/api/data-collection',
];

// 预编译正则（模块加载时编译一次，不在请求中重复创建）
const DANGEROUS_CHARS = /[<>{}`;\\]/;
const SQL_INJECTION_PATTERN = /\b(select\s+.+\s+from|insert\s+into|update\s+.+\s+set|delete\s+from|drop\s+(table|database)|union\s+(all\s+)?select|or\s+1\s*=\s*1|and\s+1\s*=\s*1|;\s*(drop|delete|update|insert))\b/i;
const XSS_PATTERN = /<script|javascript:|on(error|load|click|mouseover)\s*=|eval\s*\(|document\.(cookie|write|location)|window\.(location|open)/i;
// URL 编码检测：只在包含 % 时才做 decode，避免无意义的 decode 开销
const HAS_PERCENT = /%/;

const MAX_PARAM_LENGTH = 2048;

// body 字段白名单
const BODY_FIELD_WHITELIST = new Set([
  'deviceSignals.navigator.userAgent',
  'deviceSignals.navigator.appVersion',
  'deviceSignals.navigator.platform',
  'deviceSignals.navigator.vendor',
  'deviceSignals.navigator.product',
  'deviceSignals.navigator.plugins',
  'deviceSignals.navigator.languages',
  'deviceSignals.navigator.doNotTrack',
  'deviceSignals.navigator.uaData',
  'deviceSignals.canvas',
  'deviceSignals.screen.o',
  'deviceSignals.timezone.tz',
  'userAgent', 'ua',
  'html', 'text', 'content', 'markdown',
  'input', 'curlCommand',
  'ipfsUploadUrl', 'ipfsUa', 'bypassUAKeyword',
  'originalContent', 'tamperContent', 'url', 'filePath', 'checksum',
  'consent.checksum', 'description', 'instructions', 'keySequence',
]);

// 白名单顶层 key 前缀集合（用于快速跳过整个子树，如 deviceSignals.*）
const WHITELIST_PREFIXES: string[] = [];
{
  const prefixes = new Set<string>();
  for (const p of BODY_FIELD_WHITELIST) {
    const dot = p.indexOf('.');
    if (dot > 0) prefixes.add(p.substring(0, dot));
  }
  WHITELIST_PREFIXES.push(...prefixes);
}

/** URL 解码（仅在含 % 时执行，最多 3 层） */
function deepDecode(str: string): string {
  if (!HAS_PERCENT.test(str)) return str;
  let decoded = str;
  for (let i = 0; i < 3; i++) {
    try {
      const next = decodeURIComponent(decoded);
      if (next === decoded) break;
      decoded = next;
    } catch { break; }
  }
  return decoded;
}

/** 检查单个字符串值是否安全 */
function isSafeValue(raw: string): boolean {
  if (raw.length > MAX_PARAM_LENGTH) return false;
  const val = deepDecode(raw);
  // 快速路径：先检查最廉价的危险字符，大部分正常值在这里就通过了
  if (!DANGEROUS_CHARS.test(val)) return true;
  // 有危险字符才做更昂贵的正则匹配
  if (SQL_INJECTION_PATTERN.test(val)) return false;
  if (XSS_PATTERN.test(val)) return false;
  // 含危险字符但不匹配攻击模式，仍然拦截
  return false;
}

/** 递归检查对象（迭代式，减少调用栈开销） */
function checkObject(obj: any): string | null {
  // 用栈代替递归，避免深层嵌套时的函数调用开销
  const stack: Array<{ val: any; path: string; depth: number }> = [
    { val: obj, path: '', depth: 0 },
  ];

  while (stack.length > 0) {
    const { val, path, depth } = stack.pop()!;
    if (depth > 10 || val === null || val === undefined) continue;

    // 白名单字段跳过
    if (path && BODY_FIELD_WHITELIST.has(path)) continue;

    if (typeof val === 'string') {
      if (!isSafeValue(val)) return path || 'value';
      continue;
    }

    if (typeof val !== 'object') continue;

    if (Array.isArray(val)) {
      for (let i = val.length - 1; i >= 0; i--) {
        stack.push({ val: val[i], path: `${path}[${i}]`, depth: depth + 1 });
      }
    } else {
      const entries = Object.entries(val);
      for (let i = entries.length - 1; i >= 0; i--) {
        const [key, v] = entries[i];
        const childPath = path ? `${path}.${key}` : key;
        // 顶层白名单 key 且无嵌套需要检查时直接跳过整棵子树
        if (!path && BODY_FIELD_WHITELIST.has(key)) continue;
        stack.push({ val: v, path: childPath, depth: depth + 1 });
      }
    }
  }

  return null;
}

/**
 * WAF 中间件（性能优化版）
 * - 环境变量缓存避免每次读 process.env
 * - 快速路径跳过（GET/HEAD/OPTIONS 无 body 检查）
 * - 迭代式 body 检查替代递归
 * - 仅在含 % 时做 URL decode
 */
export function wafMiddleware(req: Request, res: Response, next: NextFunction) {
  if (WAF_DISABLED) return next();

  const p = req.path;
  if (p.charCodeAt(0) !== 47 || p.charCodeAt(1) !== 97 || p.charCodeAt(4) !== 47) return next(); // 快速判断非 /api/
  if (!p.startsWith('/api/')) return next();

  if (WAF_SKIP_PATHS.has(p)) return next();
  for (let i = 0; i < WAF_SKIP_PREFIXES.length; i++) {
    if (p.startsWith(WAF_SKIP_PREFIXES[i])) return next();
  }

  // GET/HEAD/OPTIONS 通常无 body，只检查 query
  const method = req.method;
  const hasBody = method === 'POST' || method === 'PUT' || method === 'PATCH';

  // 检查 query 参数
  const query = req.query;
  if (query) {
    const keys = Object.keys(query);
    for (let i = 0; i < keys.length; i++) {
      const val = query[keys[i]];
      if (typeof val === 'string' && !isSafeValue(val)) {
        logger.warn(`[WAF] 拦截可疑 query 参数: ${keys[i]}`, { ip: req.ip, path: p });
        return res.status(400).json({ error: '参数包含非法字符' });
      }
    }
  }

  // 检查 URL 路径参数
  const params = req.params;
  if (params) {
    const keys = Object.keys(params);
    for (let i = 0; i < keys.length; i++) {
      const val = params[keys[i]];
      if (typeof val === 'string' && !isSafeValue(val)) {
        logger.warn(`[WAF] 拦截可疑 path 参数: ${keys[i]}`, { ip: req.ip, path: p });
        return res.status(400).json({ error: '参数包含非法字符' });
      }
    }
  }

  // 检查 body
  if (hasBody && req.body && typeof req.body === 'object') {
    const badField = checkObject(req.body);
    if (badField) {
      logger.warn(`[WAF] 拦截可疑 body 字段: ${badField}`, { ip: req.ip, path: p, method });
      return res.status(400).json({ error: '请求内容包含非法字符' });
    }
  }

  next();
}
