---
slug: network-and-data-apis-implementation
title: 网络检测与数据处理 API 实现总结
tags: [api, implementation, network, data-processing]
---

# 网络检测与数据处理 API 实现总结

## 已完成的工作

<!--truncate-->

### 1. 网络检测服务 (`src/services/networkService.ts`)

- ✅ 创建了 `NetworkService` 类
- ✅ 实现了 TCP 连接检测功能
- ✅ 实现了 Ping 检测功能
- ✅ 实现了网站测速功能
- ✅ 实现了端口扫描功能
- ✅ 添加了完善的错误处理和日志记录
- ✅ 配置了合理的超时时间

### 2. 数据处理服务 (`src/services/dataProcessService.ts`)

- ✅ 创建了 `DataProcessService` 类
- ✅ 实现了 Base64 编码功能
- ✅ 实现了 Base64 解码功能
- ✅ 实现了 MD5 哈希加密功能
- ✅ 添加了完善的错误处理和日志记录
- ✅ 配置了合理的超时时间

### 3. 网络检测控制器 (`src/controllers/networkController.ts`)

- ✅ 创建了 `NetworkController` 类
- ✅ 实现了 TCP 连接检测控制器
- ✅ 实现了 Ping 检测控制器
- ✅ 实现了网站测速控制器
- ✅ 实现了端口扫描控制器
- ✅ 添加了参数验证和错误处理
- ✅ 添加了请求日志记录

### 4. 数据处理控制器 (`src/controllers/dataProcessController.ts`)

- ✅ 创建了 `DataProcessController` 类
- ✅ 实现了 Base64 编码控制器
- ✅ 实现了 Base64 解码控制器
- ✅ 实现了 MD5 哈希加密控制器
- ✅ 添加了参数验证和错误处理
- ✅ 添加了请求日志记录

### 5. 网络检测路由 (`src/routes/networkRoutes.ts`)

- ✅ 创建了网络检测路由
- ✅ 添加了完整的 OpenAPI 文档注释
- ✅ 路由路径：
  - `GET /api/network/tcping` - TCP 连接检测
  - `GET /api/network/ping` - Ping 检测
  - `GET /api/network/speed` - 网站测速
  - `GET /api/network/portscan` - 端口扫描

### 6. 数据处理路由 (`src/routes/dataProcessRoutes.ts`)

- ✅ 创建了数据处理路由
- ✅ 添加了完整的 OpenAPI 文档注释
- ✅ 路由路径：
  - `GET /api/data/base64/encode` - Base64 编码
  - `GET /api/data/base64/decode` - Base64 解码
  - `GET /api/data/md5` - MD5 哈希加密

### 7. 应用集成 (`src/app.ts`)

- ✅ 导入了网络检测和数据处理路由
- ✅ 添加了专用限流器
- ✅ 注册了路由到应用
- ✅ 配置了限流中间件

### 8. 测试脚本 (`test-network-apis.js`)

- ✅ 创建了完整的 API 测试脚本
- ✅ 测试所有网络检测功能
- ✅ 测试所有数据处理功能
- ✅ 包含错误处理

### 9. 文档 (`docs/NETWORK_AND_DATA_APIS.md`)

- ✅ 创建了完整的 API 文档
- ✅ 包含所有端点的详细说明
- ✅ 包含请求/响应示例
- ✅ 包含使用示例代码

## API 端点详情

### 网络检测 API

#### 1. TCP 连接检测

- **端点**: `GET /api/network/tcping`
- **参数**: `address`, `port`
- **功能**: 检测目标地址的 TCP 端口是否可连接

#### 2. Ping 检测

- **端点**: `GET /api/network/ping`
- **参数**: `url`
- **功能**: 检测服务器的网络连接状况

#### 3. 网站测速

- **端点**: `GET /api/network/speed`
- **参数**: `url`
- **功能**: 检测网站的加载速度

#### 4. 端口扫描

- **端点**: `GET /api/network/portscan`
- **参数**: `address`
- **功能**: 扫描目标 IP 地址的开放端口

### 数据处理 API

