---
title: 弹窗自动滚动系统实现
description: 实现统一的弹窗自动滚动和位置恢复系统，提供流畅的用户体验
date: 2025-09-27
author: Synapse Team
tags: [前端, 用户体验, React, 弹窗管理, 滚动控制, 状态管理]
---

# 弹窗自动滚动系统实现

## 概述

为了实现更好的用户体验，我们设计并实现了一个统一的弹窗自动滚动系统。该系统在弹窗打开时自动滚动到弹窗位置，关闭时恢复到原始位置，提供流畅的视觉体验和智能的位置管理。

## 系统设计

### 核心概念

1. **自动滚动**: 弹窗打开后自动滚动到视窗中心
2. **位置恢复**: 弹窗关闭时恢复到原始滚动位置
3. **智能存储**: 使用 sessionStorage 存储滚动位置和时间戳
4. **统一管理**: 所有弹窗使用相同的滚动逻辑
5. **自定义配置**: 支持自定义存储键、值生成和生命周期回调

### 工作流程

```
用户点击按钮 → 记录当前位置 → 打开弹窗 → 自动滚动到弹窗 → 用户操作
                                    ↓
用户关闭弹窗 → 检查存储位置 → 恢复原始位置 → 清理存储 → 完成
```

## 技术实现

### 1. 核心函数实现

#### 公共弹窗打开函数

```typescript
// frontend/src/components/EnvManager.tsx
export const handleSourceClick = (
  source: string,
  setSelectedSource: (source: string) => void,
  setShowSourceModal: (show: boolean) => void,
  options?: {
    storageKey?: string;
    getStorageValue?: () => string;
    onBeforeOpen?: () => void;
    onAfterOpen?: () => void;
  }
) => {
  // 执行打开前回调
  options?.onBeforeOpen?.();

  // 记录当前滚动位置
  const currentScrollY = window.scrollY;
  const storageKey = options?.storageKey || "envManagerScrollPosition";
  const storageValue = options?.getStorageValue
    ? options.getStorageValue()
    : currentScrollY.toString();

  // 存储到 sessionStorage
  sessionStorage.setItem(storageKey, storageValue);

  // 设置弹窗状态
  setSelectedSource(source);
  setShowSourceModal(true);

  // 延迟执行自动滚动，确保弹窗已渲染
  setTimeout(() => {
    const modal = document.querySelector("[data-source-modal]");
    if (modal) {
      modal.scrollIntoView({
        behavior: "smooth",
        block: "center",
        inline: "center",
      });
    }
    // 执行打开后回调
    options?.onAfterOpen?.();
  }, 100);
};
```

#### 公共弹窗关闭函数

```typescript
// frontend/src/components/EnvManager.tsx
export const handleSourceModalClose = (
  setShowSourceModal: (show: boolean) => void,
  options?: {
    storageKey?: string;
    getRestoreValue?: () => number;
    onBeforeClose?: () => void;
    onAfterClose?: () => void;
    closeDelay?: number;
  }
) => {
  // 执行关闭前回调
  options?.onBeforeClose?.();

  // 关闭弹窗
  setShowSourceModal(false);

  // 延迟执行位置恢复
  setTimeout(() => {
    const storageKey = options?.storageKey || "envManagerScrollPosition";
    const savedScrollY = sessionStorage.getItem(storageKey);

    if (savedScrollY) {
      const scrollY = options?.getRestoreValue
        ? options.getRestoreValue()
        : parseInt(savedScrollY, 10);
      window.scrollTo({
        top: scrollY,
        behavior: "smooth",
      });
      // 清理存储
      sessionStorage.removeItem(storageKey);
    }

    // 执行关闭后回调
    options?.onAfterClose?.();
  }, options?.closeDelay || 300);
};
```

### 2. 组件集成实现

#### 环境管理器组件集成

