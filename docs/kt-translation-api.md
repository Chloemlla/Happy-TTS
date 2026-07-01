# KT Translation API 调用文档

本文档说明 KT/Kotlin 客户端如何调用后端已配置的公共翻译 API。客户端不需要携带登录态，也不应持有 DeepLX API Key；后端会使用运行时已保存的 DeepLX 配置完成转发。

## 接口地址

基础地址按部署环境替换：

```text
https://<your-domain>
```

公共接口：

```text
GET  /api/public/deeplx/config
POST /api/public/deeplx/translate
```

限流策略：`POST /api/public/deeplx/translate` 按客户端 IP 统计，默认每 60 秒最多 300 次请求。超过限制时返回 HTTP `429`。

## 查询配置状态

```http
GET /api/public/deeplx/config
Accept: application/json
```

响应示例：

```json
{
  "enabled": true,
  "requiresApiKey": true,
  "baseUrl": "https://api.deeplx.org",
  "endpointPath": "https://api.deeplx.org/<api-key>/translate"
}
```

`enabled=false` 表示后端尚未配置可用 DeepLX API Key，此时翻译接口会返回 HTTP `503`。

## 发起翻译

```http
POST /api/public/deeplx/translate
Content-Type: application/json
Accept: application/json
```

请求体：

```json
{
  "text": "Hello, world",
  "sourceLang": "auto",
  "targetLang": "ZH"
}
```

字段说明：

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `text` | 是 | 待翻译文本，去除首尾空白后不能为空，最长 5000 个字符。 |
| `sourceLang` | 否 | 源语言，默认 `auto`。也兼容 `source_lang`。 |
| `targetLang` | 是 | 目标语言，例如 `ZH`、`EN`、`JA`。也兼容 `target_lang`。 |

成功响应：

```json
{
  "success": true,
  "translatedText": "你好，世界",
  "alternatives": ["你好 世界", "您好，世界"],
  "sourceLang": "EN",
  "targetLang": "ZH"
}
```

常见错误：

| HTTP 状态 | 场景 |
| --- | --- |
| `400` | 参数缺失、文本过长、DeepLX 上游返回错误。 |
| `429` | 超过公共 API 限流。 |
| `503` | 后端 DeepLX 未配置或配置不可用。 |

## Kotlin/Android 示例

以下示例适用于已有 OkHttp 的 Android/Kotlin 项目：

```kotlin
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject

data class TranslationResult(
    val translatedText: String,
    val sourceLang: String,
    val targetLang: String,
    val alternatives: List<String>
)

class TranslationApi(
    private val baseUrl: String,
    private val client: OkHttpClient = OkHttpClient()
) {
    private val jsonMediaType = "application/json; charset=utf-8".toMediaType()

    suspend fun translate(
        text: String,
        targetLang: String,
        sourceLang: String = "auto"
    ): TranslationResult = withContext(Dispatchers.IO) {
        val payload = JSONObject()
            .put("text", text)
            .put("sourceLang", sourceLang)
            .put("targetLang", targetLang)
            .toString()

        val request = Request.Builder()
            .url("${baseUrl.trimEnd('/')}/api/public/deeplx/translate")
            .addHeader("Accept", "application/json")
            .post(payload.toRequestBody(jsonMediaType))
            .build()

        client.newCall(request).execute().use { response ->
            val body = response.body?.string().orEmpty()
            if (!response.isSuccessful) {
                val message = runCatching { JSONObject(body).optString("error") }.getOrNull()
                throw IllegalStateException(message?.takeIf { it.isNotBlank() } ?: "Translation failed: HTTP ${response.code}")
            }

            val json = JSONObject(body)
            val alternativesJson = json.optJSONArray("alternatives")
            val alternatives = buildList {
                if (alternativesJson != null) {
                    for (index in 0 until alternativesJson.length()) {
                        add(alternativesJson.optString(index))
                    }
                }
            }

            TranslationResult(
                translatedText = json.getString("translatedText"),
                sourceLang = json.optString("sourceLang", sourceLang),
                targetLang = json.optString("targetLang", targetLang),
                alternatives = alternatives
            )
        }
    }
}
```

调用示例：

```kotlin
val api = TranslationApi("https://<your-domain>")
val result = api.translate(
    text = "Hello, world",
    targetLang = "ZH"
)
println(result.translatedText)
```

客户端侧建议：

- 对 `429` 做退避重试，不要立即密集重试。
- 对 `503` 展示服务未配置或暂不可用状态。
- 不要在 KT 客户端保存或传输 DeepLX API Key。
