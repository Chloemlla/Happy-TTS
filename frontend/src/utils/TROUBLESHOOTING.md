# 完整性检查器故障排除指南

## 当前问题解决方案

### 问题：控制台出现大量错误

如果你在控制台看到大量错误（超过 100 个），请按以下步骤操作：

#### 1. 立即停止错误输出

在浏览器控制台中运行：

```javascript
// 重置完整性检查器
window.integrityChecker?.resetErrors();

// 或者重新初始化
window.integrityChecker?.reinitialize();
```

#### 2. 启用调试模式

```javascript
// 启用调试模式查看详细信息
window.integrityChecker?.enableDebugMode();

// 查看当前状态
console.log(window.integrityChecker?.getDebugInfo());
```

#### 3. 检查错误状态

```javascript
// 查看错误统计
console.log(window.integrityChecker?.getErrorStatus());
```

### 问题：Uncaught 错误和误报

如果看到 "Uncaught" 错误或误报检测：

#### 解决方案：

```javascript
// 方法1：暂停检查
window.integrityChecker?.pause();

// 方法2：完全禁用（推荐）
window.integrityChecker?.disable();

// 方法3：重新初始化（等待页面稳定后）
setTimeout(() => {
  window.integrityChecker?.reinitialize();
}, 3000);
```

### 问题：基准内容长度为 0

如果看到"基准=0"的错误：

#### 解决方案：

```javascript
// 手动重新捕获基准内容
window.integrityChecker?.captureBaseline();

// 等待页面完全加载后重新初始化
setTimeout(() => {
  window.integrityChecker?.reinitialize();
}, 3000);
```

### 问题：误报检测

如果完整性检查器误报篡改：

#### 解决方案：

```javascript
// 暂停完整性检查
window.integrityChecker?.pause();

// 调整检测策略（自动减少检查频率）
// 或者手动恢复
window.integrityChecker?.resume();
```

## 快速修复脚本

将以下代码复制到浏览器控制台执行：

```javascript
// 快速修复脚本
(function () {
  const checker = window.integrityChecker;
  if (!checker) {
    console.log("完整性检查器未找到");
    return;
  }

  // 1. 重置所有错误
  checker.resetErrors();

  // 2. 完全禁用检查
  checker.disable();

  // 3. 等待页面稳定
  setTimeout(() => {
    // 4. 重新初始化
    checker.reinitialize();

    // 5. 恢复检查
    setTimeout(() => {
      checker.resume();
      console.log("✅ 完整性检查器已修复");
    }, 2000);
  }, 1000);
})();
```

## 紧急禁用脚本

如果问题持续存在，使用以下脚本完全禁用：

```javascript
// 紧急禁用脚本
(function () {
  const checker = window.integrityChecker;
  if (checker) {
    checker.disable();
    console.log("🚫 完整性检查器已完全禁用");
  }

  // 清理可能的错误输出
  console.clear();
  console.log("✅ 控制台已清理，完整性检查器已禁用");
})();
```

## 环境变量配置

在 `.env` 文件中添加：

```bash
# 启用调试模式
VITE_DEBUG_MODE=true

# 完整性检查密钥
VITE_INTEGRITY_KEY=your-secret-key

# 网络完整性密钥
VITE_NETWORK_KEY=your-network-key
```

## 常见问题

### Q: 为什么会出现基准长度为 0 的错误？

A: 这通常是因为页面还没有完全加载就开始了检查。完整性检查器现在会自动等待页面完全加载。

### Q: 如何减少误报？

A: 系统会自动检测误报并调整策略。你也可以手动暂停检查或增加检查间隔。

### Q: 错误数量过多怎么办？

A: 系统现在会自动限制错误输出，超过 10 个错误后会暂停输出，避免控制台被刷屏。

### Q: 如何完全禁用完整性检查？

A: 在控制台运行：

```javascript
window.integrityChecker?.disable();
```

### Q: 如何检查完整性检查器状态？

A: 在控制台运行：

```javascript
console.log(window.integrityChecker?.getDebugInfo());
console.log(window.integrityChecker?.isDisabled());
```

## 联系支持

如果问题仍然存在，请提供以下信息：

1. 浏览器版本
2. 错误截图
3. 控制台日志
4. 页面 URL
