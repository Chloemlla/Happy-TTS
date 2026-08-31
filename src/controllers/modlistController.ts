import * as crypto from "node:crypto";
import type { Request, Response } from "express";
import {
  addMod as addModStorage,
  batchAddMods as batchAddModsService,
  batchDeleteMods as batchDeleteModsService,
  deleteMod as deleteModStorage,
  getAllMods,
  updateMod as updateModStorage,
} from "../services/modlistStorage";
import { mongoose } from "../services/mongoService";
import { getTokenFromRequest } from "../utils/authCookie";
import logger from "../utils/logger";

// 使用 MongoDB 存储和读取修改码（MODIFY_CODE），不再读取环境变量
const ModlistSettingSchema = new mongoose.Schema(
  {
    key: { type: String, default: "MODIFY_CODE" },
    code: { type: String, required: true },
    updatedAt: { type: Date, default: Date.now },
  },
  { collection: "modlist_settings" },
);
const ModlistSettingModel = mongoose.models.ModlistSetting || mongoose.model("ModlistSetting", ModlistSettingSchema);

async function getModifyCodeFromDb(): Promise<string | null> {
  try {
    const doc = (await ModlistSettingModel.findOne({ key: "MODIFY_CODE" }).lean().exec()) as { code?: string } | null;
    return doc && typeof doc.code === "string" && doc.code.length > 0 ? doc.code : null;
  } catch {
    return null;
  }
}

// G3-23: 修改码比较用定时安全比较，避免短路字符串比较
function timingSafeCodeEqual(candidate: unknown, expected: string): boolean {
  if (typeof candidate !== "string") return false;
  const a = Buffer.from(candidate);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export const getModList = async (req: Request, res: Response) => {
  try {
    const { withHash, withMd5 } = req.query;
    const mods = await getAllMods({
      withHash: withHash === "1" || withHash === "true",
      withMd5: withMd5 === "1" || withMd5 === "true",
    });

    // 检查是否为管理员用户
    if (req.user && (req.user.role === "admin" || req.user.role === "superadmin")) {
      // 获取管理员token作为加密密钥（优先从 Authorization header，其次从 cookie）
      const token = getTokenFromRequest(req);
      if (!token) {
        res.status(401).json({ error: "未携带Token，请先登录" });
        return;
      }

      // 使用AES-256-CBC加密数据
      const algorithm = "aes-256-cbc";
      const key = crypto.createHash("sha256").update(token).digest();
      const iv = crypto.randomBytes(16);
      const cipher = crypto.createCipheriv(algorithm, key, iv);
      const jsonData = JSON.stringify({ mods });
      let encrypted = cipher.update(jsonData, "utf8", "hex");
      encrypted += cipher.final("hex");

      res.json({
        success: true,
        data: encrypted,
        iv: iv.toString("hex"),
      });
    } else {
      // 普通用户或未登录用户，返回未加密数据
      res.json({ mods });
    }
  } catch (error) {
    logger.error("获取MOD列表失败:", error);
    res.status(500).json({ error: "获取MOD列表失败" });
  }
};

export const getModListJson = async (req: Request, res: Response) => {
  try {
    const { withHash, withMd5 } = req.query;
    const mods = await getAllMods({
      withHash: withHash === "1" || withHash === "true",
      withMd5: withMd5 === "1" || withMd5 === "true",
    });

    res.json(mods);
  } catch (error) {
    logger.error("获取JSON格式MOD列表失败:", error);
    res.status(500).json({ error: "获取MOD列表失败" });
  }
};

export const addMod = async (req: Request, res: Response) => {
  try {
    const { name, code, hash, md5 } = req.body;
    if (!name || typeof name !== "string") {
      return res.status(400).json({ error: "MOD名不能为空" });
    }

    const expected = await getModifyCodeFromDb();
    if (!expected || !timingSafeCodeEqual(code, expected)) {
      return res.status(403).json({ error: "修改码错误" });
    }

    const newMod = await addModStorage({ name, hash, md5 });
    res.json({ success: true, mod: newMod });
  } catch (e: any) {
    logger.error("添加MOD失败:", e);
    res.status(409).json({ error: e.message || "添加失败" });
  }
};

export const updateMod = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name, code, hash, md5 } = req.body;
    if (!id || !name || typeof name !== "string") {
      return res.status(400).json({ error: "参数错误" });
    }

    const expected = await getModifyCodeFromDb();
    if (!expected || !timingSafeCodeEqual(code, expected)) {
      return res.status(403).json({ error: "修改码错误" });
    }

    const mod = await updateModStorage(id, name, hash, md5);
    res.json({ success: true, mod });
  } catch (e: any) {
    logger.error("更新MOD失败:", e);
    res.status(404).json({ error: e.message || "修改失败" });
  }
};

export const deleteMod = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { code } = req.body;

    const expected = await getModifyCodeFromDb();
    if (!expected || !timingSafeCodeEqual(code, expected)) {
      return res.status(403).json({ error: "修改码错误" });
    }

    await deleteModStorage(id);
    res.json({ success: true });
  } catch (e: any) {
    logger.error("删除MOD失败:", e);
    res.status(404).json({ error: e.message || "删除失败" });
  }
};

export const batchAddMods = async (req: Request, res: Response) => {
  try {
    const { mods, code } = req.body;
    if (!Array.isArray(mods)) {
      return res.status(400).json({ error: "参数必须为数组" });
    }
    // G3-23: 单次批量添加数量上限，防止无界写放大
    if (mods.length > 500) {
      return res.status(400).json({ error: "单次批量添加不能超过500条" });
    }

    // 校验修改码
    const expected = await getModifyCodeFromDb();
    if (!expected || !timingSafeCodeEqual(code, expected)) {
      return res.status(403).json({ error: "修改码错误" });
    }

    const added = await batchAddModsService(mods);
    res.json({ success: true, added });
  } catch (e: any) {
    logger.error("批量添加MOD失败:", e);
    res.status(500).json({ error: e.message || "批量添加失败" });
  }
};

export const batchDeleteMods = async (req: Request, res: Response) => {
  try {
    const { ids, code } = req.body;
    if (!Array.isArray(ids)) {
      return res.status(400).json({ error: "参数必须为数组" });
    }
    // G3-23: 单次批量删除数量上限
    if (ids.length > 500) {
      return res.status(400).json({ error: "单次批量删除不能超过500条" });
    }

    // 校验修改码
    const expected = await getModifyCodeFromDb();
    if (!expected || !timingSafeCodeEqual(code, expected)) {
      return res.status(403).json({ error: "修改码错误" });
    }

    const result = await batchDeleteModsService(ids);
    res.json({ success: true, ...result });
  } catch (e: any) {
    logger.error("批量删除MOD失败:", e);
    res.status(500).json({ error: e.message || "批量删除失败" });
  }
};
