import type { Request, Response } from "express";
import { asAuthenticatedRequest } from "../types/authRequest";
import {
  BilibiliSyncError,
  bindBilibiliUid,
  getBilibiliSearchChanges,
  getBilibiliSettings,
  getBilibiliUid,
  unbindBilibiliUid,
  updateBilibiliSettings,
  upsertBilibiliSearchRecords,
} from "../services/bilibiliSyncService";
import logger from "../utils/logger";

function getUserId(req: Request): string {
  const userId = asAuthenticatedRequest(req).auth?.user.id || asAuthenticatedRequest(req).user?.id;
  if (!userId) throw new BilibiliSyncError("未授权", "BILIBILI_AUTH_REQUIRED", 401);
  return userId;
}

function includeSummary(req: Request): boolean {
  return req.body?.includeSummary === true || req.query.includeSummary === "true";
}

function sendError(res: Response, error: unknown): void {
  if (error instanceof BilibiliSyncError) {
    res.status(error.statusCode).json({ success: false, error: error.message, code: error.code, ...error.details });
    return;
  }
  logger.error("[Bilibili Sync] request failed", error);
  res.status(500).json({ success: false, error: "Bilibili 同步服务暂时不可用", code: "BILIBILI_SYNC_INTERNAL_ERROR" });
}

export async function getUid(req: Request, res: Response): Promise<void> {
  try {
    res.json({ success: true, data: await getBilibiliUid(getUserId(req)) });
  } catch (error) {
    sendError(res, error);
  }
}

export async function bindUid(req: Request, res: Response): Promise<void> {
  try {
    res.json({ success: true, data: await bindBilibiliUid(getUserId(req), req.body?.uid, req.body?.cookie) });
  } catch (error) {
    sendError(res, error);
  }
}

export async function unbindUid(req: Request, res: Response): Promise<void> {
  try {
    res.json({ success: true, data: await unbindBilibiliUid(getUserId(req)) });
  } catch (error) {
    sendError(res, error);
  }
}

export async function getSettings(req: Request, res: Response): Promise<void> {
  try {
    res.json({ success: true, data: await getBilibiliSettings(getUserId(req)) });
  } catch (error) {
    sendError(res, error);
  }
}

export async function putSettings(req: Request, res: Response): Promise<void> {
  try {
    const result = await updateBilibiliSettings(getUserId(req), req.body?.settings, req.body?.baseVersion, includeSummary(req));
    res.json({ success: true, data: result });
  } catch (error) {
    sendError(res, error);
  }
}

export async function batchSearchRecords(req: Request, res: Response): Promise<void> {
  try {
    res.json({ success: true, data: await upsertBilibiliSearchRecords(getUserId(req), req.body?.records) });
  } catch (error) {
    sendError(res, error);
  }
}

export async function getSearchChanges(req: Request, res: Response): Promise<void> {
  try {
    res.json({ success: true, data: await getBilibiliSearchChanges(getUserId(req), String(req.query.since || ""), req.query.limit) });
  } catch (error) {
    sendError(res, error);
  }
}
