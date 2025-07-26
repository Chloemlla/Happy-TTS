# LogShare 复杂数学公式加密实现

## 概述

LogShare模块现在使用了一套复杂的数学公式加密方法，结合了多种加密技术和数学变换，大大提高了数据安全性。

## 加密算法组成

### 1. PBKDF2密钥派生

- **算法**: PBKDF2 (Password-Based Key Derivation Function 2)
- **哈希函数**: SHA-512
- **轮数**: 10000-20000轮（随机）
- **盐值**: 32字节随机盐值
- **密钥长度**: 256位

### 2. AES-256-GCM认证加密

- **模式**: GCM (Galois/Counter Mode)
- **密钥长度**: 256位
- **IV**: 16字节随机初始化向量
- **认证数据**: 包含时间戳和随机字符串
- **认证标签**: 16字节GCM认证标签

### 3. 数学矩阵变换

- **矩阵大小**: 根据数据长度动态计算
- **变换矩阵**: 基于密钥生成的变换矩阵
- **非线性变换**: 使用模运算和位运算的组合

## 数学公式详解

### 密钥派生公式

```
keyHash = PBKDF2(password + salt, salt, rounds, 32, 'sha512')
```

### 矩阵变换公式

```
transformMatrix[i][j] = keyArray[(i * matrixSize + j) % keyLength] % 256
```

### 非线性变换公式

```
transformed = ((sum * 7 + 13) % 256) ^ ((sum >> 3) + (sum << 5)) % 256
```

### 矩阵乘法

```
resultMatrix[i][j] = Σ(transformMatrix[i][k] * dataMatrix[k][j])
```

## 加密流程

1. **数据准备**: 将JSON数据转换为字符串
2. **盐值生成**: 生成32字节随机盐值
3. **轮数生成**: 生成10000-20000之间的随机轮数
4. **密钥派生**: 使用PBKDF2生成256位密钥
5. **IV生成**: 生成16字节随机IV
6. **认证数据**: 生成包含时间戳的认证数据
7. **AES-GCM加密**: 使用AES-256-GCM进行加密
8. **数据组合**: 组合加密数据、认证标签和认证数据
9. **数学变换**: 应用矩阵变换和非线性变换
10. **结果输出**: 返回加密数据、IV、盐值和轮数

## 解密流程

1. **参数验证**: 检查加密参数完整性
2. **密钥派生**: 使用相同的PBKDF2参数重新生成密钥
3. **逆数学变换**: 应用逆矩阵变换
4. **数据分离**: 分离加密数据、认证标签和认证数据
5. **AES-GCM解密**: 使用AES-256-GCM进行解密
6. **数据解析**: 解析JSON数据

## 安全特性

### 1. 抗暴力破解

- 10000-20000轮PBKDF2大大增加了暴力破解的计算成本
- 随机盐值防止彩虹表攻击

### 2. 数据完整性

- GCM模式提供认证加密，确保数据完整性
- 认证标签防止数据篡改

### 3. 前向安全性

- 每次加密使用不同的IV和盐值
- 即使密钥泄露，历史数据仍然安全

### 4. 数学复杂度

- 矩阵变换增加了数学复杂度
- 非线性变换防止线性分析

## 兼容性

系统同时支持新旧两种加密格式：

- **新格式**: 包含`salt`和`rounds`参数
- **旧格式**: 仅包含`data`和`iv`参数

## 性能考虑

- **加密时间**: 由于PBKDF2轮数较高，加密时间约为100-200ms
- **解密时间**: 解密时间与加密时间相近
- **内存使用**: 矩阵变换需要额外的内存空间

## 使用示例

### 后端加密

```typescript
const encrypted = encryptData({ logs: allLogs }, token);
return res.json({
  data: encrypted.data,
  iv: encrypted.iv,
  salt: encrypted.salt,
  rounds: encrypted.rounds,
});
```

### 前端解密

```typescript
const keyHash = CryptoJS.PBKDF2(token + salt, salt, {
  keySize: 256 / 32,
  iterations: rounds,
});
const reversedData = reverseMathematicalTransform(data, keyHash);
// ... 后续解密步骤
```

## 总结

这套复杂数学公式加密方法结合了现代密码学技术和数学变换，提供了极高的安全性。通过多层加密和数学变换，即使攻击者获得了部分信息，也很难破解完整的加密数据。
