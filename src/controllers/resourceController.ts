import type { Request, Response } from "express";
import { firstString } from "../utils/httpParam";
import logger from "../utils/logger";

// AuthRequest接口直接定义在这里
interface AuthRequest extends Request {
  user?: any;
}

import { ResourceService } from "../services/resourceService";

const resourceService = new ResourceService();

// 获取资源列表
export const getResources = async (req: Request, res: Response) => {
  try {
    const page = Number(firstString(req.query.page) || "1");
    const category = firstString(req.query.category);
    const resources = await resourceService.getResources(page, category);
    res.json(resources);
  } catch (error) {
    logger.error("获取资源列表失败:", error);
    res.status(500).json({ message: "获取资源列表失败" });
  }
};

// 获取资源详情
export const getResourceById = async (req: Request, res: Response) => {
  try {
    const id = firstString(req.params.id);
    if (!id) return res.status(400).json({ message: "无效的资源ID" });
    const resource = await resourceService.getResourceById(id);
    if (!resource) {
      return res.status(404).json({ message: "资源不存在" });
    }
    res.json(resource);
  } catch (_error) {
    res.status(500).json({ message: "获取资源详情失败" });
  }
};

// 获取分类列表
export const getCategories = async (_req: Request, res: Response) => {
  try {
    const categories = await resourceService.getCategories();
    res.json(categories);
  } catch (_error) {
    res.status(500).json({ message: "获取分类列表失败" });
  }
};

// 创建资源
export const createResource = async (req: AuthRequest, res: Response) => {
  try {
    const resource = await resourceService.createResource(req.body);
    res.status(201).json(resource);
  } catch (_error) {
    res.status(500).json({ message: "创建资源失败" });
  }
};

// 更新资源
export const updateResource = async (req: AuthRequest, res: Response) => {
  try {
    const id = firstString(req.params.id);
    if (!id) return res.status(400).json({ message: "无效的资源ID" });
    const resource = await resourceService.updateResource(id, req.body);
    if (!resource) {
      return res.status(404).json({ message: "资源不存在" });
    }
    res.json(resource);
  } catch (_error) {
    res.status(500).json({ message: "更新资源失败" });
  }
};

// 删除资源
export const deleteResource = async (req: AuthRequest, res: Response) => {
  try {
    const id = firstString(req.params.id);
    if (!id) return res.status(400).json({ message: "无效的资源ID" });
    await resourceService.deleteResource(id);
    res.status(204).send();
  } catch (_error) {
    res.status(500).json({ message: "删除资源失败" });
  }
};

// 获取资源统计信息
export const getResourceStats = async (_req: AuthRequest, res: Response) => {
  try {
    const stats = await resourceService.getResourceStats();
    res.json(stats);
  } catch (_error) {
    res.status(500).json({ message: "获取资源统计信息失败" });
  }
};

// 初始化测试资源（仅用于开发和测试）
export const initializeTestResources = async (_req: AuthRequest, res: Response) => {
  try {
    const result = await resourceService.initializeTestResources();
    res.json(result);
  } catch (error) {
    logger.error("初始化测试资源失败:", error);
    res.status(500).json({ message: "初始化测试资源失败" });
  }
};
