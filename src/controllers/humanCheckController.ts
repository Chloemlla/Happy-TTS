import { Request, Response } from 'express';
import SmartHumanCheckService from '../services/smartHumanCheckService';
import logger from '../utils/logger';
import crypto from 'crypto';
import { connectMongo, mongoose } from '../services/mongoService';
import { isIP } from 'net';

const service = new SmartHumanCheckService();

export class SmartHumanCheckController {
  /** 获取/复用 SHC 溯源模型 */
  private static getTraceModel() {
    const schema = new mongoose.Schema({
      traceId: { type: String, required: true, unique: true },
      time: { type: Date, default: Date.now },
      ip: String,
      ua: String,
      success: Boolean,
      reason: String,
      errorCode: String,
      errorMessage: String,
      score: Number,
      thresholdBase: Number,
      thresholdUsed: Number,
      passRateIp: Number,
      passRateUa: Number,
      policy: String,
      riskLevel: String,
      riskScore: Number,
      riskReasons: [String],
      challengeRequired: Boolean
    }, { collection: 'shc_traces', timestamps: false });
    // @ts-ignore
    return mongoose.models.SHCTrace || mongoose.model('SHCTrace', schema);
  }
  /**
   * GET /nonce - 发放一次性 nonce（短时有效）
   */
  static async issueNonce(req: Request, res: Response) {
    try {
      const clientIp = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.ip;
      const userAgent = req.headers['user-agent'];

      const result = service.issueNonce(clientIp, userAgent);

      if (result.success) {
        res.json(result);
      } else {
        // 根据错误类型返回适当的 HTTP 状态码
        const statusCode = result.retryable ? 503 : 500;
        res.status(statusCode).json(result);
      }
    } catch (e) {
      logger.error('[SmartHumanCheck] issueNonce error', e);
      res.status(500).json({
        success: false,
        error: 'server_error',
        errorCode: 'SERVER_ERROR',
        errorMessage: '服务器内部错误',
        retryable: true,
        timestamp: Date.now()
      });
    }
  }

  /**
   * GET /stats - 获取 nonce 存储统计信息（管理端点）
   */
  static async getStats(req: Request, res: Response) {
    try {
      const stats = service.getStats();
      res.json({
        success: true,
        stats,
        timestamp: Date.now()
      });
    } catch (e) {
      logger.error('[SmartHumanCheck] getStats error', e);
      res.status(500).json({
        success: false,
        error: 'server_error',
        errorCode: 'SERVER_ERROR',
        errorMessage: '服务器内部错误',
        retryable: true,
        timestamp: Date.now()
      });
    }
  }

  /**
   * POST /verify - 验证前端 token
   * body: { token: string }
   */
  static async verifyToken(req: Request, res: Response) {
    try {
      const traceId = crypto.randomBytes(12).toString('hex');
      const token = req.body?.token as string;
      if (!token || typeof token !== 'string') {
        return res.status(400).json({
          success: false,
          error: 'missing_token',
          errorCode: 'MISSING_TOKEN',
          errorMessage: '缺少验证令牌',
          retryable: false,
          timestamp: Date.now(),
          traceId
        });
      }

      const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.ip;
      const ua = req.headers['user-agent'] as string | undefined;
      const result = service.verifyToken(token, ip);
      const withTrace = { ...result, traceId };

      // 持久化溯源信息
      try {
        await connectMongo();
        const M = SmartHumanCheckController.getTraceModel();
        await M.create({
          traceId,
          time: new Date(result.timestamp || Date.now()),
          ip,
          ua,
          success: result.success,
          reason: result.reason,
          errorCode: result.errorCode,
          errorMessage: result.errorMessage,
          score: result.score,
          thresholdBase: result.thresholdBase,
          thresholdUsed: result.thresholdUsed,
          passRateIp: result.passRateIp,
          passRateUa: result.passRateUa,
          policy: result.policy,
          riskLevel: result.riskLevel,
          riskScore: result.riskScore,
          riskReasons: result.riskReasons,
          challengeRequired: result.challengeRequired,
        });
      } catch (persistErr) {
        logger.warn('[SmartHumanCheck] persist trace failed', persistErr);
      }

      if (!result.success) {
        // 当需要验证码挑战（CAPTCHA Fallback）时，返回 403 并携带挑战信息
        if (result.challengeRequired) {
          const body = {
            ...withTrace,
            errorCode: withTrace.errorCode || 'CHALLENGE_REQUIRED',
            challengeRequired: true,
          };
          return res.status(403).json(body);
        }

        // 根据错误类型返回适当的 HTTP 状态码
        let statusCode = 400;
        if (result.retryable) {
          statusCode = result.errorCode === 'NONCE_EXPIRED' ? 410 : 429;
        }
        return res.status(statusCode).json(withTrace);
      }

      res.json(withTrace);
    } catch (e) {
      const traceId = crypto.randomBytes(12).toString('hex');
      logger.error('[SmartHumanCheck] verifyToken error', e);
      res.status(500).json({
        success: false,
        error: 'server_error',
        errorCode: 'SERVER_ERROR',
        errorMessage: '服务器内部错误',
        retryable: true,
        timestamp: Date.now(),
        traceId
      });
    }
  }

