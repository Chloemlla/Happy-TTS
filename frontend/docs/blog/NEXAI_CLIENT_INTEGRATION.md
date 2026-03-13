# NexAI 客户端对接技术文档

## 概述

本文档详细说明如何将 NexAI 客户端与后端安全系统对接。后端已实现完整的设备指纹追踪、风险评估和蜜罐防御系统。

## API 端点

所有 NexAI 安全 API 端点都位于 `/api/nexai` 路径下。

### 基础 URL

```
生产环境: https://api.951100.xyz/api/nexai
开发环境: https://api.951100.xyz/api/nexai
```

## 安全请求头规范

客户端在所有请求中必须包含以下 HTTP 头：

### 必需的请求头

| 请求头 | 类型 | 说明 | 示例 |
|--------|------|------|------|
| `X-Device-Fingerprint` | String | 设备指纹（64字符 SHA256） | `a3f5c8d9e2b1f4a6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0` |
| `X-Device-Risk-Score` | Integer | 风险评分（0-100） | `45` |
| `X-Device-Risk-Level` | String | 风险等级 | `MEDIUM` |
| `X-Device-Compromised` | String | 设备是否被攻破 | `0` 或 `1` |
| `X-Device-Root` | String | 是否 Root | `0` 或 `1` |
| `X-Device-Debugger` | String | 是否有调试器 | `0` 或 `1` |
| `X-Device-Emulator` | String | 是否模拟器 | `0` 或 `1` |
| `X-Device-VPN` | String | 是否使用 VPN | `0` 或 `1` |
| `X-Device-Signature-Valid` | String | APK 签名是否有效 | `0` 或 `1` |
| `X-Device-Hash-Valid` | String | APK 哈希是否有效 | `0` 或 `1` |

### 可选的请求头

| 请求头 | 类型 | 说明 | 示例 |
|--------|------|------|------|
| `X-App-Version` | String | 应用版本号 | `1.0.7-e19d98d36` |
| `X-App-Build` | String | 构建号 | `107` |

## API 端点详情

### 1. 上报安全事件

**端点**: `POST /api/nexai/security/report`

**说明**: 客户端主动上报安全事件（如完整性验证失败、Root 检测等）

**请求头**: 包含所有安全请求头

**请求体**:
```json
{
  "event_type": "integrity_fail",
  "details": {
    "signature_valid": false,
    "hash_valid": false,
    "expected_hash": "abc123...",
    "actual_hash": "def456..."
  },
  "timestamp": "2026-03-13T10:30:00Z"
}
```

**请求体字段说明**:
- `event_type` (必需): 事件类型
  - `integrity_fail`: 完整性验证失败
  - `root_detected`: 检测到 Root
  - `debugger_detected`: 检测到调试器
  - `emulator_detected`: 检测到模拟器
  - `tamper_detected`: 检测到篡改
  - `frida_detected`: 检测到 Frida 框架
  - `xposed_detected`: 检测到 Xposed 框架
- `details` (可选): 事件详细信息（JSON 对象）
- `timestamp` (可选): 事件时间戳（ISO 8601 格式）

**响应**:
```json
{
  "status": "recorded",
  "action": "block",
  "message": "Device has been flagged for security review"
}
```

**响应字段说明**:
- `status`: 记录状态（`recorded`）
- `action`: 服务器采取的动作
  - `monitor`: 正常服务，记录日志
  - `restrict`: 限制敏感功能
  - `honeypot`: 蜜罐模式（返回假数据）
  - `block`: 拒绝服务
- `message`: 提示信息

**HTTP 状态码**:
- `200`: 成功
- `400`: 请求参数错误
- `429`: 请求过于频繁
- `500`: 服务器内部错误

**示例代码（Kotlin）**:
```kotlin
suspend fun reportSecurityEvent(
    eventType: String,
    details: Map<String, Any>
): Result<SecurityEventResponse> {
    val request = SecurityEventRequest(
        event_type = eventType,
        details = details,
        timestamp = Instant.now().toString()
    )

    return apiService.reportSecurityEvent(request)
}

// 使用示例
reportSecurityEvent(
    eventType = "integrity_fail",
    details = mapOf(
        "signature_valid" to false,
        "hash_valid" to false,
        "expected_hash" to "abc123...",
        "actual_hash" to "def456..."
    )
)
```

### 2. 查询设备安全状态

**端点**: `GET /api/nexai/security/status`

**说明**: 查询当前设备的安全状态和限制信息

**请求头**: 包含所有安全请求头

