---
title: IP封禁管理API - 管理员手动封禁和解封功能
date: 2025-08-27
slug: ip-ban-management-api
tags: [ip-ban, admin, management, api, security, feature, blog]
---

# IP封禁管理API - 管理员手动封禁和解封功能

## 概述

我们为管理员提供了完整的IP封禁管理功能，支持手动封禁、解封IP地址，以及批量操作。所有接口都需要管理员权限，通过JWT token进行认证。

## 认证要求

所有IP封禁管理接口都需要管理员权限，请在请求头中包含有效的JWT token：

```http
Authorization: Bearer YOUR_ADMIN_JWT_TOKEN
```

## API接口

### 1. 手动封禁单个IP

**接口**: `POST /api/turnstile/ban-ip`

**请求体**:

```json
{
  "ipAddress": "192.168.1.100",
  "reason": "违规行为 - 恶意请求",
  "durationMinutes": 120,
  "fingerprint": "optional_fingerprint",
  "userAgent": "optional_user_agent"
}
```

**参数说明**:

- `ipAddress` (必填): 要封禁的IP地址
- `reason` (必填): 封禁原因，最大500字符
- `durationMinutes` (可选): 封禁时长（分钟），默认60分钟，最大1440分钟（24小时）
- `fingerprint` (可选): 用户指纹
- `userAgent` (可选): 用户代理

**成功响应**:

```json
{
  "success": true,
  "message": "IP 192.168.1.100 已被封禁 120 分钟",
  "banInfo": {
    "ipAddress": "192.168.1.100",
    "reason": "违规行为 - 恶意请求",
    "durationMinutes": 120,
    "expiresAt": "2025-01-27T12:30:00.000Z",
    "bannedAt": "2025-01-27T10:30:00.000Z"
  }
}
```

**错误响应**:

```json
{
  "success": false,
  "error": "IP已被封禁",
  "existingBan": {
    "reason": "之前的封禁原因",
    "expiresAt": "2025-01-27T11:30:00.000Z"
  }
}
```

### 2. 手动解封单个IP

**接口**: `POST /api/turnstile/unban-ip`

**请求体**:

```json
{
  "ipAddress": "192.168.1.100"
}
```

**成功响应**:

```json
{
  "success": true,
  "message": "IP 192.168.1.100 封禁已解除"
}
```

**错误响应**:

```json
{
  "success": false,
  "error": "IP地址未找到或未被封禁"
}
```

### 3. 批量封禁IP

**接口**: `POST /api/turnstile/ban-ips`

**请求体**:

```json
{
  "ipAddresses": ["192.168.1.100", "192.168.1.101", "192.168.1.102"],
  "reason": "批量封禁 - 恶意攻击",
  "durationMinutes": 180
}
```

**成功响应**:

```json
{
  "success": true,
  "total": 3,
  "successful": 2,
  "failed": 1,
  "results": [
    {
      "ipAddress": "192.168.1.100",
      "success": true,
      "message": "IP 192.168.1.100 已被封禁 180 分钟",
      "banInfo": {
        "reason": "批量封禁 - 恶意攻击",
        "durationMinutes": 180,
        "expiresAt": "2025-01-27T13:30:00.000Z",
        "bannedAt": "2025-01-27T10:30:00.000Z"
      }
    }
  ],
  "errors": [
    {
      "ipAddress": "192.168.1.101",
      "error": "IP已被封禁",
      "existingBan": {
        "reason": "之前的封禁原因",
        "expiresAt": "2025-01-27T11:30:00.000Z"
      }
    }
  ]
}
```

### 4. 批量解封IP

**接口**: `POST /api/turnstile/unban-ips`

**请求体**:

```json
{
  "ipAddresses": ["192.168.1.100", "192.168.1.101", "192.168.1.102"]
}
```

**成功响应**:

```json
{
  "success": true,
  "total": 3,
  "successful": 2,
  "failed": 1,
  "results": [
    {
      "ipAddress": "192.168.1.100",
      "success": true,
      "message": "IP 192.168.1.100 封禁已解除"
    }
  ],
  "errors": [
    {
      "ipAddress": "192.168.1.101",
      "error": "IP地址未找到或未被封禁"
    }
  ]
}
```

### 5. 获取IP封禁统计

**接口**: `GET /api/turnstile/ip-ban-stats`

**成功响应**:

```json
{
  "success": true,
  "stats": {
    "total": 150,
    "active": 45,
    "expired": 105
  }
}
```

## 使用示例

### 使用curl命令

```bash
# 1. 获取管理员token（通过登录接口）
TOKEN="your_admin_jwt_token"

# 2. 手动封禁IP
curl -X POST http://your-api-domain/api/turnstile/ban-ip \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "ipAddress": "192.168.1.100",
    "reason": "恶意攻击 - 频繁请求",
    "durationMinutes": 120
  }'

# 3. 解封IP
curl -X POST http://your-api-domain/api/turnstile/unban-ip \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "ipAddress": "192.168.1.100"
  }'

# 4. 批量封禁IP
curl -X POST http://your-api-domain/api/turnstile/ban-ips \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "ipAddresses": ["192.168.1.100", "192.168.1.101"],
    "reason": "批量封禁 - 恶意行为",
    "durationMinutes": 60
  }'

# 5. 获取封禁统计
curl -X GET http://your-api-domain/api/turnstile/ip-ban-stats \
  -H "Authorization: Bearer $TOKEN"
```

### 使用JavaScript/TypeScript

```typescript
// IP封禁管理类
class IpBanManager {
  private baseUrl: string;
  private token: string;

  constructor(baseUrl: string, token: string) {
    this.baseUrl = baseUrl;
    this.token = token;
  }

  // 手动封禁IP
  async banIp(ipAddress: string, reason: string, durationMinutes: number = 60) {
    const response = await fetch(`${this.baseUrl}/api/turnstile/ban-ip`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.token}`,
      },
      body: JSON.stringify({
        ipAddress,
        reason,
        durationMinutes,
      }),
    });

    return await response.json();
  }

  // 解封IP
  async unbanIp(ipAddress: string) {
    const response = await fetch(`${this.baseUrl}/api/turnstile/unban-ip`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.token}`,
      },
      body: JSON.stringify({ ipAddress }),
    });

    return await response.json();
  }

  // 批量封禁IP
  async banIps(
    ipAddresses: string[],
    reason: string,
    durationMinutes: number = 60
  ) {
    const response = await fetch(`${this.baseUrl}/api/turnstile/ban-ips`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.token}`,
      },
      body: JSON.stringify({
        ipAddresses,
        reason,
        durationMinutes,
      }),
    });

    return await response.json();
  }

  // 批量解封IP
  async unbanIps(ipAddresses: string[]) {
    const response = await fetch(`${this.baseUrl}/api/turnstile/unban-ips`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.token}`,
      },
      body: JSON.stringify({ ipAddresses }),
    });

    return await response.json();
  }

  // 获取封禁统计
  async getBanStats() {
    const response = await fetch(`${this.baseUrl}/api/turnstile/ip-ban-stats`, {
      headers: {
        Authorization: `Bearer ${this.token}`,
      },
    });

    return await response.json();
  }
}

// 使用示例
const ipBanManager = new IpBanManager(
  "http://your-api-domain",
  "your_admin_token"
);

// 封禁单个IP
const banResult = await ipBanManager.banIp("192.168.1.100", "恶意攻击", 120);
console.log("封禁结果:", banResult);

// 批量封禁IP
const batchBanResult = await ipBanManager.banIps(
  ["192.168.1.100", "192.168.1.101"],
  "批量封禁",
  60
);
console.log("批量封禁结果:", batchBanResult);
```

### 使用Python

```python
import requests
import json

class IpBanManager:
    def __init__(self, base_url: str, token: str):
        self.base_url = base_url
        self.headers = {
            'Content-Type': 'application/json',
            'Authorization': f'Bearer {token}'
        }

    def ban_ip(self, ip_address: str, reason: str, duration_minutes: int = 60):
        """手动封禁IP"""
        url = f"{self.base_url}/api/turnstile/ban-ip"
        data = {
            'ipAddress': ip_address,
            'reason': reason,
            'durationMinutes': duration_minutes
        }

        response = requests.post(url, headers=self.headers, json=data)
        return response.json()

    def unban_ip(self, ip_address: str):
        """解封IP"""
        url = f"{self.base_url}/api/turnstile/unban-ip"
        data = {'ipAddress': ip_address}

        response = requests.post(url, headers=self.headers, json=data)
        return response.json()

    def ban_ips(self, ip_addresses: list, reason: str, duration_minutes: int = 60):
        """批量封禁IP"""
        url = f"{self.base_url}/api/turnstile/ban-ips"
        data = {
            'ipAddresses': ip_addresses,
            'reason': reason,
            'durationMinutes': duration_minutes
        }

        response = requests.post(url, headers=self.headers, json=data)
        return response.json()

    def unban_ips(self, ip_addresses: list):
        """批量解封IP"""
        url = f"{self.base_url}/api/turnstile/unban-ips"
        data = {'ipAddresses': ip_addresses}

        response = requests.post(url, headers=self.headers, json=data)
        return response.json()

    def get_ban_stats(self):
        """获取封禁统计"""
        url = f"{self.base_url}/api/turnstile/ip-ban-stats"
        response = requests.get(url, headers=self.headers)
        return response.json()

# 使用示例
ip_ban_manager = IpBanManager('http://your-api-domain', 'your_admin_token')

# 封禁单个IP
result = ip_ban_manager.ban_ip('192.168.1.100', '恶意攻击', 120)
print('封禁结果:', result)

# 批量封禁IP
batch_result = ip_ban_manager.ban_ips(
    ['192.168.1.100', '192.168.1.101'],
    '批量封禁',
    60
)
print('批量封禁结果:', batch_result)
```

## 安全特性

### 1. 权限验证

- 所有接口都需要管理员权限
- 通过JWT token进行身份验证
- 自动检查用户角色（admin/administrator）

### 2. 输入验证

- IP地址格式验证（IPv4/IPv6）
- 封禁原因长度限制（最大500字符）
- 封禁时长限制（1分钟到24小时）
- 危险字符过滤和清理

### 3. 重复检查

- 自动检查IP是否已被封禁
- 避免重复封禁同一IP
- 提供现有封禁信息

### 4. 批量操作

- 支持批量封禁和解封
- 详细的成功/失败统计
- 错误信息详细记录

## 错误处理

### 常见错误码

| 状态码 | 错误类型   | 说明                       |
| ------ | ---------- | -------------------------- |
| 400    | 参数无效   | IP地址格式错误、参数缺失等 |
| 401    | 未授权     | JWT token无效或过期        |
| 403    | 权限不足   | 非管理员用户访问           |
| 409    | 冲突       | IP已被封禁                 |
| 404    | 未找到     | IP地址未找到或未被封禁     |
| 429    | 请求过频   | 接口调用频率超限           |
| 500    | 服务器错误 | 数据库连接失败等           |

### 错误响应格式

```json
{
  "success": false,
  "error": "错误描述",
  "details": "详细错误信息（可选）"
}
```

## 最佳实践

### 1. 封禁策略

- 根据违规严重程度设置不同的封禁时长
- 记录详细的封禁原因，便于后续分析
- 定期检查封禁统计，及时调整策略

### 2. 批量操作

- 批量操作时建议分批处理大量IP
- 注意检查返回的错误信息
- 记录操作日志便于审计

### 3. 监控告警

- 定期检查封禁统计信息
- 设置异常封禁数量的告警
- 监控封禁操作的频率

### 4. 安全建议

- 定期轮换管理员JWT token
- 限制管理员账户的访问权限
- 记录所有封禁操作的审计日志

## 总结

IP封禁管理API提供了完整的管理功能：

### ✅ 核心功能

- **单个IP封禁/解封**: 精确控制单个IP地址
- **批量操作**: 高效处理大量IP地址
- **自定义时长**: 灵活设置封禁时长（1分钟-24小时）
- **详细原因**: 记录封禁原因便于管理

### 🔧 管理功能

- **统计信息**: 实时查看封禁状态
- **权限控制**: 严格的管理员权限验证
- **错误处理**: 完善的错误信息和状态码
- **批量处理**: 支持批量操作提高效率

### 🚀 扩展可能

- **封禁白名单**: 支持IP白名单功能
- **自动解封**: 定时自动解封功能
- **封禁历史**: 查看历史封禁记录
- **通知系统**: 封禁操作的通知机制

这套API为系统管理员提供了强大的IP封禁管理能力，有效保护系统安全。

---

**相关链接**

- [IP封禁系统实现](./IP_BAN_SYSTEM.md)
- [Turnstile验证服务](./TURNSTILE_SERVICE.md)
- [管理员权限管理](./ADMIN_PERMISSIONS.md)