```typescript
// frontend/src/components/EnvManager.tsx
const EnvManager: React.FC = () => {
  const [selectedSource, setSelectedSource] = useState<string | null>(null);
  const [showSourceModal, setShowSourceModal] = useState(false);

  // 内部包装函数，适配组件状态
  const handleSourceClickWrapper = useCallback((source: string) => {
    handleSourceClick(source, setSelectedSource, setShowSourceModal, {
      storageKey: "envManagerScrollPosition",
      getStorageValue: () =>
        JSON.stringify({
          scrollY: window.scrollY,
          timestamp: Date.now(),
          source: source,
        }),
      onBeforeOpen: () => {
        console.log("即将打开环境变量详情弹窗");
      },
      onAfterOpen: () => {
        console.log("环境变量详情弹窗已打开");
      },
    });
  }, []);

  const handleSourceModalCloseWrapper = useCallback(() => {
    handleSourceModalClose(setShowSourceModal, {
      storageKey: "envManagerScrollPosition",
      getRestoreValue: () => {
        const saved = sessionStorage.getItem("envManagerScrollPosition");
        if (saved) {
          try {
            const data = JSON.parse(saved);
            if (Date.now() - data.timestamp < 5000) {
              return data.scrollY;
            }
          } catch (e) {
            const scrollY = parseInt(saved, 10);
            if (!isNaN(scrollY)) return scrollY;
          }
        }
        return 0;
      },
      onBeforeClose: () => {
        console.log("即将关闭环境变量详情弹窗");
      },
      onAfterClose: () => {
        console.log("环境变量详情弹窗已关闭");
      },
    });
  }, []);

  return (
    <div>
      {/* 弹窗内容 */}
      {showSourceModal && selectedSource && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
          <div
            className="bg-white/90 backdrop-blur rounded-2xl max-w-4xl w-[95vw] p-4 sm:p-6 border border-white/20 shadow-xl"
            data-source-modal="env-detail"
          >
            <div className="flex items-center justify-between mb-3">
              <div className="font-semibold text-gray-900">环境变量详情</div>
              <button
                onClick={handleSourceModalCloseWrapper}
                className="px-3 py-1 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-800 text-sm font-medium flex items-center gap-2"
              >
                <FaTimes className="w-4 h-4" /> 关闭
              </button>
            </div>
            {/* 弹窗内容 */}
          </div>
        </div>
      )}
    </div>
  );
};
```

#### 人机验证日志组件集成

```typescript
// frontend/src/components/SmartHumanCheckTraces.tsx
import { handleSourceClick, handleSourceModalClose } from "./EnvManager";

const SmartHumanCheckTraces: React.FC = () => {
  const [selected, setSelected] = useState<any>(null);
  const [batchView, setBatchView] = useState<any>(null);

  // 打开详情弹窗
  const openDetail = useCallback(async (id: string) => {
    try {
      const response = await fetch(
        `${getApiBaseUrl()}/api/human-check-traces/${id}`,
        {
          headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
        }
      );
      const data = await response.json();

      if (data.success) {
        handleSourceClick(
          "trace-detail",
          (item: any) => setSelected(item),
          (show: boolean) => setSelected(show ? data.item : null),
          {
            storageKey: "humanCheckTracesScrollPosition",
            getStorageValue: () =>
              JSON.stringify({
                scrollY: window.scrollY,
                timestamp: Date.now(),
                traceId: id,
              }),
            onBeforeOpen: () => {
              console.log("即将打开人机验证日志详情弹窗");
            },
            onAfterOpen: () => {
              console.log("人机验证日志详情弹窗已打开");
            },
          }
        );
      }
    } catch (e: any) {
      setNotification({ type: "error", message: e?.message || "获取详情失败" });
    }
  }, []);

  // 关闭详情弹窗
  const closeDetailModal = useCallback(() => {
    handleSourceModalClose(
      (show: boolean) => setSelected(show ? selected : null),
      {
        storageKey: "humanCheckTracesScrollPosition",
        getRestoreValue: () => {
          const saved = sessionStorage.getItem(
            "humanCheckTracesScrollPosition"
          );
          if (saved) {
            try {
              const data = JSON.parse(saved);
              if (Date.now() - data.timestamp < 5000) {
                return data.scrollY;
              }
            } catch (e) {
              const scrollY = parseInt(saved, 10);
              if (!isNaN(scrollY)) return scrollY;
            }
          }
          return 0;
        },
        onBeforeClose: () => {
          console.log("即将关闭人机验证日志详情弹窗");
        },
        onAfterClose: () => {
          console.log("人机验证日志详情弹窗已关闭");
        },
      }
    );
  }, [selected]);

  return (
    <div>
      {/* 详情弹窗 */}
      {selected && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
          <div
            className="bg-white/90 backdrop-blur rounded-2xl max-w-3xl w-[95vw] p-4 sm:p-6 border border-white/20 shadow-xl"
            data-source-modal="trace-detail"
          >
            <div className="flex items-center justify-between mb-3">
              <div className="font-semibold text-gray-900">日志详情</div>
              <button
                onClick={closeDetailModal}
                className="px-3 py-1 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-800 text-sm font-medium flex items-center gap-2"
              >
                <FaTimes className="w-4 h-4" /> 关闭
              </button>
            </div>
            {/* 弹窗内容 */}
          </div>
        </div>
      )}
    </div>
  );
};
```

