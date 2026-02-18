/**
 * 分析控制器 - Analytics Controller
 * 处理使用分析相关的HTTP请求
 *
 * Requirements: 3.1, 3.2, 3.5
 */

import type { Request, Response } from "express";
import { usageAnalyticsService } from "../services/usageAnalyticsService";
import logger from "../utils/logger";

export class AnalyticsController {
  /**
   * 获取使用统计
   * GET /analytics/statistics
   * Requirements: 3.1
   */
  static async getStatistics(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).user?.id || (req as any).userId;

      if (!userId) {
        res.status(401).json({ error: "未授权访问" });
        return;
      }

      const statistics = await usageAnalyticsService.getStatistics(userId);

      res.json({
        success: true,
        data: statistics,
      });
    } catch (error) {
      logger.error("[AnalyticsController] 获取统计数据失败:", error);
      res.status(500).json({ error: "获取统计数据失败" });
    }
  }

  /**
   * 获取优化建议
   * GET /analytics/suggestions
   * Requirements: 3.2
   */
  static async getSuggestions(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).user?.id || (req as any).userId;

      if (!userId) {
        res.status(401).json({ error: "未授权访问" });
        return;
      }

      const suggestions = await usageAnalyticsService.getOptimizationSuggestions(userId);

      res.json({
        success: true,
        data: suggestions,
        count: suggestions.length,
      });
    } catch (error) {
      logger.error("[AnalyticsController] 获取优化建议失败:", error);
      res.status(500).json({ error: "获取优化建议失败" });
    }
  }

  /**
   * 检测重复模式
   * GET /analytics/patterns
   * Requirements: 3.3
   */
  static async getPatterns(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).user?.id || (req as any).userId;

      if (!userId) {
        res.status(401).json({ error: "未授权访问" });
        return;
      }

      const patterns = await usageAnalyticsService.detectRepetitivePatterns(userId);

      res.json({
        success: true,
        data: patterns,
        count: patterns.length,
      });
    } catch (error) {
      logger.error("[AnalyticsController] 检测重复模式失败:", error);
      res.status(500).json({ error: "检测重复模式失败" });
    }
  }

  /**
   * 导出分析数据
   * GET /analytics/export
   * Requirements: 3.5
   */
  static async exportData(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).user?.id || (req as any).userId;

      if (!userId) {
        res.status(401).json({ error: "未授权访问" });
        return;
      }

      const format = (req.query.format as string)?.toLowerCase() === "csv" ? "csv" : "json";

      const data = await usageAnalyticsService.exportData(userId, format);

      // 设置响应头
      const contentType = format === "csv" ? "text/csv" : "application/json";
      const filename = `analytics-export-${userId}-${Date.now()}.${format}`;

      res.setHeader("Content-Type", contentType);
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.send(data);
    } catch (error) {
      logger.error("[AnalyticsController] 导出数据失败:", error);
      res.status(500).json({ error: "导出数据失败" });
    }
  }

  /**
   * 导入分析数据（用于数据恢复或迁移）
   * POST /analytics/import
   */
  static async importData(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).user?.id || (req as any).userId;

      if (!userId) {
        res.status(401).json({ error: "未授权访问" });
        return;
      }

      const { data, format } = req.body;

      if (!data || typeof data !== "string") {
        res.status(400).json({ error: "缺少必要参数: data" });
        return;
      }

      const validFormat = format === "csv" ? "csv" : "json";

      try {
        const parsed = usageAnalyticsService.parseExportedData(data, validFormat);

        res.json({
          success: true,
          message: "数据解析成功",
          data: {
            userId: parsed.userId,
            exportDate: parsed.exportDate,
            recordCount: parsed.rawData?.length || 0,
          },
        });
      } catch (parseError) {
        res.status(400).json({
          error: "数据格式无效",
          details: parseError instanceof Error ? parseError.message : "Unknown error",
        });
      }
    } catch (error) {
      logger.error("[AnalyticsController] 导入数据失败:", error);
      res.status(500).json({ error: "导入数据失败" });
    }
  }
}
