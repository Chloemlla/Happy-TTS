import { Router, Request, Response } from 'express';
import { logger } from '@/utils/logger';
import { v4 as uuidv4 } from 'uuid';

const router = Router();

// 模拟CDK数据（实际项目中应该使用数据库）
let cdks = [
  {
    id: '1',
    code: 'ABCD1234EFGH5678',
    resourceId: '1',
    isUsed: false,
    usedAt: null,
    usedBy: null,
    usedIp: null,
    expiresAt: null,
    batchId: 'batch-001',
    createdAt: new Date(),
    updatedAt: new Date()
  }
];

// 生成CDK代码
function generateCDKCode(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < 16; i++) {
    if (i > 0 && i % 4 === 0) {
      result += '-';
    }
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// 获取CDK列表
router.get('/', (req: Request, res: Response) => {
  try {
    const { page = 1, limit = 10, resourceId, isUsed, batchId } = req.query;
    
    let filteredCDKs = [...cdks];

    // 资源ID筛选
    if (resourceId) {
      filteredCDKs = filteredCDKs.filter(cdk => cdk.resourceId === resourceId);
    }

    // 使用状态筛选
    if (isUsed !== undefined) {
      const used = isUsed === 'true';
      filteredCDKs = filteredCDKs.filter(cdk => cdk.isUsed === used);
    }

    // 批次ID筛选
    if (batchId) {
      filteredCDKs = filteredCDKs.filter(cdk => cdk.batchId === batchId);
    }

    // 按创建时间排序
    filteredCDKs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    // 分页
    const pageNum = parseInt(page.toString());
    const limitNum = parseInt(limit.toString());
    const startIndex = (pageNum - 1) * limitNum;
    const endIndex = startIndex + limitNum;
    const paginatedCDKs = filteredCDKs.slice(startIndex, endIndex);

    res.json({
      success: true,
      data: paginatedCDKs,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total: filteredCDKs.length,
        totalPages: Math.ceil(filteredCDKs.length / limitNum)
      }
    });
  } catch (error) {
    logger.error('Get CDKs error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: '获取CDK列表时发生错误'
    });
  }
});

// 获取CDK详情
router.get('/:id', (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const cdk = cdks.find(c => c.id === id);

    if (!cdk) {
      return res.status(404).json({
        success: false,
        error: 'CDK not found',
        message: 'CDK不存在'
      });
    }

    res.json({
      success: true,
      data: cdk
    });
  } catch (error) {
    logger.error('Get CDK error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: '获取CDK详情时发生错误'
    });
  }
});

// 生成CDK
router.post('/generate', (req: Request, res: Response) => {
  try {
    const { resourceId, quantity = 1, expiresAt } = req.body;

    // 验证必填字段
    if (!resourceId || !quantity) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields',
        message: '缺少必填字段'
      });
    }

    // 验证数量
    const qty = parseInt(quantity.toString());
    if (qty <= 0 || qty > 1000) {
      return res.status(400).json({
        success: false,
        error: 'Invalid quantity',
        message: '生成数量必须在1-1000之间'
      });
    }

    const batchId = `batch-${Date.now()}`;
    const newCDKs = [];

    for (let i = 0; i < qty; i++) {
      const newCDK = {
        id: uuidv4(),
        code: generateCDKCode(),
        resourceId,
        isUsed: false,
        usedAt: null,
        usedBy: null,
        usedIp: null,
        expiresAt: expiresAt ? new Date(expiresAt) : null,
        batchId,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      cdks.push(newCDK);
      newCDKs.push(newCDK);
    }

    logger.info(`Generated ${qty} CDKs for resource ${resourceId}, batch: ${batchId}`);

    res.status(201).json({
      success: true,
      message: `成功生成 ${qty} 个CDK`,
      data: {
        batchId,
        cdks: newCDKs,
        count: qty
      }
    });
  } catch (error) {
    logger.error('Generate CDKs error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: '生成CDK时发生错误'
    });
  }
});

// 删除CDK
router.delete('/:id', (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const cdkIndex = cdks.findIndex(c => c.id === id);

    if (cdkIndex === -1) {
      return res.status(404).json({
        success: false,
        error: 'CDK not found',
        message: 'CDK不存在'
      });
    }

    const deletedCDK = cdks[cdkIndex];
    
    // 检查CDK是否已被使用
    if (deletedCDK.isUsed) {
      return res.status(400).json({
        success: false,
        error: 'CDK already used',
        message: '无法删除已使用的CDK'
      });
    }

    cdks.splice(cdkIndex, 1);

    logger.info(`CDK deleted: ${deletedCDK.code}`);

    res.json({
      success: true,
      message: 'CDK删除成功',
      data: deletedCDK
    });
  } catch (error) {
    logger.error('Delete CDK error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: '删除CDK时发生错误'
    });
  }
});

// 批量删除CDK
router.delete('/batch/:batchId', (req: Request, res: Response) => {
  try {
    const { batchId } = req.params;
    const batchCDKs = cdks.filter(c => c.batchId === batchId && !c.isUsed);

    if (batchCDKs.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'No unused CDKs found in batch',
        message: '批次中没有未使用的CDK'
      });
    }

    // 删除未使用的CDK
    cdks = cdks.filter(c => !(c.batchId === batchId && !c.isUsed));

    logger.info(`Deleted ${batchCDKs.length} unused CDKs from batch ${batchId}`);

    res.json({
      success: true,
      message: `成功删除 ${batchCDKs.length} 个未使用的CDK`,
      data: {
        deletedCount: batchCDKs.length,
        batchId
      }
    });
  } catch (error) {
    logger.error('Delete batch CDKs error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: '批量删除CDK时发生错误'
    });
  }
});

// 获取CDK统计信息
router.get('/stats/summary', (req: Request, res: Response) => {
  try {
    const totalCDKs = cdks.length;
    const usedCDKs = cdks.filter(c => c.isUsed).length;
    const availableCDKs = totalCDKs - usedCDKs;
    const expiredCDKs = cdks.filter(c => c.expiresAt && new Date() > c.expiresAt).length;

    res.json({
      success: true,
      data: {
        total: totalCDKs,
        used: usedCDKs,
        available: availableCDKs,
        expired: expiredCDKs,
        usageRate: totalCDKs > 0 ? (usedCDKs / totalCDKs * 100).toFixed(2) : '0'
      }
    });
  } catch (error) {
    logger.error('Get CDK stats error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: '获取CDK统计信息时发生错误'
    });
  }
});

export default router; 