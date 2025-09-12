import { Request, Response } from 'express';
import { GitHubBillingService } from '../services/githubBillingService';

export class GitHubBillingController {
  
  /**
   * 保存 curl 命令配置
   * POST /api/github-billing/config
   */
  static async saveCurlConfig(req: Request, res: Response): Promise<void> {
    try {
      const { curlCommand } = req.body;

      if (!curlCommand || typeof curlCommand !== 'string') {
        res.status(400).json({ 
          error: '请提供有效的 curl 命令',
          message: 'curlCommand 字段是必需的且必须是字符串'
        });
        return;
      }

      // URL 验证将在 parseCurlCommand 中进行，这里只做基本检查
      if (!curlCommand.includes('github.com')) {
        res.status(400).json({ 
          error: '无效的 curl 命令',
          message: 'curl 命令必须包含 GitHub 相关的 URL'
        });
        return;
      }

      const parsed = await GitHubBillingService.saveCurlConfig(curlCommand);

      res.json({
        success: true,
        message: 'curl 命令配置已保存',
        data: {
          url: parsed.url,
          method: parsed.method,
          customerId: parsed.customerId,
          headersCount: Object.keys(parsed.headers).length,
          hasCookies: !!parsed.cookies
        }
      });
    } catch (error) {
      console.error('保存 curl 配置失败:', error);
      res.status(500).json({ 
        error: '保存配置失败',
        message: error instanceof Error ? error.message : '未知错误'
      });
    }
  }

  /**
   * 获取保存的 curl 配置
   * GET /api/github-billing/config
   */
  static async getCurlConfig(req: Request, res: Response): Promise<void> {
    try {
      const config = await GitHubBillingService.getSavedCurlConfig();

      if (!config) {
        res.status(404).json({ 
          error: '未找到配置',
          message: '请先保存 curl 命令配置'
        });
        return;
      }

      // 不返回敏感信息（cookies）
      res.json({
        success: true,
        data: {
          url: config.url,
          method: config.method,
          customerId: config.customerId,
          headersCount: Object.keys(config.headers).length,
          hasCookies: !!config.cookies
        }
      });
    } catch (error) {
      console.error('获取 curl 配置失败:', error);
      res.status(500).json({ 
        error: '获取配置失败',
        message: error instanceof Error ? error.message : '未知错误'
      });
    }
  }

  /**
   * 获取 GitHub Billing 数据
   * GET /api/github-billing/usage
   */
  static async getBillingUsage(req: Request, res: Response): Promise<void> {
    try {
      const { force } = req.query;

      // 如果 force=true，先获取配置中的 customerId 并清除缓存
      if (force === 'true') {
        const config = await GitHubBillingService.getSavedCurlConfig();
        if (config?.customerId) {
          await GitHubBillingService.clearCache(config.customerId);
        }
      }

      const billingData = await GitHubBillingService.fetchBillingData();

      res.json({
        success: true,
        data: billingData
      });
    } catch (error) {
      console.error('获取 GitHub Billing 数据失败:', error);
      
      if (error instanceof Error && error.message.includes('未找到保存的 curl 配置')) {
        res.status(404).json({ 
          error: '配置未找到',
          message: '请先保存 curl 命令配置'
        });
        return;
      }

      if (error instanceof Error && error.message.includes('配置中未找到 customer_id')) {
        res.status(400).json({ 
          error: '配置错误',
          message: '配置中未找到 customer_id，请重新保存 curl 命令'
        });
        return;
      }

      res.status(500).json({ 
        error: '获取数据失败',
        message: error instanceof Error ? error.message : '未知错误'
      });
    }
  }

  /**
   * 清除缓存
   * DELETE /api/github-billing/cache/:customerId
   */
  static async clearCache(req: Request, res: Response): Promise<void> {
    try {
      const { customerId } = req.params;

      if (!customerId) {
        res.status(400).json({ 
          error: '参数错误',
          message: '请提供 customerId 参数'
        });
        return;
      }

      await GitHubBillingService.clearCache(customerId);

      res.json({
        success: true,
        message: `客户 ${customerId} 的缓存已清除`
      });
    } catch (error) {
      console.error('清除缓存失败:', error);
      res.status(500).json({ 
        error: '清除缓存失败',
        message: error instanceof Error ? error.message : '未知错误'
      });
    }
  }

  /**
   * 清理过期缓存
   */
  static async clearExpiredCache(req: Request, res: Response): Promise<void> {
    try {
      await GitHubBillingService.clearExpiredCache();
      res.json({ success: true, message: '过期缓存已清理' });
    } catch (error) {
      console.error('清理过期缓存失败:', error);
      res.status(500).json({ 
        success: false, 
        message: '清理过期缓存失败: ' + (error instanceof Error ? error.message : '未知错误')
      });
    }
  }

  /**
   * 获取缓存性能指标
   */
  static async getCacheMetrics(req: Request, res: Response): Promise<void> {
    try {
      const metrics = await GitHubBillingService.getCachePerformanceMetrics();
      res.json({ 
        success: true, 
        data: metrics 
      });
    } catch (error) {
      console.error('获取缓存性能指标失败:', error);
      res.status(500).json({ 
        success: false, 
        message: '获取缓存性能指标失败: ' + (error instanceof Error ? error.message : '未知错误')
      });
    }
  }

  /**
   * 获取缓存的客户列表
   */
  static async getCachedCustomers(req: Request, res: Response): Promise<void> {
    try {
      const customerIds = await GitHubBillingService.getCachedCustomerIds();

      res.json({
        success: true,
        data: customerIds,
        count: customerIds.length
      });
    } catch (error) {
      console.error('获取缓存客户列表失败:', error);
      res.status(500).json({ 
        error: '获取客户列表失败',
        message: error instanceof Error ? error.message : '未知错误'
      });
    }
  }

  /**
   * 测试 curl 命令解析（不保存）
   * POST /api/github-billing/test-parse
   */
  static async testParseCurl(req: Request, res: Response): Promise<void> {
    try {
      const { curlCommand } = req.body;

      if (!curlCommand || typeof curlCommand !== 'string') {
        res.status(400).json({ 
          error: '请提供有效的 curl 命令',
          message: 'curlCommand 字段是必需的且必须是字符串'
        });
        return;
      }

      const parsed = GitHubBillingService.parseCurlCommand(curlCommand);

      res.json({
        success: true,
        message: 'curl 命令解析成功',
        data: {
          url: parsed.url,
          method: parsed.method,
          customerId: parsed.customerId,
          headersCount: Object.keys(parsed.headers).length,
          hasCookies: !!parsed.cookies,
          // 仅用于测试，显示部分 headers（不包含敏感信息）
          sampleHeaders: Object.keys(parsed.headers).slice(0, 5)
        }
      });
    } catch (error) {
      console.error('解析 curl 命令失败:', error);
      res.status(500).json({ 
        error: '解析失败',
        message: error instanceof Error ? error.message : '未知错误'
      });
    }
  }
}