#### Webhook 事件管理器组件集成

```typescript
// frontend/src/components/WebhookEventsManager.tsx
import { handleSourceClick, handleSourceModalClose } from "./EnvManager";

const WebhookEventsManager: React.FC = () => {
  const [selected, setSelected] = useState<WebhookEventItem | null>(null);
  const [editing, setEditing] = useState<WebhookEventItem | null>(null);
  const [creating, setCreating] = useState<boolean>(false);

  // 打开详情弹窗
  const openDetail = useCallback((item: WebhookEventItem) => {
    handleSourceClick(
      "webhook-event-detail",
      (source: string) =>
        setSelected(source === "webhook-event-detail" ? item : null),
      (show: boolean) => setSelected(show ? item : null),
      {
        storageKey: "webhookEventsScrollPosition",
        getStorageValue: () =>
          JSON.stringify({
            scrollY: window.scrollY,
            timestamp: Date.now(),
            eventId: item._id,
          }),
        onBeforeOpen: () => {
          console.log("即将打开 Webhook 事件详情弹窗");
        },
        onAfterOpen: () => {
          console.log("Webhook 事件详情弹窗已打开");
        },
      }
    );
  }, []);

  // 打开编辑弹窗
  const openEdit = useCallback((item: WebhookEventItem) => {
    handleSourceClick(
      "webhook-event-edit",
      (source: string) =>
        setEditing(source === "webhook-event-edit" ? item : null),
      (show: boolean) => setEditing(show ? item : null),
      {
        storageKey: "webhookEventsEditScrollPosition",
        getStorageValue: () =>
          JSON.stringify({
            scrollY: window.scrollY,
            timestamp: Date.now(),
            eventId: item._id,
          }),
        onBeforeOpen: () => {
          console.log("即将打开 Webhook 事件编辑弹窗");
        },
        onAfterOpen: () => {
          console.log("Webhook 事件编辑弹窗已打开");
        },
      }
    );
  }, []);

  // 关闭详情弹窗
  const closeDetailModal = useCallback(() => {
    handleSourceModalClose(
      (show: boolean) => setSelected(show ? selected : null),
      {
        storageKey: "webhookEventsScrollPosition",
        getRestoreValue: () => {
          const saved = sessionStorage.getItem("webhookEventsScrollPosition");
          if (saved) {
            try {
              const data = JSON.parse(saved);
              if (Date.now() - data.timestamp < 5000) {
                return data.scrollY;
              }
            } catch (e) {
              const scrollY = parseInt(saved, 10);
              if (!isNaN(scrollY)) return scrollY;
            }
          }
          return 0;
        },
        onBeforeClose: () => {
          console.log("即将关闭 Webhook 事件详情弹窗");
        },
        onAfterClose: () => {
          console.log("Webhook 事件详情弹窗已关闭");
        },
      }
    );
  }, [selected]);

  return (
    <div>
      {/* 详情弹窗 */}
      {selected && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
          <div
            className="bg-white/90 backdrop-blur rounded-2xl max-w-3xl w-[95vw] p-4 sm:p-6 border border-white/20 shadow-xl"
            data-source-modal="webhook-event-detail"
          >
            <div className="flex items-center justify-between mb-3">
              <div className="font-semibold text-gray-900">事件详情</div>
              <button
                onClick={closeDetailModal}
                className="px-3 py-1 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-800 text-sm font-medium flex items-center gap-2"
              >
                <FaTimes className="w-4 h-4" /> 关闭
              </button>
            </div>
            {/* 弹窗内容 */}
          </div>
        </div>
      )}
    </div>
  );
};
```

