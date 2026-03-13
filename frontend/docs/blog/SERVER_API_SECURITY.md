# NexAI 服务端安全接口文档

## 概述

NexAI 客户端会在所有 API 请求中自动添加安全相关的 HTTP 头，用于设备指纹识别、风险评估和蜜罐防御。

## 安全请求头

### 设备识别

#### `X-Device-Fingerprint`
- **类型**: String (64字符 SHA256 哈希)
- **示例**: `a3f5c8d9e2b1f4a6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0`
- **说明**: 永久唯一设备标识符，基于以下特征生成：
  - 硬件特征：CPU ABI、屏幕参数、传感器列表、摄像头信息
  - 软件特征：已安装应用哈希、系统应用哈希、字体列表
  - 存储特征：分区信息、存储容量、文件系统
  - 传感器指纹：加速度计/陀螺仪/磁力计特征
  - 网络特征：Android ID、网络接口
  - 系统属性：Build 属性、序列号、指纹
- **用途**:
  - 设备唯一性识别
  - 多账号关联检测
  - 异常设备追踪
  - 设备黑名单

#### `X-App-Version`
- **类型**: String
- **示例**: `1.0.7-e19d98d36`
- **说明**: 应用版本号（包含 Git commit hash）

#### `X-App-Build`
- **类型**: String
- **示例**: `107`
- **说明**: 构建号

### 风险评估

#### `X-Device-Risk-Score`
- **类型**: Integer (0-100)
- **示例**: `45`
- **说明**: 设备风险评分
  - 0-9: SAFE（安全）
  - 10-29: LOW（低风险）
  - 30-49: MEDIUM（中风险）
  - 50-79: HIGH（高风险）
  - 80-100: CRITICAL（极高风险）

**评分规则**:
```
签名无效:        +50
APK 哈希无效:    +50
Root/越狱:       +30
调试器连接:      +40
模拟器:          +30
VPN 连接:        +20
```

#### `X-Device-Risk-Level`
- **类型**: String (枚举)
- **可能值**: `SAFE` | `LOW` | `MEDIUM` | `HIGH` | `CRITICAL`
- **示例**: `MEDIUM`
- **说明**: 风险等级文本描述

### 安全标志

#### `X-Device-Compromised`
- **类型**: String (`0` | `1`)
- **示例**: `1`
- **说明**: 设备是否被攻破（Root、签名篡改、调试器等）
- **触发条件**:
  - APK 签名不匹配（TOFU 验证失败）
  - APK 文件哈希与 GitHub release 不匹配
  - 检测到 Root
  - 检测到调试器
  - 检测到模拟器
  - 检测到 Frida/Xposed 框架

#### `X-Device-Root`
- **类型**: String (`0` | `1`)
- **示例**: `0`
- **说明**: 设备是否 Root
- **检测方法**:
  - su 二进制文件检测
  - Root 管理应用检测（SuperSU、Magisk 等）
  - 系统属性检测（ro.debuggable、test-keys）
  - Frida 框架检测
  - Xposed 框架检测

#### `X-Device-Debugger`
- **类型**: String (`0` | `1`)
- **示例**: `0`
- **说明**: 是否有调试器连接
- **检测方法**: `Debug.isDebuggerConnected()`

#### `X-Device-Emulator`
- **类型**: String (`0` | `1`)
- **示例**: `0`
- **说明**: 是否运行在模拟器
- **检测特征**:
  - Build.FINGERPRINT 包含 "generic"
  - Build.MODEL 包含 "Emulator"、"google_sdk"
  - Build.HARDWARE 包含 "goldfish"、"ranchu"

#### `X-Device-VPN`
- **类型**: String (`0` | `1`)
- **示例**: `0`
- **说明**: 是否使用 VPN
- **检测方法**:
  - NetworkCapabilities.TRANSPORT_VPN
  - 虚拟网卡检测（tun0、ppp0、wg0）
  - 路由表分析
  - DNS 服务器分析
  - VPN 应用检测

#### `X-Device-Signature-Valid`
- **类型**: String (`0` | `1`)
- **示例**: `1`
- **说明**: APK 签名是否有效（TOFU 验证）

#### `X-Device-Hash-Valid`
- **类型**: String (`0` | `1`)
- **示例**: `1`
- **说明**: APK 文件哈希是否与 GitHub release 匹配

## 服务端处理建议

### 1. 风险分级策略