#### 1. Base64 编码

- **端点**: `GET /api/data/base64/encode`
- **参数**: `text`
- **功能**: 对文本进行 Base64 编码操作

#### 2. Base64 解码

- **端点**: `GET /api/data/base64/decode`
- **参数**: `text`
- **功能**: 对 Base64 编码的文本进行解码操作

#### 3. MD5 哈希加密

- **端点**: `GET /api/data/md5`
- **参数**: `text`
- **功能**: 对字符串进行 MD5 哈希加密

## 安全特性

1. **参数验证**: 所有输入参数都经过验证
2. **限流保护**:
   - 网络检测 API：每分钟 30 次请求
   - 数据处理 API：每分钟 50 次请求
3. **错误处理**: 完善的错误处理和日志记录
4. **超时保护**: 配置了合理的请求超时时间
5. **日志记录**: 所有请求都被记录

## 使用示例

### cURL 命令

```bash
# TCP连接检测
curl "http://localhost:3000/api/network/tcping?address=www.baidu.com&port=80"

# Ping检测
curl "http://localhost:3000/api/network/ping?url=www.baidu.com"

# 网站测速
curl "http://localhost:3000/api/network/speed?url=https://www.baidu.com"

# 端口扫描
curl "http://localhost:3000/api/network/portscan?address=127.0.0.1"

# Base64编码
curl "http://localhost:3000/api/data/base64/encode?text=Hello%20World!"

# Base64解码
curl "http://localhost:3000/api/data/base64/decode?text=SGVsbG8gV29ybGQh"

# MD5哈希加密
curl "http://localhost:3000/api/data/md5?text=123456"
```

### JavaScript

```javascript
// TCP连接检测
async function tcpPing(address, port) {
  const response = await fetch(
    `/api/network/tcping?address=${address}&port=${port}`
  );
  return await response.json();
}

// Base64编码
async function base64Encode(text) {
  const response = await fetch(
    `/api/data/base64/encode?text=${encodeURIComponent(text)}`
  );
  return await response.json();
}

// MD5哈希加密
async function md5Hash(text) {
  const response = await fetch(
    `/api/data/md5?text=${encodeURIComponent(text)}`
  );
  return await response.json();
}
```

## 响应格式

### 成功响应

```json
{
  "success": true,
  "message": "操作完成",
  "data": {
    // 具体数据
  }
}
```

### 错误响应

```json
{
  "success": false,
  "error": "错误信息"
}
```

## 限流规则

- **网络检测 API**: 每个 IP 每分钟最多 30 次请求
- **数据处理 API**: 每个 IP 每分钟最多 50 次请求
- **本地 IP**: 不受限流限制

## 测试功能

1. **运行测试脚本**:

```bash
node test-network-apis.js
```

2. **手动测试单个 API**:

```bash
curl "http://localhost:3000/api/network/tcping?address=www.baidu.com&port=80"
```

## 注意事项

1. **网络检测功能**:

   - 需要目标服务可访问
   - 端口扫描可能需要较长时间
   - 某些网络环境可能限制扫描功能

2. **数据处理功能**:

   - 文本长度限制为 10000 字符
   - Base64 解码需要有效的 Base64 格式
   - MD5 是单向加密，无法解密

3. **安全考虑**:

   - 端口扫描功能应谨慎使用
   - 避免对敏感目标进行扫描
   - 遵守相关法律法规

4. **性能优化**:
   - 网络检测有超时设置
   - 建议合理使用限流功能
   - 大量请求时考虑分批处理

## 部署要求

1. **网络连接**: 确保服务器能够访问 `https://v2.xxapi.cn`
2. **依赖**: 项目已包含所需依赖
3. **防火墙**: 确保没有阻止外部网络请求
4. **监控**: 建议监控 API 使用情况和错误率

## 扩展功能

未来可以考虑添加的功能：

1. 更多哈希算法（SHA1, SHA256 等）
2. 更多编码格式（URL 编码、HTML 实体编码等）
3. 网络诊断工具（路由追踪、DNS 查询等）
4. 批量处理功能
5. 结果缓存机制
