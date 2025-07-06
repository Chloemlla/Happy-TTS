# IPFS 图片上传功能使用说明

## 功能概述

IPFS 图片上传功能允许用户将图片文件上传到 IPFS 网络，获得可访问的 URL。

## 重要配置

### 文件大小限制

- **最大文件大小**: 5MB
- **建议文件大小**: 1-2MB 以获得最佳性能

### 支持的文件格式

- JPEG (.jpg, .jpeg)
- PNG (.png)
- GIF (.gif)
- WebP (.webp)
- BMP (.bmp)
- SVG (.svg)

## API 端点

```
POST /api/ipfs/upload
```

### 请求格式

- **Content-Type**: `multipart/form-data`
- **参数名**: `file`
- **参数值**: 图片文件

### 响应格式

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

## 使用示例

### 1. cURL 命令

```bash
curl --location 'http://localhost:3000/api/ipfs/upload' \
--form 'file=@"/path/to/your/image.jpg"'
```

### 2. JavaScript (浏览器)

```javascript
async function uploadImage(file) {
  const formData = new FormData();
  formData.append("file", file);

  try {
    const response = await fetch("/api/ipfs/upload", {
      method: "POST",
      body: formData,
    });

    const result = await response.json();

    if (result.success) {
      console.log("上传成功:", result.data.web2url);
      return result.data.web2url;
    } else {
      console.error("上传失败:", result.error);
    }
  } catch (error) {
    console.error("请求失败:", error);
  }
}

// 使用示例
const fileInput = document.getElementById("fileInput");
fileInput.addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (file) {
    uploadImage(file);
  }
});
```

### 3. Python

```python
import requests

def upload_image(file_path):
    url = 'http://localhost:3000/api/ipfs/upload'

    with open(file_path, 'rb') as f:
        files = {'file': f}
        response = requests.post(url, files=files)

    if response.status_code == 200:
        result = response.json()
        if result['success']:
            print('上传成功:', result['data']['web2url'])
            return result['data']['web2url']
        else:
            print('上传失败:', result['error'])
    else:
        print('请求失败:', response.status_code)

# 使用示例
upload_image('/path/to/your/image.jpg')
```

### 4. Node.js

```javascript
const FormData = require("form-data");
const fs = require("fs");
const axios = require("axios");

async function uploadImage(filePath) {
  const formData = new FormData();
  formData.append("file", fs.createReadStream(filePath));

  try {
    const response = await axios.post(
      "http://localhost:3000/api/ipfs/upload",
      formData,
      {
        headers: {
          ...formData.getHeaders(),
        },
      }
    );

    if (response.data.success) {
      console.log("上传成功:", response.data.data.web2url);
      return response.data.data.web2url;
    } else {
      console.error("上传失败:", response.data.error);
    }
  } catch (error) {
    console.error("请求失败:", error.message);
  }
}

// 使用示例
uploadImage("/path/to/your/image.jpg");
```

## 错误处理

### 常见错误及解决方案

1. **文件大小超限**

   ```
   错误: 文件大小不能超过 5MB
   解决: 压缩图片或选择更小的文件
   ```

2. **文件格式不支持**

   ```
   错误: 只支持图片文件格式：JPEG, PNG, GIF, WebP, BMP, SVG
   解决: 确保上传的是支持的图片格式
   ```

3. **请求过于频繁**

   ```
   错误: 上传请求过于频繁，请稍后再试
   解决: 等待一分钟后再试（限流：每分钟10次）
   ```

4. **网络错误**
   ```
   错误: IPFS服务无响应，请稍后重试
   解决: 检查网络连接，稍后重试
   ```

## 最佳实践

1. **文件大小优化**

   - 建议上传 1-2MB 的图片
   - 使用图片压缩工具减小文件大小
   - 选择合适的图片格式（JPEG 通常比 PNG 小）

2. **错误处理**

   - 始终检查响应状态
   - 实现重试机制
   - 为用户提供友好的错误提示

3. **用户体验**
   - 显示上传进度
   - 提供文件大小和格式提示
   - 在上传前验证文件

## 安全注意事项

1. **文件验证**

   - 服务端会验证文件类型和大小
   - 只允许上传图片文件
   - 文件大小限制为 5MB

2. **限流保护**

   - 每个 IP 每分钟最多 10 次请求
   - 防止滥用和 DoS 攻击

3. **日志记录**
   - 所有上传请求都会被记录
   - 包含 IP 地址、文件信息等

## 测试

### 运行测试脚本

```bash
# 测试 form-data 格式
node test-form-data.js

# 测试 IPFS 上传
node test-ipfs-upload.js

# 运行单元测试
npm test -- --testPathPatterns=ipfsService.test.ts
```

### 手动测试

```bash
# 使用 cURL 测试
curl --location 'http://localhost:3000/api/ipfs/upload' \
--form 'file=@"/path/to/test/image.jpg"'
```

## 部署注意事项

1. **依赖安装**

   ```bash
   npm install form-data @types/form-data
   ```

2. **网络要求**

   - 确保服务器可以访问 `https://ipfs-relay.crossbell.io`
   - 检查防火墙设置

3. **监控**
   - 监控上传成功率
   - 监控响应时间
   - 监控错误率
