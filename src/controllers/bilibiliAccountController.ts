import type { Request, Response } from "express";
import { asAuthenticatedRequest } from "../types/authRequest";
import { BilibiliSyncError } from "../services/bilibiliSyncService";
import {
  listBilibiliAccounts,
  pruneBilibiliAccounts,
  removeBilibiliAccount,
  upsertBilibiliAccount,
} from "../services/bilibiliAccountService";
import logger from "../utils/logger";

function getUserId(req: Request): string {
  const userId = asAuthenticatedRequest(req).auth?.user.id || asAuthenticatedRequest(req).user?.id;
  if (!userId) throw new BilibiliSyncError("未授权", "BILIBILI_AUTH_REQUIRED", 401);
  return userId;
}

function sendError(res: Response, error: unknown): void {
  if (error instanceof BilibiliSyncError) {
    res.status(error.statusCode).json({ success: false, error: error.message, code: error.code, ...error.details });
    return;
  }
  logger.error("[Bilibili Account Sync] request failed", error);
  res.status(500).json({ success: false, error: "Bilibili 账号同步服务暂时不可用", code: "BILIBILI_ACCOUNT_SYNC_INTERNAL_ERROR" });
}

export async function listAccounts(req: Request, res: Response): Promise<void> {
  try {
    res.json({ success: true, data: await listBilibiliAccounts(getUserId(req)) });
  } catch (error) {
    sendError(res, error);
  }
}

export async function upsertAccount(req: Request, res: Response): Promise<void> {
  try {
    const data = await upsertBilibiliAccount(getUserId(req), {
      uid: req.body?.uid,
      cookie: req.body?.cookie,
      isPrimary: req.body?.isPrimary === true,
      device: req.body?.device,
      permissions: req.body?.permissions,
      client: req.body?.client,
    });
    res.json({ success: true, data });
  } catch (error) {
    sendError(res, error);
  }
}

export async function removeAccount(req: Request, res: Response): Promise<void> {
  try {
    res.json({ success: true, data: await removeBilibiliAccount(getUserId(req), req.params?.uid) });
  } catch (error) {
    sendError(res, error);
  }
}

export async function pruneAccounts(req: Request, res: Response): Promise<void> {
  try {
    res.json({ success: true, data: await pruneBilibiliAccounts(getUserId(req), req.body?.activeUids) });
  } catch (error) {
    sendError(res, error);
  }
}
