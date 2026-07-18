import express from "express";
import { SmartHumanCheckController } from "../controllers/humanCheckController";
import adminOnly from "../middleware/adminOnly";
import { authenticateToken } from "../middleware/authenticateToken";
import { createLimiter } from "../middleware/routeLimiters";

const router = express.Router();

// 适度限流，防止滥用（统一 routeLimiters）
const humanCheckLimiter = createLimiter({
  name: "humanCheckBootstrap",
  profile: "burst",
  category: "public-api",
  max: 120,
  message: "请求过于频繁，请稍后再试",
});

// 更严格的验证限流
const verifyLimiter = createLimiter({
  name: "humanCheckVerify",
  profile: "standard",
  category: "verification",
  message: "验证请求过于频繁，请稍后再试",
});

// 管理员端点限流
const adminLimiter = createLimiter({
  name: "humanCheckAdmin",
  profile: "relaxed",
  category: "admin",
  message: "管理端请求过于频繁，请稍后再试",
});

// 添加 CORS 和安全头
router.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", req.headers.origin || "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With, X-SHC-Action");
  res.header("Access-Control-Max-Age", "86400");

  // 安全头
  res.header("X-Content-Type-Options", "nosniff");
  res.header("X-Frame-Options", "DENY");
  res.header("X-XSS-Protection", "1; mode=block");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  next();
});

// 发放 nonce（前端在渲染组件前获取）
router.get("/nonce", humanCheckLimiter, SmartHumanCheckController.issueNonce);

// 校验 token（前端提交验证结果）
router.post("/verify", verifyLimiter, SmartHumanCheckController.verifyToken);

// 获取统计信息（管理端点）
router.get("/stats", adminLimiter, authenticateToken, adminOnly, SmartHumanCheckController.getStats);

// 管理端：查询溯源记录（需要管理员权限）
router.get("/traces", adminLimiter, authenticateToken, SmartHumanCheckController.listTraces);
router.get("/trace/:id", adminLimiter, authenticateToken, SmartHumanCheckController.getTrace);

// 管理端：删除溯源记录（需要管理员权限）
router.delete("/traces", adminLimiter, authenticateToken, SmartHumanCheckController.deleteTraces);
router.delete("/trace/:id", adminLimiter, authenticateToken, SmartHumanCheckController.deleteTrace);

export default router;
