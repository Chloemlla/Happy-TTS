import type { Request, Response } from "express";
import { AntaService } from "../services/antaService";
import { QueryStatsService } from "../services/queryStatsService";
import logger from "../utils/logger";

export class AntaController {
  private static antaService = new AntaService();
  private static getClientIp(req: Request): string {
    // 按优先级尝试从不同位置获取 IP 地址
    const ip =
      // 1. 从 X-Forwarded-For 头部获取
      (req.headers["x-forwarded-for"] as string)?.split(",")[0] ||
      // 2. 从 X-Real-IP 头部获取
      (req.headers["x-real-ip"] as string) ||
      // 3. 从 Express 的 ip 属性获取
      req.ip ||
      // 4. 从连接对象获取
      req.connection.remoteAddress ||
      // 5. 从 socket 对象获取
      req.socket.remoteAddress ||
      // 6. 如果都获取不到，返回 unknown
      "unknown";

    // 如果是 IPv6 格式的本地地址，转换为 IPv4 格式
    return ip.replace(/^::ffff:/, "");
  }

  public static async queryProduct(req: Request, res: Response) {
    try {
      const { barcode, itemNumber, ean, size } = req.body;
      const ip = AntaController.getClientIp(req);

      // 记录请求日志
      logger.info("收到安踏产品查询请求", {
        ip,
        barcode,
        itemNumber,
        ean,
        size,
        userAgent: req.headers["user-agent"],
        timestamp: new Date().toISOString(),
      });

      // 基本参数验证
      if (!barcode || typeof barcode !== "string" || barcode.trim().length === 0) {
        logger.warn("安踏产品查询参数无效", { ip, barcode });
        return res.status(400).json({
          success: false,
          error: "条码不能为空",
        });
      }

      // 条码格式验证 - 只允许字母数字和常见符号
      const barcodePattern = /^[a-zA-Z0-9\-_.]+$/;
      if (!barcodePattern.test(barcode)) {
        logger.warn("安踏产品条码格式无效", { ip, barcode });
        return res.status(400).json({
          success: false,
          error: "条码格式不正确，只允许字母、数字、横线、下划线和点号",
        });
      }

      // 条码长度限制
      if (barcode.length > 50) {
        logger.warn("安踏产品条码过长", { ip, barcode: `${barcode.substring(0, 20)}...` });
        return res.status(400).json({
          success: false,
          error: "条码长度不能超过50个字符",
        });
      }

      // 实际调用安踏服务
      const result = await AntaController.antaService.queryProductWithParams({
        barcode,
        itemNumber,
        ean,
        size,
      });

      if (!result.success) {
        const msg = result.error || "查询失败";
        const isNotFound = msg.includes("未找到");
        logger.warn("安踏产品查询失败", { ip, barcode, error: msg });
        return res.status(isNotFound ? 404 : 502).json({
          success: false,
          error: msg,
        });
      }

      // 记录查询统计（仅在查询成功时）
      let localQueryCount = 0;
      const officialQueryCount = result.data?.queryCount;

      try {
        localQueryCount = await QueryStatsService.recordQuery(
          barcode,
          ip,
          req.headers["user-agent"] as string | undefined,
          officialQueryCount,
        );
      } catch (e) {
        logger.warn("记录查询统计失败，但不影响主流程", {
          barcode,
          ip,
          error: e instanceof Error ? e.message : String(e),
        });
      }

      // 优先使用官方查询次数，如果没有则使用本地统计
      const finalQueryCount = officialQueryCount || localQueryCount;

      logger.info("安踏产品查询请求成功", {
        ip,
        barcode,
        localQueryCount,
        officialQueryCount,
        finalQueryCount,
      });

      return res.status(200).json({
        success: true,
        data: {
          ...result.data,
          queryCount: finalQueryCount,
        },
      });
    } catch (error) {
      logger.error("安踏产品查询失败:", error);
      return res.status(500).json({
        success: false,
        error: "服务器内部错误，请稍后重试",
      });
    }
  }

  /**
   * 获取某产品的查询统计
   */
  public static async getProductStats(req: Request, res: Response) {
    try {
      const { productId } = req.params;
      const ip = AntaController.getClientIp(req);

      if (!productId || typeof productId !== "string" || productId.trim().length === 0) {
        return res.status(400).json({ success: false, error: "产品ID不能为空" });
      }
      const productIdPattern = /^[a-zA-Z0-9\-_.]+$/;
      if (!productIdPattern.test(productId) || productId.length > 50) {
        return res.status(400).json({ success: false, error: "产品ID格式不正确或过长" });
      }

      const stats = await QueryStatsService.getStats(productId);
      if (!stats) {
        logger.info("未找到产品统计", { productId, ip });
        return res.status(404).json({ success: false, error: "未找到该产品的统计信息" });
      }
      return res.status(200).json({ success: true, data: stats });
    } catch (error) {
      logger.error("获取产品统计失败", { error });
      return res.status(500).json({ success: false, error: "服务器内部错误，请稍后重试" });
    }
  }