**响应**:
```json
{
  "device_fingerprint": "a3f5c8d9...",
  "status": "flagged",
  "risk_level": "HIGH",
  "restrictions": [
    "payment_disabled",
    "api_rate_limited"
  ],
  "message": "Your device has been flagged due to security concerns"
}
```

**响应字段说明**:
- `device_fingerprint`: 设备指纹
- `status`: 设备状态
  - `normal`: 正常
  - `flagged`: 已标记
  - `blocked`: 已封禁
  - `unknown`: 未知（设备未在数据库中）
- `risk_level`: 风险等级（`SAFE`, `LOW`, `MEDIUM`, `HIGH`, `CRITICAL`）
- `restrictions`: 限制列表
  - `payment_disabled`: 支付功能禁用
  - `api_rate_limited`: API 速率受限
  - `all_operations_blocked`: 所有操作被阻止
- `message`: 状态说明

**HTTP 状态码**:
- `200`: 成功
- `400`: 缺少设备指纹
- `429`: 请求过于频繁
- `500`: 服务器内部错误

**示例代码（Kotlin）**:
```kotlin
suspend fun getSecurityStatus(): Result<SecurityStatusResponse> {
    return apiService.getSecurityStatus()
}

// 使用示例
val status = getSecurityStatus()
when (status.status) {
    "blocked" -> {
        // 显示封禁提示
        showBlockedDialog(status.message)
    }
    "flagged" -> {
        // 显示警告，限制部分功能
        if ("payment_disabled" in status.restrictions) {
            disablePaymentFeature()
        }
    }
    "normal" -> {
        // 正常使用
    }
}
```

### 3. 检查异常行为

**端点**: `GET /api/nexai/security/anomalies`

**说明**: 检查多账号关联和频繁换设备等异常行为（需要认证）

**请求头**:
- 包含所有安全请求头
- `Authorization: Bearer <JWT_TOKEN>` (必需)

**响应**:
```json
{
  "device_fingerprint": "a3f5c8d9...",
  "user_id": "user123",
  "anomalies": {
    "multi_account": false,
    "frequent_device_switch": true
  },
  "details": {
    "account_count": 2,
    "device_count": 4
  }
}
```

**响应字段说明**:
- `device_fingerprint`: 设备指纹
- `user_id`: 用户 ID
- `anomalies`: 异常检测结果
  - `multi_account`: 是否检测到多账号（同一设备 >5 个账号）
  - `frequent_device_switch`: 是否频繁换设备（24小时内 >3 个设备）
- `details`: 详细统计
  - `account_count`: 该设备关联的账号数量
  - `device_count`: 该用户最近使用的设备数量

**HTTP 状态码**:
- `200`: 成功
- `400`: 缺少设备指纹
- `401`: 未认证
- `429`: 请求过于频繁
- `500`: 服务器内部错误

**示例代码（Kotlin）**:
```kotlin
suspend fun checkAnomalies(): Result<AnomaliesResponse> {
    return apiService.checkAnomalies()
}

// 使用示例
val anomalies = checkAnomalies()
if (anomalies.anomalies.multi_account) {
    // 警告：检测到多账号异常
    logSecurityWarning("Multi-account detected")
}
if (anomalies.anomalies.frequent_device_switch) {
    // 警告：频繁换设备
    logSecurityWarning("Frequent device switch detected")
}
```

### 4. 手动追踪设备

**端点**: `POST /api/nexai/security/track`

**说明**: 手动追踪设备信息（需要认证）

**请求头**:
- 包含所有安全请求头
- `Authorization: Bearer <JWT_TOKEN>` (必需)

**响应**:
```json
{
  "status": "tracked",
  "device_fingerprint": "a3f5c8d9...",
  "risk_level": "MEDIUM",
  "risk_score": 45
}
```

**HTTP 状态码**:
- `200`: 成功
- `400`: 缺少设备指纹
- `401`: 未认证
- `429`: 请求过于频繁
- `500`: 服务器内部错误

**示例代码（Kotlin）**:
```kotlin
suspend fun trackDevice(): Result<TrackDeviceResponse> {
    return apiService.trackDevice()
}

// 使用示例
// 在用户登录后自动追踪设备
trackDevice()
```

## 客户端集成指南

### 1. 初始化安全拦截器

创建一个 Retrofit 拦截器，自动添加安全请求头：

