---
title: 批量上传历史记录功能改进
date: 2025-08-27
slug: batch-upload-history-record
tags: [batch, upload, history, record, image, blog]
---

# 批量上传历史记录功能改进

## 问题背景

在 Synapse 项目的图片上传功能中，批量上传成功后，文件没有正确添加到本地历史记录中，导致以下问题：

1. **历史记录不完整**：用户无法在本地存储中查看批量上传的文件
2. **用户体验差**：用户不知道哪些文件已经成功上传并保存
3. **数据不一致**：本地存储与实际上传结果不同步
4. **管理困难**：用户无法对批量上传的文件进行统一管理

## 解决方案

### 1. 改进批量上传成功处理逻辑

在 `handleBatchUpload()` 方法中，为每个成功上传的文件添加本地存储保存：

```typescript
if (result?.data?.web2url) {
  // 上传成功
  setBatchProgress((prev) => ({
    ...prev,
    [fileName]: { status: "success", progress: 100 },
  }));

  // 生成图片数据验证信息
  let imageId: string;
  let fileHash: string;
  let md5Hash: string;

  try {
    imageId = generateImageId();
    const fileArrayBuffer = await file.arrayBuffer();
    fileHash = await generateFileHash(fileArrayBuffer);
    md5Hash = generateMD5Hash(fileArrayBuffer);
  } catch (error) {
    console.error("[批量上传] 哈希生成失败:", error);
    imageId = generateImageId();
    fileHash = "hash-generation-failed";
    md5Hash = "md5-generation-failed";
  }

  // 保存到本地存储
  const imageData = {
    imageId,
    cid: result.data.cid || "",
    url: result.data.url || "",
    web2url: result.data.web2url,
    fileSize: file.size,
    fileName: file.name,
    uploadTime: new Date().toISOString(),
    fileHash,
    md5Hash,
  };

  try {
    await saveImageToStorage(imageData);
    console.log(`[批量上传] 文件 ${fileName} 已保存到本地存储`);
  } catch (error) {
    console.error("[批量上传] 保存到本地存储失败:", error);
  }

  // 记录到后端数据库
  try {
    await imageDataApi.recordImageData({
      imageId,
      fileName: file.name,
      fileSize: file.size,
      fileHash,
      md5Hash,
      web2url: result.data.web2url,
      cid: result.data.cid || "",
      uploadTime: new Date().toISOString(),
    });
    console.log(`[批量上传] 文件 ${fileName} 已记录到后端数据库`);
  } catch (error) {
    console.error("[批量上传] 记录到后端失败:", error);
  }

  console.log(`[批量上传] 文件 ${fileName} 上传成功`);
}
```

### 2. 改进批量上传完成后的处理

在批量上传完成后，添加更详细的成功处理逻辑：

```typescript
if (successCount > 0) {
  // 获取成功上传的文件列表
  const successfulFiles = batchFiles.filter((file) => {
    const progress = batchProgress[file.name];
    return progress && progress.status === "success";
  });

  // 显示成功上传的文件列表
  const successfulFileNames = successfulFiles
    .map((file) => file.name)
    .join(", ");
  setNotification({
    message: `批量上传完成！成功 ${successCount} 个，失败 ${errorCount} 个。成功文件：${successfulFileNames}`,
    type: successCount === batchFiles.length ? "success" : "warning",
  });

  // 更新批量文件列表，只保留成功的文件
  setBatchFiles(successfulFiles);

  // 更新进度状态，只保留成功的文件
  const successfulProgress: {
    [key: string]: {
      status: "pending" | "uploading" | "success" | "error";
      progress?: number;
      error?: string;
    };
  } = {};
  successfulFiles.forEach((file) => {
    const progress = batchProgress[file.name];
    if (progress && progress.status === "success") {
      successfulProgress[file.name] = progress;
    }
  });
  setBatchProgress(successfulProgress);

  // 如果所有文件都上传成功，隐藏批量上传列表
  if (successCount === batchFiles.length) {
    setShowBatchList(false);
  }

  // 显示成功上传的文件已添加到本地历史记录
  console.log(
    `[批量上传] 成功上传的文件已添加到本地历史记录：`,
    successfulFileNames
  );
}
```

### 3. 改进图片列表重新加载

在批量上传完成后，确保本地图片列表能够正确重新加载：

```typescript
setBatchUploading(false);

// 重新加载图片列表，确保显示所有成功上传的文件
try {
  await reloadImages();
  console.log("[批量上传] 本地图片列表已重新加载");
} catch (error) {
  console.error("[批量上传] 重新加载图片列表失败:", error);
}
```

## 实现细节

### 1. 本地存储保存机制