### 3. 弹窗标识系统

#### data-source-modal 属性

每个弹窗都需要添加 `data-source-modal` 属性，用于自动滚动定位：

```typescript
// 环境变量详情弹窗
<div data-source-modal="env-detail">
  {/* 弹窗内容 */}
</div>

// 人机验证日志详情弹窗
<div data-source-modal="trace-detail">
  {/* 弹窗内容 */}
</div>

// Webhook事件详情弹窗
<div data-source-modal="webhook-event-detail">
  {/* 弹窗内容 */}
</div>

// Webhook事件编辑弹窗
<div data-source-modal="webhook-event-edit">
  {/* 弹窗内容 */}
</div>
```

## 配置选项详解

### 1. handleSourceClick 配置选项

```typescript
interface HandleSourceClickOptions {
  storageKey?: string; // 自定义存储键名
  getStorageValue?: () => string; // 自定义存储值生成函数
  onBeforeOpen?: () => void; // 弹窗打开前回调
  onAfterOpen?: () => void; // 弹窗打开后回调
}
```

#### 配置示例

```typescript
// 基础配置
handleSourceClick("my-modal", setSelected, setShowModal, {
  storageKey: "myModalScrollPosition",
  getStorageValue: () => window.scrollY.toString(),
  onBeforeOpen: () => console.log("即将打开弹窗"),
  onAfterOpen: () => console.log("弹窗已打开"),
});

// 高级配置 - 存储复杂数据
handleSourceClick("advanced-modal", setSelected, setShowModal, {
  storageKey: "advancedModalScrollPosition",
  getStorageValue: () =>
    JSON.stringify({
      scrollY: window.scrollY,
      timestamp: Date.now(),
      userId: getCurrentUserId(),
      modalType: "advanced",
    }),
  onBeforeOpen: () => {
    // 执行打开前逻辑
    trackModalOpen("advanced-modal");
  },
  onAfterOpen: () => {
    // 执行打开后逻辑
    focusFirstInput();
  },
});
```

### 2. handleSourceModalClose 配置选项

```typescript
interface HandleSourceModalCloseOptions {
  storageKey?: string; // 自定义存储键名
  getRestoreValue?: () => number; // 自定义位置恢复函数
  onBeforeClose?: () => void; // 弹窗关闭前回调
  onAfterClose?: () => void; // 弹窗关闭后回调
  closeDelay?: number; // 关闭延迟时间（毫秒）
}
```

#### 配置示例

```typescript
// 基础配置
handleSourceModalClose(setShowModal, {
  storageKey: "myModalScrollPosition",
  getRestoreValue: () =>
    parseInt(sessionStorage.getItem("myModalScrollPosition") || "0", 10),
  onBeforeClose: () => console.log("即将关闭弹窗"),
  onAfterClose: () => console.log("弹窗已关闭"),
  closeDelay: 300,
});

// 高级配置 - 智能位置恢复
handleSourceModalClose(setShowModal, {
  storageKey: "advancedModalScrollPosition",
  getRestoreValue: () => {
    const saved = sessionStorage.getItem("advancedModalScrollPosition");
    if (saved) {
      try {
        const data = JSON.parse(saved);
        // 检查时间戳，只有5秒内的位置才恢复
        if (Date.now() - data.timestamp < 5000) {
          return data.scrollY;
        }
      } catch (e) {
        // 降级处理
        const scrollY = parseInt(saved, 10);
        if (!isNaN(scrollY)) return scrollY;
      }
    }
    return 0;
  },
  onBeforeClose: () => {
    // 执行关闭前逻辑
    saveFormData();
  },
  onAfterClose: () => {
    // 执行关闭后逻辑
    refreshData();
  },
  closeDelay: 500,
});
```

## 使用指南

### 1. 基础使用

#### 步骤 1: 导入函数

```typescript
import { handleSourceClick, handleSourceModalClose } from "./EnvManager";
```

#### 步骤 2: 创建包装函数

