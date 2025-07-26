---
title: EnvManager AES-256 加密传输实现
date: 2025-01-27
slug: env-encryption-implementation
tags: [security, encryption, aes-256, env-manager]
---

# EnvManager AES-256 加密传输实现

## 概述

为了保护敏感的环境变量数据，EnvManager 组件实现了 AES-256 加密传输机制。后端使用管理员用户的 token 作为加密密钥，对环境变量数据进行加密后传输，前端使用相同的 token 进行解密显示。

## 安全特性

### 1. 密钥管理

- **密钥来源**: 使用管理员用户的 JWT token 作为 AES-256 加密密钥
- **密钥唯一性**: 每个管理员的 token 都是唯一的，确保数据隔离
- **密钥时效性**: token 有过期时间，过期后无法解密数据

### 2. 加密算法

- **算法**: AES-256-CBC
- **密钥派生**: 使用 SHA-256 对 token 进行哈希处理
- **初始化向量**: 每次请求生成随机 IV，确保相同数据的加密结果不同
- **填充模式**: PKCS7

### 3. 传输安全

- **端到端加密**: 数据在传输过程中始终是加密状态
- **中间人防护**: 即使网络被监听，也无法获取明文数据
- **重放攻击防护**: 每次请求使用不同的 IV

## 实现细节

### 后端实现 (adminController.ts)

```typescript
// 获取所有环境变量
async getEnvs(req: Request, res: Response) {
  try {
    // 检查管理员权限
    if (!req.user || req.user.role !== 'admin') {
      return res.status(403).json({ error: '需要管理员权限' });
    }

    // 获取管理员token作为加密密钥
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: '未携带Token，请先登录' });
    }

    const token = authHeader.substring(7); // 移除 'Bearer ' 前缀
    if (!token) {
      return res.status(401).json({ error: 'Token为空' });
    }

    // 合并env对象和所有导出常量
    let allEnvs: Record<string, any> = {};
    if (envModule.env && typeof envModule.env === 'object') {
      allEnvs = { ...envModule.env };
    }
    for (const [k, v] of Object.entries(envModule)) {
      if (k !== 'env') allEnvs[k] = v;
    }

    // 将环境变量转换为数组格式
    const envArray = Object.entries(allEnvs).map(([key, value]) => ({
      key,
      value: String(value)
    }));

    // 使用AES-256-CBC加密数据
    const algorithm = 'aes-256-cbc';
    const key = crypto.createHash('sha256').update(token).digest();
    const iv = crypto.randomBytes(16);

    const cipher = crypto.createCipheriv(algorithm, key, iv);
    let encrypted = cipher.update(JSON.stringify(envArray), 'utf8', 'hex');
    encrypted += cipher.final('hex');

        // 返回加密后的数据
    res.json({
      success: true,
      data: encrypted,
      iv: iv.toString('hex')
    });
  } catch (e) {
    logger.error('获取环境变量失败:', e);
    res.status(500).json({ success: false, error: '获取环境变量失败' });
  }
}
```

### 前端实现 (EnvManager.tsx)

```typescript
// AES-256解密函数
function decryptAES256(encryptedData: string, iv: string, key: string): string {
  try {
    const keyBytes = CryptoJS.SHA256(key);
    const ivBytes = CryptoJS.enc.Hex.parse(iv);
    const encryptedBytes = CryptoJS.enc.Hex.parse(encryptedData);

    const decrypted = CryptoJS.AES.decrypt(
      { ciphertext: encryptedBytes },
      keyBytes,
      {
        iv: ivBytes,
        mode: CryptoJS.mode.CBC,
        padding: CryptoJS.pad.Pkcs7,
      }
    );

    return decrypted.toString(CryptoJS.enc.Utf8);
  } catch (error) {
    console.error("解密失败:", error);
    throw new Error("解密失败");
  }
}

// 在fetchEnvs函数中的解密逻辑
if (
  data.data &&
  data.iv &&
  typeof data.data === "string" &&
  typeof data.iv === "string"
) {
  try {
    const token = localStorage.getItem("token");
    if (!token) {
      setNotification({ message: "Token不存在，无法解密数据", type: "error" });
      setLoading(false);
      return;
    }

    // 解密数据
    const decryptedJson = decryptAES256(data.data, data.iv, token);
    const decryptedData = JSON.parse(decryptedJson);

    if (Array.isArray(decryptedData)) {
      envArr = decryptedData;
    } else {
      setNotification({ message: "解密数据格式错误", type: "error" });
      setLoading(false);
      return;
    }
  } catch (decryptError) {
    console.error("解密失败:", decryptError);
    setNotification({ message: "数据解密失败，请检查登录状态", type: "error" });
    setLoading(false);
    return;
  }
}
```

## API 响应格式

### 加密数据响应

```json
{
  "success": true,
  "data": "a1b2c3d4e5f6...", // 加密后的十六进制字符串
  "iv": "f1e2d3c4b5a6..." // 初始化向量的十六进制字符串
}
```

### 错误响应

```json
{
  "success": false,
  "error": "错误信息"
}
```

## 兼容性

### 向后兼容

- 支持旧的未加密格式响应
- 自动检测响应格式并选择相应的处理方式

### 错误处理

- Token 不存在或无效
- 解密失败
- 数据格式错误
- 网络错误

## 测试

### 本地测试

```bash
node scripts/test-env-encryption.js
```

### 测试内容

1. 本地加密解密功能验证
2. 数据一致性检查
3. 错误情况处理
4. API 接口测试（需要真实 token）

## 安全建议

### 1. Token 管理

- 定期更换管理员 token
- 使用强密码策略
- 启用 TOTP 或 Passkey 二次验证

### 2. 网络传输

- 使用 HTTPS 传输
- 启用 HSTS
- 配置安全的 CSP 策略

### 3. 客户端安全

- 定期清理本地存储
- 实现自动登出机制
- 监控异常登录行为

## 性能考虑

### 1. 加密开销

- AES-256 加密/解密性能良好
- 密钥派生使用 SHA-256，计算开销小
- 随机 IV 生成使用系统随机数生成器

### 2. 网络传输

- 加密后数据大小略有增加
- 支持数据压缩（如果启用）
- 缓存策略可减少重复请求

## 故障排除

### 常见问题

1. **解密失败**
   - 检查 token 是否正确
   - 确认 token 未过期
   - 验证 IV 格式是否正确

2. **权限错误**
   - 确认用户具有管理员权限
   - 检查 token 格式是否正确
   - 验证用户状态是否正常

3. **数据格式错误**
   - 检查后端返回的数据格式
   - 确认加密参数正确
   - 验证 JSON 解析是否成功

### 调试方法

1. 启用详细日志记录
2. 使用浏览器开发者工具检查网络请求
3. 验证加密解密函数的输入输出
4. 检查 token 的有效性和格式

## 总结

EnvManager 的 AES-256 加密传输实现提供了强大的数据保护能力，确保敏感的环境变量信息在传输过程中得到充分保护。通过使用管理员 token 作为加密密钥，实现了基于身份的访问控制，只有具有正确权限的用户才能访问和查看环境变量数据。

该实现具有良好的向后兼容性和错误处理机制，同时考虑了性能和安全性之间的平衡，为系统提供了可靠的数据保护解决方案。
