---
title: 临时指纹存储MongoDB优化
description: 将临时指纹存储从内存改为MongoDB，并实现定时清理任务
date: 2025-09-15
author: Synapse Team
tags: [后端, 数据库, MongoDB, 性能优化, 定时任务]
---

# 临时指纹存储MongoDB优化

## 概述

为了节约内存开销并提高系统的可扩展性，我们将临时指纹存储从内存Map改为MongoDB数据库存储，并实现了定时任务来自动清理过期的指纹记录。

## 优化背景

### 原有问题

1. **内存占用高** - 使用Map存储所有临时指纹，随着访问量增加会占用大量内存
2. **数据丢失风险** - 服务器重启后所有临时指纹数据丢失
3. **扩展性差** - 多实例部署时无法共享指纹数据
4. **手动清理** - 需要手动清理过期数据，容易遗漏

### 优化目标

1. **降低内存占用** - 使用数据库存储，减少内存压力
2. **数据持久化** - 服务器重启后数据不丢失
3. **支持集群** - 多实例可以共享指纹数据
4. **自动清理** - 定时任务自动清理过期数据

## 技术实现

### 1. MongoDB模型设计

创建了专门的临时指纹模型：

```typescript
// src/models/tempFingerprintModel.ts

interface TempFingerprintDoc {
  fingerprint: string;
  verified: boolean;
  createdAt: Date;
  updatedAt: Date;
  expiresAt: Date; // 过期时间，用于TTL索引
}

const TempFingerprintSchema = new mongoose.Schema<TempFingerprintDoc>(
  {
    fingerprint: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    verified: {
      type: Boolean,
      default: false,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
    updatedAt: {
      type: Date,
      default: Date.now,
    },
    expiresAt: {
      type: Date,
      required: true,
      index: true,
    },
  },
  {
    timestamps: true, // 自动管理 createdAt 和 updatedAt
  }
);

// 创建TTL索引，自动删除过期文档（5分钟后过期）
TempFingerprintSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// 创建复合索引，提高查询性能
TempFingerprintSchema.index({ fingerprint: 1, verified: 1 });
```

### 2. 服务层优化

在`TurnstileService`中添加了临时指纹管理方法：

```typescript
// src/services/turnstileService.ts

export class TurnstileService {
  // ... 现有方法 ...

  // ==================== 临时指纹管理 ====================

  /**
   * 上报临时指纹
   */
  public static async reportTempFingerprint(fingerprint: string): Promise<{
    isFirstVisit: boolean;
    verified: boolean;
  }> {
    try {
      if (mongoose.connection.readyState !== 1) {
        logger.error("数据库连接不可用，无法上报临时指纹");
        return { isFirstVisit: false, verified: false };
      }

      // 检查指纹是否已存在
      const existingDoc = await TempFingerprintModel.findOne({ fingerprint })
        .lean()
        .exec();

      if (existingDoc) {
        // 指纹已存在，返回当前状态
        return {
          isFirstVisit: false,
          verified: existingDoc.verified,
        };
      }

      // 首次访问，创建新记录
      const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5分钟后过期
      await TempFingerprintModel.create({
        fingerprint,
        verified: false,
        expiresAt,
      });

      logger.info("临时指纹上报成功", {
        fingerprint: fingerprint.substring(0, 8) + "...",
      });

      return {
        isFirstVisit: true,
        verified: false,
      };
    } catch (error) {
      logger.error("临时指纹上报失败", error);
      return { isFirstVisit: false, verified: false };
    }
  }

  /**
   * 验证临时指纹
   */
  public static async verifyTempFingerprint(
    fingerprint: string,
    cfToken: string,
    remoteIp?: string
  ): Promise<boolean> {
    try {
      if (mongoose.connection.readyState !== 1) {
        logger.error("数据库连接不可用，无法验证临时指纹");
        return false;
      }

      // 查找指纹记录
      const doc = await TempFingerprintModel.findOne({ fingerprint }).exec();
      if (!doc) {
        logger.warn("临时指纹不存在或已过期", {
          fingerprint: fingerprint.substring(0, 8) + "...",
        });
        return false;
      }

      // 验证Turnstile令牌
      const isValid = await this.verifyToken(cfToken, remoteIp);
      if (!isValid) {
        logger.warn("Turnstile验证失败", {
          fingerprint: fingerprint.substring(0, 8) + "...",
        });
        return false;
      }

      // 标记为已验证
      doc.verified = true;
      doc.updatedAt = new Date();
      await doc.save();

      logger.info("临时指纹验证成功", {
        fingerprint: fingerprint.substring(0, 8) + "...",
      });
      return true;
    } catch (error) {
      logger.error("临时指纹验证失败", error);
      return false;
    }
  }

  /**
   * 检查临时指纹状态
   */
  public static async checkTempFingerprintStatus(fingerprint: string): Promise<{
    exists: boolean;
    verified: boolean;
  }> {
    try {
      if (mongoose.connection.readyState !== 1) {
        logger.error("数据库连接不可用，无法检查临时指纹状态");
        return { exists: false, verified: false };
      }

      const doc = await TempFingerprintModel.findOne({ fingerprint })
        .lean()
        .exec();

      if (!doc) {
        return { exists: false, verified: false };
      }

      return {
        exists: true,
        verified: doc.verified,
      };
    } catch (error) {
      logger.error("检查临时指纹状态失败", error);
      return { exists: false, verified: false };
    }
  }

  /**
   * 清理过期的临时指纹
   */
  public static async cleanupExpiredFingerprints(): Promise<number> {
    try {
      if (mongoose.connection.readyState !== 1) {
        logger.error("数据库连接不可用，无法清理过期指纹");
        return 0;
      }

      const now = new Date();
      const result = await TempFingerprintModel.deleteMany({
        expiresAt: { $lt: now },
      });

      if (result.deletedCount > 0) {
        logger.info(`清理过期临时指纹完成，删除 ${result.deletedCount} 条记录`);
      }

      return result.deletedCount || 0;
    } catch (error) {
      logger.error("清理过期临时指纹失败", error);
      return 0;
    }
  }

  /**
   * 获取临时指纹统计信息
   */
  public static async getTempFingerprintStats(): Promise<{
    total: number;
    verified: number;
    unverified: number;
    expired: number;
  }> {
    try {
      if (mongoose.connection.readyState !== 1) {
        logger.error("数据库连接不可用，无法获取临时指纹统计");
        return { total: 0, verified: 0, unverified: 0, expired: 0 };
      }

      const now = new Date();

      const [total, verified, unverified, expired] = await Promise.all([
        TempFingerprintModel.countDocuments(),
        TempFingerprintModel.countDocuments({ verified: true }),
        TempFingerprintModel.countDocuments({ verified: false }),
        TempFingerprintModel.countDocuments({ expiresAt: { $lt: now } }),
      ]);

      return {
        total,
        verified,
        unverified,
        expired,
      };
    } catch (error) {
      logger.error("获取临时指纹统计失败", error);
      return { total: 0, verified: 0, unverified: 0, expired: 0 };
    }
  }
}
```