```typescript
const openModal = useCallback((data: any) => {
  handleSourceClick("my-modal", setSelected, setShowModal, {
    storageKey: "myModalScrollPosition",
    getStorageValue: () =>
      JSON.stringify({
        scrollY: window.scrollY,
        timestamp: Date.now(),
        dataId: data.id,
      }),
  });
}, []);

const closeModal = useCallback(() => {
  handleSourceModalClose(setShowModal, {
    storageKey: "myModalScrollPosition",
    getRestoreValue: () => {
      const saved = sessionStorage.getItem("myModalScrollPosition");
      if (saved) {
        try {
          const data = JSON.parse(saved);
          if (Date.now() - data.timestamp < 5000) {
            return data.scrollY;
          }
        } catch (e) {
          return parseInt(saved, 10) || 0;
        }
      }
      return 0;
    },
  });
}, []);
```

#### 步骤 3: 添加弹窗标识

```typescript
{
  showModal && (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
      <div
        className="bg-white/90 backdrop-blur rounded-2xl max-w-3xl w-[95vw] p-4 sm:p-6 border border-white/20 shadow-xl"
        data-source-modal="my-modal"
      >
        <div className="flex items-center justify-between mb-3">
          <div className="font-semibold text-gray-900">弹窗标题</div>
          <button
            onClick={closeModal}
            className="px-3 py-1 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-800 text-sm font-medium flex items-center gap-2"
          >
            <FaTimes className="w-4 h-4" /> 关闭
          </button>
        </div>
        {/* 弹窗内容 */}
      </div>
    </div>
  );
}
```

#### 步骤 4: 绑定按钮事件

```typescript
<button
  onClick={() => openModal(item)}
  className="px-3 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-800 text-sm font-medium flex items-center gap-2"
>
  <FaEye className="w-4 h-4" /> 查看详情
</button>
```

### 2. 高级使用

#### 多弹窗管理

```typescript
const ModalManager: React.FC = () => {
  const [detailModal, setDetailModal] = useState<any>(null);
  const [editModal, setEditModal] = useState<any>(null);
  const [createModal, setCreateModal] = useState(false);

  // 详情弹窗
  const openDetail = useCallback((item: any) => {
    handleSourceClick(
      "detail-modal",
      setDetailModal,
      (show: boolean) => setDetailModal(show ? item : null),
      {
        storageKey: "detailModalScrollPosition",
        getStorageValue: () =>
          JSON.stringify({
            scrollY: window.scrollY,
            timestamp: Date.now(),
            itemId: item.id,
          }),
      }
    );
  }, []);

  // 编辑弹窗
  const openEdit = useCallback((item: any) => {
    handleSourceClick(
      "edit-modal",
      setEditModal,
      (show: boolean) => setEditModal(show ? item : null),
      {
        storageKey: "editModalScrollPosition",
        getStorageValue: () =>
          JSON.stringify({
            scrollY: window.scrollY,
            timestamp: Date.now(),
            itemId: item.id,
          }),
      }
    );
  }, []);

  // 创建弹窗
  const openCreate = useCallback(() => {
    handleSourceClick(
      "create-modal",
      () => setCreateModal(true),
      setCreateModal,
      {
        storageKey: "createModalScrollPosition",
        getStorageValue: () =>
          JSON.stringify({
            scrollY: window.scrollY,
            timestamp: Date.now(),
            action: "create",
          }),
      }
    );
  }, []);

  return (
    <div>
      {/* 详情弹窗 */}
      {detailModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
          <div
            className="bg-white/90 backdrop-blur rounded-2xl max-w-3xl w-[95vw] p-4 sm:p-6 border border-white/20 shadow-xl"
            data-source-modal="detail-modal"
          >
            {/* 详情弹窗内容 */}
          </div>
        </div>
      )}

      {/* 编辑弹窗 */}
      {editModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
          <div
            className="bg-white/90 backdrop-blur rounded-2xl max-w-2xl w-[95vw] p-4 sm:p-6 border border-white/20 shadow-xl"
            data-source-modal="edit-modal"
          >
            {/* 编辑弹窗内容 */}
          </div>
        </div>
      )}

      {/* 创建弹窗 */}
      {createModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
          <div
            className="bg-white/90 backdrop-blur rounded-2xl max-w-2xl w-[95vw] p-4 sm:p-6 border border-white/20 shadow-xl"
            data-source-modal="create-modal"
          >
            {/* 创建弹窗内容 */}
          </div>
        </div>
      )}
    </div>
  );
};
```

