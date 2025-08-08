import { Request, Response } from 'express';
import logger from '../utils/logger';
// AuthRequest接口直接定义在这里
interface AuthRequest extends Request {
  user?: any;
}
import { CDKService } from '../services/cdkService';

const cdkService = new CDKService();

// CDK兑换
export const redeemCDK = async (req: Request, res: Response) => {
  try {
    const { code } = req.body;
    const result = await cdkService.redeemCDK(code);
    res.json(result);
  } catch (error) {
    logger.error('CDK兑换失败:', error);
    res.status(400).json({ message: '兑换失败：无效或已使用的CDK' });
  }
};

// 获取CDK列表
export const getCDKs = async (req: AuthRequest, res: Response) => {
  try {
    const { page = 1, resourceId } = req.query;
    const cdks = await cdkService.getCDKs(Number(page), resourceId as string);
    res.json(cdks);
  } catch (error) {
    logger.error('获取CDK列表失败:', error);
    res.status(500).json({ message: '获取CDK列表失败' });
  }
};

// 获取CDK统计信息
export const getCDKStats = async (req: AuthRequest, res: Response) => {
  try {
    const stats = await cdkService.getCDKStats();
    res.json(stats);
  } catch (error) {
    logger.error('获取CDK统计信息失败:', error);
    res.status(500).json({ message: '获取CDK统计信息失败' });
  }
};

// 生成CDK
export const generateCDKs = async (req: AuthRequest, res: Response) => {
  try {
    const { resourceId, count, expiresAt } = req.body;
    const cdks = await cdkService.generateCDKs(resourceId, count, expiresAt);
    res.status(201).json(cdks);
  } catch (error) {
    logger.error('生成CDK失败:', error);
    res.status(500).json({ message: '生成CDK失败' });
  }
};

// 删除CDK
export const deleteCDK = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    await cdkService.deleteCDK(id);
    res.status(204).send();
  } catch (error) {
    logger.error('删除CDK失败:', error);
    res.status(500).json({ message: '删除CDK失败' });
  }
};

// 获取用户已兑换的资源
export const getUserRedeemedResources = async (req: Request, res: Response) => {
  try {
    const userIp = req.ip || req.connection.remoteAddress || req.socket.remoteAddress || '127.0.0.1';
    const result = await cdkService.getUserRedeemedResources(userIp);
    res.json(result);
  } catch (error) {
    logger.error('获取用户已兑换资源失败:', error);
    res.status(500).json({ message: '获取已兑换资源失败' });
  }
}; 