```kotlin
class SecurityHeadersInterceptor(
    private val securityManager: SecurityManager
) : Interceptor {
    override fun intercept(chain: Interceptor.Chain): Response {
        val original = chain.request()

        val request = original.newBuilder().apply {
            // 添加设备指纹
            header("X-Device-Fingerprint", securityManager.getDeviceFingerprint())

            // 添加风险评分
            val riskScore = securityManager.calculateRiskScore()
            header("X-Device-Risk-Score", riskScore.toString())
            header("X-Device-Risk-Level", getRiskLevel(riskScore))

            // 添加安全标志
            header("X-Device-Compromised", if (securityManager.isCompromised()) "1" else "0")
            header("X-Device-Root", if (securityManager.isRooted()) "1" else "0")
            header("X-Device-Debugger", if (securityManager.isDebuggerConnected()) "1" else "0")
            header("X-Device-Emulator", if (securityManager.isEmulator()) "1" else "0")
            header("X-Device-VPN", if (securityManager.isVpnActive()) "1" else "0")
            header("X-Device-Signature-Valid", if (securityManager.isSignatureValid()) "1" else "0")
            header("X-Device-Hash-Valid", if (securityManager.isHashValid()) "1" else "0")

            // 添加应用版本信息
            header("X-App-Version", BuildConfig.VERSION_NAME)
            header("X-App-Build", BuildConfig.VERSION_CODE.toString())
        }.build()

        return chain.proceed(request)
    }

    private fun getRiskLevel(score: Int): String {
        return when {
            score >= 80 -> "CRITICAL"
            score >= 50 -> "HIGH"
            score >= 30 -> "MEDIUM"
            score >= 10 -> "LOW"
            else -> "SAFE"
        }
    }
}
```

### 2. 配置 Retrofit

```kotlin
val okHttpClient = OkHttpClient.Builder()
    .addInterceptor(SecurityHeadersInterceptor(securityManager))
    .addInterceptor(AuthInterceptor(tokenManager))
    .build()

val retrofit = Retrofit.Builder()
    .baseUrl("https://your-domain.com/api/")
    .client(okHttpClient)
    .addConverterFactory(GsonConverterFactory.create())
    .build()

val apiService = retrofit.create(NexAISecurityService::class.java)
```

### 3. 定义 API 接口

```kotlin
interface NexAISecurityService {
    @POST("nexai/security/report")
    suspend fun reportSecurityEvent(
        @Body request: SecurityEventRequest
    ): Response<SecurityEventResponse>

    @GET("nexai/security/status")
    suspend fun getSecurityStatus(): Response<SecurityStatusResponse>

    @GET("nexai/security/anomalies")
    suspend fun checkAnomalies(): Response<AnomaliesResponse>

    @POST("nexai/security/track")
    suspend fun trackDevice(): Response<TrackDeviceResponse>
}
```

### 4. 数据模型

```kotlin
data class SecurityEventRequest(
    val event_type: String,
    val details: Map<String, Any>? = null,
    val timestamp: String? = null
)

data class SecurityEventResponse(
    val status: String,
    val action: String,
    val message: String
)

data class SecurityStatusResponse(
    val device_fingerprint: String,
    val status: String,
    val risk_level: String,
    val restrictions: List<String>,
    val message: String
)

data class AnomaliesResponse(
    val device_fingerprint: String,
    val user_id: String,
    val anomalies: Anomalies,
    val details: AnomalyDetails
)

data class Anomalies(
    val multi_account: Boolean,
    val frequent_device_switch: Boolean
)

data class AnomalyDetails(
    val account_count: Int,
    val device_count: Int
)

data class TrackDeviceResponse(
    val status: String,
    val device_fingerprint: String,
    val risk_level: String,
    val risk_score: Int
)
```

### 5. 安全事件上报时机

建议在以下情况下上报安全事件：

```kotlin
class SecurityEventReporter(
    private val apiService: NexAISecurityService
) {
    suspend fun reportIntegrityFailure(details: Map<String, Any>) {
        apiService.reportSecurityEvent(
            SecurityEventRequest(
                event_type = "integrity_fail",
                details = details
            )
        )
    }

    suspend fun reportRootDetection() {
        apiService.reportSecurityEvent(
            SecurityEventRequest(
                event_type = "root_detected",
                details = mapOf(
                    "detection_method" to "su_binary",
                    "root_apps" to listOf("Magisk", "SuperSU")
                )
            )
        )
    }

    suspend fun reportDebuggerDetection() {
        apiService.reportSecurityEvent(
            SecurityEventRequest(
                event_type = "debugger_detected"
            )
        )
    }

    suspend fun reportEmulatorDetection() {
        apiService.reportSecurityEvent(
            SecurityEventRequest(
                event_type = "emulator_detected",
                details = mapOf(
                    "fingerprint" to Build.FINGERPRINT,
                    "model" to Build.MODEL,
                    "hardware" to Build.HARDWARE
                )
            )
        )
    }
}
```

