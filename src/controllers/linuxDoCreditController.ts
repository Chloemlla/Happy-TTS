import type { Request, Response } from "express";
import { firstString } from "../utils/httpParam";
import {
  createLinuxDoCreditRecharge,
  getLinuxDoCreditPublicConfig,
  handleLinuxDoCreditNotify,
  listLinuxDoCreditOrders,
  queryLinuxDoCreditOrder,
} from "../services/linuxDoCreditService";
import logger from "../utils/logger";

function getUser(req: Request): { id: string; role?: string } | null {
  const user = (req as any).user;
  if (!user?.id) return null;
  return { id: String(user.id), role: user.role ? String(user.role) : undefined };
}

function statusFromError(error: unknown): number {
  const code = typeof (error as any)?.statusCode === "number" ? (error as any).statusCode : 500;
  return code >= 400 && code < 600 ? code : 500;
}

export class LinuxDoCreditController {
  static getConfig(_req: Request, res: Response): void {
    res.json({ success: true, config: getLinuxDoCreditPublicConfig() });
  }

  static async createRecharge(req: Request, res: Response): Promise<void> {
    try {
      const user = getUser(req);
      if (!user) {
        res.status(401).json({ error: "未登录" });
        return;
      }

      const keyId = typeof req.body?.keyId === "string" ? req.body.keyId.trim() : "";
      const money = Number(req.body?.money);
      const orderName = typeof req.body?.orderName === "string" ? req.body.orderName : undefined;

      if (!keyId) {
        res.status(400).json({ error: "keyId 不能为空" });
        return;
      }

      const result = await createLinuxDoCreditRecharge({
        userId: user.id,
        keyId,
        money,
        orderName,
        isAdmin: user.role === "admin",
      });

      res.json({ success: true, ...result });
    } catch (error) {
      const status = statusFromError(error);
      logger.error("[LinuxDoCredit] create recharge failed", error);
      res.status(status).json({
        error: error instanceof Error ? error.message : "创建充值订单失败",
        code: (error as any)?.code,
      });
    }
  }

  static async getOrder(req: Request, res: Response): Promise<void> {
    try {
      const user = getUser(req);
      if (!user) {
        res.status(401).json({ error: "未登录" });
        return;
      }
      const outTradeNo = firstString(req.params.outTradeNo);
      if (!outTradeNo) {
        res.status(400).json({ error: "缺少订单号" });
        return;
      }

      const order = await queryLinuxDoCreditOrder({
        outTradeNo,
        userId: user.id,
        isAdmin: user.role === "admin",
      });
      if (!order) {
        res.status(404).json({ error: "订单不存在" });
        return;
      }
      res.json({ success: true, order });
    } catch (error) {
      const status = statusFromError(error);
      logger.error("[LinuxDoCredit] get order failed", error);
      res.status(status).json({ error: error instanceof Error ? error.message : "查询订单失败" });
    }
  }

  static async listOrders(req: Request, res: Response): Promise<void> {
    try {
      const user = getUser(req);
      if (!user) {
        res.status(401).json({ error: "未登录" });
        return;
      }
      const keyId = firstString(req.query.keyId);
      const limit = Number(req.query.limit) || 20;
      const orders = await listLinuxDoCreditOrders({
        userId: user.id,
        isAdmin: user.role === "admin",
        keyId: keyId || undefined,
        limit,
      });
      res.json({ success: true, orders });
    } catch (error) {
      logger.error("[LinuxDoCredit] list orders failed", error);
      res.status(500).json({ error: "获取订单列表失败" });
    }
  }

  static async notify(req: Request, res: Response): Promise<void> {
    try {
      const params = { ...req.query, ...req.body } as Record<string, unknown>;
      const result = await handleLinuxDoCreditNotify(params);
      if (result.ok) {
        res.status(200).type("text/plain").send("success");
        return;
      }
      res.status(400).type("text/plain").send(result.message || "fail");
    } catch (error) {
      logger.error("[LinuxDoCredit] notify handler error", error);
      res.status(500).type("text/plain").send("error");
    }
  }
}