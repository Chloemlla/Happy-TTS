import express from "express";
import {
  createResource,
  deleteResource,
  getCategories,
  getResourceById,
  getResourceStats,
  getResources,
  initializeTestResources,
  updateResource,
} from "../controllers/resourceController";
import { auditLog } from "../middleware/auditLog";
import { authenticateAdmin, authenticateSuperAdmin } from "../middleware/auth";
import { authenticateToken } from "../middleware/authenticateToken";
import { resourceLimiter } from "../middleware/rateLimiter";

const router = express.Router();

// 公共API - 不需要认证，但需要速率限制
router.get("/resources", resourceLimiter.getResources, getResources);
router.get("/categories", resourceLimiter.getCategories, getCategories);

// 管理员API - 需要认证和速率限制（具体路由必须在参数路由之前）
router.get("/resources/stats", resourceLimiter.stats, authenticateToken, authenticateAdmin, getResourceStats);
router.post(
  "/resources",
  resourceLimiter.create,
  authenticateToken,
  authenticateSuperAdmin,
  auditLog({ module: "resource", action: "resource.create" }),
  createResource,
);
router.post(
  "/resources/init-test",
  resourceLimiter.initTest,
  authenticateToken,
  authenticateSuperAdmin,
  auditLog({ module: "resource", action: "resource.initTest" }),
  initializeTestResources,
);

// 参数路由放在最后 - 需要速率限制
router.get("/resources/:id", resourceLimiter.getById, getResourceById);
router.put(
  "/resources/:id",
  resourceLimiter.update,
  authenticateToken,
  authenticateSuperAdmin,
  auditLog({ module: "resource", action: "resource.update", extractTarget: (req) => ({ targetId: req.params.id }) }),
  updateResource,
);
router.delete(
  "/resources/:id",
  resourceLimiter.delete,
  authenticateToken,
  authenticateSuperAdmin,
  auditLog({ module: "resource", action: "resource.delete", extractTarget: (req) => ({ targetId: req.params.id }) }),
  deleteResource,
);

export default router;
