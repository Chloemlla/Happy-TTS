---
title: EnvManager集成Turnstile配置管理
date: 2025-08-27
slug: envmanager-turnstile-integration
tags: [envmanager, turnstile, config, admin, frontend, blog]
---

# EnvManager集成Turnstile配置管理

## 概述

为了提供统一的配置管理界面，我们在EnvManager中集成了Turnstile配置管理功能。现在管理员可以通过EnvManager界面直接管理Turnstile的Site Key和Secret Key，无需手动修改数据库或环境变量。

## 功能特性

### 1. 统一的配置管理界面

- **集中管理**：在EnvManager中统一管理所有系统配置
- **可视化操作**：直观的界面操作，无需命令行或数据库操作
- **实时反馈**：操作结果实时显示，状态一目了然

### 2. Turnstile配置管理

- **Site Key管理**：配置前端显示的Turnstile Site Key
- **Secret Key管理**：配置后端验证的Turnstile Secret Key
- **状态显示**：实时显示Turnstile启用状态
- **安全保护**：敏感信息脱敏显示，不回显明文

### 3. 操作功能

- **获取配置**：从数据库获取当前Turnstile配置
- **更新配置**：动态更新Site Key和Secret Key
- **删除配置**：删除指定的配置项
- **刷新状态**：实时刷新配置状态

## 实现细节

### 1. 状态管理

添加Turnstile配置相关的状态：

```typescript
// Turnstile Config Setting
const [turnstileConfig, setTurnstileConfig] =
  useState<TurnstileConfigSetting | null>(null);
const [turnstileConfigLoading, setTurnstileConfigLoading] = useState(false);
const [turnstileConfigSaving, setTurnstileConfigSaving] = useState(false);
const [turnstileConfigDeleting, setTurnstileConfigDeleting] = useState(false);
const [turnstileSiteKeyInput, setTurnstileSiteKeyInput] = useState("");
const [turnstileSecretKeyInput, setTurnstileSecretKeyInput] = useState("");
```

### 2. 配置获取

实现从API获取Turnstile配置：

```typescript
const fetchTurnstileConfig = useCallback(async () => {
  setTurnstileConfigLoading(true);
  try {
    const res = await fetch(TURNSTILE_CONFIG_API, {
      headers: { ...getAuthHeaders() },
    });
    const data = await res.json();
    if (!res.ok) {
      setNotification({
        message: data.error || "获取Turnstile配置失败",
        type: "error",
      });
      setTurnstileConfigLoading(false);
      return;
    }
    setTurnstileConfig({
      enabled: data.enabled || false,
      siteKey: data.siteKey || null,
      secretKey: data.secretKey || null,
      updatedAt: data.updatedAt,
    });
  } catch (e) {
    setNotification({
      message:
        "获取Turnstile配置失败：" +
        (e instanceof Error ? e.message : "未知错误"),
      type: "error",
    });
  } finally {
    setTurnstileConfigLoading(false);
  }
}, [setNotification]);
```

### 3. 配置保存

实现配置保存功能：

```typescript
const handleSaveTurnstileConfig = useCallback(
  async (key: "TURNSTILE_SECRET_KEY" | "TURNSTILE_SITE_KEY") => {
    if (turnstileConfigSaving) return;
    const value =
      key === "TURNSTILE_SECRET_KEY"
        ? turnstileSecretKeyInput.trim()
        : turnstileSiteKeyInput.trim();
    if (!value) {
      setNotification({
        message: `请填写${key === "TURNSTILE_SECRET_KEY" ? "Secret Key" : "Site Key"}`,
        type: "error",
      });
      return;
    }
    setTurnstileConfigSaving(true);
    try {
      const res = await fetch(TURNSTILE_CONFIG_API, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({ key, value }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setNotification({ message: data.error || "保存失败", type: "error" });
        return;
      }
      setNotification({ message: "保存成功", type: "success" });
      if (key === "TURNSTILE_SECRET_KEY") {
        setTurnstileSecretKeyInput("");
      } else {
        setTurnstileSiteKeyInput("");
      }
      await fetchTurnstileConfig();
    } catch (e) {
      setNotification({
        message: "保存失败：" + (e instanceof Error ? e.message : "未知错误"),
        type: "error",
      });
    } finally {
      setTurnstileConfigSaving(false);
    }
  },
  [
    turnstileConfigSaving,
    turnstileSecretKeyInput,
    turnstileSiteKeyInput,
    fetchTurnstileConfig,
    setNotification,
  ]
);
```

