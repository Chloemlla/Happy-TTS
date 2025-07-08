---
title: 抖音热榜 API 文档
date: 2025-07-07
slug: douyin-hot-api
tags: [api, douyin, hot, trending]
---

# 抖音热榜 API 文档

## 概述

抖音热榜 API 提供抖音平台上的热门视频、话题和实时排行榜数据查询服务。通过该 API，开发者可以轻松获取抖音平台的最新热门趋势，助力内容分析、市场调研和社交媒体监控。

## 接口信息

- **接口地址**: `GET /api/network/douyinhot`
- **请求方式**: GET
- **响应格式**: JSON
- **超时时间**: 15 秒
- **限流规则**: 每个 IP 每分钟最多 30 次请求

## 请求参数

该接口无需任何请求参数。

## 响应格式

### 成功响应

```json
{
  "success": true,
  "message": "抖音热榜获取完成",
  "data": {
    "code": 200,
    "msg": "数据请求成功",
    "data": [
      {
        "word": "火箭热火冲突6人被驱逐",
        "hot_value": 12244807,
        "position": 1,
        "event_time": 1735533481,
        "video_count": 3,
        "word_cover": {
          "uri": "tos-cn-p-0015/owESw9BnUcyFcFLGecJDygBACNAfAX8yBI7aEh",
          "url_list": [
            "https://p3-sign.douyinpic.com/tos-cn-p-0015/owESw9BnUcyFcFLGecJDygBACNAfAX8yBI7aEh~noop.jpeg?lk3s=bfd515bb&x-expires=1735578000&x-signature=idrHTFPTyzpPA9JA3c9hDh6HZhU%3D&from=3218412987",
            "https://p26-sign.douyinpic.com/tos-cn-p-0015/owESw9BnUcyFcFLGecJDygBACNAfAX8yBI7aEh~noop.jpeg?lk3s=bfd515bb&x-expires=1735578000&x-signature=Q3yhkIZXnHHQjGYd%2FZm57xDKi8c%3D&from=3218412987",
            "https://p11-sign.douyinpic.com/tos-cn-p-0015/owESw9BnUcyFcFLGecJDygBACNAfAX8yBI7aEh~noop.jpeg?lk3s=bfd515bb&x-expires=1735578000&x-signature=QJsUYx%2Fz73bY5hBbT1fjzy6vxjA%3D&from=3218412987"
          ]
        },
        "label": 3,
        "group_id": "7452267248612742440",
        "sentence_id": "1947544",
        "sentence_tag": 5000,
        "word_type": 1,
        "article_detail_count": 0,
        "discuss_video_count": 1,
        "display_style": 0,
        "can_extend_detail": false,
        "hotlist_param": "{\"version\":1}",
        "related_words": null,
        "word_sub_board": null,
        "aweme_infos": null,
        "drift_info": null
      }
    ],
    "request_id": "f1e6b96be39a1ee39588c298"
  }
}
```

### 错误响应

```json
{
  "success": false,
  "error": "抖音热榜服务无响应，请稍后重试"
}
```

## 响应字段说明

### 顶层字段

| 字段名  | 类型    | 说明             |
| ------- | ------- | ---------------- |
| success | boolean | 请求是否成功     |
| message | string  | 成功时的消息     |
| error   | string  | 失败时的错误信息 |

### data 字段

| 字段名     | 类型    | 说明                         |
| ---------- | ------- | ---------------------------- |
| code       | integer | API 响应状态码，200 表示成功 |
| msg        | string  | API 响应消息                 |
| data       | array   | 热榜数据列表                 |
| request_id | string  | 请求唯一标识                 |

### 热榜数据字段

