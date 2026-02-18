/**
 * 推荐控制器 - Recommendation Controller
 * 处理推荐相关的HTTP请求
 *
 * Requirements: 1.1, 1.3, 2.1
 */

import type { Request, Response } from "express";
import { recommendationService } from "../services/recommendationService";
import logger from "../utils/logger";

export class RecommendationController {
  /**
   * 获取个性化推荐
   * GET /recommendations
   * Requirements: 1.1
   */
  static async getRecommendations(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).user?.id || (req as any).userId;

      if (!userId) {
        res.status(401).json({ error: "未授权访问" });
        return;
      }

      const limit = parseInt(req.query.limit as string, 10) || 5;

      // 限制最大推荐数量
      const safeLimit = Math.min(Math.max(1, limit), 10);

      const recommendations = await recommendationService.getPersonalizedRecommendations(userId, safeLimit);

      res.json({
        success: true,
        data: recommendations,
        count: recommendations.length,
      });
    } catch (error) {
      logger.error("[RecommendationController] 获取推荐失败:", error);
      res.status(500).json({ error: "获取推荐失败" });
    }
  }

  /**
   * 获取热门语音风格
   * GET /recommendations/popular
   */
  static async getPopularStyles(req: Request, res: Response): Promise<void> {
    try {
      const limit = parseInt(req.query.limit as string, 10) || 5;
      const safeLimit = Math.min(Math.max(1, limit), 10);

      const styles = await recommendationService.getPopularStyles(safeLimit);

      res.json({
        success: true,
        data: styles,
        count: styles.length,
      });
    } catch (error) {
      logger.error("[RecommendationController] 获取热门风格失败:", error);
      res.status(500).json({ error: "获取热门风格失败" });
    }
  }

  /**
   * 记录用户选择
   * POST /recommendations/select
   * Requirements: 1.3
   */
  static async recordSelection(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).user?.id || (req as any).userId;

      if (!userId) {
        res.status(401).json({ error: "未授权访问" });
        return;
      }

      const { styleId, textContent, voiceStyle } = req.body;

      if (!styleId) {
        res.status(400).json({ error: "缺少必要参数: styleId" });
        return;
      }

      await recommendationService.recordSelection(userId, styleId, textContent || "", voiceStyle);

      res.json({
        success: true,
        message: "选择已记录",
      });
    } catch (error) {
      logger.error("[RecommendationController] 记录选择失败:", error);
      res.status(500).json({ error: "记录选择失败" });
    }
  }

  /**
   * 分析文本内容
   * POST /recommendations/analyze
   * Requirements: 2.1
   */
  static async analyzeContent(req: Request, res: Response): Promise<void> {
    try {
      const { text } = req.body;

      if (!text || typeof text !== "string") {
        res.status(400).json({ error: "缺少必要参数: text" });
        return;
      }

      // 限制文本长度
      const safeText = text.substring(0, 10000);

      const suggestion = await recommendationService.analyzeContent(safeText);

      res.json({
        success: true,
        data: suggestion,
      });
    } catch (error) {
      logger.error("[RecommendationController] 内容分析失败:", error);
      res.status(500).json({ error: "内容分析失败" });
    }
  }

  /**
   * 应用内容建议
   * POST /recommendations/apply
   * Requirements: 2.4
   */
  static async applySuggestion(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).user?.id || (req as any).userId;

      if (!userId) {
        res.status(401).json({ error: "未授权访问" });
        return;
      }

      const { suggestion } = req.body;

      if (!suggestion) {
        res.status(400).json({ error: "缺少必要参数: suggestion" });
        return;
      }

      // 验证建议格式
      try {
        const serialized = recommendationService.serializeContentSuggestion(suggestion);
        recommendationService.parseContentSuggestion(serialized);
      } catch {
        res.status(400).json({ error: "无效的建议格式" });
        return;
      }

      res.json({
        success: true,
        message: "建议已应用",
        appliedParameters: suggestion.voiceParameters,
      });
    } catch (error) {
      logger.error("[RecommendationController] 应用建议失败:", error);
      res.status(500).json({ error: "应用建议失败" });
    }
  }
}
