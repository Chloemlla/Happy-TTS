import express from "express";
import { coinFlipController } from "../controllers/coinFlipController";
import { authenticateAdmin } from "../middleware/auth";
import { optionalAuthenticateToken } from "../middleware/optionalAuthenticateToken";
import { createLimiter } from "../middleware/routeLimiters";

const router = express.Router();

// 抛硬币限流器
const coinFlipLimiter = createLimiter({
  name: "coinFlip",
  profile: "relaxed",
  category: "public-api",
  max: 60,
  message: "抛硬币请求过于频繁，请稍后再试",
});

// 管理员查看限流器
const coinFlipAdminLimiter = createLimiter({
  name: "coinFlipAdmin",
  profile: "sensitive",
  category: "admin",
  message: "管理员查看过于频繁，请稍后再试",
});

// 公开接口：抛硬币（登录用户可选，登录后记录身份）
router.post("/flip", coinFlipLimiter, optionalAuthenticateToken, coinFlipController.flip.bind(coinFlipController));

// 公开接口：按唯一结果 ID 校验单次结果
router.get("/results/:resultId", coinFlipLimiter, coinFlipController.getResult.bind(coinFlipController));

// 管理员接口：分页查看全部结果
router.get("/results", authenticateAdmin, coinFlipAdminLimiter, coinFlipController.listResults.bind(coinFlipController));

// 管理员接口：查看统计信息
router.get(
  "/statistics",
  authenticateAdmin,
  coinFlipAdminLimiter,
  coinFlipController.getStatistics.bind(coinFlipController),
);

export default router;