### 4. 配置删除

实现配置删除功能：

```typescript
const handleDeleteTurnstileConfig = useCallback(
  async (key: "TURNSTILE_SECRET_KEY" | "TURNSTILE_SITE_KEY") => {
    if (turnstileConfigDeleting) return;
    setTurnstileConfigDeleting(true);
    try {
      const res = await fetch(`${TURNSTILE_CONFIG_API}/${key}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setNotification({ message: data.error || "删除失败", type: "error" });
        return;
      }
      setNotification({ message: "删除成功", type: "success" });
      await fetchTurnstileConfig();
    } catch (e) {
      setNotification({
        message: "删除失败：" + (e instanceof Error ? e.message : "未知错误"),
        type: "error",
      });
    } finally {
      setTurnstileConfigDeleting(false);
    }
  },
  [turnstileConfigDeleting, fetchTurnstileConfig, setNotification]
);
```

## 用户界面

### 1. 配置界面布局

Turnstile配置界面分为两个主要部分：

#### Site Key 配置区域

```typescript
{/* Site Key 配置 */}
<div className="mb-6">
  <h4 className="text-md font-semibold text-gray-700 mb-3">Site Key 配置</h4>
  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
    <div className="md:col-span-2">
      <label className="block text-sm font-medium text-gray-700 mb-1">Site Key</label>
      <input
        value={turnstileSiteKeyInput}
        onChange={(e) => setTurnstileSiteKeyInput(e.target.value)}
        placeholder="请输入 Turnstile Site Key（例如：0x4AAAAAAABkMYinukE5NHzg）"
        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400 text-sm sm:text-base"
      />
    </div>
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">当前配置（脱敏）</label>
      <div className="px-3 py-2 border border-gray-200 rounded-lg bg-gray-50 text-sm text-gray-700 min-h-[40px] flex items-center">
        {turnstileConfigLoading ? '加载中...' : (turnstileConfig?.siteKey || '未设置')}
      </div>
    </div>
  </div>

  <div className="flex items-center justify-end gap-3">
    <m.button onClick={() => handleDeleteTurnstileConfig('TURNSTILE_SITE_KEY')}>
      删除
    </m.button>
    <m.button onClick={() => handleSaveTurnstileConfig('TURNSTILE_SITE_KEY')}>
      保存/更新
    </m.button>
  </div>
</div>
```

#### Secret Key 配置区域

```typescript
{/* Secret Key 配置 */}
<div className="mb-4">
  <h4 className="text-md font-semibold text-gray-700 mb-3">Secret Key 配置</h4>
  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
    <div className="md:col-span-2">
      <label className="block text-sm font-medium text-gray-700 mb-1">Secret Key</label>
      <input
        value={turnstileSecretKeyInput}
        onChange={(e) => setTurnstileSecretKeyInput(e.target.value)}
        placeholder="请输入 Turnstile Secret Key（仅用于后端验证，不回显明文）"
        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400 text-sm sm:text-base"
      />
    </div>
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">当前配置（脱敏）</label>
      <div className="px-3 py-2 border border-gray-200 rounded-lg bg-gray-50 text-sm text-gray-700 min-h-[40px] flex items-center">
        {turnstileConfigLoading ? '加载中...' : (turnstileConfig?.secretKey || '未设置')}
      </div>
    </div>
  </div>

  <div className="flex items-center justify-end gap-3">
    <m.button onClick={() => handleDeleteTurnstileConfig('TURNSTILE_SECRET_KEY')}>
      删除
    </m.button>
    <m.button onClick={() => handleSaveTurnstileConfig('TURNSTILE_SECRET_KEY')}>
      保存/更新
    </m.button>
  </div>
</div>
```

### 2. 状态显示

实时显示Turnstile启用状态：

```typescript
{/* 状态信息 */}
<div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
  <div className="flex items-center gap-2 text-sm text-blue-700">
    <div className={`w-2 h-2 rounded-full ${turnstileConfig?.enabled ? 'bg-green-500' : 'bg-red-500'}`}></div>
    <span className="font-medium">
      Turnstile 状态：{turnstileConfig?.enabled ? '已启用' : '未启用'}
    </span>
  </div>
  <div className="mt-2 text-xs text-blue-600">
    说明：Turnstile 用于人机验证，支持动态配置。Site Key 用于前端显示，Secret Key 用于后端验证。
  </div>
