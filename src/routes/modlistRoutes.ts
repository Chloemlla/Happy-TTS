import express from "express";
import {
  addMod,
  batchAddMods,
  batchDeleteMods,
  deleteMod as deleteModController,
  getModList,
  getModListJson,
  updateMod,
} from "../controllers/modlistController";
import { optionalAuthenticateToken } from "../middleware/optionalAuthenticateToken";
import { authenticateSuperAdmin } from "../middleware/auth";
import { auditLog } from "../middleware/auditLog";
import { authenticateToken } from "../middleware/authenticateToken";
import { createLimiter } from "../middleware/rateLimiter";

const router = express.Router();

const modlistLimiter = createLimiter({
  windowMs: 60 * 1000, // 1分钟
  max: 30,
  routeName: "modlist",
  message: "MOD操作过于频繁，请稍后再试",
});

router.get("/", optionalAuthenticateToken, modlistLimiter, getModList);
router.get("/json", optionalAuthenticateToken, modlistLimiter, getModListJson);
// G3-23: 写操作要求登录 + 超级管理员，修改码降级为二次确认，并写审计
router.post("/", modlistLimiter, authenticateToken, authenticateSuperAdmin, auditLog({ module: "modlist", action: "modlist.add" }), addMod);
router.put("/:id", modlistLimiter, authenticateToken, authenticateSuperAdmin, auditLog({ module: "modlist", action: "modlist.update", extractTarget: (req) => ({ targetId: req.params.id }) }), updateMod);
router.delete("/:id", modlistLimiter, authenticateToken, authenticateSuperAdmin, auditLog({ module: "modlist", action: "modlist.delete", extractTarget: (req) => ({ targetId: req.params.id }) }), deleteModController);
router.post("/batch-add", modlistLimiter, authenticateToken, authenticateSuperAdmin, auditLog({ module: "modlist", action: "modlist.batchAdd", extractDetail: (req) => ({ count: Array.isArray(req.body?.mods) ? req.body.mods.length : 0 }) }), batchAddMods);
router.post("/batch-delete", modlistLimiter, authenticateToken, authenticateSuperAdmin, auditLog({ module: "modlist", action: "modlist.batchDelete", extractDetail: (req) => ({ count: Array.isArray(req.body?.ids) ? req.body.ids.length : 0 }) }), batchDeleteMods);

export default router;
