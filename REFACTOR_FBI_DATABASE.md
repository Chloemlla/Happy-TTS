# FBI通缉犯数据库优化方案

## 问题分析

### 当前索引配置（fbiWantedModel.ts 第80-85行）

```typescript
FBIWantedSchema.index({ isActive: 1 });
FBIWantedSchema.index({ status: 1 });
FBIWantedSchema.index({ dangerLevel: 1 });
FBIWantedSchema.index({ dateAdded: -1 });
FBIWantedSchema.index({ name: 'text', description: 'text', charges: 'text' }); // 文本搜索索引
```

### 存在的问题

1. **缺少复合索引**: 常见查询组合未优化
2. **fbiNumber索引**: 虽然是unique，但MongoDB会自动创建索引，无需显式声明
3. **文本搜索索引权重**: 未设置字段权重，可能影响搜索相关性
4. **缺少TTL索引**: 如果需要自动清理旧记录

## 优化方案

### 1. 分析常见查询模式

从控制器代码分析，常见查询包括：
- 按状态+活跃状态查询: `{ isActive: true, status: 'ACTIVE' }`
- 按危险等级+活跃状态查询: `{ isActive: true, dangerLevel: 'HIGH' }`
- 按状态+危险等级查询: `{ status: 'ACTIVE', dangerLevel: 'HIGH' }`
- 文本搜索+状态过滤: `{ $text: {...}, status: 'ACTIVE' }`
- 按日期范围查询: `{ dateAdded: { $gte: ..., $lte: ... } }`

### 2. 优化后的索引配置

```typescript
// src/models/fbiWantedModel.ts

// ===== 基础索引 =====
// fbiNumber 唯一索引（自动创建，无需显式声明）

// ===== 单字段索引 =====
FBIWantedSchema.index({ isActive: 1 });
FBIWantedSchema.index({ status: 1 });
FBIWantedSchema.index({ dangerLevel: 1 });
FBIWantedSchema.index({ dateAdded: -1 });

// ===== 复合索引（优化常见查询组合） =====

// 1. 活跃状态 + 状态查询（最常用）
FBIWantedSchema.index({ isActive: 1, status: 1, dateAdded: -1 });

// 2. 活跃状态 + 危险等级查询
FBIWantedSchema.index({ isActive: 1, dangerLevel: 1, dateAdded: -1 });

// 3. 状态 + 危险等级组合查询
FBIWantedSchema.index({ status: 1, dangerLevel: 1, dateAdded: -1 });

// 4. 全面复合索引（支持多维度过滤）
FBIWantedSchema.index({
  isActive: 1,
  status: 1,
  dangerLevel: 1,
  dateAdded: -1
});

// ===== 文本搜索索引（带权重） =====
FBIWantedSchema.index(
  {
    name: 'text',
    description: 'text',
    charges: 'text',
    aliases: 'text',
    fbiNumber: 'text',
    ncicNumber: 'text'
  },
  {
    name: 'fbi_wanted_text_search',
    weights: {
      name: 10,           // 姓名最重要
      fbiNumber: 8,       // FBI编号次之
      ncicNumber: 8,      // NCIC编号
      aliases: 5,         // 别名
      charges: 3,         // 指控
      description: 1      // 描述最低
    },
    default_language: 'english',
    language_override: 'search_language'
  }
);

// ===== 可选：TTL索引（自动清理旧记录） =====
// 如果需要自动清理标记为REMOVED且超过1年的记录
FBIWantedSchema.index(
  { lastUpdated: 1 },
  {
    expireAfterSeconds: 365 * 24 * 60 * 60, // 1年
    partialFilterExpression: { status: 'REMOVED' }
  }
);

// ===== 地理位置索引（如果需要） =====
// 如果lastKnownLocation存储为GeoJSON格式
// FBIWantedSchema.index({ lastKnownLocation: '2dsphere' });
```

### 3. 索引监控和维护