  /**
   * GET /traces - 分页查询溯源记录（管理员）
   * query: page=1&pageSize=50&success=&reason=&traceId=&ip=&ua=
   */
  static async listTraces(req: Request, res: Response) {
    try {
      // 权限校验：仅管理员
      // @ts-ignore
      if (!req.user || req.user.role !== 'admin') {
        return res.status(403).json({ error: '需要管理员权限' });
      }
      const page = Math.max(1, Number(req.query.page || 1));
      const pageSize = Math.min(200, Math.max(1, Number(req.query.pageSize || 50)));

      // 安全处理查询参数，避免将用户输入直接用于数据库查询
      const successParam = req.query.success;
      const reasonRaw = typeof req.query.reason === 'string' ? req.query.reason : undefined;
      const traceIdRaw = typeof req.query.traceId === 'string' ? req.query.traceId : undefined;
      const ipRaw = typeof req.query.ip === 'string' ? req.query.ip : undefined;
      const uaRaw = typeof req.query.ua === 'string' ? req.query.ua : undefined;

      // 仅接受严格的布尔字符串
      const success = (typeof successParam !== 'undefined' && successParam !== '')
        ? String(successParam) === 'true'
        : undefined;

      // 仅允许受控字符集且限制长度，防止注入和ReDoS攻击
      const reason = reasonRaw && /^[A-Za-z0-9_.\-]{1,64}$/.test(reasonRaw) ? reasonRaw : undefined;

      // traceId 为 24 位 hex（由 crypto.randomBytes(12) 生成）
      const traceId = traceIdRaw && /^[a-fA-F0-9]{24}$/.test(traceIdRaw) ? traceIdRaw : undefined;

      // IP 使用 Node 内置 isIP 校验（支持 IPv4/IPv6）
      const ip = ipRaw && isIP(ipRaw) ? ipRaw : undefined;

      // 对 UA 进行转义并限制长度，使用安全正则
      const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const ua = uaRaw ? escapeRegex(uaRaw.slice(0, 100)) : undefined;

      await connectMongo();
      const M = SmartHumanCheckController.getTraceModel();
      const q: any = {};
      if (typeof success !== 'undefined') q.success = !!success;
      if (reason) q.reason = reason;
      if (traceId) q.traceId = traceId;
      if (ip) q.ip = ip;
      if (ua) q.ua = { $regex: ua, $options: 'i' };

      const total = await M.countDocuments(q);
      const items = await M.find(q).sort({ time: -1 }).skip((page - 1) * pageSize).limit(pageSize).lean();
      res.json({ success: true, page, pageSize, total, items });
    } catch (e) {
      logger.error('[SmartHumanCheck] listTraces error', e);
      res.status(500).json({ success: false, error: 'server_error' });
    }
  }

  /** GET /trace/:id - 获取单条溯源记录（管理员） */
  static async getTrace(req: Request, res: Response) {
    try {
      // 权限校验：仅管理员
      // @ts-ignore
      if (!req.user || req.user.role !== 'admin') {
        return res.status(403).json({ error: '需要管理员权限' });
      }
      const { id } = req.params;
      await connectMongo();
      const M = SmartHumanCheckController.getTraceModel();
      const doc = await M.findOne({ traceId: id }).lean();
      if (!doc) return res.status(404).json({ success: false, error: 'not_found' });
      res.json({ success: true, item: doc });
    } catch (e) {
      logger.error('[SmartHumanCheck] getTrace error', e);
      res.status(500).json({ success: false, error: 'server_error' });
    }
  }

  /** DELETE /trace/:id - 删除单条溯源记录（管理员） */
  static async deleteTrace(req: Request, res: Response) {
    try {
      // 权限校验：仅管理员
      // @ts-ignore
      if (!req.user || req.user.role !== 'admin') {
        return res.status(403).json({ error: '需要管理员权限' });
      }
      const { id } = req.params;
      if (!id) return res.status(400).json({ success: false, error: 'missing_id' });
      await connectMongo();
      const M = SmartHumanCheckController.getTraceModel();
      const resp = await M.deleteOne({ traceId: id });
      if (!resp?.deletedCount) {
        return res.status(404).json({ success: false, error: 'not_found' });
      }
      res.json({ success: true, deletedCount: 1 });
    } catch (e) {
      logger.error('[SmartHumanCheck] deleteTrace error', e);
      res.status(500).json({ success: false, error: 'server_error' });
    }
  }

  /** DELETE /traces - 批量删除溯源记录（管理员） body: { ids: string[] } */
  static async deleteTraces(req: Request, res: Response) {
    try {
      // 权限校验：仅管理员
      // @ts-ignore
      if (!req.user || req.user.role !== 'admin') {
        return res.status(403).json({ error: '需要管理员权限' });
      }
      const ids = (req.body?.ids || []) as string[];
      if (!Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ success: false, error: 'missing_ids' });
      }
      const uniqueIds = Array.from(new Set(ids.filter(x => typeof x === 'string' && x.trim())));
      if (uniqueIds.length === 0) {
        return res.status(400).json({ success: false, error: 'no_valid_ids' });
      }
      // 限制单次最多删除数量，防滥用
      const MAX_BATCH = 200;
      const limitedIds = uniqueIds.slice(0, MAX_BATCH);

      await connectMongo();
      const M = SmartHumanCheckController.getTraceModel();
      // 先查存在的，便于返回 notFound
      const existing = await M.find({ traceId: { $in: limitedIds } }).select('traceId').lean();
      const existSet = new Set<string>(existing.map((d: any) => d.traceId));
      const toDelete = limitedIds.filter(id => existSet.has(id));
      const notFound = limitedIds.filter(id => !existSet.has(id));

      let deletedCount = 0;
      if (toDelete.length > 0) {
        const delResp = await M.deleteMany({ traceId: { $in: toDelete } });
        deletedCount = Number(delResp?.deletedCount || 0);
      }

      res.json({ success: true, deletedCount, notFound, requested: limitedIds.length });
    } catch (e) {
      logger.error('[SmartHumanCheck] deleteTraces error', e);
      res.status(500).json({ success: false, error: 'server_error' });
    }
  }
}

export default SmartHumanCheckController;
