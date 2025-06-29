# 完整性检查器 - Nginx 代理防御增强版

## 概述

增强后的完整性检查器专门设计用来防御通过 nginx 反向代理进行的文本替换攻击。它提供了多层防御机制，能够实时检测和响应各种类型的篡改行为。

## 主要功能

### 1. 多层防御机制

#### DOM 层监控

- **实时 DOM 变化检测**: 使用 MutationObserver 监控页面 DOM 变化
- **文本内容保护**: 保护关键文本如"Happy-clo"、"Synapse"、"Happy"等
- **自动恢复**: 检测到篡改后自动恢复原始内容

#### 网络层监控

- **请求拦截**: 拦截所有 fetch 和 XMLHttpRequest 请求
- **响应完整性检查**: 验证网络响应的完整性
- **代理头检测**: 检测常见的代理服务器头信息

#### 内容层验证

- **基准内容捕获**: 在页面加载时捕获基准内容
- **校验和验证**: 使用 SHA256 计算内容校验和
- **签名验证**: 使用 HMAC-SHA256 进行内容签名

### 2. Nginx 代理攻击防御

#### 检测机制

- **代理特征识别**: 检测 nginx 相关的 HTML 注释和特征
- **内容长度监控**: 监控页面内容长度异常变化
- **响应时间分析**: 检测异常的响应时间（代理可能增加延迟）

#### 防御策略

- **紧急恢复模式**: 检测到代理篡改时立即恢复原始内容
- **增强监控**: 检测到代理时自动启用更频繁的检查
- **警告系统**: 显示专门的代理篡改警告

### 3. 实时监控

#### 检查频率

- **标准模式**: 每 2 秒检查一次页面完整性
- **增强模式**: 每 500ms 检查一次（检测到代理时）
- **网络监控**: 每 1 秒检查一次网络完整性

#### 监控范围

- 关键页面元素
- 受保护的文本内容
- 网络请求和响应
- 页面内容长度变化

## 配置选项

### 环境变量

```bash
# 完整性检查密钥
VITE_INTEGRITY_KEY=your-integrity-key

# 网络完整性密钥
VITE_NETWORK_KEY=network-integrity-key
```

### 关键参数

```typescript
private readonly MAX_ATTEMPTS = 3;           // 最大尝试次数
private readonly NETWORK_CHECK_INTERVAL = 1000; // 网络检查间隔(ms)
```

## 使用方法

### 基本使用

```typescript
import { integrityChecker } from "./integrityCheck";

// 设置元素完整性
integrityChecker.setIntegrity("element-id", element.innerHTML);

// 验证元素完整性
const isValid = integrityChecker.verifyIntegrity("element-id", currentContent);
```

### 自动初始化

完整性检查器会在页面加载时自动初始化，无需手动启动。

## 防御能力

### 1. 对抗 nginx sub_filter

- 检测通过`sub_filter`指令进行的文本替换
- 识别 nginx 相关的 HTML 注释和特征
- 自动恢复被替换的内容

### 2. 对抗代理注入

- 检测代理服务器注入的额外内容
- 监控内容长度异常变化
- 识别代理相关的 HTTP 头

### 3. 对抗实时篡改

- 实时监控 DOM 变化
- 立即响应篡改行为
- 自动恢复原始内容

## 事件处理

### 篡改事件类型

- `dom`: DOM 层面的篡改
- `network`: 网络层面的篡改
- `proxy`: 代理服务器篡改
- `injection`: 注入攻击

### 检测方法

- `mutation-observer`: DOM 变化观察器
- `network-analysis`: 网络分析
- `content-verification`: 内容验证
- `proxy-detection`: 代理检测

## 警告系统

### 1. 标准警告

- 显示篡改检测信息
- 倒计时自动关闭
- 触发水印显示

### 2. 代理篡改警告

- 专门的代理篡改警告
- 紧急恢复模式激活
- 增强的视觉提示

### 3. 严重警告

- 持续篡改行为警告
- 系统防御机制激活
- 全屏遮罩层

## 性能考虑

### 优化策略

- 使用防抖机制避免频繁检查
- 智能检查间隔调整
- 内存使用优化

### 资源消耗

- CPU 使用率: 低（<1%）
- 内存使用: 约 2-5MB
- 网络开销: 最小化

## 兼容性

### 浏览器支持

- Chrome 60+
- Firefox 55+
- Safari 12+
- Edge 79+

### 技术要求

- ES6+ 支持
- MutationObserver API
- CryptoJS 库

## 故障排除

### 常见问题

1. **误报**: 调整检查间隔或阈值
2. **性能问题**: 减少检查频率
3. **兼容性问题**: 检查浏览器支持

### 调试模式

```typescript
// 启用调试日志
console.log("Integrity Checker Debug Mode");
```

## 更新日志

### v2.0.0 - Nginx 代理防御增强

- 新增网络层监控
- 增强代理检测能力
- 改进恢复机制
- 优化性能表现

### v1.0.0 - 基础版本

- DOM 监控
- 文本保护
- 基本恢复功能
