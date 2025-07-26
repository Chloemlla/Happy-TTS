---
title: API 批量测试脚本使用说明
date: 2025-07-07
slug: api-batch-test-readme
tags: [api, test, batch, blog]
---

# API 批量测试脚本使用说明

## 概述

本项目提供了两个 Python 脚本用于批量测试后端不需要授权的 API 接口：

1. `batch_api_test.py` - 完整的批量测试脚本，包含详细统计和报告
2. `quick_api_test.py` - 简化版快速测试脚本
3. `test_fix.py` - 简单的路径验证测试脚本

## 功能特性

### 支持的 API 接口

- **IP 查询**

  - 精准 IP 查询 (`/api/network/ipquery?ip=8.8.8.8`)
  - IP 信息查询 (`/api/network/ipquery?ip=8.8.8.8`)

- **一言古诗词**

  - 随机一言 (`/api/network/yiyan?type=hitokoto`)
  - 古诗词 (`/api/network/yiyan?type=poetry`)

- **抖音热榜**

  - 抖音热榜数据 (`/api/network/douyinhot`)

- **工具类**

  - 字符串 Hash 加密 (`/api/network/hash?text=Hello World&type=md5`)
  - Base64 编码/解码 (`/api/network/base64?text=Hello World&type=encode`)
  - BMI 身体指数计算 (`/api/network/bmi?weight=70&height=175`)

- **媒体转换**

  - FLAC 转 MP3 (`/api/network/flactomp3?url=https://example.com/test.flac`)

- **驾考题目**
  - 随机驾考题目 (`/api/network/jiakao?subject=1`)

### 核心功能

- ✅ 批量调用所有不需要授权的 API
- ✅ 自动处理调用次数限制（429 状态码）
- ✅ 随机延迟避免触发频率限制
- ✅ 详细的测试报告和统计
- ✅ 支持多轮测试
- ✅ 支持单个端点测试
- ✅ 完整的错误处理和日志记录

## 安装依赖

```bash
pip install requests
```

## 使用方法

### 快速测试脚本 (quick_api_test.py)

#### 1. 默认测试（1 轮）

```bash
python quick_api_test.py
```

#### 2. 多轮测试

```bash
python quick_api_test.py --rounds 3
```

#### 3. 测试单个端点

```bash
python quick_api_test.py --single "服务状态"
```

### 完整测试脚本 (batch_api_test.py)

#### 1. 基本使用

```python
from batch_api_test import ApiBatchTester

# 创建测试器
tester = ApiBatchTester("https://api.hapxs.com")

# 执行批量测试
results = tester.batch_test(rounds=2, delay_between_rounds=5)

# 生成报告
report = tester.generate_report(results)
print(report)

# 保存结果
tester.save_results(results)
```

### 路径验证测试 (test_fix.py)

```bash
python test_fix.py
```

## 配置说明

### 基础配置

```python
BASE_URL = "https://api.hapxs.com"  # API基础URL
DELAY_RANGE = (1, 2)  # 请求间隔范围（秒）
```

### 测试参数

- `rounds`: 测试轮次数量
- `delay_between_rounds`: 轮次间延迟（秒）
- `timeout`: 请求超时时间（秒）

## 输出说明

### 控制台输出

```
开始批量测试API接口
基础URL: https://api.hapxs.com
测试轮次: 1
端点数量: 12
============================================================

=== 第 1 轮测试 ===
测试: 服务状态
URL: https://api.hapxs.com/api/status
✓ 成功 (状态码: 200)
  响应: {"status": "ok", "timestamp": "2024-01-01T12:00:00Z"}...
  耗时: 0.15秒
--------------------------------------------------
```

### 日志文件

- `api_test.log` - 详细的测试日志
- `api_test_results_YYYYMMDD_HHMMSS.json` - 测试结果 JSON 文件

### 测试报告

```
=== API批量测试报告 ===
测试时间: 2024-01-01 12:00:00 - 2024-01-01 12:05:00
总耗时: 300.00 秒

统计信息:
- 总调用次数: 36
- 成功调用: 34
- 失败调用: 1
- 频率限制: 1
- 成功率: 94.4%

详细结果:
服务状态:
  调用次数: 3
  成功率: 100.0%
  平均响应时间: 0.15s
```

## 错误处理

### 常见错误

1. **429 频率限制**

   - 自动检测并记录
   - 建议增加延迟时间

2. **网络超时**

   - 默认 30 秒超时
   - 自动重试机制

3. **API 错误**
   - 详细错误信息记录
   - 不影响其他接口测试

### 故障排除

1. **连接失败**

   ```bash
   # 检查网络连接
   curl https://api.hapxs.com/api/status
   ```

2. **权限问题**

   ```bash
   # 确保脚本有执行权限
   chmod +x quick_api_test.py
   ```

3. **依赖缺失**
   ```bash
   # 安装依赖
   pip install -r requirements.txt
   ```

## 最佳实践

### 1. 测试频率控制

- 建议延迟范围：1-3 秒
- 轮次间延迟：5-10 秒
- 避免短时间内大量请求

### 2. 监控要点

- 关注成功率变化
- 监控响应时间
- 注意频率限制次数

### 3. 报告分析

- 定期查看测试报告
- 分析失败原因
- 优化测试策略

## 扩展开发

### 添加新的 API 端点

```python
# 在ENDPOINTS列表中添加
{
    "name": "新API",
    "path": "/api/new",
    "method": "GET",
    "params": {"param": "value"}
}
```

### 自定义测试逻辑

```python
def custom_test_logic(endpoint):
    # 自定义测试逻辑
    pass
```

## 注意事项

1. **频率限制**：请遵守 API 的频率限制，避免对服务器造成压力
2. **测试环境**：建议在测试环境中使用，避免影响生产环境
3. **数据安全**：测试数据不会保存敏感信息
4. **网络环境**：确保网络连接稳定

## 更新日志

- v1.0.0 - 初始版本，支持基础 API 测试
- v1.1.0 - 添加详细统计和报告功能
- v1.2.0 - 优化错误处理和日志记录
- v1.3.0 - 修复 API 路径匹配问题，更新为正确的路由路径
