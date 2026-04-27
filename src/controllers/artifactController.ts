/**
 * Artifact 控制器
 * 处理 artifacts 分享功能的 HTTP 请求
 */
import type { Request, Response } from "express";
import { ArtifactService } from "../services/artifactService";
import { firstString, firstStringOr } from "../utils/httpParam";
import logger from "../utils/logger";

export class ArtifactController {
  /**
   * POST /api/nexai/artifacts
   * 创建 Artifact
   */
  static async createArtifact(req: Request, res: Response) {
    try {
      const userId = (req as any).nexaiUser?.id;
      if (!userId) {
        return res.status(401).json({
          success: false,
          error: "未授权",
        });
      }

      const {
        title,
        content_type,
        contentType,
        content,
        language,
        visibility,
        password,
        description,
        tags,
        expires_in_days,
        expiresInDays,
      } = req.body;

      // 验证必填字段
      if (!title || !content || !(content_type || contentType)) {
        return res.status(400).json({
          success: false,
          error: "缺少必填字段: title, content_type, content",
        });
      }

      const result = await ArtifactService.createArtifact({
        userId,
        title,
        contentType: content_type || contentType,
        content,
        language,
        visibility,
        password,
        description,
        tags,
        expiresInDays: expires_in_days || expiresInDays,
      });

      res.status(201).json({
        success: true,
        message: "Artifact 创建成功",
        data: result,
      });
    } catch (error: any) {
      logger.error("[ArtifactController] createArtifact error:", error);
      res.status(500).json({
        success: false,
        error: error.message || "创建失败",
      });
    }
  }

  /**
   * GET /api/nexai/artifacts/:shortId
   * 获取 Artifact
   */
  static async getArtifact(req: Request, res: Response) {
    try {
      const shortId = firstString(req.params.shortId);
      const password = req.headers["x-password"] as string;

      if (!shortId) {
        return res.status(400).json({ success: false, error: "invalid_short_id" });
      }

      const artifact = await ArtifactService.getArtifact(shortId, password);

      if (!artifact) {
        return res.status(404).json({
          success: false,
          error: "not_found",
          message: "Artifact 不存在或已过期",
        });
      }

      // 移除敏感字段
      const { passwordHash, ...safeArtifact } = artifact as any;

      res.json({
        success: true,
        data: safeArtifact,
      });
    } catch (error: any) {
      if (error.code === "PASSWORD_REQUIRED") {
        return res.status(403).json({
          success: false,
          error: "password_required",
          message: "此 Artifact 需要密码",
        });
      }
      if (error.code === "INVALID_PASSWORD") {
        return res.status(403).json({
          success: false,
          error: "invalid_password",
          message: "密码错误",
        });
      }

      logger.error("[ArtifactController] getArtifact error:", error);
      res.status(500).json({
        success: false,
        error: error.message || "获取失败",
      });
    }
  }

  /**
   * PATCH /api/nexai/artifacts/:shortId
   * 更新 Artifact
   */
  static async updateArtifact(req: Request, res: Response) {
    try {
      const userId = (req as any).nexaiUser?.id;
      if (!userId) {
        return res.status(401).json({
          success: false,
          error: "未授权",
        });
      }

      const shortId = firstString(req.params.shortId);
      const updates = req.body;

      if (!shortId) {
        return res.status(400).json({ success: false, error: "invalid_short_id" });
      }

      const artifact = await ArtifactService.updateArtifact(shortId, userId, updates);

      if (!artifact) {
        return res.status(404).json({
          success: false,
          error: "Artifact 不存在或无权限",
        });
      }

      res.json({
        success: true,
        message: "更新成功",
        data: {
          id: artifact._id.toString(),
          shortId: artifact.shortId,
          updatedAt: artifact.updatedAt,
        },
      });
    } catch (error: any) {
      logger.error("[ArtifactController] updateArtifact error:", error);
      res.status(500).json({
        success: false,
        error: error.message || "更新失败",
      });
    }
  }

  /**
   * DELETE /api/nexai/artifacts/:shortId
   * 删除 Artifact
   */
  static async deleteArtifact(req: Request, res: Response) {
    try {
      const userId = (req as any).nexaiUser?.id;
      if (!userId) {
        return res.status(401).json({
          success: false,
          error: "未授权",
        });
      }

      const shortId = firstString(req.params.shortId);

      if (!shortId) {
        return res.status(400).json({ success: false, error: "invalid_short_id" });
      }

      const deleted = await ArtifactService.deleteArtifact(shortId, userId);

      if (!deleted) {
        return res.status(404).json({
          success: false,
          error: "Artifact 不存在或无权限",
        });
      }

      res.status(204).send();
    } catch (error: any) {
      logger.error("[ArtifactController] deleteArtifact error:", error);
      res.status(500).json({
        success: false,
        error: error.message || "删除失败",
      });
    }
  }

  /**
   * GET /api/nexai/artifacts
   * 获取用户的 Artifacts 列表
   */
  static async listArtifacts(req: Request, res: Response) {
    try {
      const userId = (req as any).nexaiUser?.id;
      if (!userId) {
        return res.status(401).json({
          success: false,
          error: "未授权",
        });
      }

      const page = parseInt(firstStringOr(req.query.page, "1"), 10) || 1;
      const limit = parseInt(firstStringOr(req.query.limit, "20"), 10) || 20;
      const sort = firstStringOr(req.query.sort, "createdAt");
      const order = firstString(req.query.order) === "asc" ? "asc" : "desc";

      const result = await ArtifactService.listArtifacts(userId, {
        page,
        limit,
        sort,
        order,
      });

      res.json({
        success: true,
        data: result,
      });
    } catch (error: any) {
      logger.error("[ArtifactController] listArtifacts error:", error);
      res.status(500).json({
        success: false,
        error: error.message || "获取列表失败",
      });
    }
  }

  /**
   * POST /api/nexai/artifacts/:shortId/view
   * 记录访问
   */
  static async recordView(req: Request, res: Response) {
    try {
      const shortId = firstString(req.params.shortId);
      const { referer, user_agent } = req.body;

      if (!shortId) {
        return res.status(400).json({ success: false, error: "invalid_short_id" });
      }

      const ipAddress = req.ip || (req.headers["x-real-ip"] as string);
      const userAgent = user_agent || (req.headers["user-agent"] as string);

      await ArtifactService.recordView(shortId, {
        ipAddress,
        userAgent,
        referer,
      });

      res.status(204).send();
    } catch (error: any) {
      logger.error("[ArtifactController] recordView error:", error);
      // 不返回错误,避免影响用户体验
      res.status(204).send();
    }
  }
}