### 3. 定时任务服务

创建了专门的定时任务服务：

```typescript
// src/services/schedulerService.ts

class SchedulerService {
  private cleanupInterval: NodeJS.Timeout | null = null;
  private isRunning = false;

  /**
   * 启动定时任务
   */
  public start(): void {
    if (this.isRunning) {
      logger.warn("定时任务已在运行中");
      return;
    }

    this.isRunning = true;

    // 每5分钟清理一次过期的临时指纹
    this.cleanupInterval = setInterval(
      async () => {
        try {
          await this.cleanupExpiredFingerprints();
        } catch (error) {
          logger.error("定时清理过期指纹失败:", error);
        }
      },
      5 * 60 * 1000
    ); // 5分钟

    logger.info("定时任务服务已启动");

    // 启动后立即执行一次清理
    this.cleanupExpiredFingerprints().catch((error) => {
      logger.error("初始清理过期指纹失败:", error);
    });
  }

  /**
   * 停止定时任务
   */
  public stop(): void {
    if (!this.isRunning) {
      logger.warn("定时任务未在运行");
      return;
    }

    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }

    this.isRunning = false;
    logger.info("定时任务服务已停止");
  }

  /**
   * 清理过期的临时指纹
   */
  private async cleanupExpiredFingerprints(): Promise<void> {
    try {
      const deletedCount = await TurnstileService.cleanupExpiredFingerprints();

      if (deletedCount > 0) {
        logger.info(`定时清理完成，删除了 ${deletedCount} 条过期指纹记录`);
      } else {
        logger.debug("定时清理完成，没有过期指纹需要清理");
      }
    } catch (error) {
      logger.error("清理过期指纹失败:", error);
    }
  }

  /**
   * 获取服务状态
   */
  public getStatus(): { isRunning: boolean; lastCleanup?: Date } {
    return {
      isRunning: this.isRunning,
    };
  }

  /**
   * 手动触发清理
   */
  public async manualCleanup(): Promise<{
    success: boolean;
    deletedCount: number;
    error?: string;
  }> {
    try {
      const deletedCount = await TurnstileService.cleanupExpiredFingerprints();
      logger.info(`手动清理完成，删除了 ${deletedCount} 条过期指纹记录`);

      return {
        success: true,
        deletedCount,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "未知错误";
      logger.error("手动清理失败:", error);

      return {
        success: false,
        deletedCount: 0,
        error: errorMessage,
      };
    }
  }
}

// 创建单例实例
const schedulerService = new SchedulerService();
export { schedulerService };
```

