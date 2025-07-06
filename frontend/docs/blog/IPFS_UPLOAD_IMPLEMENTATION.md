---
slug: ipfs-upload-implementation
title: IPFS 图片上传功能实现总结
tags: [api, implementation, ipfs, upload]
---

# IPFS 图片上传功能实现总结

## 已完成的工作

<!--truncate-->

### 1. 核心服务层 (`src/services/ipfsService.ts`)

- ✅ 创建了 `IPFSService` 类
- ✅ 实现了文件上传到 IPFS 的功能
- ✅ 添加了文件大小限制（5MB）
- ✅ 添加了文件类型验证（只允许图片格式）
- ✅ 实现了错误处理和日志记录
- ✅ 支持的文件格式：JPEG, PNG, GIF, WebP, BMP, SVG

### 2. 控制器层 (`src/controllers/ipfsController.ts`)

- ✅ 创建了 `IPFSController` 类
- ✅ 实现了 `uploadImage` 方法
- ✅ 添加了请求日志记录
- ✅ 实现了错误处理和响应格式化
- ✅ 添加了客户端 IP 获取功能

### 3. 路由层 (`src/routes/ipfsRoutes.ts`)

- ✅ 创建了 IPFS 路由
- ✅ 配置了 multer 中间件用于文件上传
- ✅ 添加了文件大小和类型限制
- ✅ 添加了完整的 OpenAPI 文档注释
- ✅ 路由路径：`POST /api/ipfs/upload`

### 4. 应用集成 (`src/app.ts`)

- ✅ 导入了 IPFS 路由
- ✅ 添加了 IPFS 专用限流器（每分钟 10 次请求）
- ✅ 注册了 IPFS 路由到应用
- ✅ 配置了限流中间件

### 5. 测试文件 (`src/tests/ipfsService.test.ts`)

- ✅ 创建了 IPFS 服务的单元测试
- ✅ 测试文件大小验证
- ✅ 测试文件类型验证
- ✅ 测试文件提取功能

### 6. 文档 (`docs/IPFS_UPLOAD_API.md`)

- ✅ 创建了完整的 API 文档
- ✅ 包含请求/响应示例
- ✅ 包含错误处理说明
- ✅ 包含使用示例代码

### 7. 测试脚本 (`test-ipfs-upload.js`)

- ✅ 创建了独立的测试脚本
- ✅ 可以测试 IPFS 上传功能
- ✅ 包含错误处理

## API 端点详情

### POST /api/ipfs/upload

**功能**: 上传图片文件到 IPFS 网络

**请求格式**: `multipart/form-data`

**参数**:

- `file`: 图片文件（必需）

**响应格式**:

```json
{
  "success": true,
  "message": "图片上传成功",
  "data": {
    "cid": "QmVHG3KdGs3M8otdqjZEei6AzWt1usWRP6UmfLMbEub5nc",
    "url": "ipfs://QmVHG3KdGs3M8otdqjZEei6AzWt1usWRP6UmfLMbEub5nc",
    "web2url": "https://ipfs.crossbell.io/ipfs/QmVHG3KdGs3M8otdqjZEei6AzWt1usWRP6UmfLMbEub5nc",
    "fileSize": "77199",
    "filename": "image.jpg"
  }
}
```

## 安全特性

1. **文件类型限制**: 只允许上传图片文件
2. **文件大小限制**: 最大 10MB
3. **限流保护**: 每个 IP 每分钟最多 10 次请求
4. **错误处理**: 完善的错误处理和日志记录
5. **超时保护**: 30 秒请求超时

## 使用示例

### cURL 命令

```bash
curl --location 'http://localhost:3000/api/ipfs/upload' \
--form 'file=@"/path/to/your/image.jpg"'
```

### JavaScript

```javascript
const formData = new FormData();
formData.append("file", fileInput.files[0]);

fetch("/api/ipfs/upload", {
  method: "POST",
  body: formData,
})
  .then((response) => response.json())
  .then((data) => {
    if (data.success) {
      console.log("上传成功:", data.data.web2url);
    }
  });
```

## 待完成的工作

1. **依赖安装**: 需要安装 `form-data` 和 `@types/form-data` 依赖
2. **测试运行**: 运行单元测试验证功能
3. **集成测试**: 测试完整的 API 端点
4. **生产部署**: 在生产环境中部署和测试

## 安装依赖

运行以下命令安装必要的依赖：

```bash
npm install form-data @types/form-data
```

## 测试功能

1. **运行单元测试**:

```bash
npm test -- --testPathPattern=ipfsService.test.ts
```

2. **运行独立测试脚本**:

```bash
node test-ipfs-upload.js
```

3. **测试 API 端点**:

```bash
curl --location 'http://localhost:3000/api/ipfs/upload' \
--form 'file=@"/path/to/test/image.jpg"'
```

## 注意事项

1. 确保服务器有足够的网络连接访问 IPFS 服务
2. 文件上传可能需要一些时间，建议添加进度提示
3. 返回的 `web2url` 可以直接在浏览器中访问，无 CORS 限制
4. 上传的文件会永久存储在 IPFS 网络中
