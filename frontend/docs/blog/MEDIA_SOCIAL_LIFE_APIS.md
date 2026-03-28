---
slug: media-social-life-apis
title: 媒体解析、社交媒体和生活信息 API 文档
tags: [api, media, social, life-info]
---

# 媒体解析、社交媒体和生活信息 API 文档

## 概述

本文档描述了 Synapse 后端提供的媒体解析、社交媒体和生活信息 API 接口。这些 API 提供了音乐视频解析、热搜查询和生活信息查询等功能。

<!--truncate-->

## 基础信息

- **基础 URL**: `http://localhost:3000/api`
- **请求格式**: GET
- **响应格式**: JSON
- **字符编码**: UTF-8

## 1. 媒体解析 API

### 1.1 网抑云音乐解析

解析网抑云中的歌曲数据，获取歌曲详细信息和播放链接。

**接口地址**: `GET /api/media/music163`

**请求参数**:
| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| id | string | 是 | 歌曲 ID（数字） |

**请求示例**:

```bash
curl "http://localhost:3000/api/media/music163?id=2651528954"
```

**响应示例**:

```json
{
  "success": true,
  "message": "网抑云音乐解析完成",
  "data": {
    "id": "2651528954",
    "name": "歌曲名称",
    "artist": "歌手名称",
    "album": "专辑名称",
    "duration": "03:45",
    "url": "播放链接"
  }
}
```

**错误响应**:

```json
{
  "success": false,
  "error": "歌曲ID参数不能为空"
}
```

### 1.2 皮皮虾视频解析

解析皮皮虾视频链接，获取视频播放地址。

**接口地址**: `GET /api/media/pipixia`

**请求参数**:
| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| url | string | 是 | 皮皮虾或抖音视频链接 |

**请求示例**:

```bash
curl "http://localhost:3000/api/media/pipixia?url=https://h5.pipix.com/s/BWmCQUg/"
```

**响应示例**:

```json
{
  "success": true,
  "message": "皮皮虾视频解析完成",
  "data": {
    "title": "视频标题",
    "author": "作者",
    "duration": "00:30",
    "url": "视频播放地址"
  }
}
```

**错误响应**:

```json
{
  "success": false,
  "error": "请输入有效的皮皮虾或抖音视频链接"
}
```

## 2. 社交媒体 API

### 2.1 微博热搜

获取微博当前热搜榜单。

**接口地址**: `GET /api/social/weibo-hot`

**请求参数**: 无

**请求示例**:

```bash
curl "http://localhost:3000/api/social/weibo-hot"
```

**响应示例**:

```json
{
  "success": true,
  "message": "微博热搜获取完成",
  "data": [
    {
      "rank": 1,
      "keyword": "热搜关键词",
      "hot_value": "热度值",
      "url": "相关链接"
    }
  ]
}
```

### 2.2 百度热搜

获取百度的热搜数据。

**接口地址**: `GET /api/social/baidu-hot`

**请求参数**: 无

**请求示例**:

```bash
curl "http://localhost:3000/api/social/baidu-hot"
```

**响应示例**:

```json
{
  "success": true,
  "message": "百度热搜获取完成",
  "data": [
    {
      "rank": 1,
      "keyword": "热搜关键词",
      "hot_value": "热度值",
      "url": "相关链接"
    }
  ]
}
```

## 3. 生活信息 API

### 3.1 手机号码归属地查询

查询手机号码的归属地信息。

**接口地址**: `GET /api/life/phone-address`

**请求参数**:
| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| phone | string | 是 | 11 位手机号码 |

**请求示例**:

```bash
curl "http://localhost:3000/api/life/phone-address?phone=13800138000"
```

**响应示例**:

```json
{
  "success": true,
  "message": "手机号码归属地查询完成",
  "data": {
    "phone": "13800138000",
    "province": "北京",
    "city": "北京",
    "operator": "移动",
    "area_code": "010"
  }
}
```

**错误响应**:

```json
{
  "success": false,
  "error": "请输入有效的11位手机号码"
}
```

### 3.2 油价查询

查询全国或特定城市的油价信息。

**接口地址**: `GET /api/life/oil-price`

**请求参数**:
| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| city | string | 否 | 城市名称（不传则查询全国油价） |

