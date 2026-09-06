import type { Router } from "express";
import { authenticateAdmin, authenticateSuperAdmin } from "../middleware/auth";
import { auditLog } from "../middleware/auditLog";
import { libreChatService } from "../services/libreChatService";
import { mongoose } from "../services/mongoService";
import { normalizeWire } from "../services/librechat/wire";
import { normalizePagination } from "./libreChatRoutes.shared";

export function registerLibreChatAdminRoutes(router: Router): void {
  // ================= 管理员接口（仅管理后台使用） =================
  // 列出用户概览
  router.get("/admin/users", authenticateAdmin, async (req, res) => {
    try {
      const kw = (req.query.kw as string) || "";
      const { page, limit } = normalizePagination(req.query.page, req.query.limit);
      const includeDeleted = String(req.query.includeDeleted || "").toLowerCase() === "true";
      const data = await (libreChatService as any).adminListUsers(kw, page, limit, includeDeleted);
      res.json(data);
    } catch (error) {
      console.error("管理员获取用户列表错误:", error);
      res.status(500).json({ error: "获取用户列表失败" });
    }
  });

  // 查看指定用户历史
  router.get("/admin/users/:userId/history", authenticateAdmin, async (req, res) => {
    try {
      const { userId } = req.params as { userId: string };
      const { page, limit } = normalizePagination(req.query.page, req.query.limit);
      const data = await libreChatService.adminGetUserHistory(userId, page, limit);
      res.json(data);
    } catch (error) {
      console.error("管理员获取用户历史错误:", error);
      res.status(500).json({ error: "获取用户历史失败" });
    }
  });

  // 删除所有用户历史（危险操作）—— 必须在 /admin/users/:userId 之前注册，避免被参数路由吞掉
  router.delete(
    "/admin/users/all",
    authenticateSuperAdmin,
    auditLog({ module: "api", action: "libreChat.deleteAllUsers" }),
    async (req, res) => {
    try {
      const { confirm } = req.body as { confirm: boolean };
      const { statusCode, body } = await libreChatService.adminDeleteAllUsersAction({ confirm });
      res.status(statusCode).json(body);
    } catch (error) {
      console.error("管理员删除所有用户历史错误:", error);
      res.status(500).json({ error: "删除所有用户历史失败" });
    }
  });

  // 一键清理全部 guest 遗留历史（登录化后孤儿，软删语义同单用户删除）—— 须在 /admin/users/:userId 之前注册
  router.delete(
    "/admin/users/guests",
    authenticateSuperAdmin,
    auditLog({ module: "api", action: "libreChat.deleteGuestHistories" }),
    async (req, res) => {
    try {
      const ret = await libreChatService.adminDeleteGuestHistories();
      res.json({ message: `已清理 ${ret.deleted} 条 guest 遗留历史`, ...ret });
    } catch (error) {
      console.error("管理员清理 guest 历史错误:", error);
      res.status(500).json({ error: "清理 guest 历史失败" });
    }
  });

  // 删除指定用户全部历史
  router.delete(
    "/admin/users/:userId",
    authenticateSuperAdmin,
    auditLog({
      module: "api",
      action: "libreChat.deleteUser",
      extractTarget: (req) => ({ targetId: req.params.userId }),
    }),
    async (req, res) => {
    try {
      const { userId } = req.params as { userId: string };
      if (userId === "all" || userId === "guests") {
        return res.status(400).json({ error: `保留字 ${userId} 请使用 /admin/users/${userId}` });
      }
      const ret = await libreChatService.adminDeleteUser(userId);
      res.json({ message: "指定用户聊天历史已删除", ...ret });
    } catch (error) {
      console.error("管理员删除用户历史错误:", error);
      res.status(500).json({ error: "删除用户历史失败" });
    }
  });

  // 批量删除多个用户全部历史
  router.delete(
    "/admin/users",
    authenticateSuperAdmin,
    auditLog({
      module: "api",
      action: "libreChat.batchDeleteUsers",
      extractDetail: (req) => ({ count: Array.isArray(req.body?.userIds) ? req.body.userIds.length : 0 }),
    }),
    async (req, res) => {
    try {
      const { userIds } = req.body as { userIds: string[] };
      if (!Array.isArray(userIds) || userIds.length === 0) {
        return res.status(400).json({ error: "请提供要删除的用户ID列表" });
      }
      const ret = await libreChatService.adminBatchDeleteUsers(userIds);
      res.json({ message: `批量删除完成，共删除 ${ret.deleted} 个用户的历史记录`, ...ret });
    } catch (error) {
      console.error("管理员批量删除用户历史错误:", error);
      res.status(500).json({ error: "批量删除用户历史失败" });
    }
  });

  // ========== 管理聊天提供者配置（BASE_URL/API_KEY/MODEL，多组轮询&故障切换）===========
  // 列表（可选按 group 过滤），对 apiKey 做脱敏
  router.get("/admin/providers", authenticateAdmin, async (req, res) => {
    try {
      const group = typeof req.query.group === "string" ? req.query.group : undefined;
      const ChatProviderModel = (mongoose.models.ChatProvider as any) || mongoose.model("ChatProvider");
      const q: any = {};
      if (group) q.group = group;
      const docs = await ChatProviderModel.find(q).sort({ updatedAt: -1 }).lean();
      const list = (docs || []).map((d: any) => ({
        id: String(d._id),
        baseUrl: d.baseUrl,
        model: d.model,
        wire: normalizeWire(d.wire),
        group: d.group || "",
        enabled: d.enabled !== false,
        weight: Number(d.weight || 1),
        apiKey:
          typeof d.apiKey === "string" && d.apiKey.length > 8 ? `${d.apiKey.slice(0, 2)}***${d.apiKey.slice(-4)}` : "***",
        updatedAt: d.updatedAt,
      }));
      res.json({ success: true, providers: list });
    } catch (_e) {
      res.status(500).json({ success: false, error: "获取提供者失败" });
    }
  });

  // 新增或更新（带 id 则更新，不带则创建）。自动标准化 baseUrl 去尾斜杠
  router.post(
    "/admin/providers",
    authenticateSuperAdmin,
    auditLog({
      module: "api",
      action: "libreChat.provider.upsert",
      extractDetail: (req) => ({ baseUrl: req.body?.baseUrl, model: req.body?.model, group: req.body?.group }),
    }),
    async (req, res) => {
    try {
      const { id, baseUrl, apiKey, model, group, enabled, weight, wire } = req.body || {};
      const ChatProviderModel = (mongoose.models.ChatProvider as any) || mongoose.model("ChatProvider");
      const safeBase = typeof baseUrl === "string" ? baseUrl.trim().replace(/\/$/, "") : "";
      const safeKey = typeof apiKey === "string" ? apiKey.trim() : "";
      const safeModel = typeof model === "string" ? model.trim() : "";
      const safeWire = normalizeWire(wire);
      const safeGroup = typeof group === "string" ? group.trim() : "";
      const safeEnabled = typeof enabled === "boolean" ? enabled : true;
      const safeWeight = Number.isFinite(Number(weight)) ? Math.max(1, Math.min(10, Number(weight))) : 1;
      if (!safeBase || !safeKey || !safeModel) {
        return res.status(400).json({ success: false, error: "baseUrl/apiKey/model 不能为空" });
      }
      let doc;
      if (id && typeof id === "string" && /^[0-9a-fA-F]{24}$/.test(id)) {
        doc = await ChatProviderModel.findByIdAndUpdate(
          id,
          {
            baseUrl: safeBase,
            apiKey: safeKey,
            model: safeModel,
            wire: safeWire,
            group: safeGroup,
            enabled: safeEnabled,
            weight: safeWeight,
            updatedAt: new Date(),
          },
          { returnDocument: "after", upsert: false },
        );
        if (!doc) return res.status(404).json({ success: false, error: "提供者不存在" });
      } else {
        doc = await ChatProviderModel.create({
          baseUrl: safeBase,
          apiKey: safeKey,
          model: safeModel,
          wire: safeWire,
          group: safeGroup,
          enabled: safeEnabled,
          weight: safeWeight,
          updatedAt: new Date(),
        });
      }
      // 可选触发服务端缓存尽快刷新（若提供了内部方法）
      try {
        await (libreChatService as any).loadProviders?.();
      } catch {}
      res.json({ success: true, id: String(doc._id) });
    } catch (_e) {
      res.status(500).json({ success: false, error: "保存提供者失败" });
    }
  });

  // 删除提供者
  router.delete(
    "/admin/providers/:id",
    authenticateSuperAdmin,
    auditLog({
      module: "api",
      action: "libreChat.provider.delete",
      extractTarget: (req) => ({ targetId: req.params.id }),
    }),
    async (req, res) => {
    try {
      const { id } = req.params as any;
      if (!id || typeof id !== "string" || !/^[0-9a-fA-F]{24}$/.test(id)) {
        return res.status(400).json({ success: false, error: "无效的提供者ID" });
      }
      const ChatProviderModel = (mongoose.models.ChatProvider as any) || mongoose.model("ChatProvider");
      await ChatProviderModel.findByIdAndDelete(id);
      try {
        await (libreChatService as any).loadProviders?.();
      } catch {}
      res.json({ success: true });
    } catch (_e) {
      res.status(500).json({ success: false, error: "删除提供者失败" });
    }
  });
}