```typescript
// src/scripts/monitorIndexes.ts (新建文件)
import mongoose from 'mongoose';
import FBIWantedModel from '../models/fbiWantedModel';
import logger from '../utils/logger';

export async function analyzeIndexUsage() {
  try {
    const collection = FBIWantedModel.collection;
    
    // 获取所有索引统计
    const stats = await collection.aggregate([
      { $indexStats: {} }
    ]).toArray();

    logger.info('FBI Wanted 索引使用统计:');
    stats.forEach((stat: any) => {
      logger.info(`索引: ${stat.name}`);
      logger.info(`  访问次数: ${stat.accesses.ops}`);
      logger.info(`  最后访问: ${stat.accesses.since}`);
    });

    // 识别未使用的索引
    const unusedIndexes = stats.filter((stat: any) => stat.accesses.ops === 0);
    if (unusedIndexes.length > 0) {
      logger.warn('未使用的索引（考虑删除）:');
      unusedIndexes.forEach((stat: any) => {
        logger.warn(`  - ${stat.name}`);
      });
    }

    return stats;
  } catch (error) {
    logger.error('分析索引使用失败:', error);
    throw error;
  }
}

export async function rebuildIndexes() {
  try {
    logger.info('开始重建FBI Wanted索引...');
    
    // 删除旧索引（除了_id）
    await FBIWantedModel.collection.dropIndexes();
    
    // 触发索引重建
    await FBIWantedModel.syncIndexes();
    
    logger.info('FBI Wanted索引重建完成');
  } catch (error) {
    logger.error('重建索引失败:', error);
    throw error;
  }
}

// 定期执行索引分析（可在cron job中调用）
export async function scheduleIndexAnalysis() {
  setInterval(async () => {
    try {
      await analyzeIndexUsage();
    } catch (error) {
      logger.error('定期索引分析失败:', error);
    }
  }, 7 * 24 * 60 * 60 * 1000); // 每7天执行一次
}
```

### 4. 查询优化示例

**优化前（低效）:**
```typescript
const wanted = await FBIWantedModel.find({
  isActive: true,
  status: 'ACTIVE'
}).sort({ dateAdded: -1 });
```

**优化后（使用复合索引）:**
```typescript
const wanted = await FBIWantedModel.find({
  isActive: true,
  status: 'ACTIVE'
})
.hint({ isActive: 1, status: 1, dateAdded: -1 }) // 明确使用特定索引
.sort({ dateAdded: -1 })
.lean(); // 返回普通对象而非Mongoose文档，更轻量
```

### 5. 聚合查询优化

```typescript
// 统计查询优化（使用索引）
async getStatistics(req: Request, res: Response) {
  try {
    const stats = await FBIWantedModel.aggregate([
      // 1. 先使用索引过滤
      { $match: { isActive: true } },
      
      // 2. 并行执行统计
      {
        $facet: {
          statusCounts: [
            { $group: { _id: '$status', count: { $sum: 1 } } }
          ],
          dangerCounts: [
            { $group: { _id: '$dangerLevel', count: { $sum: 1 } } }
          ],
          recentAdded: [
            { $sort: { dateAdded: -1 } },
            { $limit: 5 },
            {
              $project: {
                name: 1,
                fbiNumber: 1,
                dateAdded: 1,
                dangerLevel: 1
              }
            }
          ]
        }
      }
    ]);

    // 格式化结果
    const formatted = {
      total: 0,
      active: 0,
      captured: 0,
      deceased: 0,
      dangerLevels: {} as Record<string, number>,
      recentAdded: stats[0].recentAdded
    };

    stats[0].statusCounts.forEach((item: any) => {
      formatted.total += item.count;
      formatted[item._id.toLowerCase() as keyof typeof formatted] = item.count;
    });

    stats[0].dangerCounts.forEach((item: any) => {
      formatted.dangerLevels[item._id] = item.count;
    });

    res.json({ success: true, data: formatted });
  } catch (error) {
    logger.error('获取统计信息失败:', error);
    res.status(500).json({ success: false, message: '获取统计信息失败' });
  }
}
```

