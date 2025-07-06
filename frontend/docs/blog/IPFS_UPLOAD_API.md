---
slug: ipfs-upload-api
title: IPFS 图片上传 API
tags: [api, ipfs, upload, image]
---

# IPFS 图片上传 API

## 概述

IPFS 图片上传 API 允许用户将图片文件上传到 IPFS 网络，获得可访问的 URL。

<!--truncate-->

## 端点

### POST /api/ipfs/upload

上传图片文件到 IPFS。

#### 请求

- **方法**: POST
- **URL**: `/api/ipfs/upload`
- **Content-Type**: `multipart/form-data`

#### 参数

| 参数名 | 类型 | 必需 | 描述             |
| ------ | ---- | ---- | ---------------- |
| file   | File | 是   | 要上传的图片文件 |

#### 支持的文件格式

- JPEG (.jpg, .jpeg)
- PNG (.png)
- GIF (.gif)
- WebP (.webp)
- BMP (.bmp)
- SVG (.svg)

#### 文件大小限制

- 最大文件大小：5MB

#### 请求示例

```bash
curl --location 'http://localhost:3000/api/ipfs/upload' \
--form 'file=@"/path/to/your/image.jpg"'
```

#### 响应

##### 成功响应 (200)

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

##### 错误响应

###### 400 Bad Request

```json
{
  "error": "请选择要上传的图片文件"
}
```

```json
{
  "error": "只支持图片文件格式：JPEG, PNG, GIF, WebP, BMP, SVG"
}
```

###### 413 Payload Too Large

```json
{
  "error": "文件大小不能超过 10MB"
}
```

###### 429 Too Many Requests

```json
{
  "error": "上传请求过于频繁，请稍后再试"
}
```

###### 500 Internal Server Error

```json
{
  "success": false,
  "error": "IPFS上传失败: 500 - 服务器错误"
}
```

## 限流

- 每个 IP 地址每分钟最多 10 次上传请求
- 本地 IP 地址不受限流限制

## 使用说明

1. **选择图片文件**: 确保文件格式为支持的图片格式
2. **检查文件大小**: 确保文件不超过 10MB
3. **发送请求**: 使用 `multipart/form-data` 格式发送文件
4. **获取 URL**: 从响应中的 `web2url` 字段获取可直接访问的 URL

## 注意事项

- `web2url` 字段返回的 URL 可以直接在浏览器中访问，无 CORS 限制
- 上传的文件会永久存储在 IPFS 网络中
- 建议在生产环境中添加适当的认证和授权机制
- 文件上传可能需要一些时间，请耐心等待

## 示例代码

### JavaScript (Fetch API)

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
```

### Python (requests)

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
```
