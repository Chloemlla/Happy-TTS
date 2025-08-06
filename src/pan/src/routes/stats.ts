import { Router, Request, Response } from 'express';
import { logger } from '@/utils/logger';

const router = Router();

// 模拟数据（实际项目中应该使用数据库）
const mockStats = {
  totalResources: 15,
  totalCDKs: 1250,
  usedCDKs: 342,
  availableCDKs: 908,
  totalDownloads: 2847,
  totalRevenue: 28470.50,
  lastAdminLogin: new Date('2024-01-15T10:30:00Z')
};

// 获取总体统计信息
router.get('/', (req: Request, res: Response) => {
  try {
    res.json({
      success: true,
      data: mockStats
    });
  } catch (error) {
    logger.error('Get stats error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: '获取统计信息时发生错误'
    });
  }
});

// 获取资源统计
router.get('/resources', (req: Request, res: Response) => {
  try {
    const resourceStats = {
      total: mockStats.totalResources,
      byCategory: {
        '软件': 8,
        '游戏': 4,
        '工具': 3
      },
      byStatus: {
        active: 12,
        inactive: 3
      },
      recentAdditions: 5
    };

    res.json({
      success: true,
      data: resourceStats
    });
  } catch (error) {
    logger.error('Get resource stats error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: '获取资源统计时发生错误'
    });
  }
});

// 获取CDK统计
router.get('/cdks', (req: Request, res: Response) => {
  try {
    const cdkStats = {
      total: mockStats.totalCDKs,
      used: mockStats.usedCDKs,
      available: mockStats.availableCDKs,
      usageRate: ((mockStats.usedCDKs / mockStats.totalCDKs) * 100).toFixed(2),
      byResource: {
        'resource-1': 150,
        'resource-2': 200,
        'resource-3': 100
      },
      recentUsage: 25
    };

    res.json({
      success: true,
      data: cdkStats
    });
  } catch (error) {
    logger.error('Get CDK stats error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: '获取CDK统计时发生错误'
    });
  }
});

// 获取收入统计
router.get('/revenue', (req: Request, res: Response) => {
  try {
    const revenueStats = {
      total: mockStats.totalRevenue,
      monthly: [
        { month: '2024-01', revenue: 8500.25 },
        { month: '2024-02', revenue: 9200.50 },
        { month: '2024-03', revenue: 10769.75 }
      ],
      byResource: {
        'resource-1': 8500.25,
        'resource-2': 12000.00,
        'resource-3': 7970.25
      },
      averageOrderValue: 9.99
    };

    res.json({
      success: true,
      data: revenueStats
    });
  } catch (error) {
    logger.error('Get revenue stats error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: '获取收入统计时发生错误'
    });
  }
});

// 获取系统状态
router.get('/system', (req: Request, res: Response) => {
  try {
    const systemStats = {
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      version: process.version,
      platform: process.platform,
      lastAdminLogin: mockStats.lastAdminLogin,
      activeSessions: 3,
      serverTime: new Date()
    };

    res.json({
      success: true,
      data: systemStats
    });
  } catch (error) {
    logger.error('Get system stats error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: '获取系统状态时发生错误'
    });
  }
});

export default router;