import { Router } from "express";
import { LinuxDoCreditController } from "../controllers/linuxDoCreditController";
import { authMiddleware } from "../middleware/authMiddleware";
import { createLimiter } from "../middleware/routeLimiters";

const router = Router();

const notifyLimiter = createLimiter({
  name: "linuxdo-credit-notify",
  profile: "standard",
  category: "public-api",
  message: "回调请求过于频繁，请稍后再试",
});

const rechargeLimiter = createLimiter({
  name: "linuxdo-credit-recharge",
  profile: "sensitive",
  category: "auth",
  windowMs: 60 * 1000,
  max: 10,
  message: "充值请求过于频繁，请稍后再试",
});

const readLimiter = createLimiter({
  name: "linuxdo-credit-read",
  profile: "authRead",
  category: "auth",
  message: "查询过于频繁，请稍后再试",
});

router.get("/notify", notifyLimiter, LinuxDoCreditController.notify);
router.post("/notify", notifyLimiter, LinuxDoCreditController.notify);
router.get("/config", readLimiter, authMiddleware, LinuxDoCreditController.getConfig);
router.post("/recharge", rechargeLimiter, authMiddleware, LinuxDoCreditController.createRecharge);
router.get("/orders", readLimiter, authMiddleware, LinuxDoCreditController.listOrders);
router.get("/orders/:outTradeNo", readLimiter, authMiddleware, LinuxDoCreditController.getOrder);

export default router;