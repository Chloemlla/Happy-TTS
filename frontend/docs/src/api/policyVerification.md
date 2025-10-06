# 隐私政策验证 API 端点

## 概述

为了增强隐私政策验证的安全性，可以在后端实现以下 API 端点来记录和验证用户的同意状态。

## API 端点

### POST /api/policy/verify

记录用户的隐私政策同意状态。

#### 请求体

```json
{
  "consent": {
    "timestamp": 1696636800000,
    "version": "2.0",
    "fingerprint": "abc123def456",
    "checksum": "xyz789"
  },
  "userAgent": "Mozilla/5.0...",
  "timestamp": 1696636800000
}
```

#### 响应

**成功 (200)**
```json
{
  "success": true,
  "message": "Consent recorded successfully",
  "consentId": "consent_123456"
}
```

**失败 (400)**
```json
{
  "success": false,
  "error": "Invalid consent data",
  "details": "Checksum verification failed"
}
```

## 实现示例

### Node.js/Express 实现

```javascript
const express = require('express');
const crypto = require('crypto');
const app = express();

// 验证校验和的函数
function verifyChecksum(consent) {
  const data = `${consent.timestamp}|${consent.version}|${consent.fingerprint}`;
  const expectedChecksum = crypto
    .createHash('sha256')
    .update(data + 'hapxtts_secret_salt')
    .digest('hex')
    .substring(0, 8);
  
  return consent.checksum === expectedChecksum;
}

// 隐私政策验证端点
app.post('/api/policy/verify', async (req, res) => {
  try {
    const { consent, userAgent, timestamp } = req.body;
    
    // 验证必需字段
    if (!consent || !consent.timestamp || !consent.version || 
        !consent.fingerprint || !consent.checksum) {
      return res.status(400).json({
        success: false,
        error: 'Missing required consent fields'
      });
    }
    
    // 验证校验和
    if (!verifyChecksum(consent)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid consent data',
        details: 'Checksum verification failed'
      });
    }
    
    // 验证时间戳（不能是未来时间，不能太旧）
    const now = Date.now();
    const fiveMinutesAgo = now - (5 * 60 * 1000);
    
    if (consent.timestamp > now || consent.timestamp < fiveMinutesAgo) {
      return res.status(400).json({
        success: false,
        error: 'Invalid timestamp'
      });
    }
    
    // 验证版本
    if (consent.version !== '2.0') {
      return res.status(400).json({
        success: false,
        error: 'Unsupported policy version'
      });
    }
    
    // 记录到数据库（示例）
    const consentRecord = {
      id: crypto.randomUUID(),
      ...consent,
      userAgent,
      ip: req.ip,
      recordedAt: new Date(),
    };
    
    // await db.policyConsents.insert(consentRecord);
    
    // 记录日志
    console.log('Policy consent recorded:', {
      consentId: consentRecord.id,
      version: consent.version,
      fingerprint: consent.fingerprint,
      ip: req.ip,
      userAgent: userAgent?.substring(0, 100)
    });
    
    res.json({
      success: true,
      message: 'Consent recorded successfully',
      consentId: consentRecord.id
    });
    
  } catch (error) {
    console.error('Error recording policy consent:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

module.exports = app;
```

### 数据库表结构

```sql
CREATE TABLE policy_consents (
  id VARCHAR(36) PRIMARY KEY,
  timestamp BIGINT NOT NULL,
  version VARCHAR(10) NOT NULL,
  fingerprint VARCHAR(100) NOT NULL,
  checksum VARCHAR(100) NOT NULL,
  user_agent TEXT,
  ip_address VARCHAR(45),
  recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  INDEX idx_fingerprint (fingerprint),
  INDEX idx_timestamp (timestamp),
  INDEX idx_version (version)
);
```

## 安全考虑

1. **校验和验证**: 确保客户端数据未被篡改
2. **时间戳验证**: 防止重放攻击
3. **版本控制**: 确保使用最新的政策版本
4. **IP 记录**: 用于安全审计
5. **用户代理记录**: 检测异常行为
6. **速率限制**: 防止滥用

## 客户端集成

客户端的 `policyVerification.ts` 已经包含了调用此端点的逻辑：

```typescript
private async sendConsentToServer(consent: PolicyConsent): Promise<void> {
  try {
    const response = await fetch('/api/policy/verify', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        consent,
        userAgent: navigator.userAgent,
        timestamp: Date.now()
      })
    });
    
    if (!response.ok) {
      throw new Error(`Server response: ${response.status}`);
    }
  } catch (error) {
    console.warn('Server consent recording failed:', error);
  }
}
```

## 监控和分析

可以基于记录的数据进行以下分析：

1. **同意率统计**: 跟踪用户同意政策的比例
2. **版本采用率**: 监控新政策版本的采用情况
3. **异常检测**: 识别可疑的绕过尝试
4. **合规报告**: 生成隐私合规报告

## 注意事项

- 此 API 端点是可选的，客户端验证仍然是主要的安全机制
- 服务器端记录主要用于审计和分析目的
- 确保遵守相关的数据保护法规
- 定期清理过期的同意记录
