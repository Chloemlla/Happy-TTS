import express from "express";
import multer from "multer";
import { fbiWantedController } from "../controllers/fbiWantedController";
import { authenticateAdmin } from "../middleware/auth";
import { authenticateToken } from "../middleware/authenticateToken";
import { createLimiter } from "../middleware/rateLimiter";

const router = express.Router();

// 文件上传中间件（内存存储，限制5MB）
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

// ===== 公开路由（无需认证） =====
const publicLimiter = createLimiter({
  windowMs: 60 * 1000,
  max: 60,
  routeName: "fbi.public",
  message: "公开API请求过于频繁，请稍后再试",
});

// 公开API - 使用 /public 前缀明确区分
router.get("/public/list", publicLimiter, fbiWantedController.getAllWanted);
router.get("/public/statistics", publicLimiter, fbiWantedController.getStatistics);
router.get("/public/:id", publicLimiter, fbiWantedController.getWantedById);

// ===== 管理员路由（需要认证+管理员权限） =====

// 管理员限流器
const adminLimiter = createLimiter({
  windowMs: 5 * 60 * 1000,
  max: 100,
  routeName: "fbi.admin",
  message: "管理员操作过于频繁，请稍后再试",
});

// 头像上传限流器（更严格）
const uploadPhotoLimiter = createLimiter({
  windowMs: 15 * 60 * 1000,
  max: 20,
  routeName: "fbi.admin.photo_upload",
  message: "头像上传过于频繁，请稍后再试",
});

// 管理员API - 统一应用认证中间件
router.get("/", adminLimiter, authenticateToken, authenticateAdmin, fbiWantedController.getAllWanted);
router.get("/statistics", adminLimiter, authenticateToken, authenticateAdmin, fbiWantedController.getStatistics);
router.get("/:id", adminLimiter, authenticateToken, authenticateAdmin, fbiWantedController.getWantedById);
router.post("/", adminLimiter, authenticateToken, authenticateAdmin, fbiWantedController.createWanted);
router.put("/:id", adminLimiter, authenticateToken, authenticateAdmin, fbiWantedController.updateWanted);
router.patch("/:id/status", adminLimiter, authenticateToken, authenticateAdmin, fbiWantedController.updateWantedStatus);
router.patch(
  "/:id/photo",
  uploadPhotoLimiter,
  authenticateToken,
  authenticateAdmin,
  upload.single("photo"),
  fbiWantedController.updateWantedPhoto,
);
router.delete("/multiple", adminLimiter, authenticateToken, authenticateAdmin, fbiWantedController.deleteMultiple);
router.delete("/:id", adminLimiter, authenticateToken, authenticateAdmin, fbiWantedController.deleteWanted);
router.post("/batch-delete", adminLimiter, authenticateToken, authenticateAdmin, fbiWantedController.batchDeleteWanted);

export default router;
