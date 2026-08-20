import type { Request, Response } from "express";
import logger from "../utils/logger";
import {
  deleteDonationClaim,
  deleteDonationSetting,
  getDonationSetting,
  getPublicDonationConfig,
  listDonationClaims,
  resolveDonationImage,
  setDonationSetting,
  submitDonationClaim,
} from "../services/cdictDonationService";

/**
 * CDict 赞赏码控制器。
 *
 * 公开接口给客户端用：回渠道文案，以及收款码图片的 302 跳转——后台填的图片地址原样下发，
 * 服务端不下载也不缓存图片；只有地址留空时才回服务端内置文件的字节。
 * 管理接口给 env-manager 后台用，写操作由超管鉴权中间件把关。
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
        supporters: config.supporters,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "赞赏配置读取失败";
      logger.warn("[CDict] 赞赏渠道读取失败", { message });
      fail(res, 502, message);
    }
  }

  /**
   * GET /api/cdict/donate/:channel —— 收款码。
   *
   * 后台填了图片地址就 302 到那个地址，客户端自己去图床取图；地址留空时才直接吐内置图片的字节。
   */
  public static async image(req: Request, res: Response): Promise<void> {
    const channelId = String(req.params.channel || "");
    try {
      const resolved = await resolveDonationImage(channelId);
      if (!resolved) {
        fail(res, 404, "该赞赏渠道当前没有可用的收款码");
        return;
      }
      if (resolved.kind === "redirect") {
        res.setHeader("Cache-Control", "public, max-age=300");
        res.redirect(302, resolved.url);
        return;
      }
      res.setHeader("Content-Type", resolved.image.contentType);
      res.setHeader("Cache-Control", "public, max-age=3600");
      res.status(200).send(resolved.image.data);
    } catch (error) {
      const message = error instanceof Error ? error.message : "收款码获取失败";
      logger.warn("[CDict] 收款码获取失败", { channel: channelId, message });
      fail(res, 502, message);
    }
  }

  /**
   * POST /api/cdict/donate/claim —— 提交署名申请（交易号 + 想展示的称呼）。
   *
   * 只落库这两项，由开发者在后台核对交易号后决定是否加入鸣谢名单；重复提交同一交易号是幂等的。
   */
  public static async claim(req: Request, res: Response): Promise<void> {
    try {
      const result = await submitDonationClaim(req.body || {});
      res.json({
        success: true,
        duplicated: result.duplicated,
        message: result.duplicated
          ? "这个交易号已经提交过了，正在等待核实"
          : "已提交，开发者核实后会把你的名字加入鸣谢名单",
      });
    } catch (error) {
      fail(res, 400, error instanceof Error ? error.message : "提交失败");
    }
  }

  /** GET /api/admin/cdict-donation/claims —— 后台读取待核实的署名申请。 */
  public static async getClaims(_req: Request, res: Response): Promise<void> {
    try {
      res.json({ success: true, claims: await listDonationClaims() });
    } catch (error) {
      fail(res, 500, error instanceof Error ? error.message : "读取署名申请失败");
    }
  }

  /** DELETE /api/admin/cdict-donation/claims/:id —— 核实完删除该申请。 */
  public static async deleteClaim(req: Request, res: Response): Promise<void> {
    try {
      await deleteDonationClaim(String(req.params.id || ""));
      res.json({ success: true });
    } catch (error) {
      fail(res, 400, error instanceof Error ? error.message : "删除署名申请失败");
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
