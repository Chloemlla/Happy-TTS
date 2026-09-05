import type { RequestHandler, Router } from "express";
import { isAdminRole, isSuperAdmin } from "../middleware/auth";
import { auditLog } from "../middleware/auditLog";
import { authenticateToken } from "../middleware/authenticateToken";
import { PasskeyDataRepairService } from "../services/passkeyDataRepairService";
import logger from "../utils/logger";
import { PasskeyCredentialIdFixer } from "../utils/passkeyCredentialIdFixer";
import { UserStorage } from "../utils/userStorage";

export function registerPasskeyMaintenanceRoutes(
  router: Router,
  passkeyAuthLimiter: RequestHandler,
  passkeyAdminLimiter: RequestHandler,
): void {
  // 检查当前用户的Passkey数据状态（需要认证）
  // codeql[js/missing-rate-limiting] rate-limited at mount: passkeyLimiter on /api/passkey (routeLimiterModules passkey-limiter); route already applies passkeyAuthLimiter param, no visible duplicate
  router.get("/data/check", passkeyAuthLimiter, authenticateToken, async (req, res) => {
    try {
      const userId = (req as any).user.id;
      const result = await PasskeyDataRepairService.checkUserPasskeyData(userId);

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      logger.error("[Passkey] 检查用户数据状态失败", {
        userId: (req as any).user.id,
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({ error: "检查数据状态失败" });
    }
  });

  // 修复当前用户的Passkey数据（需要认证）
  // G2-09: 改为只报告，不实际改写/删除凭证；如需真正修复走显式一次性迁移。
  // codeql[js/missing-rate-limiting] rate-limited at mount: passkeyLimiter on /api/passkey (routeLimiterModules passkey-limiter); route already applies passkeyAuthLimiter param, no visible duplicate
  router.post("/data/repair", passkeyAuthLimiter, authenticateToken, async (req, res) => {
    try {
      const userId = (req as any).user.id;
      const result = await PasskeyDataRepairService.checkUserPasskeyData(userId);

      if (result.needsRepair) {
        res.json({
          success: true,
          report: result,
          message: "检测到需要修复的数据，已生成报告。请通过管理员显式迁移流程处理。",
        });
      } else {
        res.json({
          success: true,
          report: result,
          message: "数据无需修复",
        });
      }
    } catch (error) {
      logger.error("[Passkey] 检查用户数据失败", {
        userId: (req as any).user.id,
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({ error: "检查数据失败" });
    }
  });

  // 管理员接口：检查所有用户的Passkey数据状态（需要管理员权限）
  // G3-17: 加分页并限制 pageSize ≤ 100，把 N+1 检查收敛到当前页
  // codeql[js/missing-rate-limiting] rate-limited at mount: passkeyLimiter on /api/passkey (routeLimiterModules passkey-limiter); route already applies passkeyAdminLimiter param, no visible duplicate
  router.get("/admin/data/check-all", passkeyAdminLimiter, authenticateToken, async (req, res) => {
    try {
      const user = (req as any).user;

      // 检查管理员权限
      if (!isAdminRole(user.role)) {
        return res.status(403).json({ error: "需要管理员权限" });
      }

      const page = Math.max(1, parseInt((req.query.page as string) || "1", 10) || 1);
      const pageSize = Math.min(100, Math.max(1, parseInt((req.query.pageSize as string) || "50", 10) || 50));

      const allUsers = await UserStorage.getAllUsers();
      const enabledUsers = allUsers.filter(
        (u: any) => u.passkeyEnabled && u.passkeyCredentials && u.passkeyCredentials.length > 0,
      );
      const usersWithPasskey = enabledUsers.length;
      const start = (page - 1) * pageSize;
      const pageUsers = enabledUsers.slice(start, start + pageSize);

      const results = [];
      for (const target of pageUsers) {
        const checkResult = await PasskeyDataRepairService.checkUserPasskeyData(target.id);
        results.push({
          userId: target.id,
          username: target.username,
          ...checkResult,
        });
      }

      res.json({
        success: true,
        data: {
          totalUsers: allUsers.length,
          usersWithPasskey,
          page,
          pageSize,
          results,
        },
      });
    } catch (error) {
      logger.error("[Passkey] 管理员检查所有用户数据失败", {
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({ error: "检查所有用户数据失败" });
    }
  });

  // 管理员接口：修复所有用户的Passkey数据（需要管理员权限）
  // codeql[js/missing-rate-limiting] rate-limited at mount: passkeyLimiter on /api/passkey (routeLimiterModules passkey-limiter); route already applies passkeyAdminLimiter param, no visible duplicate
  router.post("/admin/data/repair-all", passkeyAdminLimiter, authenticateToken, auditLog({ module: "security", action: "passkey.repairAll" }), async (req, res) => {
    try {
      // 检查管理员权限
      if (!isSuperAdmin(req)) {
        return res.status(403).json({ error: "需要管理员权限" });
      }

      await PasskeyDataRepairService.repairAllUsersPasskeyData();

      res.json({
        success: true,
        message: "所有用户Passkey数据修复完成",
      });
    } catch (error) {
      logger.error("[Passkey] 管理员修复所有用户数据失败", {
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({ error: "修复所有用户数据失败" });
    }
  });

  // 修复当前用户的credentialID（需要认证）
  // codeql[js/missing-rate-limiting] rate-limited at mount: passkeyLimiter on /api/passkey (routeLimiterModules passkey-limiter); route already applies passkeyAuthLimiter param, no visible duplicate
  router.post("/credential-id/fix", passkeyAuthLimiter, authenticateToken, async (req, res) => {
    try {
      const userId = (req as any).user.id;
      const result = await PasskeyCredentialIdFixer.fixUserCredentialIds(userId);

      if (result.success) {
        res.json({
          success: true,
          message: result.message,
          fixedCredentials: result.fixedCredentials,
          totalCredentials: result.totalCredentials,
        });
      } else {
        res.status(400).json({
          success: false,
          error: result.message,
        });
      }
    } catch (error) {
      logger.error("[Passkey] 修复用户credentialID失败", {
        userId: (req as any).user.id,
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({ error: "修复credentialID失败" });
    }
  });

  // 检查当前用户的credentialID状态（需要认证）
  // codeql[js/missing-rate-limiting] rate-limited at mount: passkeyLimiter on /api/passkey (routeLimiterModules passkey-limiter); route already applies passkeyAuthLimiter param, no visible duplicate
  router.get("/credential-id/check", passkeyAuthLimiter, authenticateToken, async (req, res) => {
    try {
      const userId = (req as any).user.id;
      const user = await UserStorage.getUserById(userId);

      if (!user) {
        return res.status(404).json({ error: "用户不存在" });
      }

      if (!user.passkeyEnabled || !user.passkeyCredentials || user.passkeyCredentials.length === 0) {
        return res.json({
          success: true,
          hasPasskey: false,
          message: "用户未启用Passkey或无凭证",
        });
      }

      const credentialInfo = user.passkeyCredentials.map((cred, index) => ({
        index,
        credentialId: cred.credentialID,
        ...PasskeyCredentialIdFixer.getCredentialIdInfo(cred.credentialID),
      }));

      const validCredentials = credentialInfo.filter((info) => info.isValid);
      const invalidCredentials = credentialInfo.filter((info) => !info.isValid);

      res.json({
        success: true,
        hasPasskey: true,
        totalCredentials: user.passkeyCredentials.length,
        validCredentials: validCredentials.length,
        invalidCredentials: invalidCredentials.length,
        needsFix: invalidCredentials.length > 0,
        credentialDetails: credentialInfo,
      });
    } catch (error) {
      logger.error("[Passkey] 检查用户credentialID状态失败", {
        userId: (req as any).user.id,
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({ error: "检查credentialID状态失败" });
    }
  });

  // 管理员接口：修复所有用户的credentialID（需要管理员权限）
  // codeql[js/missing-rate-limiting] rate-limited at mount: passkeyLimiter on /api/passkey (routeLimiterModules passkey-limiter); route already applies passkeyAdminLimiter param, no visible duplicate
  router.post("/admin/credential-id/fix-all", passkeyAdminLimiter, authenticateToken, auditLog({ module: "security", action: "passkey.fixAllCredentialIds" }), async (req, res) => {
    try {
      // 检查管理员权限
      if (!isSuperAdmin(req)) {
        return res.status(403).json({ error: "需要管理员权限" });
      }

      const result = await PasskeyCredentialIdFixer.fixAllUsersCredentialIds();

      if (result.success) {
        res.json({
          success: true,
          message: result.message,
          totalUsers: result.totalUsers,
          fixedUsers: result.fixedUsers,
          totalFixedCredentials: result.totalFixedCredentials,
        });
      } else {
        res.status(400).json({
          success: false,
          error: result.message,
        });
      }
    } catch (error) {
      logger.error("[Passkey] 管理员修复所有用户credentialID失败", {
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({ error: "修复所有用户credentialID失败" });
    }
  });
}