#### 自定义滚动行为

```typescript
const CustomScrollModal: React.FC = () => {
  const openModal = useCallback((item: any) => {
    handleSourceClick("custom-modal", setSelected, setShowModal, {
      storageKey: "customModalScrollPosition",
      getStorageValue: () =>
        JSON.stringify({
          scrollY: window.scrollY,
          timestamp: Date.now(),
          itemId: item.id,
          customData: {
            section: getCurrentSection(),
            tab: getActiveTab(),
          },
        }),
      onBeforeOpen: () => {
        // 自定义打开前逻辑
        pauseAnimations();
        hideTooltips();
      },
      onAfterOpen: () => {
        // 自定义打开后逻辑
        setTimeout(() => {
          const modal = document.querySelector(
            '[data-source-modal="custom-modal"]'
          );
          if (modal) {
            // 自定义滚动行为
            modal.scrollIntoView({
              behavior: "smooth",
              block: "start",
              inline: "nearest",
            });
          }
        }, 200);
      },
    });
  }, []);

  const closeModal = useCallback(() => {
    handleSourceModalClose(setShowModal, {
      storageKey: "customModalScrollPosition",
      getRestoreValue: () => {
        const saved = sessionStorage.getItem("customModalScrollPosition");
        if (saved) {
          try {
            const data = JSON.parse(saved);
            if (Date.now() - data.timestamp < 5000) {
              // 恢复自定义状态
              restoreSection(data.customData.section);
              restoreTab(data.customData.tab);
              return data.scrollY;
            }
          } catch (e) {
            return parseInt(saved, 10) || 0;
          }
        }
        return 0;
      },
      onBeforeClose: () => {
        // 自定义关闭前逻辑
        saveFormState();
      },
      onAfterClose: () => {
        // 自定义关闭后逻辑
        resumeAnimations();
        showTooltips();
      },
      closeDelay: 400,
    });
  }, []);
};
```

## 最佳实践

### 1. 命名规范

```typescript
// 存储键命名规范
const STORAGE_KEYS = {
  ENV_MANAGER: "envManagerScrollPosition",
  HUMAN_CHECK_TRACES: "humanCheckTracesScrollPosition",
  WEBHOOK_EVENTS: "webhookEventsScrollPosition",
  WEBHOOK_EDIT: "webhookEventsEditScrollPosition",
};

// 弹窗标识命名规范
const MODAL_IDS = {
  ENV_DETAIL: "env-detail",
  TRACE_DETAIL: "trace-detail",
  WEBHOOK_DETAIL: "webhook-event-detail",
  WEBHOOK_EDIT: "webhook-event-edit",
};
```

### 2. 错误处理

```typescript
const safeOpenModal = useCallback((item: any) => {
  try {
    handleSourceClick("safe-modal", setSelected, setShowModal, {
      storageKey: "safeModalScrollPosition",
      getStorageValue: () => {
        try {
          return JSON.stringify({
            scrollY: window.scrollY,
            timestamp: Date.now(),
            itemId: item.id,
          });
        } catch (e) {
          console.warn("Failed to generate storage value:", e);
          return window.scrollY.toString();
        }
      },
      onBeforeOpen: () => {
        try {
          // 安全执行打开前逻辑
          trackEvent("modal_open", { modalType: "safe-modal" });
        } catch (e) {
          console.warn("Failed to execute onBeforeOpen:", e);
        }
      },
    });
  } catch (e) {
    console.error("Failed to open modal:", e);
    // 降级处理
    setSelected(item);
    setShowModal(true);
  }
}, []);
```

### 3. 性能优化

```typescript
// 使用 useMemo 优化存储值生成
const getStorageValue = useMemo(() => {
  return () =>
    JSON.stringify({
      scrollY: window.scrollY,
      timestamp: Date.now(),
      itemId: selectedItem?.id,
    });
}, [selectedItem?.id]);

// 使用 useCallback 优化函数引用
const openModal = useCallback(
  (item: any) => {
    handleSourceClick("optimized-modal", setSelected, setShowModal, {
      storageKey: "optimizedModalScrollPosition",
      getStorageValue,
    });
  },
  [getStorageValue]
);
```

