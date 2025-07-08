---
title: 字符串 Hash 加密 API 文档
date: 2025-07-07
slug: hash-encrypt-api
tags: [api, hash, encrypt, security]
---

# 字符串 Hash 加密 API 文档

## 概述

字符串 Hash 加密 API 提供多种哈希加密算法支持，包括 MD4、MD5、SHA1、SHA256 和 SHA512。该功能完全本地实现，不依赖外部 API，确保数据安全和隐私保护。

## 接口信息

- **接口地址**: `GET /api/network/hash`
- **功能描述**: 对指定字符串进行哈希加密
- **实现方式**: 本地加密，无需外部依赖

## 请求参数

| 参数名 | 类型   | 必填 | 说明                                               |
| ------ | ------ | ---- | -------------------------------------------------- |
| type   | string | 是   | 加密算法类型，支持：md4, md5, sha1, sha256, sha512 |
| text   | string | 是   | 需要加密的字符串                                   |

### 支持的加密算法

- **MD4**: 128 位哈希算法（注意：Node.js 不直接支持 MD4，实际使用 MD5 替代）
- **MD5**: 128 位哈希算法，生成 32 位十六进制字符串
- **SHA1**: 160 位哈希算法，生成 40 位十六进制字符串
- **SHA256**: 256 位哈希算法，生成 64 位十六进制字符串
- **SHA512**: 512 位哈希算法，生成 128 位十六进制字符串

## 请求示例

### cURL

```bash
curl -X GET "http://localhost:3000/api/network/hash?type=md5&text=123456"
```

### JavaScript (axios)

```javascript
const axios = require("axios");

const response = await axios.get("http://localhost:3000/api/network/hash", {
  params: {
    type: "md5",
    text: "123456",
  },
});

console.log(response.data);
```

### Python

```python
import requests

response = requests.get('http://localhost:3000/api/network/hash', {
    'type': 'md5',
    'text': '123456'
})

print(response.json())
```

## 响应格式

### 成功响应 (200)

```json
{
  "success": true,
  "message": "字符串Hash加密完成",
  "data": {
    "code": 200,
    "msg": "数据请求成功",
    "data": "e10adc3949ba59abbe56e057f20f883e"
  }
}
```

### 参数错误 (400)

```json
{
  "success": false,
  "error": "加密算法类型参数不能为空"
}
```

### 服务器错误 (500)

```json
{
  "success": false,
  "error": "Hash加密失败: 未知错误"
}
```

## 响应字段说明

| 字段名    | 类型    | 说明             |
| --------- | ------- | ---------------- |
| success   | boolean | 请求是否成功     |
| message   | string  | 成功时的消息     |
| error     | string  | 错误时的错误信息 |
| data.code | integer | 响应状态码       |
| data.msg  | string  | 响应消息         |
| data.data | string  | 加密后的 Hash 值 |

## 测试用例

### 1. MD5 加密测试

- **输入**: `type=md5&text=123456`
- **期望输出**: `e10adc3949ba59abbe56e057f20f883e`
- **Hash 长度**: 32 位

### 2. SHA1 加密测试

- **输入**: `type=sha1&text=123456`
- **期望输出**: `7c4a8d09ca3762af61e59520943dc26494f8941b`
- **Hash 长度**: 40 位

### 3. SHA256 加密测试

- **输入**: `type=sha256&text=123456`
- **期望输出**: `8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92`
- **Hash 长度**: 64 位

### 4. SHA512 加密测试

- **输入**: `type=sha512&text=123456`
- **期望输出**: `ba3253876aed6bc22d4a6ff53d8406c6ad864195ed144ab5c87621b6c233b548baeae6956df346ec8c17f5ea10f35ee3cbc514797ed7ddd3145464e2a0bab413`
- **Hash 长度**: 128 位

## 错误处理

### 常见错误类型

1. **缺少参数错误**

   - 缺少 `type` 参数
   - 缺少 `text` 参数

2. **参数格式错误**

   - `type` 参数值不在支持范围内
   - `text` 参数为空字符串

3. **服务器内部错误**
   - 加密过程中发生异常

### 错误响应示例

```json
{
  "success": false,
  "error": "不支持的加密算法: invalid。支持的算法: md4, md5, sha1, sha256, sha512"
}
```

## 安全说明

1. **本地加密**: 所有加密操作在本地完成，不会将明文发送到外部服务器
2. **数据隐私**: 加密过程中不会记录或存储用户的原始文本
3. **算法安全**: 使用 Node.js 内置的 crypto 模块，确保加密算法的正确性和安全性

## 性能特点

1. **快速响应**: 本地加密，响应速度快
2. **无网络依赖**: 不依赖外部 API，稳定性高
3. **资源占用低**: 使用系统内置加密库，资源占用少

## 使用建议

1. **选择合适的算法**:

   - MD5: 适用于快速校验，不建议用于安全场景
   - SHA1: 适用于一般安全需求
   - SHA256/SHA512: 适用于高安全需求场景

2. **文本长度限制**: 建议加密文本长度不超过 1MB，以确保最佳性能

3. **错误处理**: 在生产环境中，建议对 API 响应进行适当的错误处理

## 相关链接

- [Node.js Crypto 模块文档](https://nodejs.org/api/crypto.html)
- [哈希算法对比](https://en.wikipedia.org/wiki/Hash_function)
- [MD5 算法说明](https://en.wikipedia.org/wiki/MD5)
- [SHA 家族算法说明](https://en.wikipedia.org/wiki/SHA-2)