```python
def get_risk_strategy(headers):
    risk_score = int(headers.get('X-Device-Risk-Score', 0))
    is_compromised = headers.get('X-Device-Compromised') == '1'

    if risk_score >= 80 or (is_compromised and risk_score >= 50):
        return 'BLOCK'  # 拒绝服务
    elif risk_score >= 50:
        return 'HONEYPOT'  # 蜜罐模式（返回假数据）
    elif risk_score >= 30:
        return 'RESTRICT'  # 限制敏感功能
    elif risk_score >= 10:
        return 'MONITOR'  # 正常服务，记录日志
    else:
        return 'NORMAL'  # 正常服务
```

### 2. 设备指纹追踪

```python
# 存储设备指纹与用户关联
def track_device(user_id, device_fingerprint, risk_info):
    db.execute("""
        INSERT INTO device_tracking (
            user_id,
            device_fingerprint,
            risk_score,
            risk_level,
            is_compromised,
            is_root,
            is_debugger,
            is_emulator,
            is_vpn,
            first_seen,
            last_seen,
            request_count
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW(), 1)
        ON DUPLICATE KEY UPDATE
            last_seen = NOW(),
            request_count = request_count + 1,
            risk_score = VALUES(risk_score),
            risk_level = VALUES(risk_level)
    """, (
        user_id,
        device_fingerprint,
        risk_info['score'],
        risk_info['level'],
        risk_info['compromised'],
        risk_info['root'],
        risk_info['debugger'],
        risk_info['emulator'],
        risk_info['vpn']
    ))
```

### 3. 异常检测

```python
# 检测异常行为
def detect_anomalies(device_fingerprint, user_id):
    # 1. 多账号关联检测
    accounts = db.query("""
        SELECT COUNT(DISTINCT user_id) as account_count
        FROM device_tracking
        WHERE device_fingerprint = ?
    """, (device_fingerprint,))

    if accounts[0]['account_count'] > 5:
        alert('多账号异常', device_fingerprint, user_id)

    # 2. 设备切换检测
    devices = db.query("""
        SELECT COUNT(DISTINCT device_fingerprint) as device_count
        FROM device_tracking
        WHERE user_id = ?
        AND last_seen > DATE_SUB(NOW(), INTERVAL 1 DAY)
    """, (user_id,))

    if devices[0]['device_count'] > 3:
        alert('频繁换设备', device_fingerprint, user_id)

    # 3. 高风险设备集中检测
    high_risk_count = db.query("""
        SELECT COUNT(*) as count
        FROM device_tracking
        WHERE risk_score >= 50
        AND last_seen > DATE_SUB(NOW(), INTERVAL 1 HOUR)
    """)

    if high_risk_count[0]['count'] > 100:
        alert('大量高风险设备', None, None)
```

### 4. 蜜罐模式实现

```python
def handle_request(headers, request_data):
    strategy = get_risk_strategy(headers)

    if strategy == 'BLOCK':
        return {
            'error': 'Service unavailable',
            'code': 503
        }

    elif strategy == 'HONEYPOT':
        # 返回假数据
        return generate_fake_response(request_data)

    elif strategy == 'RESTRICT':
        # 限制敏感功能
        if is_sensitive_operation(request_data):
            return {
                'error': 'Operation not allowed',
                'code': 403
            }
        return process_normal_request(request_data)

    else:
        # 正常处理
        return process_normal_request(request_data)
```

### 5. 速率限制

```python
# 基于设备指纹的速率限制
def check_rate_limit(device_fingerprint, risk_score):
    # 高风险设备更严格的限制
    if risk_score >= 50:
        limit = 10  # 每分钟 10 次
    elif risk_score >= 30:
        limit = 30  # 每分钟 30 次
    else:
        limit = 100  # 每分钟 100 次

    key = f"rate_limit:{device_fingerprint}"
    current = redis.incr(key)

    if current == 1:
        redis.expire(key, 60)

    if current > limit:
        return False, f"Rate limit exceeded: {current}/{limit}"

    return True, None
```

## 数据库设计

### device_tracking 表