| 字段名               | 类型        | 说明                      |
| -------------------- | ----------- | ------------------------- |
| word                 | string      | 热榜标题/话题名称         |
| hot_value            | integer     | 热度值，数值越大越热门    |
| position             | integer     | 排名位置，从 1 开始       |
| event_time           | integer     | 事件时间戳（Unix 时间戳） |
| video_count          | integer     | 相关视频数量              |
| word_cover           | object      | 封面图片信息              |
| label                | integer     | 标签类型                  |
| group_id             | string      | 分组 ID                   |
| sentence_id          | string      | 句子 ID                   |
| sentence_tag         | integer     | 句子标签                  |
| word_type            | integer     | 词条类型                  |
| article_detail_count | integer     | 文章详情数量              |
| discuss_video_count  | integer     | 讨论视频数量              |
| display_style        | integer     | 显示样式                  |
| can_extend_detail    | boolean     | 是否可扩展详情            |
| hotlist_param        | string      | 热榜参数（JSON 格式）     |
| related_words        | object/null | 相关词汇                  |
| word_sub_board       | array/null  | 子板块信息                |
| aweme_infos          | object/null | 视频信息                  |
| drift_info           | object/null | 漂移信息                  |
| room_count           | integer     | 房间数量（直播相关）      |

### word_cover 字段

| 字段名   | 类型   | 说明          |
| -------- | ------ | ------------- |
| uri      | string | 图片 URI      |
| url_list | array  | 图片 URL 列表 |

## 状态码说明

| 状态码 | 说明                 |
| ------ | -------------------- |
| 200    | 请求成功             |
| 400    | 参数错误             |
| 429    | 请求过于频繁（限流） |
| 500    | 服务器内部错误       |

## 使用示例

### JavaScript (axios)

```javascript
const axios = require("axios");

async function getDouyinHot() {
  try {
    const response = await axios.get(
      "http://localhost:3000/api/network/douyinhot"
    );

    if (response.data.success) {
      const hotList = response.data.data.data;
      console.log("抖音热榜数据:", hotList);

      // 显示前10名
      hotList.slice(0, 10).forEach((item, index) => {
        console.log(`${index + 1}. ${item.word} (热度: ${item.hot_value})`);
      });
    } else {
      console.error("获取失败:", response.data.error);
    }
  } catch (error) {
    console.error("请求失败:", error.message);
  }
}

getDouyinHot();
```

### Python (requests)

```python
import requests

def get_douyin_hot():
    try:
        response = requests.get('http://localhost:3000/api/network/douyinhot')
        data = response.json()

        if data['success']:
            hot_list = data['data']['data']
            print('抖音热榜数据:', hot_list)

            # 显示前10名
            for i, item in enumerate(hot_list[:10]):
                print(f"{i + 1}. {item['word']} (热度: {item['hot_value']})")
        else:
            print('获取失败:', data['error'])

    except Exception as e:
        print('请求失败:', str(e))

get_douyin_hot()
```

### cURL

```bash
curl -X GET "http://localhost:3000/api/network/douyinhot" \
  -H "Accept: application/json" \
  -H "User-Agent: MyApp/1.0"
```

## 注意事项

1. **限流控制**: 每个 IP 地址每分钟最多可请求 30 次，超过限制将返回 429 状态码
2. **数据时效性**: 热榜数据实时更新，建议根据业务需求合理设置缓存时间
3. **图片资源**: 返回的图片 URL 有时效性，建议及时处理或缓存
4. **错误处理**: 建议实现完善的错误处理机制，包括网络异常、服务异常等
5. **数据格式**: 返回的数据结构可能随抖音平台更新而变化，建议做好兼容性处理

## 业务场景

### 内容分析

- 分析热门话题趋势
- 监控特定领域热度变化
- 内容创作方向指导

### 市场调研

- 了解用户关注焦点
- 分析品牌话题热度
- 竞品监控

### 社交媒体监控

- 实时监控热点事件
- 舆情分析
- 话题传播追踪

### 应用集成

- 新闻聚合应用
- 社交媒体工具
- 数据分析平台

## 相关接口

- [精准 IP 查询](./PRECISE_IP_QUERY_API.md) - 查询 IP 地理位置信息
- [随机一言古诗词](./RANDOM_QUOTE_API.md) - 获取随机一言或古诗词
- [网络检测服务](./NETWORK_APIS.md) - 网络连接检测相关接口

## 更新日志

| 版本  | 日期       | 更新内容                   |
| ----- | ---------- | -------------------------- |
| 1.0.0 | 2024-12-30 | 初始版本，支持抖音热榜查询 |

## 技术支持

如有问题或建议，请联系技术支持团队。