### 6. 处理服务器响应

根据服务器返回的 `action` 字段采取相应措施：

```kotlin
class SecurityResponseHandler {
    fun handleSecurityResponse(response: SecurityEventResponse) {
        when (response.action) {
            "block" -> {
                // 服务器拒绝服务，显示错误信息并退出应用
                showBlockDialog(response.message)
                exitApp()
            }
            "honeypot" -> {
                // 服务器返回假数据，记录日志
                logWarning("Device in honeypot mode")
            }
            "restrict" -> {
                // 限制敏感功能
                disableSensitiveFeatures()
                showWarningDialog(response.message)
            }
            "monitor" -> {
                // 正常服务，但被监控
                logInfo("Device is being monitored")
            }
            else -> {
                // 正常服务
            }
        }
    }
}
```

### 7. 定期检查设备状态

建议在应用启动和定期检查设备安全状态：

```kotlin
class SecurityStatusChecker(
    private val apiService: NexAISecurityService,
    private val scope: CoroutineScope
) {
    fun startPeriodicCheck(intervalMinutes: Long = 30) {
        scope.launch {
            while (isActive) {
                checkStatus()
                delay(intervalMinutes * 60 * 1000)
            }
        }
    }

    private suspend fun checkStatus() {
        try {
            val response = apiService.getSecurityStatus()
            if (response.isSuccessful) {
                val status = response.body()
                handleSecurityStatus(status)
            }
        } catch (e: Exception) {
            logError("Failed to check security status", e)
        }
    }

    private fun handleSecurityStatus(status: SecurityStatusResponse?) {
        status ?: return

        when (status.status) {
            "blocked" -> {
                showBlockDialog(status.message)
                exitApp()
            }
            "flagged" -> {
                if ("payment_disabled" in status.restrictions) {
                    disablePaymentFeature()
                }
                if ("api_rate_limited" in status.restrictions) {
                    showRateLimitWarning()
                }
            }
        }
    }
}
```

## 风险评分计算

客户端应根据以下规则计算风险评分：

```kotlin
class RiskScoreCalculator {
    fun calculateRiskScore(
        isSignatureValid: Boolean,
        isHashValid: Boolean,
        isRooted: Boolean,
        isDebuggerConnected: Boolean,
        isEmulator: Boolean,
        isVpnActive: Boolean
    ): Int {
        var score = 0

        if (!isSignatureValid) score += 50
        if (!isHashValid) score += 50
        if (isRooted) score += 30
        if (isDebuggerConnected) score += 40
        if (isEmulator) score += 30
        if (isVpnActive) score += 20

        return score.coerceIn(0, 100)
    }
}
```

## 错误处理

### HTTP 状态码处理

```kotlin
suspend fun <T> safeApiCall(
    apiCall: suspend () -> Response<T>
): Result<T> {
    return try {
        val response = apiCall()
        when (response.code()) {
            200 -> Result.success(response.body()!!)
            400 -> Result.failure(BadRequestException(response.message()))
            401 -> Result.failure(UnauthorizedException())
            429 -> Result.failure(RateLimitException())
            500 -> Result.failure(ServerErrorException())
            else -> Result.failure(UnknownException(response.code()))
        }
    } catch (e: Exception) {
        Result.failure(e)
    }
}
```

### 重试策略

对于网络错误，建议实现指数退避重试：

```kotlin
suspend fun <T> retryWithExponentialBackoff(
    maxRetries: Int = 3,
    initialDelayMs: Long = 1000,
    maxDelayMs: Long = 10000,
    factor: Double = 2.0,
    block: suspend () -> T
): T {
    var currentDelay = initialDelayMs
    repeat(maxRetries - 1) {
        try {
            return block()
        } catch (e: Exception) {
            logWarning("Retry attempt ${it + 1} failed", e)
        }
        delay(currentDelay)
        currentDelay = (currentDelay * factor).toLong().coerceAtMost(maxDelayMs)
    }
    return block() // 最后一次尝试，失败则抛出异常
}
```

## 性能优化建议

### 1. 缓存设备指纹

设备指纹计算开销较大，应缓存结果：

```kotlin
class DeviceFingerprintCache {
    private var cachedFingerprint: String? = null

    fun getFingerprint(calculator: () -> String): String {
        if (cachedFingerprint == null) {
            cachedFingerprint = calculator()
        }
        return cachedFingerprint!!
    }
}
```