### 4. 调试和监控

```typescript
const DebugModal: React.FC = () => {
  const openModal = useCallback((item: any) => {
    const startTime = performance.now();

    handleSourceClick("debug-modal", setSelected, setShowModal, {
      storageKey: "debugModalScrollPosition",
      getStorageValue: () =>
        JSON.stringify({
          scrollY: window.scrollY,
          timestamp: Date.now(),
          itemId: item.id,
          debug: {
            userAgent: navigator.userAgent,
            viewport: {
              width: window.innerWidth,
              height: window.innerHeight,
            },
          },
        }),
      onBeforeOpen: () => {
        console.log("Modal opening started at:", new Date().toISOString());
      },
      onAfterOpen: () => {
        const endTime = performance.now();
        console.log(`Modal opened in ${endTime - startTime}ms`);
      },
    });
  }, []);

  return <div>{/* 弹窗内容 */}</div>;
};
```

## 故障排除

### 1. 常见问题

#### 问题 1: 弹窗不自动滚动

**原因**: 缺少 `data-source-modal` 属性

**解决方案**:

```typescript
// 错误示例
<div className="modal">
  {/* 弹窗内容 */}
</div>

// 正确示例
<div className="modal" data-source-modal="my-modal">
  {/* 弹窗内容 */}
</div>
```

#### 问题 2: 位置恢复不准确

**原因**: 时间戳检查过于严格

**解决方案**:

```typescript
getRestoreValue: () => {
  const saved = sessionStorage.getItem("myModalScrollPosition");
  if (saved) {
    try {
      const data = JSON.parse(saved);
      // 增加时间窗口到10秒
      if (Date.now() - data.timestamp < 10000) {
        return data.scrollY;
      }
    } catch (e) {
      return parseInt(saved, 10) || 0;
    }
  }
  return 0;
};
```

#### 问题 3: 存储值解析失败

**原因**: 存储值格式不正确

**解决方案**:

```typescript
getStorageValue: () => {
  try {
    return JSON.stringify({
      scrollY: window.scrollY,
      timestamp: Date.now(),
      itemId: item.id,
    });
  } catch (e) {
    // 降级到简单字符串
    return window.scrollY.toString();
  }
};
```

### 2. 调试工具

#### 存储状态检查

```typescript
const checkStorageState = () => {
  const keys = Object.keys(sessionStorage);
  const modalKeys = keys.filter((key) => key.includes("ScrollPosition"));

  console.log("Modal storage keys:", modalKeys);

  modalKeys.forEach((key) => {
    const value = sessionStorage.getItem(key);
    try {
      const parsed = JSON.parse(value);
      console.log(`${key}:`, parsed);
    } catch (e) {
      console.log(`${key}:`, value);
    }
  });
};

// 在控制台调用
checkStorageState();
```

#### 滚动位置监控

```typescript
const monitorScrollPosition = () => {
  let lastScrollY = window.scrollY;

  const handleScroll = () => {
    const currentScrollY = window.scrollY;
    if (Math.abs(currentScrollY - lastScrollY) > 100) {
      console.log(
        `Scroll position changed: ${lastScrollY} -> ${currentScrollY}`
      );
      lastScrollY = currentScrollY;
    }
  };

  window.addEventListener("scroll", handleScroll);

  return () => {
    window.removeEventListener("scroll", handleScroll);
  };
};
```

## 总结

弹窗自动滚动系统成功实现了以下目标：

1. **统一管理**: 所有弹窗使用相同的滚动逻辑，保持一致性
2. **智能恢复**: 自动恢复到原始位置，提供无缝体验
3. **高度可配置**: 支持自定义存储键、值生成和生命周期回调
4. **错误处理**: 完善的错误处理和降级机制
5. **性能优化**: 使用 sessionStorage 和智能时间戳检查
6. **易于集成**: 简单的 API 设计，易于在现有组件中集成

该系统为弹窗管理提供了更好的用户体验，同时保持了代码的可维护性和扩展性。通过统一的接口和灵活的配置选项，开发者可以轻松地在各种场景中应用自动滚动功能。