### 4. 应用启动集成

在应用启动时自动启动定时任务：

```typescript
// src/app.ts

import { schedulerService } from "./services/schedulerService";

// 在服务器启动后启动定时任务服务
try {
  schedulerService.start();
  logger.info("[启动] 定时任务服务已启动");
} catch (error) {
  logger.warn("[启动] 定时任务服务启动失败，继续启动", {
    error: error instanceof Error ? error.message : String(error),
  });
}
```

### 5. API接口更新

更新了路由接口，使用数据库服务：

```typescript
// src/routes/turnstileRoutes.ts

// 临时指纹上报接口（无需认证）
router.post("/temp-fingerprint", async (req, res) => {
  try {
    const { fingerprint } = req.body;

    if (!fingerprint || typeof fingerprint !== "string") {
      return res.status(400).json({
        success: false,
        error: "指纹参数无效",
      });
    }

    const result = await TurnstileService.reportTempFingerprint(fingerprint);

    res.json({
      success: true,
      isFirstVisit: result.isFirstVisit,
      verified: result.verified,
    });
  } catch (error) {
    console.error("临时指纹上报失败:", error);
    res.status(500).json({
      success: false,
      error: "服务器内部错误",
    });
  }
});

// 验证临时指纹接口（无需认证）
router.post("/verify-temp-fingerprint", async (req, res) => {
  try {
    const { fingerprint, cfToken } = req.body;

    if (!fingerprint || typeof fingerprint !== "string") {
      return res.status(400).json({
        success: false,
        error: "指纹参数无效",
      });
    }

    if (!cfToken || typeof cfToken !== "string") {
      return res.status(400).json({
        success: false,
        error: "验证令牌无效",
      });
    }

    const success = await TurnstileService.verifyTempFingerprint(
      fingerprint,
      cfToken,
      req.ip
    );

    if (!success) {
      return res.status(400).json({
        success: false,
        error: "验证失败",
      });
    }

    res.json({
      success: true,
      verified: true,
    });
  } catch (error) {
    console.error("验证临时指纹失败:", error);
    res.status(500).json({
      success: false,
      error: "服务器内部错误",
    });
  }
});

// 检查临时指纹状态接口（无需认证）
router.get("/temp-fingerprint/:fingerprint", async (req, res) => {
  try {
    const { fingerprint } = req.params;

    if (!fingerprint) {
      return res.status(400).json({
        success: false,
        error: "指纹参数无效",
      });
    }

    const status =
      await TurnstileService.checkTempFingerprintStatus(fingerprint);

    res.json({
      success: true,
      exists: status.exists,
      verified: status.verified,
    });
  } catch (error) {
    console.error("检查临时指纹状态失败:", error);
    res.status(500).json({
      success: false,
      error: "服务器内部错误",
    });
  }
});

// 清理过期指纹接口（管理员专用）
router.post(
  "/cleanup-expired-fingerprints",
  authenticateToken,
  async (req, res) => {
    try {
      const userRole = (req as any).user?.role;
      const isAdmin = userRole === "admin" || userRole === "administrator";

      if (!isAdmin) {
        return res.status(403).json({
          success: false,
          error: "权限不足",
        });
      }

      const deletedCount = await TurnstileService.cleanupExpiredFingerprints();

      res.json({
        success: true,
        deletedCount,
        message: `清理了 ${deletedCount} 条过期指纹记录`,
      });
    } catch (error) {
      console.error("清理过期指纹失败:", error);
      res.status(500).json({
        success: false,
        error: "服务器内部错误",
      });
    }
  }
);

// 获取指纹统计信息接口（管理员专用）
router.get("/fingerprint-stats", authenticateToken, async (req, res) => {
  try {
    const userRole = (req as any).user?.role;
    const isAdmin = userRole === "admin" || userRole === "administrator";

    if (!isAdmin) {
      return res.status(403).json({
        success: false,
        error: "权限不足",
      });
    }

    const stats = await TurnstileService.getTempFingerprintStats();

    res.json({
      success: true,
      stats,
    });
  } catch (error) {
    console.error("获取指纹统计失败:", error);
    res.status(500).json({
      success: false,
      error: "服务器内部错误",
    });
  }
});

// 获取定时任务状态接口（管理员专用）
router.get("/scheduler-status", authenticateToken, async (req, res) => {
  try {
    const userRole = (req as any).user?.role;
    const isAdmin = userRole === "admin" || userRole === "administrator";

    if (!isAdmin) {
      return res.status(403).json({
        success: false,
        error: "权限不足",
      });
    }

    const status = schedulerService.getStatus();

    res.json({
      success: true,
      status,
    });
  } catch (error) {
    console.error("获取定时任务状态失败:", error);
    res.status(500).json({
      success: false,
      error: "服务器内部错误",
    });
  }
});

// 手动触发清理接口（管理员专用）
router.post("/manual-cleanup", authenticateToken, async (req, res) => {
  try {
    const userRole = (req as any).user?.role;
    const isAdmin = userRole === "admin" || userRole === "administrator";

    if (!isAdmin) {
      return res.status(403).json({
        success: false,
        error: "权限不足",
      });
    }

    const result = await schedulerService.manualCleanup();

    res.json({
      success: result.success,
      deletedCount: result.deletedCount,
      message: result.success
        ? `手动清理完成，删除了 ${result.deletedCount} 条过期指纹记录`
        : `手动清理失败: ${result.error}`,
      error: result.error,
    });
  } catch (error) {
    console.error("手动清理失败:", error);
    res.status(500).json({
      success: false,
      error: "服务器内部错误",
    });
  }
});

// 启动定时任务接口（管理员专用）
router.post("/scheduler/start", authenticateToken, async (req, res) => {
  try {
    const userRole = (req as any).user?.role;
    const isAdmin = userRole === "admin" || userRole === "administrator";

    if (!isAdmin) {
      return res.status(403).json({
        success: false,
        error: "权限不足",
      });
    }

    schedulerService.start();

    res.json({
      success: true,
      message: "定时任务已启动",
    });
  } catch (error) {
    console.error("启动定时任务失败:", error);
    res.status(500).json({
      success: false,
      error: "服务器内部错误",
    });
  }
});

// 停止定时任务接口（管理员专用）
router.post("/scheduler/stop", authenticateToken, async (req, res) => {
  try {
    const userRole = (req as any).user?.role;
    const isAdmin = userRole === "admin" || userRole === "administrator";

    if (!isAdmin) {
      return res.status(403).json({
        success: false,
        error: "权限不足",
      });
    }

    schedulerService.stop();

    res.json({
      success: true,
      message: "定时任务已停止",
    });
  } catch (error) {
    console.error("停止定时任务失败:", error);
    res.status(500).json({
      success: false,
      error: "服务器内部错误",
    });
  }
});
```

