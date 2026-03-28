---
title: 批量图片上传功能实现
date: 2025-08-27
slug: batch-image-upload
tags: [batch, upload, image, Synapse]
---

# 批量图片上传功能实现

## 功能概述

在 Synapse 项目中，我们实现了强大的批量图片上传功能，支持用户一次性选择多个图片文件进行上传，并提供了完整的进度跟踪和状态管理。

## 核心特性

### 1. 批量文件选择

- 支持通过文件选择器选择多个图片文件
- 支持拖拽多个文件到上传区域
- 自动验证文件格式和大小
- 智能区分单文件和批量上传

### 2. 一次性 Turnstile 验证

- 批量上传只需要完成一次人机验证
- 验证 token 在所有文件上传中共享
- 避免重复验证，提升用户体验

### 3. 实时进度跟踪

- 每个文件独立的状态管理
- 实时显示上传进度
- 详细的错误信息反馈
- 支持单个文件移除和重试

### 4. 智能队列管理

- 可视化的上传队列
- 支持清空整个队列
- 支持移除单个文件
- 自动隐藏空队列

## 技术实现

### 1. 状态管理

```typescript
// 批量上传相关状态
const [batchFiles, setBatchFiles] = useState<File[]>([]);
const [batchUploading, setBatchUploading] = useState(false);
const [batchProgress, setBatchProgress] = useState<{
  [key: string]: {
    status: "pending" | "uploading" | "success" | "error";
    progress?: number;
    error?: string;
  };
}>({});
const [showBatchList, setShowBatchList] = useState(false);
```

### 2. 文件选择处理

```typescript
const handleBatchFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
  const files = Array.from(e.target.files || []);

  // 验证文件
  const validFiles: File[] = [];
  const invalidFiles: string[] = [];

  files.forEach((file) => {
    if (!ALLOWED_TYPES.includes(file.type)) {
      invalidFiles.push(`${file.name} (格式不支持)`);
    } else if (file.size > MAX_IMAGE_SIZE) {
      invalidFiles.push(`${file.name} (超过5MB)`);
    } else {
      validFiles.push(file);
    }
  });

  // 添加到队列
  if (validFiles.length > 0) {
    setBatchFiles((prev) => [...prev, ...validFiles]);
    setShowBatchList(true);
  }
};
```

### 3. 批量上传处理

```typescript
const handleBatchUpload = async () => {
  // 检查 Turnstile 验证（只需要验证一次）
  if (!!turnstileConfig.siteKey && (!turnstileVerified || !turnstileToken)) {
    setNotification({ message: "请先完成人机验证", type: "warning" });
    return;
  }

  setBatchUploading(true);

  // 逐个上传文件
  for (let i = 0; i < batchFiles.length; i++) {
    const file = batchFiles[i];

    try {
      // 更新进度状态
      setBatchProgress((prev) => ({
        ...prev,
        [file.name]: { status: "uploading", progress: 0 },
      }));

      const formData = new FormData();
      formData.append("file", file);
      formData.append("source", "batch-imgupload");

      // 只在第一个文件时添加 Turnstile token
      if (!!turnstileConfig.siteKey && turnstileToken && i === 0) {
        formData.append("cfToken", turnstileToken);
      }

      const result = await uploadFile(formData);

      if (result?.data?.web2url) {
        // 上传成功处理
        setBatchProgress((prev) => ({
          ...prev,
          [file.name]: { status: "success", progress: 100 },
        }));

        // 保存到本地存储和数据库
        await saveImageData(file, result.data);
      } else {
        // 上传失败处理
        setBatchProgress((prev) => ({
          ...prev,
          [file.name]: { status: "error", error: result?.error || "上传失败" },
        }));
      }
    } catch (error) {
      // 异常处理
      setBatchProgress((prev) => ({
        ...prev,
        [file.name]: { status: "error", error: error?.message || "上传异常" },
      }));
    }

    // 添加延迟，避免请求过于频繁
    if (i < batchFiles.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }

  setBatchUploading(false);
};
```

### 4. 拖拽上传支持

```typescript
const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
  e.preventDefault();
  setDragActive(false);
  const files = e.dataTransfer.files;

  if (files.length > 0) {
    const imageFiles = Array.from(files).filter((file) =>
      file.type.startsWith("image/")
    );
    if (imageFiles.length > 0) {
      if (imageFiles.length === 1) {
        // 单文件上传
        handleFileChange({ target: { files: imageFiles } } as any);
      } else {
        // 多文件批量上传
        handleBatchFileChange({ target: { files: imageFiles } } as any);
      }
    }
  }
};
```

