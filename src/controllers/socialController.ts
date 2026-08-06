import type { Request, Response } from "express";
import { SocialService } from "../services/socialService";
import { getClientIP } from "../utils/ipUtils";
import logger from "../utils/logger";

export class SocialController {
  /**
   * 微博热搜
   */
  public static async weiboHot(req: Request, res: Response) {
    try {
      const ip = SocialController.getClientIp(req);

      logger.info("收到微博热搜请求", {
        ip,
        userAgent: req.headers["user-agent"],
      });

      const result = await SocialService.weiboHot();

      if (result.success) {
        res.json({
          success: true,
          message: "微博热搜获取完成",
          data: result.data,
        });
      } else {
        res.status(500).json({
          success: false,
          error: result.error,
        });
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "获取失败";

      logger.error("微博热搜获取失败", {
        ip: SocialController.getClientIp(req),
        error: errorMessage,
      });

      res.status(500).json({
        success: false,
        error: errorMessage,
      });
    }
  }

  /**
   * 百度热搜
   */
  public static async baiduHot(req: Request, res: Response) {
    try {
      const ip = SocialController.getClientIp(req);

      logger.info("收到百度热搜请求", {
        ip,
        userAgent: req.headers["user-agent"],
      });

      const result = await SocialService.baiduHot();

      if (result.success) {
        res.json({
          success: true,
          message: "百度热搜获取完成",
          data: result.data,
        });
      } else {
        res.status(500).json({
          success: false,
          error: result.error,
        });
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "获取失败";

      logger.error("百度热搜获取失败", {
        ip: SocialController.getClientIp(req),
        error: errorMessage,
      });

      res.status(500).json({
        success: false,
        error: errorMessage,
      });
    }
  }

  /**
   * 获取客户端IP地址
   */
  private static getClientIp(req: Request): string {
    return getClientIP(req);
  }
}
