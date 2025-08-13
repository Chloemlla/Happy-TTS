import { Request, Response } from 'express';
import logger from '../utils/logger';
// AuthRequest接口直接定义在这里
interface AuthRequest extends Request {
  user?: any;
}
import { CDKService } from '../services/cdkService';

const cdkService = new CDKService();

// CDK兑换
export const redeemCDK = async (req: AuthRequest, res: Response) => {
  try {
    const { code, userId, username, forceRedeem } = req.body;
    
    // 构建用户信息对象
    let userInfo: { userId: string; username: string } | undefined;
    if (userId && username) {
      userInfo = { userId, username };
    } else if (req.user) {
      // 如果请求中有用户信息，使用认证用户信息
      userInfo = {
        userId: req.user.id || req.user._id || 'unknown',
        username: req.user.username || req.user.name || 'unknown'
      };
    }
    
    const result = await cdkService.redeemCDK(code, userInfo, forceRedeem);
    
    logger.info('CDK兑换成功', { 
      code, 
      userInfo,
      resourceId: result.resource.id,
      forceRedeem 
    });
    
    res.json(result);
  } catch (error: any) {
    logger.error('CDK兑换失败:', error);
    
    // 处理重复资源的特殊情况
    if (error.message === 'DUPLICATE_RESOURCE') {
      return res.status(409).json({ 
        message: 'DUPLICATE_RESOURCE',
        resourceTitle: error.resourceTitle,
        resourceId: error.resourceId
      });
    }
    
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

// 编辑CDK
export const updateCDK = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { code, resourceId, expiresAt } = req.body;
    
    const updateData: { code?: string; resourceId?: string; expiresAt?: Date } = {};
    
    if (code !== undefined) updateData.code = code;
    if (resourceId !== undefined) updateData.resourceId = resourceId;
    if (expiresAt !== undefined) updateData.expiresAt = expiresAt ? new Date(expiresAt) : undefined;
    
    const updatedCDK = await cdkService.updateCDK(id, updateData);
    
    logger.info('编辑CDK成功', { 
      id, 
      userId: req.user?.id,
      username: req.user?.username,
      updateData 
    });
    
    res.json(updatedCDK);
  } catch (error) {
    logger.error('编辑CDK失败:', error);
    res.status(400).json({ 
      message: error instanceof Error ? error.message : '编辑CDK失败' 
    });
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

// 批量删除CDK
export const batchDeleteCDKs = async (req: AuthRequest, res: Response) => {
  try {
    const { ids } = req.body;
    
    // 验证请求体
    if (!ids || !Array.isArray(ids)) {
      return res.status(400).json({ message: '请提供有效的CDK ID列表' });
    }
    
    const result = await cdkService.batchDeleteCDKs(ids);
    
    logger.info('批量删除CDK成功', { 
      userId: req.user?.id,
      username: req.user?.username,
      result 
    });
    
    res.json({
      message: '批量删除成功',
      ...result
    });
  } catch (error) {
    logger.error('批量删除CDK失败:', error);
    res.status(500).json({ 
      message: error instanceof Error ? error.message : '批量删除CDK失败' 
    });
  }
};

// 获取CDK总数量
export const getTotalCDKCount = async (req: AuthRequest, res: Response) => {
  try {
    const result = await cdkService.getTotalCDKCount();
    
    logger.info('获取CDK总数量成功', { 
      userId: req.user?.id,
      username: req.user?.username,
      totalCount: result.totalCount 
    });
    
    res.json(result);
  } catch (error) {
    logger.error('获取CDK总数量失败:', error);
    res.status(500).json({ 
      message: error instanceof Error ? error.message : '获取CDK总数量失败' 
    });
  }
};

// 删除所有CDK
export const deleteAllCDKs = async (req: AuthRequest, res: Response) => {
  try {
    const result = await cdkService.deleteAllCDKs();
    
    logger.info('删除所有CDK成功', { 
      userId: req.user?.id,
      username: req.user?.username,
      deletedCount: result.deletedCount 
    });
    
    res.json({
      message: '成功删除所有CDK',
      deletedCount: result.deletedCount
    });
  } catch (error) {
    logger.error('删除所有CDK失败:', error);
    res.status(500).json({ 
      message: error instanceof Error ? error.message : '删除所有CDK失败' 
    });
  }
};

// 删除所有未使用的CDK
export const deleteUnusedCDKs = async (req: AuthRequest, res: Response) => {
  try {
    const result = await cdkService.deleteUnusedCDKs();
    
    logger.info('删除所有未使用CDK成功', { 
      userId: req.user?.id,
      username: req.user?.username,
      deletedCount: result.deletedCount 
    });
    
    res.json({
      message: '成功删除所有未使用的CDK',
      deletedCount: result.deletedCount
    });
  } catch (error) {
    logger.error('删除所有未使用CDK失败:', error);
    res.status(500).json({ 
      message: error instanceof Error ? error.message : '删除所有未使用CDK失败' 
    });
  }
};

// 导入CDK数据（管理员）
export const importCDKs = async (req: AuthRequest, res: Response) => {
  try {
    const { content } = req.body || {};
    if (!content || typeof content !== 'string') {
      return res.status(400).json({ message: '请提供要导入的文本内容' });
    }

    const results = await cdkService.importCDKs(content);

    logger.info('导入CDK数据成功', {
      userId: req.user?.id,
      username: req.user?.username,
      ...results
    });

    res.json({
      message: `成功导入 ${results.importedCount} 个，跳过重复 ${results.skippedCount} 个，错误 ${results.errorCount} 个`,
      ...results
    });
  } catch (error) {
    logger.error('导入CDK数据失败:', error);
    res.status(500).json({ 
      message: error instanceof Error ? error.message : '导入CDK数据失败' 
    });
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