import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { getNonceStore } from '../services/nonceStore';
import logger from '../utils/logger';

/**
 * 防重放中间件
 *
 * 客户端需在请求头中携带：
 *   x-timestamp  — 毫秒级时间戳
 *   x-nonce      — 一次性随机字符串（≥16 字符）
 *   x-signature  — HMAC-SHA256(timestamp + nonce + body, secret)
 *
 * 服务端校验：
 *   1. 时间戳偏差不超过 maxDriftMs（默认 5 分钟）
 *   2. nonce 未被使用过（NonceStore 去重）
 *   3. 签名正确
 */

const SIGN_SECRET = process.env.SIGN_SECRET_KEY || 'w=NKYzE?jZHbqmG1k4m6B!.Yp9t5)HY@LsMnN~UK9i';

export interface ReplayProtectionOptions {
  /** 允许的时间戳偏差，毫秒，默认 5 分钟 */
  maxDriftMs?: number;
  /** nonce 最小长度，默认 16 */
  minNonceLength?: number;
  /** 是否在开发环境跳过校验，默认 true */
  skipInDev?: boolean;
}

export function replayProtection(options: ReplayProtectionOptions = {}) {
  const {
    maxDriftMs = 5 * 60 * 1000,
    minNonceLength = 16,
    skipInDev = true,
  } = options;

  const nonceStore = getNonceStore({ ttlMs: maxDriftMs });

  return (req: Request, res: Response, next: NextFunction) => {
    // 开发环境可选跳过
    if (skipInDev && process.env.NODE_ENV === 'development') {
      return next();
    }

    const timestamp = req.headers['x-timestamp'] as string | undefined;
    const nonce = req.headers['x-nonce'] as string | undefined;
    const signature = req.headers['x-signature'] as string | undefined;

    // --- 1. 参数完整性 ---
    if (!timestamp || !nonce || !signature) {
      logger.warn('[ReplayProtection] 缺少防重放头', {
        ip: req.ip,
        path: req.path,
        hasTimestamp: !!timestamp,
        hasNonce: !!nonce,
        hasSignature: !!signature,
      });
      return res.status(400).json({ error: '缺少请求签名参数 (x-timestamp / x-nonce / x-signature)' });
    }

    // --- 2. 时间戳校验 ---
    const ts = Number(timestamp);
    if (!Number.isFinite(ts)) {
      return res.status(400).json({ error: '无效的时间戳格式' });
    }

    const drift = Math.abs(Date.now() - ts);
    if (drift > maxDriftMs) {
      logger.warn('[ReplayProtection] 时间戳偏差过大', {
        ip: req.ip,
        path: req.path,
        drift,
        maxDriftMs,
      });
      return res.status(403).json({ error: '请求已过期，请检查系统时间' });
    }

    // --- 3. nonce 格式 & 去重 ---
    if (nonce.length < minNonceLength) {
      return res.status(400).json({ error: `nonce 长度不足（最少 ${minNonceLength} 字符）` });
    }

    const consumeResult = nonceStore.consume(nonce);
    if (!consumeResult.success) {
      // nonce_not_found 说明是首次出现，先存储再消费
      if (consumeResult.reason === 'nonce_not_found') {
        nonceStore.storeNonce(nonce, req.ip, req.headers['user-agent']);
        const retry = nonceStore.consume(nonce);
        if (!retry.success) {
          logger.warn('[ReplayProtection] nonce 消费失败', {
            ip: req.ip,
            path: req.path,
            reason: retry.reason,
          });
          return res.status(403).json({ error: '请求签名验证失败 (nonce)' });
        }
      } else {
        // nonce_already_consumed / nonce_expired
        logger.warn('[ReplayProtection] 重放攻击检测', {
          ip: req.ip,
          path: req.path,
          reason: consumeResult.reason,
        });
        return res.status(403).json({ error: '重复请求已被拒绝 (replay detected)' });
      }
    }

    // --- 4. 签名校验 ---
    // payload = timestamp + nonce + rawBody(JSON.stringify for objects, '' for empty)
    const bodyStr = req.body && Object.keys(req.body).length > 0
      ? JSON.stringify(req.body)
      : '';
    const payload = `${timestamp}${nonce}${bodyStr}`;
    const expected = crypto.createHmac('sha256', SIGN_SECRET).update(payload).digest('hex');

    // 长度不一致或非法 hex 直接拒绝，避免 timingSafeEqual 抛异常
    if (signature.length !== expected.length || !/^[0-9a-f]+$/i.test(signature)) {
      logger.warn('[ReplayProtection] 签名格式无效', { ip: req.ip, path: req.path });
      return res.status(403).json({ error: '请求签名验证失败' });
    }

    if (!crypto.timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(signature, 'hex'))) {
      logger.warn('[ReplayProtection] 签名不匹配', {
        ip: req.ip,
        path: req.path,
      });
      return res.status(403).json({ error: '请求签名验证失败' });
    }

    next();
  };
}
