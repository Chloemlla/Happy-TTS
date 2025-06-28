---
title: Java SDK 使用说明
sidebar_position: 4
---

# Java SDK 使用说明

## 简介

本文档介绍如何在 Java 项目中通过 HTTP API 调用 Synapse 文本转语音（TTS）服务，适用于需要在 Java 后端或桌面应用中集成 TTS 功能的场景。

## 依赖

建议使用 OkHttp 或 HttpClient 进行 HTTP 请求。以 OkHttp 为例：

```xml
<!-- Maven 依赖 -->
<dependency>
  <groupId>com.squareup.okhttp3</groupId>
  <artifactId>okhttp</artifactId>
  <version>4.9.3</version>
</dependency>
```

## 主要接口

通过 HTTP POST 请求调用 TTS 服务接口。

### 请求参数

| 参数          | 类型   | 说明               |
| ------------- | ------ | ------------------ |
| text          | String | 要合成的文本       |
| model         | String | 语音模型           |
| voice         | String | 发音人             |
| output_format | String | 输出格式（mp3 等） |
| speed         | Float  | 语速               |
| userId        | String | 用户 ID（可选）    |
| isAdmin       | Bool   | 是否管理员（可选） |

### 返回值

- fileName：音频文件名
- audioUrl：音频文件访问地址
- isDuplicate：是否为重复内容

## 典型用法

```java
import okhttp3.*;
import java.io.IOException;

public class TtsDemo {
    public static void main(String[] args) throws IOException {
        OkHttpClient client = new OkHttpClient();
        String json = "{" +
                "\"text\": \"你好，世界！\"," +
                "\"model\": \"tts-1\"," +
                "\"voice\": \"alloy\"," +
                "\"output_format\": \"mp3\"," +
                "\"speed\": 1.0," +
                "\"userId\": \"user123\"}";
        RequestBody body = RequestBody.create(json, MediaType.parse("application/json"));
        Request request = new Request.Builder()
                .url("http://your-api-server/tts/generate")
                .post(body)
                .build();
        Response response = client.newCall(request).execute();
        System.out.println(response.body().string());
    }
}
```

## 注意事项

- 请根据实际部署地址修改 API URL
- 用户重复提交相同内容会被临时封禁 24 小时
- 需保证请求参数完整且合法
