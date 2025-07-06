---
slug: network-and-data-apis
title: 网络检测与数据处理 API 文档
tags: [api, network, data-processing]
---

# 网络检测与数据处理 API 文档

## 概述

本 API 提供了网络检测和数据处理功能，包括 TCP 连接检测、Ping 检测、网站测速、端口扫描、Base64 编码解码和 MD5 哈希加密。

<!--truncate-->

## 网络检测 API

### 1. TCP 连接检测

检测目标地址的 TCP 端口是否可连接。

**端点**: `GET /api/network/tcping`

**参数**:

- `address` (必需): 目标地址
- `port` (必需): 端口号 (1-65535)

**示例请求**:

```bash
curl "http://localhost:3000/api/network/tcping?address=www.baidu.com&port=80"
```

**响应示例**:

```json
{
  "success": true,
  "message": "TCP连接检测完成",
  "data": {
    "status": "connected",
    "response_time": "15ms"
  }
}
```

### 2. Ping 检测

检测服务器的网络连接状况。

**端点**: `GET /api/network/ping`

**参数**:

- `url` (必需): 目标 URL

**示例请求**:

```bash
curl "http://localhost:3000/api/network/ping?url=www.baidu.com"
```

**响应示例**:

```json
{
  "success": true,
  "message": "Ping检测完成",
  "data": {
    "status": "reachable",
    "response_time": "25ms",
    "packet_loss": "0%"
  }
}
```

### 3. 网站测速

检测网站的加载速度。

**端点**: `GET /api/network/speed`

**参数**:

- `url` (必需): 目标 URL

**示例请求**:

```bash
curl "http://localhost:3000/api/network/speed?url=https://www.baidu.com"
```

**响应示例**:

```json
{
  "success": true,
  "message": "网站测速完成",
  "data": {
    "load_time": "1.2s",
    "dns_time": "15ms",
    "connect_time": "45ms",
    "ttfb": "120ms"
  }
}
```

### 4. 端口扫描

扫描目标 IP 地址的开放端口。

**端点**: `GET /api/network/portscan`

**参数**:

- `address` (必需): 目标 IP 地址

**示例请求**:

```bash
curl "http://localhost:3000/api/network/portscan?address=127.0.0.1"
```

**响应示例**:

```json
{
  "success": true,
  "message": "端口扫描完成",
  "data": {
    "open_ports": [22, 80, 443, 3306],
    "total_ports_scanned": 1000,
    "scan_time": "5.2s"
  }
}
```

## 数据处理 API

### 1. Base64 编码

对文本进行 Base64 编码操作。

**端点**: `GET /api/data/base64/encode`

**参数**:

- `text` (必需): 要编码的文本 (最大 10000 字符)

**示例请求**:

```bash
curl "http://localhost:3000/api/data/base64/encode?text=Hello%20World!"
```

**响应示例**:

```json
{
  "success": true,
  "message": "Base64编码完成",
  "data": {
    "original": "Hello World!",
    "encoded": "SGVsbG8gV29ybGQh"
  }
}
```

### 2. Base64 解码

对 Base64 编码的文本进行解码操作。

**端点**: `GET /api/data/base64/decode`

**参数**:

- `text` (必需): 要解码的 Base64 文本 (最大 10000 字符)

**示例请求**:

```bash
curl "http://localhost:3000/api/data/base64/decode?text=SGVsbG8gV29ybGQh"
```

**响应示例**:

```json
{
  "success": true,
  "message": "Base64解码完成",
  "data": {
    "encoded": "SGVsbG8gV29ybGQh",
    "decoded": "Hello World!"
  }
}
```

### 3. MD5 哈希加密

对字符串进行 MD5 哈希加密。

**端点**: `GET /api/data/md5`

**参数**:

- `text` (必需): 要加密的文本 (最大 10000 字符)

**示例请求**:

```bash
curl "http://localhost:3000/api/data/md5?text=123456"
```

**响应示例**:

```json
{
  "success": true,
  "message": "MD5哈希加密完成",
  "data": {
    "original": "123456",
    "md5": "e10adc3949ba59abbe56e057f20f883e"
  }
}
```

## 错误处理

### 常见错误响应

#### 400 Bad Request

```json
{
  "success": false,
  "error": "参数错误信息"
}
```

#### 429 Too Many Requests

```json
{
  "error": "请求过于频繁，请稍后再试"
}
```

#### 500 Internal Server Error

```json
{
  "success": false,
  "error": "服务器错误信息"
}
```

## 限流规则

- **网络检测 API**: 每个 IP 每分钟最多 30 次请求
- **数据处理 API**: 每个 IP 每分钟最多 50 次请求
- **本地 IP**: 不受限流限制

## 使用示例

### JavaScript (Fetch API)

```javascript
// TCP连接检测
async function tcpPing(address, port) {
  const response = await fetch(
    `/api/network/tcping?address=${address}&port=${port}`
  );
  const result = await response.json();
  return result;
}

// Base64编码
async function base64Encode(text) {
  const response = await fetch(
    `/api/data/base64/encode?text=${encodeURIComponent(text)}`
  );
  const result = await response.json();
  return result;
}

// MD5哈希加密
async function md5Hash(text) {
  const response = await fetch(
    `/api/data/md5?text=${encodeURIComponent(text)}`
  );
  const result = await response.json();
  return result;
}
```

### Python

```python
import requests

def tcp_ping(address, port):
    response = requests.get('http://localhost:3000/api/network/tcping',
                          params={'address': address, 'port': port})
    return response.json()

def base64_encode(text):
    response = requests.get('http://localhost:3000/api/data/base64/encode',
                          params={'text': text})
    return response.json()

def md5_hash(text):
    response = requests.get('http://localhost:3000/api/data/md5',
                          params={'text': text})
    return response.json()
```

### cURL

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

## 测试

运行测试脚本验证所有 API 功能：

```bash
node test-network-apis.js
```

## 部署

确保服务器能够访问外部网络服务，特别是 `https://v2.xxapi.cn` 服务。