- **数据完整性**：确保每个成功上传的文件都保存完整的元数据
- **错误处理**：添加 try-catch 包装，确保单个文件保存失败不影响其他文件
- **日志记录**：详细记录每个文件的保存状态

### 2. 成功文件过滤机制

- **状态检查**：根据 `batchProgress` 状态过滤成功上传的文件
- **列表更新**：更新批量文件列表，只保留成功的文件
- **进度清理**：清理进度状态，只保留成功文件的状态

### 3. 用户反馈机制

- **详细通知**：在通知中显示成功上传的文件名称
- **状态显示**：在批量上传列表中显示每个文件的上传状态
- **日志输出**：在控制台输出详细的处理日志

## 优化效果

### 1. 数据一致性

- **本地同步**：批量上传的文件正确保存到本地存储
- **历史完整**：用户可以在本地历史记录中查看所有上传的文件
- **状态同步**：本地存储与实际服务器状态保持一致

### 2. 用户体验

- **清晰反馈**：用户能够清楚地知道哪些文件上传成功
- **统一管理**：所有上传的文件都可以在本地历史记录中统一管理
- **操作便利**：用户可以对批量上传的文件进行复制、预览、删除等操作

### 3. 系统稳定性

- **错误隔离**：单个文件保存失败不影响其他文件
- **状态管理**：正确的状态管理和清理机制
- **资源优化**：避免重复保存和无效操作

## 使用场景

### 1. 批量上传流程

```typescript
// 用户选择多个文件进行批量上传
const files = [file1, file2, file3, file4, file5];

// 系统逐个上传文件
for (const file of files) {
  // 上传文件
  const result = await uploadFile(file);

  if (result.success) {
    // 保存到本地存储
    await saveImageToStorage({
      imageId: generateImageId(),
      fileName: file.name,
      web2url: result.data.web2url,
      // ... 其他元数据
    });
  }
}

// 显示成功上传的文件列表
const successfulFiles = files.filter(
  (file) => uploadResults[file.name].success
);
console.log(
  "成功上传的文件：",
  successfulFiles.map((f) => f.name)
);
```

### 2. 历史记录查看

```typescript
// 用户可以在本地历史记录中查看所有上传的文件
const storedImages = await getStoredImages();
console.log("本地历史记录：", storedImages);

// 包括批量上传的文件
const batchUploadedImages = storedImages.filter(
  (img) => img.uploadTime > batchUploadStartTime
);
console.log("批量上传的文件：", batchUploadedImages);
```

### 3. 文件管理操作

```typescript
// 用户可以对批量上传的文件进行管理
const handleDeleteBatchFiles = async () => {
  const successfulFiles = batchFiles.filter(
    (file) => batchProgress[file.name]?.status === "success"
  );

  for (const file of successfulFiles) {
    await deleteImageFromStorage(file.name);
  }

  await reloadImages();
};
```

## 最佳实践

### 1. 错误处理

- **单个文件错误**：单个文件上传失败不应影响其他文件
- **存储错误**：本地存储失败时提供降级方案
- **网络错误**：网络异常时提供重试机制

### 2. 状态管理

- **进度跟踪**：实时跟踪每个文件的上传进度
- **状态同步**：确保本地状态与服务器状态同步
- **状态清理**：及时清理无效状态，避免内存泄漏

### 3. 用户反馈

- **实时更新**：实时更新上传进度和状态
- **详细通知**：提供详细的上传结果通知
- **操作指引**：为用户提供清晰的操作指引

## 监控和日志

### 1. 上传日志

```typescript
// 记录批量上传的详细信息
const logBatchUpload = (files: File[], results: any[]) => {
  const successCount = results.filter((r) => r.success).length;
  const errorCount = results.filter((r) => !r.success).length;

  console.log(`[批量上传] 完成，成功：${successCount}，失败：${errorCount}`);
  console.log(
    "[批量上传] 成功文件：",
    results.filter((r) => r.success).map((r) => r.fileName)
  );
  console.log(
    "[批量上传] 失败文件：",
    results.filter((r) => !r.success).map((r) => r.fileName)
  );
};
```

### 2. 存储日志

```typescript
// 记录本地存储操作
const logStorageOperation = (
  operation: string,
  fileName: string,
  success: boolean
) => {
  console.log(
    `[本地存储] ${operation} ${fileName}: ${success ? "成功" : "失败"}`
  );
};
```

## 总结

通过改进批量上传历史记录功能，我们实现了以下优化：

1. **数据完整性**：确保批量上传的文件正确保存到本地历史记录
2. **用户体验**：提供清晰的上传结果反馈和文件管理功能
3. **系统稳定性**：添加完善的错误处理和状态管理机制
4. **操作便利性**：用户可以对批量上传的文件进行统一管理

这个改进大大提升了批量上传功能的可用性和用户体验，是一个重要的功能完善。
