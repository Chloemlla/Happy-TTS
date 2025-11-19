# IP段封禁（CIDR）使用指南

## 功能概述

ipBanCheck中间件现已支持CIDR格式的IP段封禁，可以一次性封禁整个IP段，而不仅仅是单个IP地址。

## 支持的格式

### IPv4 CIDR
- **单个IP**: `192.168.1.1` (传统方式)
- **C段**: `192.168.1.0/24` (封禁192.168.1.0-192.168.1.255)
- **B段**: `192.168.0.0/16` (封禁192.168.0.0-192.168.255.255)
- **自定义范围**: `10.0.0.0/8`, `172.16.0.0/12` 等

### IPv6 CIDR
- **单个IP**: `2001:db8::1`
- **子网**: `2001:db8::/32`
- **更大范围**: `2001:db8:abcd::/48`

## 使用方法

### 1. 直接在数据库中创建CIDR封禁记录

```javascript
// MongoDB示例
await IpBanModel.create({
  ipAddress: '192.168.1.0/24',  // CIDR格式
  reason: '恶意攻击来源IP段',
  violationCount: 1,
  expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7天后过期
});
```

### 2. 通过API封禁IP段（如果有管理接口）

```bash
curl -X POST https://api.example.com/admin/ip-ban \
  -H "Content-Type: application/json" \
  -d '{
    "ipAddress": "10.0.0.0/8",
    "reason": "内网测试IP段",
    "duration": 86400000
  }'
```

## 工作原理

### 并行查询策略
系统会同时进行三种查询：

1. **精确IP匹配** (Redis/MongoDB)
   - 最快，直接查找特定IP
   - 优先级最高

2. **CIDR范围匹配** (MongoDB)
   - 查询所有包含'/'的封禁记录
   - 检查请求IP是否在任何CIDR范围内
   - 自动缓存匹配结果

3. **缓存优化**
   - CIDR匹配结果缓存5分钟
   - 减少重复计算
   - 提高响应速度

### 性能特性

- ✅ **智能缓存**: CIDR匹配结果自动缓存，避免重复计算
- ✅ **并行查询**: 精确匹配和CIDR匹配并行执行
- ✅ **支持IPv4和IPv6**: 完整支持两种IP协议
- ✅ **高效位运算**: 使用位掩码进行快速范围匹配

## 示例场景

### 场景1: 封禁整个云服务商IP段
```javascript
// 封禁某个云服务商的整个IP段
await IpBanModel.create({
  ipAddress: '54.0.0.0/8',
  reason: 'AWS IP段临时限制',
  violationCount: 1,
  expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
});
```

### 场景2: 封禁内网IP段
```javascript
// 防止内网访问
await IpBanModel.create({
  ipAddress: '192.168.0.0/16',
  reason: '禁止内网访问',
  violationCount: 1,
  expiresAt: new Date('2099-12-31')
});
```

### 场景3: 封禁特定区域IP段
```javascript
// 基于地理位置的IP段封禁
await IpBanModel.create({
  ipAddress: '200.0.0.0/8',
  reason: '特定区域限制',
  violationCount: 1,
  expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
});
```

## 日志示例

### CIDR匹配成功
```
🎯 CIDR IP段匹配: 192.168.1.100 在 192.168.1.0/24 范围内
🚫 [MONGODB-CIDR] 封禁IP尝试访问: 192.168.1.100, 路径: GET /api/data, 原因: 恶意攻击来源IP段
```

### 性能监控
```
📊 IP封禁检查性能指标 [5分钟]: 
总请求=1000, 
缓存命中率=85.5%, 
Redis查询=50, 
Mongo查询=145, 
并行查询=145, 
平均响应=2.34ms
```

## 注意事项

1. **精确匹配优先**: 如果同时存在精确IP和CIDR段封禁，精确匹配优先返回
2. **缓存时效**: CIDR匹配结果缓存5分钟，修改封禁规则后可能需要等待
3. **性能考虑**: CIDR查询比精确匹配稍慢，但通过缓存优化了性能
4. **IP类型**: IPv4和IPv6不能混合匹配，必须使用对应的CIDR格式

## 清除缓存

如果需要立即生效新的封禁规则，可以清除缓存：

```javascript
import { clearAllCaches } from './middleware/ipBanCheck';

// 清除所有IP封禁相关缓存
clearAllCaches();
```

## 常用CIDR范围参考

### IPv4
- `/32` - 单个IP (1个地址)
- `/24` - C段 (256个地址)
- `/16` - B段 (65,536个地址)
- `/8` - A段 (16,777,216个地址)

### IPv6
- `/128` - 单个IP
- `/64` - 标准子网
- `/48` - 站点前缀
- `/32` - ISP分配

## 测试工具

### 测试IP是否在CIDR范围内

```javascript
// 测试脚本
const testCIDR = (ip, cidr) => {
  const result = isIPInCIDR(ip, cidr);
  console.log(`${ip} in ${cidr}: ${result}`);
};

testCIDR('192.168.1.100', '192.168.1.0/24'); // true
testCIDR('192.168.2.100', '192.168.1.0/24'); // false
testCIDR('10.0.0.1', '10.0.0.0/8'); // true
```

## 故障排查

### CIDR封禁不生效
1. 检查CIDR格式是否正确
2. 确认封禁记录未过期
3. 清除缓存后重试
4. 检查日志中的CIDR查询结果

### 性能下降
1. 检查CIDR封禁记录数量
2. 考虑合并重叠的IP段
3. 监控MongoDB CIDR查询性能
4. 调整缓存TTL配置