## 用户界面

### 1. 批量上传按钮

```tsx
<div className="relative">
  <input
    type="file"
    accept="image/*"
    multiple
    ref={batchFileInputRef}
    className="hidden"
    onChange={handleBatchFileChange}
    disabled={batchUploading}
  />
  <motion.button
    className="px-3 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition"
    onClick={() => batchFileInputRef.current?.click()}
    disabled={batchUploading}
  >
    <FaUpload className="w-4 h-4" />
    批量上传
  </motion.button>
</div>
```

### 2. 上传队列显示

```tsx
{
  showBatchList && batchFiles.length > 0 && (
    <motion.div className="mt-4 p-4 bg-gray-50 rounded-lg border">
      <div className="flex items-center justify-between mb-3">
        <h4>批量上传队列 ({batchFiles.length})</h4>
        <button onClick={clearBatchFiles}>清空队列</button>
      </div>

      <div className="max-h-40 overflow-y-auto space-y-2">
        {batchFiles.map((file) => {
          const progress = batchProgress[file.name];
          return (
            <div
              key={file.name}
              className="flex items-center justify-between p-2 bg-white rounded border"
            >
              <div className="flex-1">
                <div className="text-sm font-medium truncate">{file.name}</div>
                <div className="text-xs text-gray-500">
                  {formatFileSize(file.size)}
                </div>
                {progress && (
                  <div className="mt-1">
                    {progress.status === "pending" && <div>等待上传</div>}
                    {progress.status === "uploading" && <div>上传中...</div>}
                    {progress.status === "success" && <div>✓ 上传成功</div>}
                    {progress.status === "error" && (
                      <div>✗ {progress.error}</div>
                    )}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2">
                {/* 状态图标和操作按钮 */}
              </div>
            </div>
          );
        })}
      </div>

      <button
        onClick={handleBatchUpload}
        disabled={
          batchUploading || (!!turnstileConfig.siteKey && !turnstileVerified)
        }
      >
        {batchUploading
          ? "批量上传中..."
          : `开始批量上传 (${batchFiles.length} 个文件)`}
      </button>
    </motion.div>
  );
}
```

## 使用流程

### 1. 选择文件

- 点击"批量上传"按钮选择多个文件
- 或直接拖拽多个文件到上传区域
- 系统自动验证文件格式和大小

### 2. 人机验证

- 如果启用了 Turnstile，需要完成一次验证
- 验证成功后，所有文件共享验证 token

### 3. 开始上传

- 点击"开始批量上传"按钮
- 系统逐个上传文件，显示实时进度
- 支持查看每个文件的上传状态

### 4. 结果处理

- 上传完成后显示成功/失败统计
- 成功的文件自动保存到本地存储
- 失败的文件可以查看错误原因

## 性能优化

### 1. 请求频率控制

```typescript
// 添加延迟，避免请求过于频繁
if (i < batchFiles.length - 1) {
  await new Promise((resolve) => setTimeout(resolve, 500));
}
```

### 2. 内存管理

```typescript
// 及时清理文件引用
const clearBatchFiles = () => {
  setBatchFiles([]);
  setBatchProgress({});
  setShowBatchList(false);
};
```

### 3. 状态优化

```typescript
// 使用文件名作为 key，避免重复渲染
const progress = batchProgress[file.name];
```

## 错误处理

### 1. 文件验证错误

- 格式不支持：显示具体错误信息
- 文件过大：提示大小限制
- 自动过滤无效文件

### 2. 上传错误

- 网络错误：显示重试选项
- 服务器错误：显示具体错误信息
- 验证失败：提示重新验证

### 3. 状态恢复

- 上传中断后可以继续
- 支持部分成功的情况
- 提供清空队列重新开始

## 最佳实践

### 1. 用户体验

- 提供清晰的操作指引
- 实时反馈上传状态
- 支持中断和恢复操作

### 2. 性能考虑

- 控制并发请求数量
- 及时清理内存资源
- 优化大文件处理

### 3. 错误处理

- 提供详细的错误信息
- 支持错误恢复机制
- 记录错误日志便于调试

## 总结

批量图片上传功能为用户提供了高效的文件上传体验：

1. **便捷操作**：支持多文件选择和拖拽上传
2. **智能验证**：一次性人机验证，避免重复操作
3. **实时反馈**：详细的进度跟踪和状态显示
4. **错误处理**：完善的错误处理和恢复机制
5. **性能优化**：合理的请求频率和内存管理

这个功能大大提升了用户上传多张图片的效率，同时保持了良好的用户体验和系统稳定性。