</div>
```

## API接口

### 1. 获取配置

```http
GET /api/turnstile/config
Authorization: Bearer <admin_token>
```

**响应示例：**

```json
{
  "enabled": true,
  "siteKey": "0x4AAAAAAABkMYinukE5NHzg",
  "secretKey": "0x4AAAAAAABkMYinukE5NHzg_secret_key"
}
```

### 2. 更新配置

```http
POST /api/turnstile/config
Authorization: Bearer <admin_token>
Content-Type: application/json

{
  "key": "TURNSTILE_SITE_KEY",
  "value": "0x4AAAAAAABkMYinukE5NHzg"
}
```

**响应示例：**

```json
{
  "success": true,
  "message": "配置更新成功"
}
```

### 3. 删除配置

```http
DELETE /api/turnstile/config/TURNSTILE_SITE_KEY
Authorization: Bearer <admin_token>
```

**响应示例：**

```json
{
  "success": true,
  "message": "配置删除成功"
}
```

## 使用流程

### 1. 配置Turnstile

1. **访问EnvManager**：管理员登录后访问环境变量管理页面
2. **找到Turnstile配置**：在页面中找到"Turnstile 配置设置"区域
3. **配置Site Key**：
   - 在Site Key输入框中输入Turnstile Site Key
   - 点击"保存/更新"按钮
4. **配置Secret Key**：
   - 在Secret Key输入框中输入Turnstile Secret Key
   - 点击"保存/更新"按钮
5. **验证状态**：查看状态信息确认Turnstile已启用

### 2. 管理配置

- **刷新配置**：点击"刷新"按钮获取最新配置状态
- **删除配置**：点击"删除"按钮删除指定的配置项
- **查看状态**：通过状态指示器查看Turnstile是否启用

## 安全考虑

### 1. 权限控制

- 只有管理员可以访问EnvManager
- 所有配置操作都需要管理员权限验证

### 2. 数据保护

- 敏感信息（Secret Key）脱敏显示
- 输入框不回显明文内容
- 传输过程中使用HTTPS加密

### 3. 输入验证

- 前端输入验证防止空值提交
- 后端API验证确保数据完整性

## 错误处理

### 1. 网络错误

```typescript
catch (e) {
  setNotification({
    message: '获取Turnstile配置失败：' + (e instanceof Error ? e.message : '未知错误'),
    type: 'error'
  });
}
```

### 2. API错误

```typescript
if (!res.ok) {
  setNotification({
    message: data.error || "获取Turnstile配置失败",
    type: "error",
  });
  return;
}
```

### 3. 用户输入错误

```typescript
if (!value) {
  setNotification({
    message: `请填写${key === "TURNSTILE_SECRET_KEY" ? "Secret Key" : "Site Key"}`,
    type: "error",
  });
  return;
}
```

## 测试用例

### 1. 配置获取测试

```typescript
// 测试获取Turnstile配置
const response = await fetch("/api/turnstile/config", {
  headers: { Authorization: `Bearer ${adminToken}` },
});
const data = await response.json();

expect(response.ok).toBe(true);
expect(data.enabled).toBeDefined();
expect(data.siteKey).toBeDefined();
```

### 2. 配置更新测试

```typescript
// 测试更新Site Key
const updateResponse = await fetch("/api/turnstile/config", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${adminToken}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    key: "TURNSTILE_SITE_KEY",
    value: "test_site_key",
  }),
});

expect(updateResponse.ok).toBe(true);
```

### 3. 配置删除测试

```typescript
// 测试删除配置
const deleteResponse = await fetch("/api/turnstile/config/TURNSTILE_SITE_KEY", {
  method: "DELETE",
  headers: { Authorization: `Bearer ${adminToken}` },
});

expect(deleteResponse.ok).toBe(true);
```

## 总结

通过在EnvManager中集成Turnstile配置管理，我们实现了：

1. **统一管理**：所有系统配置在一个界面中管理
2. **可视化操作**：直观的界面操作，降低配置复杂度
3. **实时反馈**：操作结果实时显示，状态一目了然
4. **安全保护**：敏感信息脱敏显示，确保数据安全
5. **动态配置**：支持动态更新，无需重启服务

这个集成使得Turnstile配置管理更加便捷和安全，管理员可以通过图形界面轻松管理Turnstile配置，提高了系统的可维护性和用户体验。