```sql
CREATE TABLE device_tracking (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    user_id BIGINT NOT NULL,
    device_fingerprint VARCHAR(64) NOT NULL,
    risk_score INT NOT NULL,
    risk_level VARCHAR(20) NOT NULL,
    is_compromised BOOLEAN NOT NULL,
    is_root BOOLEAN NOT NULL,
    is_debugger BOOLEAN NOT NULL,
    is_emulator BOOLEAN NOT NULL,
    is_vpn BOOLEAN NOT NULL,
    signature_valid BOOLEAN NOT NULL,
    hash_valid BOOLEAN NOT NULL,
    app_version VARCHAR(50),
    app_build VARCHAR(20),
    first_seen DATETIME NOT NULL,
    last_seen DATETIME NOT NULL,
    request_count BIGINT DEFAULT 0,
    blocked_count BIGINT DEFAULT 0,

    INDEX idx_device_fingerprint (device_fingerprint),
    INDEX idx_user_id (user_id),
    INDEX idx_risk_score (risk_score),
    INDEX idx_last_seen (last_seen),
    UNIQUE KEY uk_user_device (user_id, device_fingerprint)
);
```

### security_events 表

```sql
CREATE TABLE security_events (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    device_fingerprint VARCHAR(64) NOT NULL,
    user_id BIGINT,
    event_type VARCHAR(50) NOT NULL,  -- 'integrity_fail', 'root_detected', etc.
    event_data JSON,
    risk_score INT,
    ip_address VARCHAR(45),
    user_agent TEXT,
    created_at DATETIME NOT NULL,

    INDEX idx_device_fingerprint (device_fingerprint),
    INDEX idx_event_type (event_type),
    INDEX idx_created_at (created_at)
);
```

## API 端点示例

### POST /api/v1/security/report

客户端主动上报安全事件。

**请求头**:
```
X-Device-Fingerprint: a3f5c8d9e2b1f4a6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0
X-Device-Risk-Score: 85
X-Device-Risk-Level: CRITICAL
X-Device-Compromised: 1
```

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

**响应**:
```json
{
  "status": "recorded",
  "action": "block",
  "message": "Device has been flagged for security review"
}
```

### GET /api/v1/security/status

查询设备安全状态。

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

## 监控告警

### 告警规则

1. **大量完整性验证失败**
   - 条件：1小时内 >100 个设备 `X-Device-Hash-Valid: 0`
   - 说明：可能有破解版流传

2. **异常流量模式**
   - 条件：单个设备指纹 1分钟内 >1000 请求
   - 说明：可能是爬虫或自动化攻击

3. **集中地区高风险设备**
   - 条件：特定 IP 段 1小时内 >50 个高风险设备
   - 说明：可能是有组织的攻击

4. **新设备指纹激增**
   - 条件：1小时内新设备指纹 >1000
   - 说明：可能是设备指纹伪造攻击

## 隐私合规

### GDPR / 个人信息保护法

1. **数据最小化**
   - 仅收集必要的设备特征
   - 不收集个人身份信息（姓名、电话、邮箱等）

2. **用户知情同意**
   - 在隐私政策中说明设备指纹收集
   - 提供选择退出机制

3. **数据保留期限**
   - 设备追踪数据保留 90 天
   - 安全事件日志保留 1 年

4. **数据删除权**
   - 用户可请求删除其设备指纹数据
   - 提供 API: `DELETE /api/v1/security/device/{fingerprint}`

## 测试建议

### 单元测试

```python
def test_risk_scoring():
    # 测试风险评分计算
    assert calculate_risk_score(root=True, debugger=False) == 30
    assert calculate_risk_score(root=True, debugger=True) == 70
    assert calculate_risk_score(signature_invalid=True) == 50

def test_rate_limiting():
    # 测试速率限制
    fingerprint = "test_device_123"
    for i in range(10):
        assert check_rate_limit(fingerprint, risk_score=50) == True
    assert check_rate_limit(fingerprint, risk_score=50) == False
```

### 集成测试

```python
def test_honeypot_mode():
    # 测试蜜罐模式
    headers = {
        'X-Device-Risk-Score': '85',
        'X-Device-Compromised': '1'
    }
    response = client.post('/api/chat', headers=headers, json={...})
    assert response.status_code == 200
    assert response.json()['is_fake'] == True  # 内部标记
```

## 性能优化

1. **缓存设备指纹**
   - Redis 缓存设备风险评分（TTL: 5分钟）
   - 减少数据库查询

2. **异步处理**
   - 安全事件记录异步写入
   - 不阻塞主请求流程

3. **批量查询**
   - 批量查询设备黑名单
   - 使用 Bloom Filter 快速过滤
