import { Request, Response, NextFunction } from 'express';
import logger from '../utils/logger';

// 跳过 WAF 检查的路径（登录/注册的 body 可能含特殊字符）
const WAF_SKIP_PATHS = new Set([
  '/api/auth/login',
  '/api/auth/register',
]);

// 跳过 WAF 检查的路径前缀（webhook 等需要原始 body 的路由）
const WAF_SKIP_PREFIXES = [
  '/api/webhooks',
  '/api/data-collection',
];

// 危险字符正则
const DANGEROUS_CHARS = /[<>{}`;\\]/;

// SQL 注入 + XSS 关键词（用 \b 词边界，但只在可疑上下文中匹配）
// 使用组合模式减少误报：关键词后面跟空格+常见 SQL 结构才算命中
const SQL_INJECTION_PATTERN = /\b(select\s+.+\s+from|insert\s+into|update\s+.+\s+set|delete\s+from|drop\s+(table|database)|union\s+(all\s+)?select|or\s+1\s*=\s*1|and\s+1\s*=\s*1|;\s*(drop|delete|update|insert))\b/i;

// XSS 关键词（更精确：匹配实际攻击载荷模式而非单个单词）
const XSS_PATTERN = /<script|javascript:|on(error|load|click|mouseover)\s*=|eval\s*\(|document\.(cookie|write|location)|window\.(location|open)/i;

// 最大参数长度
const MAX_PARAM_LENGTH = 2048;

/**
 * 对字符串做 URL 解码（多层），防止 %3Cscript%3E 等编码绕过
 * 最多解码 3 层，避免无限循环
 */
function deepDecode(str: string, maxDepth = 3): string {
  let decoded = str;
  for (let i = 0; i < maxDepth; i++) {
    try {
      const next = decodeURIComponent(decoded);
      if (next === decoded) break; // 没有更多编码层
      decoded = next;
    } catch {
      break; // 非法编码序列，停止解码
    }
  }
  return decoded;
}

/**
 * 检查单个字符串值是否安全
 * 返回 true 表示安全，false 表示可疑
 */
function isSafeValue(raw: string): boolean {
  if (typeof raw !== 'string') return true;
  if (raw.length > MAX_PARAM_LENGTH) return false;

  // 先做 URL 解码再检查
  const val = deepDecode(raw);

  // 检查危险字符
  if (DANGEROUS_CHARS.test(val)) return false;

  // 检查 SQL 注入模式
  if (SQL_INJECTION_PATTERN.test(val)) return false;

  // 检查 XSS 模式
  if (XSS_PATTERN.test(val)) return false;

  return true;
}

/**
 * 递归检查对象中所有字符串值
 * 用于检查嵌套的 req.body
 */
function checkObject(obj: any, path = '', depth = 0): string | null {
  if (depth > 10) return null; // 防止深层嵌套 DoS
  if (obj === null || obj === undefined) return null;

  if (typeof obj === 'string') {
    if (!isSafeValue(obj)) return path || 'value';
    return null;
  }

  if (Array.isArray(obj)) {
    for (let i = 0; i < obj.length; i++) {
      const result = checkObject(obj[i], `${path}[${i}]`, depth + 1);
      if (result) return result;
    }
    return null;
  }

  if (typeof obj === 'object') {
    for (const [key, val] of Object.entries(obj)) {
      const result = checkObject(val, path ? `${path}.${key}` : key, depth + 1);
      if (result) return result;
    }
  }

  return null;
}

/**
 * WAF 中间件
 * 检查 query、params、body 中的参数，拦截 SQL 注入和 XSS 攻击载荷
 */
export function wafMiddleware(req: Request, res: Response, next: NextFunction) {
  // 非 API 路径跳过
  if (!req.path.startsWith('/api/')) return next();

  // 白名单路径跳过
  if (WAF_SKIP_PATHS.has(req.path)) return next();
  if (WAF_SKIP_PREFIXES.some(prefix => req.path.startsWith(prefix))) return next();

  // 检查 query 参数
  for (const [key, val] of Object.entries(req.query)) {
    if (typeof val === 'string' && !isSafeValue(val)) {
      logger.warn(`[WAF] 拦截可疑 query 参数: ${key}`, { ip: req.ip, path: req.path });
      return res.status(400).json({ error: '参数包含非法字符' });
    }
  }

  // 检查 URL 路径参数
  if (req.params) {
    for (const [key, val] of Object.entries(req.params)) {
      if (typeof val === 'string' && !isSafeValue(val)) {
        logger.warn(`[WAF] 拦截可疑 path 参数: ${key}`, { ip: req.ip, path: req.path });
        return res.status(400).json({ error: '参数包含非法字符' });
      }
    }
  }

  // 检查 body（POST/PUT/PATCH）
  if (req.body && typeof req.body === 'object') {
    const badField = checkObject(req.body);
    if (badField) {
      logger.warn(`[WAF] 拦截可疑 body 字段: ${badField}`, { ip: req.ip, path: req.path, method: req.method });
      return res.status(400).json({ error: '请求内容包含非法字符' });
    }
  }

  next();
}