**请求示例**:

```bash
# 查询全国油价
curl "http://localhost:3000/api/life/oil-price"

# 查询指定城市油价
curl "http://localhost:3000/api/life/oil-price?city=北京"
```

**响应示例**:

```json
{
  "success": true,
  "message": "油价查询完成",
  "data": {
    "city": "北京",
    "update_time": "2024-01-01",
    "prices": {
      "92#": "7.50",
      "95#": "8.00",
      "98#": "9.00",
      "0#": "7.20"
    }
  }
}
```

## 4. 限流规则

### 4.1 媒体解析 API 限流

- **限制**: 每个 IP 每分钟最多 20 次请求
- **错误信息**: "媒体解析请求过于频繁，请稍后再试"

### 4.2 社交媒体 API 限流

- **限制**: 每个 IP 每分钟最多 30 次请求
- **错误信息**: "社交媒体请求过于频繁，请稍后再试"

### 4.3 生活信息 API 限流

- **限制**: 每个 IP 每分钟最多 40 次请求
- **错误信息**: "生活信息请求过于频繁，请稍后再试"

## 5. 错误码说明

| HTTP 状态码 | 说明                 |
| ----------- | -------------------- |
| 200         | 请求成功             |
| 400         | 请求参数错误         |
| 429         | 请求过于频繁（限流） |
| 500         | 服务器内部错误       |

## 6. 使用示例

### 6.1 JavaScript 示例

```javascript
// 网抑云音乐解析
async function getMusicInfo(songId) {
  try {
    const response = await fetch(`/api/media/music163?id=${songId}`);
    const data = await response.json();

    if (data.success) {
      console.log("歌曲信息:", data.data);
    } else {
      console.error("解析失败:", data.error);
    }
  } catch (error) {
    console.error("请求失败:", error);
  }
}

// 微博热搜
async function getWeiboHot() {
  try {
    const response = await fetch("/api/social/weibo-hot");
    const data = await response.json();

    if (data.success) {
      console.log("微博热搜:", data.data);
    } else {
      console.error("获取失败:", data.error);
    }
  } catch (error) {
    console.error("请求失败:", error);
  }
}

// 手机号码归属地查询
async function getPhoneInfo(phone) {
  try {
    const response = await fetch(`/api/life/phone-address?phone=${phone}`);
    const data = await response.json();

    if (data.success) {
      console.log("归属地信息:", data.data);
    } else {
      console.error("查询失败:", data.error);
    }
  } catch (error) {
    console.error("请求失败:", error);
  }
}
```

### 6.2 Python 示例

```python
import requests

# 网抑云音乐解析
def get_music_info(song_id):
    try:
        response = requests.get(f'http://localhost:3000/api/media/music163?id={song_id}')
        data = response.json()

        if data['success']:
            print('歌曲信息:', data['data'])
        else:
            print('解析失败:', data['error'])
    except Exception as e:
        print('请求失败:', e)

# 微博热搜
def get_weibo_hot():
    try:
        response = requests.get('http://localhost:3000/api/social/weibo-hot')
        data = response.json()

        if data['success']:
            print('微博热搜:', data['data'])
        else:
            print('获取失败:', data['error'])
    except Exception as e:
        print('请求失败:', e)

# 手机号码归属地查询
def get_phone_info(phone):
    try:
        response = requests.get(f'http://localhost:3000/api/life/phone-address?phone={phone}')
        data = response.json()

        if data['success']:
            print('归属地信息:', data['data'])
        else:
            print('查询失败:', data['error'])
    except Exception as e:
        print('请求失败:', e)
```

## 7. 注意事项

1. **参数验证**: 所有 API 都会对输入参数进行严格验证
2. **超时设置**: 媒体解析 API 设置了较长的超时时间（15-20 秒）
3. **错误处理**: 所有 API 都包含完善的错误处理机制
4. **日志记录**: 所有请求都会被记录到日志中
5. **IP 限制**: 本地 IP 地址会跳过限流限制

## 8. 更新日志

- **v1.0.0**: 初始版本，包含所有基础功能
- 支持网抑云音乐解析
- 支持皮皮虾视频解析
- 支持微博热搜查询
- 支持百度热搜查询
- 支持手机号码归属地查询
- 支持油价查询