### 2. 异步上报

安全事件上报应异步进行，不阻塞主线程：

```kotlin
fun reportSecurityEventAsync(
    eventType: String,
    details: Map<String, Any>
) {
    CoroutineScope(Dispatchers.IO).launch {
        try {
            apiService.reportSecurityEvent(
                SecurityEventRequest(eventType, details)
            )
        } catch (e: Exception) {
            logError("Failed to report security event", e)
        }
    }
}
```

### 3. 批量上报

对于频繁的安全事件，可以批量上报：

```kotlin
class BatchSecurityReporter(
    private val apiService: NexAISecurityService,
    private val batchSize: Int = 10,
    private val flushIntervalMs: Long = 60000
) {
    private val eventQueue = mutableListOf<SecurityEventRequest>()

    fun addEvent(event: SecurityEventRequest) {
        synchronized(eventQueue) {
            eventQueue.add(event)
            if (eventQueue.size >= batchSize) {
                flush()
            }
        }
    }

    private fun flush() {
        val events = synchronized(eventQueue) {
            val copy = eventQueue.toList()
            eventQueue.clear()
            copy
        }

        CoroutineScope(Dispatchers.IO).launch {
            events.forEach { event ->
                try {
                    apiService.reportSecurityEvent(event)
                } catch (e: Exception) {
                    logError("Failed to report event", e)
                }
            }
        }
    }
}
```

## 测试建议

### 单元测试

```kotlin
@Test
fun testRiskScoreCalculation() {
    val calculator = RiskScoreCalculator()

    // 测试正常设备
    assertEquals(0, calculator.calculateRiskScore(
        isSignatureValid = true,
        isHashValid = true,
        isRooted = false,
        isDebuggerConnected = false,
        isEmulator = false,
        isVpnActive = false
    ))

    // 测试 Root 设备
    assertEquals(30, calculator.calculateRiskScore(
        isSignatureValid = true,
        isHashValid = true,
        isRooted = true,
        isDebuggerConnected = false,
        isEmulator = false,
        isVpnActive = false
    ))

    // 测试签名无效
    assertEquals(50, calculator.calculateRiskScore(
        isSignatureValid = false,
        isHashValid = true,
        isRooted = false,
        isDebuggerConnected = false,
        isEmulator = false,
        isVpnActive = false
    ))
}
```

### 集成测试

```kotlin
@Test
fun testSecurityEventReporting() = runBlocking {
    val mockService = mockk<NexAISecurityService>()
    coEvery {
        mockService.reportSecurityEvent(any())
    } returns Response.success(
        SecurityEventResponse(
            status = "recorded",
            action = "monitor",
            message = "Event recorded"
        )
    )

    val reporter = SecurityEventReporter(mockService)
    reporter.reportRootDetection()

    coVerify {
        mockService.reportSecurityEvent(
            match { it.event_type == "root_detected" }
        )
    }
}
```

## 常见问题

### Q1: 设备指纹如何生成？

A: 设备指纹应基于硬件特征、软件特征、存储特征等多个维度生成，并使用 SHA256 哈希。具体实现请参考 NexAI 客户端源码。

### Q2: 风险评分多久更新一次？

A: 建议每次请求时实时计算风险评分，因为设备状态可能随时变化（如连接 VPN、连接调试器等）。

### Q3: 如果服务器返回 `block` 动作，客户端应该怎么做？

A: 应立即停止所有敏感操作，显示错误提示，并建议用户联系客服。不应尝试绕过封禁。

### Q4: 安全事件上报失败怎么办？

A: 建议实现重试机制（最多 3 次），如果仍然失败，可以将事件缓存到本地，等待下次网络恢复时上报。

### Q5: 是否需要在每个请求中都包含安全请求头？

A: 是的，所有请求都应包含安全请求头，这样服务器才能进行完整的风险评估和设备追踪。

## 安全注意事项

1. **不要在客户端硬编码敏感信息**：如 API 密钥、加密密钥等
2. **使用 HTTPS**：所有 API 请求必须使用 HTTPS 加密传输
3. **验证服务器证书**：实现证书固定（Certificate Pinning）防止中间人攻击
4. **混淆代码**：使用 ProGuard/R8 混淆安全相关代码
5. **防止逆向工程**：使用代码混淆、字符串加密、反调试等技术
6. **及时更新**：定期更新客户端，修复安全漏洞

## 更新日志

### v1.0.0 (2026-03-13)
- 初始版本
- 实现设备指纹追踪
- 实现风险评估系统
- 实现蜜罐防御机制
- 实现异常检测功能
