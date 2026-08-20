import type { Request, Response } from "express";
import logger from "../utils/logger";
import {
  deleteDonationSetting,
  getDonationImage,
  getDonationSetting,
  getPublicDonationConfig,
  setDonationSetting,
} from "../services/cdictDonationService";

/**
 * CDict 赞赏码控制器。
 *
 * 公开接口给客户端用：只回渠道文案与图片字节，图片来源（后台配置的远端地址或服务端内置文件）
 * 完全不暴露给客户端。管理接口给 env-manager 后台用，写操作由超管鉴权中间件把关。
 */

function fail(res: Response, status: number, message: string): void {
  res.status(status).json({ success: false, code: status, error: message, message });
}

export class CDictDonationController {
  /** GET /api/cdict/donate —— 渠道列表；未配置或已下线时回 404，客户端按"暂不可用"处理。 */
  public static async channels(_req: Request, res: Response): Promise<void> {
    try {
      const config = await getPublicDonationConfig();
      if (!config.enabled || config.channels.length === 0) {
        fail(res, 404, "赞赏功能当前未开启");
        return;
      }
      res.setHeader("Cache-Control", "public, max-age=300");
      res.json({
        success: true,
        notice: config.notice,
        channels: config.channels.map((channel) => ({
          id: channel.id,
          name: channel.name,
          hint: channel.hint,
        })),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "赞赏配置读取失败";
      logger.warn("[CDict] 赞赏渠道读取失败", { message });
      fail(res, 502, message);
    }
  }

  /** GET /api/cdict/donate/:channel —— 收款码图片字节。 */
  public static async image(req: Request, res: Response): Promise<void> {
    const channelId = String(req.params.channel || "");
    try {
      const image = await getDonationImage(channelId);
      if (!image) {
        fail(res, 404, "该赞赏渠道当前没有可用的收款码");
        return;
      }
      res.setHeader("Content-Type", image.contentType);
      res.setHeader("Cache-Control", "public, max-age=3600");
      res.status(200).send(image.data);
    } catch (error) {
      const message = error instanceof Error ? error.message : "收款码获取失败";
      logger.warn("[CDict] 收款码获取失败", { channel: channelId, message });
      fail(res, 502, message);
    }
  }

  /** GET /api/admin/cdict-donation/setting —— 后台读取完整配置。 */
  public static async getSetting(_req: Request, res: Response): Promise<void> {
    try {
      const setting = await getDonationSetting();
      res.json({ success: true, setting });
    } catch (error) {
      fail(res, 500, error instanceof Error ? error.message : "读取赞赏配置失败");
    }
  }

  /** POST /api/admin/cdict-donation/setting —— 后台整体覆盖配置。 */
  public static async setSetting(req: Request, res: Response): Promise<void> {
    try {
      const result = await setDonationSetting(req.body || {});
      res.json({ success: true, ...result });
    } catch (error) {
      fail(res, 400, error instanceof Error ? error.message : "保存赞赏配置失败");
    }
  }

  /** DELETE /api/admin/cdict-donation/setting —— 恢复默认（内置两个渠道 + 内置图片）。 */
  public static async deleteSetting(_req: Request, res: Response): Promise<void> {
    try {
      await deleteDonationSetting();
      res.json({ success: true });
    } catch (error) {
      fail(res, 500, error instanceof Error ? error.message : "重置赞赏配置失败");
    }
  }
}