## 性能优化特性

### 1. TTL索引自动清理

- 使用MongoDB的TTL索引自动删除过期文档
- 减少手动清理的复杂性
- 提高数据库性能

### 2. 复合索引优化

- 为常用查询创建复合索引
- 提高查询性能
- 减少数据库负载

### 3. 连接状态检查

- 每次操作前检查数据库连接状态
- 避免在连接不可用时执行操作
- 提供优雅的错误处理

### 4. 批量操作

- 使用`deleteMany`进行批量删除
- 减少数据库往返次数
- 提高清理效率

## 管理功能

### 1. 统计信息

- 总指纹数量
- 已验证指纹数量
- 未验证指纹数量
- 过期指纹数量

### 2. 定时任务管理

- 自动启动定时清理任务
- 支持手动启动/停止
- 提供任务状态查询

### 3. 手动清理

- 管理员可手动触发清理
- 实时查看清理结果
- 详细的错误信息

## 监控和日志

### 1. 详细日志记录

- 指纹上报成功/失败
- 验证成功/失败
- 清理操作结果
- 错误详情记录

### 2. 性能监控

- 数据库操作耗时
- 清理任务执行时间
- 内存使用情况

### 3. 错误处理

- 数据库连接异常处理
- 操作失败回退机制
- 详细的错误信息

## 测试验证

### 1. 功能测试

- 指纹上报和验证
- 过期数据清理
- 统计信息查询

### 2. 性能测试

- 大量数据下的清理性能
- 并发访问处理
- 内存使用监控

### 3. 异常测试

- 数据库连接中断
- 网络异常处理
- 服务重启恢复

## 总结

通过将临时指纹存储从内存改为MongoDB，我们实现了以下优化：

### 1. 内存优化

- 大幅减少内存占用
- 支持更大规模的访问量
- 提高系统稳定性

### 2. 数据持久化

- 服务器重启后数据不丢失
- 支持多实例部署
- 提高系统可靠性

### 3. 自动管理

- 定时任务自动清理过期数据
- TTL索引自动删除过期文档
- 减少人工维护成本

### 4. 监控管理

- 详细的统计信息
- 实时状态监控
- 手动管理功能

### 5. 扩展性

- 支持集群部署
- 易于水平扩展
- 更好的负载均衡

这次优化显著提升了系统的性能和可维护性，为后续的功能扩展奠定了良好的基础。
