---
title: Base64 编码与解码 API 文档
date: 2025-07-07
slug: base64-api
tags: [api, base64, encode, decode]
---

# Base64 编码与解码 API 文档

## 概述

Base64 编码与解码 API 提供快速稳定的 Base64 编码和解码操作，完全本地实现，不依赖外部 API，确保数据安全和隐私保护。

## 接口信息

- **接口地址**: `GET /api/network/base64`
- **功能描述**: 对指定字符串进行 Base64 编码或解码
- **实现方式**: 本地操作，无需外部依赖

## 请求参数

| 参数名 | 类型   | 必填 | 说明                                         |
| ------ | ------ | ---- | -------------------------------------------- |
| type   | string | 是   | 操作类型，支持：encode(编码) 或 decode(解码) |
| text   | string | 是   | 需要编码或解码的字符串                       |

### 支持的操作类型

- **encode**: Base64 编码，将普通字符串转换为 Base64 格式
- **decode**: Base64 解码，将 Base64 格式字符串转换回普通字符串

## 请求示例

### cURL

```bash
# 编码
curl -X GET "http://localhost:3000/api/network/base64?type=encode&text=123456"

# 解码
curl -X GET "http://localhost:3000/api/network/base64?type=decode&text=MTIzNDU2"
```

### JavaScript (axios)

```javascript
const axios = require("axios");

// 编码
const encodeResponse = await axios.get(
  "http://localhost:3000/api/network/base64",
  {
    params: {
      type: "encode",
      text: "123456",
    },
  }
);

// 解码
const decodeResponse = await axios.get(
  "http://localhost:3000/api/network/base64",
  {
    params: {
      type: "decode",
      text: "MTIzNDU2",
    },
  }
);

console.log(encodeResponse.data);
console.log(decodeResponse.data);
```

### Python

```python
import requests

# 编码
encode_response = requests.get('http://localhost:3000/api/network/base64', {
    'type': 'encode',
    'text': '123456'
})

# 解码
decode_response = requests.get('http://localhost:3000/api/network/base64', {
    'type': 'decode',
    'text': 'MTIzNDU2'
})

print(encode_response.json())
print(decode_response.json())
```

## 响应格式

### 成功响应 (200)

#### 编码响应

```json
{
  "success": true,
  "message": "Base64操作完成",
  "data": {
    "code": 200,
    "msg": "数据请求成功",
    "data": "MTIzNDU2"
  }
}
```

#### 解码响应

```json
{
  "success": true,
  "message": "Base64操作完成",
  "data": {
    "code": 200,
    "msg": "数据请求成功",
    "data": "123456"
  }
}
```

### 参数错误 (400)

```json
{
  "success": false,
  "error": "操作类型参数不能为空"
}
```

### 服务器错误 (500)

```json
{
  "success": false,
  "error": "Base64操作失败: 未知错误"
}
```

## 响应字段说明

| 字段名    | 类型    | 说明               |
| --------- | ------- | ------------------ |
| success   | boolean | 请求是否成功       |
| message   | string  | 成功时的消息       |
| error     | string  | 错误时的错误信息   |
| data.code | integer | 响应状态码         |
| data.msg  | string  | 响应消息           |
| data.data | string  | 编码或解码后的结果 |

## 测试用例

### 1. 基本编码测试

- **输入**: `type=encode&text=123456`
- **期望输出**: `MTIzNDU2`

### 2. 基本解码测试

- **输入**: `type=decode&text=MTIzNDU2`
- **期望输出**: `123456`

### 3. 中文编码测试

- **输入**: `type=encode&text=你好世界`
- **期望输出**: `5L2g5aW95LiW55WM`

### 4. 中文解码测试

- **输入**: `type=decode&text=5L2g5aW95LiW55WM`
- **期望输出**: `你好世界`

### 5. 特殊字符编码测试

- **输入**: `type=encode&text=Hello@World#123`
- **期望输出**: `SGVsbG9AV29ybGQjMTIz`

### 6. 特殊字符解码测试

- **输入**: `type=decode&text=SGVsbG9AV29ybGQjMTIz`
- **期望输出**: `Hello@World#123`

## 错误处理

### 常见错误类型

1. **缺少参数错误**

   - 缺少 `type` 参数
   - 缺少 `text` 参数

2. **参数格式错误**

   - `type` 参数值不在支持范围内
   - `text` 参数为空字符串

3. **解码错误**

   - 输入不是有效的 Base64 字符串
   - Base64 字符串不完整
   - 包含非 Base64 字符

4. **服务器内部错误**
   - 编码或解码过程中发生异常

### 错误响应示例

```json
{
  "success": false,
  "error": "Base64解码失败：输入不是有效的Base64字符串"
}
```

## 安全说明

1. **本地操作**: 所有编码解码操作在本地完成，不会将数据发送到外部服务器
2. **数据隐私**: 操作过程中不会记录或存储用户的原始数据
3. **算法安全**: 使用 Node.js 内置的 Buffer 模块，确保编码解码的正确性和安全性

## 性能特点

1. **快速响应**: 本地操作，响应速度快
2. **无网络依赖**: 不依赖外部 API，稳定性高
3. **资源占用低**: 使用系统内置 Buffer 库，资源占用少

## 使用建议

1. **编码场景**:

   - 数据传输：将二进制数据转换为文本格式传输
   - 图片编码：将图片数据转换为 Base64 字符串
   - 配置文件：将敏感信息进行简单编码

2. **解码场景**:

   - 数据还原：将 Base64 格式数据还原为原始格式
   - 图片显示：将 Base64 图片字符串转换为图片显示
   - 配置解析：解析 Base64 编码的配置信息

3. **注意事项**:
   - Base64 编码会增加约 33%的数据大小
   - 建议对大型数据进行分块处理
   - 在生产环境中，建议对 API 响应进行适当的错误处理

## 相关链接

- [Base64 编码说明](https://en.wikipedia.org/wiki/Base64)
- [Node.js Buffer 文档](https://nodejs.org/api/buffer.html)
- [RFC 4648 - Base64 编码标准](https://tools.ietf.org/html/rfc4648)
