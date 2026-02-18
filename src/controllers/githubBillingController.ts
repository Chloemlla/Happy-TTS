import type { Request, Response } from "express";
import { GitHubBillingService } from "../services/githubBillingService";

export class GitHubBillingController {
  /**
   * 保存 curl 命令配置
   * POST /api/github-billing/config
   */
  static async saveCurlConfig(req: Request, res: Response): Promise<void> {
    try {
      const { curlCommand } = req.body;

      if (!curlCommand || typeof curlCommand !== "string") {
        res.status(400).json({
          error: "请提供有效的 curl 命令",
          message: "curlCommand 字段是必需的且必须是字符串",
        });
        return;
      }

      // 严格的 URL 验证：确保是真正的 GitHub API URL
      const githubUrlRegex = /https?:\/\/(?:api\.)?github\.com\//i;
      if (!githubUrlRegex.test(curlCommand)) {
        res.status(400).json({
          error: "无效的 curl 命令",
          message: "curl 命令必须包含有效的 GitHub API URL (https://api.github.com/ 或 https://github.com/)",
        });
        return;
      }

      await GitHubBillingService.saveCurlConfig(curlCommand, "config1");
      const parsed = GitHubBillingService.parseCurlCommand(curlCommand);

      res.json({
        success: true,
        message: "curl 命令配置已保存",
        data: {
          url: parsed.url,
          method: parsed.method,
          customerId: parsed.customerId,
          headersCount: Object.keys(parsed.headers).length,
          hasCookies: !!parsed.cookies,
        },
      });
    } catch (error) {
      console.error("保存 curl 配置失败:", error);
      res.status(500).json({
        error: "保存配置失败",
        message: error instanceof Error ? error.message : "未知错误",
      });
    }
  }