  /**
   * 获取查询次数最多的产品
   */
  public static async getTopStats(req: Request, res: Response) {
    try {
      const limitRaw = (req.query.limit as string) || "10";
      let limit = parseInt(limitRaw, 10);
      if (Number.isNaN(limit) || limit <= 0) limit = 10;
      if (limit > 100) limit = 100;

      const list = await QueryStatsService.getTopProducts(limit);
      return res.status(200).json({ success: true, data: list });
    } catch (error) {
      logger.error("获取Top统计失败", { error });
      return res.status(500).json({ success: false, error: "服务器内部错误，请稍后重试" });
    }
  }

  /**
   * 获取最近查询历史
   */
  public static async getRecentHistory(req: Request, res: Response) {
    try {
      // 安全地提取和验证 productId 参数，防止类型混淆攻击
      const productIdRaw = req.query.productId;
      let productId: string | undefined;

      if (productIdRaw) {
        // 确保 productId 是字符串类型，如果是数组则取第一个值
        if (typeof productIdRaw === "string") {
          productId = productIdRaw;
        } else if (Array.isArray(productIdRaw) && productIdRaw.length > 0 && typeof productIdRaw[0] === "string") {
          productId = productIdRaw[0];
        } else {
          return res.status(400).json({ success: false, error: "产品ID参数格式不正确" });
        }
      }

      // 安全地提取和验证 limit 参数
      const limitRaw = req.query.limit;
      let limitStr: string;

      if (typeof limitRaw === "string") {
        limitStr = limitRaw;
      } else if (Array.isArray(limitRaw) && limitRaw.length > 0 && typeof limitRaw[0] === "string") {
        limitStr = limitRaw[0];
      } else {
        limitStr = "50";
      }

      let limit = parseInt(limitStr, 10);
      if (Number.isNaN(limit) || limit <= 0) limit = 50;
      if (limit > 200) limit = 200;

      // 验证 productId 格式（如果提供了的话）
      if (productId) {
        const productIdPattern = /^[a-zA-Z0-9\-_.]+$/;
        if (!productIdPattern.test(productId) || productId.length > 50) {
          return res.status(400).json({ success: false, error: "产品ID格式不正确或过长" });
        }
      }

      const list = await QueryStatsService.getRecentHistory(productId, limit);
      return res.status(200).json({ success: true, data: list });
    } catch (error) {
      logger.error("获取查询历史失败", { error });
      return res.status(500).json({ success: false, error: "服务器内部错误，请稍后重试" });
    }
  }

  /**
   * 兼容性方法：通过URL参数查询产品（保留旧API）
   */
  public static async queryProductLegacy(req: Request, res: Response) {
    try {
      const { productId } = req.params;
      const ip = AntaController.getClientIp(req);

      // 记录请求日志
      logger.info("收到安踏产品查询请求（兼容模式）", {
        ip,
        productId,
        userAgent: req.headers["user-agent"],
        timestamp: new Date().toISOString(),
      });

      // 基本参数验证
      if (!productId || typeof productId !== "string" || productId.trim().length === 0) {
        logger.warn("安踏产品查询参数无效", { ip, productId });
        return res.status(400).json({
          success: false,
          error: "产品ID不能为空",
        });
      }

      // 产品ID格式验证
      const productIdPattern = /^[a-zA-Z0-9\-_.]+$/;
      if (!productIdPattern.test(productId)) {
        logger.warn("安踏产品ID格式无效", { ip, productId });
        return res.status(400).json({
          success: false,
          error: "产品ID格式不正确，只允许字母、数字、横线、下划线和点号",
        });
      }

      // 产品ID长度限制
      if (productId.length > 50) {
        logger.warn("安踏产品ID过长", { ip, productId: `${productId.substring(0, 20)}...` });
        return res.status(400).json({
          success: false,
          error: "产品ID长度不能超过50个字符",
        });
      }

      // 使用旧的查询方法
      const result = await AntaController.antaService.queryProduct(productId);

      if (!result.success) {
        const msg = result.error || "查询失败";
        const isNotFound = msg.includes("未找到");
        logger.warn("安踏产品查询失败", { ip, productId, error: msg });
        return res.status(isNotFound ? 404 : 502).json({
          success: false,
          error: msg,
        });
      }

      // 记录查询统计
      let localQueryCount = 0;
      const officialQueryCount = result.data?.queryCount;

      try {
        localQueryCount = await QueryStatsService.recordQuery(
          productId,
          ip,
          req.headers["user-agent"] as string | undefined,
          officialQueryCount,
        );
      } catch (e) {
        logger.warn("记录查询统计失败，但不影响主流程", {
          productId,
          ip,
          error: e instanceof Error ? e.message : String(e),
        });
      }

      const finalQueryCount = officialQueryCount || localQueryCount;

      logger.info("安踏产品查询请求成功（兼容模式）", {
        ip,
        productId,
        localQueryCount,
        officialQueryCount,
        finalQueryCount,
      });

      return res.status(200).json({
        success: true,
        data: {
          ...result.data,
          queryCount: finalQueryCount,
        },
      });
    } catch (error) {
      logger.error("安踏产品查询失败（兼容模式）:", error);
      return res.status(500).json({
        success: false,
        error: "服务器内部错误，请稍后重试",
      });
    }
  }
}
