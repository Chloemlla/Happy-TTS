import type { Router } from "express";
import { authMiddlewareV2 as authMiddleware } from "../../middleware/auth";
import { getUserById, updateUser } from "../../services/userService";
import { wsService } from "../../services/wsService";
import { getClientIP } from "../../utils/ipUtils";

export function registerProfileFingerprintRoutes(router: Router): void {
  // 用户指纹信息接口（需登录）
  // 注意：此接口已废弃，请使用 /api/turnstile/fingerprint/report 接口
  // 保留此接口仅用于向后兼容，新功能请使用 turnstile 路由中的接口
  router.post("/user/fingerprint", authMiddleware, async (req, res) => {
    try {
      const user = req.user;
      if (!user) return res.status(401).json({ error: "未登录" });

      const { id } = req.body || {};
      if (!id || typeof id !== "string") {
        return res.status(400).json({ error: "缺少指纹id" });
      }

      const ua = req.headers["user-agent"] || "";
      const ip = getClientIP(req);
      const ts = Date.now();

      const fingerprintRecord = { id, ts, ua: String(ua), ip: String(ip) };

      const current = await getUserById(user.id);
      const existing = (current && (current as any).fingerprints) || [];
      // 保留最新的20条指纹记录
      const next = [fingerprintRecord, ...existing].slice(0, 20);

      // 保存指纹并清除一次性上报需求标记及时间戳
      await updateUser(user.id, { fingerprints: next, requireFingerprint: false, requireFingerprintAt: 0 } as any);

      // 通过 WebSocket 推送指纹已上报确认
      try {
        wsService.notifyFingerprintAck(user.id);
      } catch (_wsErr) {
        // WS 推送失败不影响主流程
      }

      res.json({ success: true });
    } catch (e) {
      console.error("保存指纹失败", e);
      res.status(500).json({ error: "保存指纹失败" });
    }
  });

  // 查询用户指纹状态（需登录）：返回最近一次指纹时间与总数量及IP变更情况
  router.get("/user/fingerprint/status", authMiddleware, async (req, res) => {
    try {
      const user = req.user;
      if (!user) return res.status(401).json({ error: "未登录" });

      const current = await getUserById(user.id);
      const fps = (current && (current as any).fingerprints) || [];
      const count = Array.isArray(fps) ? fps.length : 0;
      const lastTs = count > 0 && fps[0] && typeof fps[0].ts === "number" ? fps[0].ts : 0;
      const lastIp = count > 0 && fps[0] && typeof fps[0].ip === "string" ? fps[0].ip : "";
      const currentIp = getClientIP(req);
      const ipChanged = !!(lastIp && currentIp && lastIp !== currentIp);

      const lastUa = count > 0 && fps[0] && typeof fps[0].ua === "string" ? fps[0].ua : "";
      const currentUa = String(req.headers["user-agent"] || "");
      const uaChanged = !!(lastUa && currentUa && lastUa !== currentUa);

      // 获取指纹请求状态字段
      const requireFingerprint = (current && (current as any).requireFingerprint) || false;
      const requireFingerprintAt = (current && (current as any).requireFingerprintAt) || 0;
      const fingerprintRequestDismissedOnce = (current && (current as any).fingerprintRequestDismissedOnce) || false;
      const fingerprintRequestDismissedAt = (current && (current as any).fingerprintRequestDismissedAt) || 0;

      res.json({
        success: true,
        count,
        lastTs,
        lastIp,
        ipChanged,
        uaChanged,
        requireFingerprint,
        requireFingerprintAt,
        fingerprintRequestDismissedOnce,
        fingerprintRequestDismissedAt,
      });
    } catch (e) {
      console.error("查询指纹状态失败", e);
      res.status(500).json({ error: "查询指纹状态失败" });
    }
  });

  // 记录用户关闭指纹请求（需登录，一生只能关闭一次）
  router.post("/user/fingerprint/dismiss", authMiddleware, async (req, res) => {
    try {
      const user = req.user;
      if (!user) return res.status(401).json({ error: "未登录" });

      const current = await getUserById(user.id);
      if (!current) return res.status(404).json({ error: "用户不存在" });

      // 检查是否已经关闭过一次
      const alreadyDismissed = (current as any).fingerprintRequestDismissedOnce || false;
      if (alreadyDismissed) {
        return res.status(400).json({
          error: "您已经关闭过一次指纹请求，无法再次关闭",
          fingerprintRequestDismissedOnce: true,
        });
      }

      // 记录关闭
      await updateUser(user.id, {
        fingerprintRequestDismissedOnce: true,
        fingerprintRequestDismissedAt: Date.now(),
      });

      console.log(`✅ 用户 ${user.id} 关闭了指纹请求（一生只能关闭一次）`);

      res.json({
        success: true,
        message: "已记录您的关闭操作，下次将无法再关闭",
        fingerprintRequestDismissedOnce: true,
        fingerprintRequestDismissedAt: Date.now(),
      });
    } catch (e) {
      console.error("记录指纹请求关闭失败", e);
      res.status(500).json({ error: "记录失败" });
    }
  });
}