## 性能测试建议

```typescript
// tests/performance/fbiWanted.perf.test.ts
import FBIWantedModel from '../../models/fbiWantedModel';
import { performance } from 'perf_hooks';

describe('FBI Wanted Performance Tests', () => {
  beforeAll(async () => {
    // 创建测试数据
    const testData = Array.from({ length: 10000 }, (_, i) => ({
      name: `Test Wanted ${i}`,
      fbiNumber: `FBI-TEST-${i}`,
      ncicNumber: `NCIC-${i}`,
      age: Math.floor(Math.random() * 50) + 20,
      charges: ['Test Charge'],
      reward: Math.floor(Math.random() * 100000),
      dangerLevel: ['LOW', 'MEDIUM', 'HIGH', 'EXTREME'][Math.floor(Math.random() * 4)],
      status: ['ACTIVE', 'CAPTURED'][Math.floor(Math.random() * 2)],
      isActive: true
    }));

    await FBIWantedModel.insertMany(testData);
  });

  it('should query with composite index efficiently', async () => {
    const start = performance.now();
    
    await FBIWantedModel.find({
      isActive: true,
      status: 'ACTIVE',
      dangerLevel: 'HIGH'
    })
    .sort({ dateAdded: -1 })
    .limit(20)
    .lean();

    const duration = performance.now() - start;
    
    console.log(`查询耗时: ${duration.toFixed(2)}ms`);
    expect(duration).toBeLessThan(100); // 应在100ms内完成
  });

  it('should perform text search efficiently', async () => {
    const start = performance.now();
    
    await FBIWantedModel.find({
      $text: { $search: 'Test' },
      isActive: true
    })
    .limit(20)
    .lean();

    const duration = performance.now() - start;
    
    console.log(`文本搜索耗时: ${duration.toFixed(2)}ms`);
    expect(duration).toBeLessThan(200); // 应在200ms内完成
  });

  afterAll(async () => {
    // 清理测试数据
    await FBIWantedModel.deleteMany({ fbiNumber: /^FBI-TEST-/ });
  });
});
```

## 索引大小监控

```typescript
// 添加到定期监控脚本
export async function checkIndexSize() {
  try {
    const stats = await FBIWantedModel.collection.stats();
    
    logger.info('FBI Wanted 集合统计:');
    logger.info(`  文档数量: ${stats.count}`);
    logger.info(`  平均文档大小: ${(stats.avgObjSize / 1024).toFixed(2)} KB`);
    logger.info(`  数据大小: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
    logger.info(`  索引大小: ${(stats.totalIndexSize / 1024 / 1024).toFixed(2)} MB`);
    
    // 警告：如果索引大小超过数据大小的50%
    if (stats.totalIndexSize > stats.size * 0.5) {
      logger.warn('索引大小过大，建议检查索引必要性');
    }
    
    return stats;
  } catch (error) {
    logger.error('获取集合统计失败:', error);
    throw error;
  }
}
```

## 实施步骤

1. **备份数据库**
   ```bash
   mongodump --db=your_database --collection=fbiwanteds --out=/backup
   ```

2. **在开发环境测试**
   - 更新模型文件
   - 运行 `FBIWantedModel.syncIndexes()`
   - 执行性能测试

3. **监控索引使用**
   - 运行索引分析脚本
   - 观察查询性能

4. **生产环境部署**
   - 在低峰时段执行
   - 监控数据库性能指标
   - 准备回滚方案

5. **持续优化**
   - 定期检查索引使用情况
   - 根据实际查询模式调整索引

## 预期收益

- 查询响应时间减少 50-80%
- 数据库CPU使用率降低 30-50%
- 支持更高的并发查询量
- 文本搜索相关性提升