  /**
   * 获取保存的 curl 配置
   * GET /api/github-billing/config
   */
  static async getCurlConfig(_req: Request, res: Response): Promise<void> {
    try {
      const config = await GitHubBillingService.getSavedCurlConfig();

      if (!config) {
        res.status(404).json({
          error: "未找到配置",
          message: "请先保存 curl 命令配置",
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
          hasCookies: !!config.cookies,
        },
      });
    } catch (error) {
      console.error("获取 curl 配置失败:", error);
      res.status(500).json({
        error: "获取配置失败",
        message: error instanceof Error ? error.message : "未知错误",
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
      if (force === "true") {
        const config = await GitHubBillingService.getSavedCurlConfig();
        if (config?.customerId) {
          await GitHubBillingService.clearCache(config.customerId);
        }
      }

      const billingData = await GitHubBillingService.fetchBillingData();

      res.json({
        success: true,
        data: billingData,
      });
    } catch (error) {
      console.error("获取 GitHub Billing 数据失败:", error);

      if (error instanceof Error && error.message.includes("未找到保存的 curl 配置")) {
        res.status(404).json({
          error: "配置未找到",
          message: "请先保存 curl 命令配置",
        });
        return;
      }

      if (error instanceof Error && error.message.includes("配置中未找到 customer_id")) {
        res.status(400).json({
          error: "配置错误",
          message: "配置中未找到 customer_id，请重新保存 curl 命令",
        });
        return;
      }

      res.status(500).json({
        error: "获取数据失败",
        message: error instanceof Error ? error.message : "未知错误",
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
          error: "参数错误",
          message: "请提供 customerId 参数",
        });
        return;
      }

      await GitHubBillingService.clearCache(customerId);

      res.json({
        success: true,
        message: `客户 ${customerId} 的缓存已清除`,
      });
    } catch (error) {
      console.error("清除缓存失败:", error);
      res.status(500).json({
        error: "清除缓存失败",
        message: error instanceof Error ? error.message : "未知错误",
      });
    }
  }

  /**
   * 清理过期缓存
   */
  static async clearExpiredCache(_req: Request, res: Response): Promise<void> {
    try {
      await GitHubBillingService.clearExpiredCache();
      res.json({ success: true, message: "过期缓存已清理" });
    } catch (error) {
      console.error("清理过期缓存失败:", error);
      res.status(500).json({
        success: false,
        message: `清理过期缓存失败: ${error instanceof Error ? error.message : "未知错误"}`,
      });
    }
  }

  /**
   * 获取缓存性能指标
   */
  static async getCacheMetrics(_req: Request, res: Response): Promise<void> {
    try {
      const metrics = await GitHubBillingService.getCachePerformanceMetrics();
      res.json({
        success: true,
        data: metrics,
      });
    } catch (error) {
      console.error("获取缓存性能指标失败:", error);
      res.status(500).json({
        success: false,
        message: `获取缓存性能指标失败: ${error instanceof Error ? error.message : "未知错误"}`,
      });
    }
  }

  /**
   * 获取缓存的客户列表
   */
  static async getCachedCustomers(_req: Request, res: Response): Promise<void> {
    try {
      const customers = await GitHubBillingService.getCachedCustomersDetails();

      res.json({
        success: true,
        data: customers,
        count: customers.length,
      });
    } catch (error) {
      console.error("获取缓存客户列表失败:", error);
      res.status(500).json({
        error: "获取客户列表失败",
        message: error instanceof Error ? error.message : "未知错误",
      });
    }
  }

  /**
   * 保存多配置 curl 命令
   * POST /api/github-billing/multi-config/:configKey
   */
  static async saveMultiCurlConfig(req: Request, res: Response): Promise<void> {
    try {
      const { configKey } = req.params;
      const { curlCommand } = req.body;

      if (!["config1", "config2", "config3"].includes(configKey)) {
        res.status(400).json({
          error: "无效的配置键",
          message: "configKey 必须是 config1, config2 或 config3",
        });
        return;
      }

      if (!curlCommand || typeof curlCommand !== "string") {
        res.status(400).json({
          error: "请提供有效的 curl 命令",
          message: "curlCommand 字段是必需的且必须是字符串",
        });
        return;
      }

      // 严格的 URL 验证：确保是真正的 GitHub API URL
      const githubUrlRegex = /https?:\/\/(?:api\.)?github\.com\//i;
      if (!githubUrlRegex.test(curlCommand)) {
        res.status(400).json({
          error: "无效的 curl 命令",
          message: "curl 命令必须包含有效的 GitHub API URL (https://api.github.com/ 或 https://github.com/)",
        });
        return;
      }

      await GitHubBillingService.saveCurlConfig(curlCommand, configKey as "config1" | "config2" | "config3");
      const parsed = GitHubBillingService.parseCurlCommand(curlCommand);

      res.json({
        success: true,
        message: `curl 命令配置 ${configKey} 已保存`,
        data: {
          configKey,
          url: parsed.url,
          method: parsed.method,
          customerId: parsed.customerId,
          headersCount: Object.keys(parsed.headers).length,
          hasCookies: !!parsed.cookies,
        },
      });
    } catch (error) {
      console.error("保存多配置 curl 失败:", error);
      res.status(500).json({
        error: "保存配置失败",
        message: error instanceof Error ? error.message : "未知错误",
      });
    }
  }

  /**
   * 获取多配置 curl 命令
   * GET /api/github-billing/multi-config
   */
  static async getMultiCurlConfig(_req: Request, res: Response): Promise<void> {
    try {
      const multiConfig = await GitHubBillingService.getAllMultiConfigs();

      if (!multiConfig) {
        res.status(404).json({
          error: "未找到配置",
          message: "请先保存 curl 命令配置",
        });
        return;
      }

      // 不返回敏感信息（cookies）
      const safeConfig: any = {
        lastUpdated: multiConfig.lastUpdated,
      };

      ["config1", "config2", "config3"].forEach((key) => {
        const config = multiConfig[key as keyof typeof multiConfig];
        if (config && typeof config === "object" && "url" in config) {
          safeConfig[key] = {
            url: config.url,
            method: config.method,
            customerId: config.customerId,
            headersCount: Object.keys(config.headers || {}).length,
            hasCookies: !!config.cookies,
          };
        }
      });

      res.json({
        success: true,
        data: safeConfig,
      });
    } catch (error) {
      console.error("获取多配置 curl 失败:", error);
      res.status(500).json({
        error: "获取配置失败",
        message: error instanceof Error ? error.message : "未知错误",
      });
    }
  }

  /**
   * 删除多配置 curl 命令
   * DELETE /api/github-billing/multi-config/:configKey
   */
  static async deleteMultiCurlConfig(req: Request, res: Response): Promise<void> {
    try {
      const { configKey } = req.params;

      if (!["config1", "config2", "config3"].includes(configKey)) {
        res.status(400).json({
          error: "无效的配置键",
          message: "configKey 必须是 config1, config2 或 config3",
        });
        return;
      }

      await GitHubBillingService.deleteConfig(configKey as "config1" | "config2" | "config3");

      res.json({
        success: true,
        message: `配置 ${configKey} 已删除`,
      });
    } catch (error) {
      console.error("删除多配置 curl 失败:", error);

      if (error instanceof Error && error.message.includes("不存在")) {
        res.status(404).json({
          error: "配置不存在",
          message: error.message,
        });
        return;
      }

      res.status(500).json({
        error: "删除配置失败",
        message: error instanceof Error ? error.message : "未知错误",
      });
    }
  }

  /**
   * 获取聚合的 GitHub Billing 数据
   * GET /api/github-billing/aggregated-usage
   */
  static async getAggregatedBillingUsage(req: Request, res: Response): Promise<void> {
    try {
      const { force } = req.query;

      // 如果 force=true，清除所有相关缓存
      if (force === "true") {
        const multiConfig = await GitHubBillingService.getAllMultiConfigs();
        if (multiConfig) {
          for (const configKey of ["config1", "config2", "config3"] as const) {
            const config = multiConfig[configKey];
            if (config?.customerId) {
              await GitHubBillingService.clearCache(config.customerId);
            }
          }
        }
      }

      const aggregatedData = await GitHubBillingService.fetchAggregatedBillingData(force === "true");

      res.json({
        success: true,
        data: aggregatedData,
      });
    } catch (error) {
      console.error("获取聚合 GitHub Billing 数据失败:", error);

      if (error instanceof Error && error.message.includes("未找到保存的 curl 配置")) {
        res.status(404).json({
          error: "配置未找到",
          message: "请先保存至少一个 curl 命令配置",
        });
        return;
      }

      if (error instanceof Error && error.message.includes("所有配置都获取数据失败")) {
        res.status(500).json({
          error: "数据获取失败",
          message: "所有配置的数据获取都失败，请检查配置或网络连接",
        });
        return;
      }

      res.status(500).json({
        error: "获取聚合数据失败",
        message: error instanceof Error ? error.message : "未知错误",
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

      if (!curlCommand || typeof curlCommand !== "string") {
        res.status(400).json({
          error: "请提供有效的 curl 命令",
          message: "curlCommand 字段是必需的且必须是字符串",
        });
        return;
      }

      const parsed = GitHubBillingService.parseCurlCommand(curlCommand);

      res.json({
        success: true,
        message: "curl 命令解析成功",
        data: {
          url: parsed.url,
          method: parsed.method,
          customerId: parsed.customerId,
          headersCount: Object.keys(parsed.headers).length,
          hasCookies: !!parsed.cookies,
          // 仅用于测试，显示部分 headers（不包含敏感信息）
          sampleHeaders: Object.keys(parsed.headers).slice(0, 5),
        },
      });
    } catch (error) {
      console.error("解析 curl 命令失败:", error);
      res.status(500).json({
        error: "解析失败",
        message: error instanceof Error ? error.message : "未知错误",
      });
    }
  }
}
