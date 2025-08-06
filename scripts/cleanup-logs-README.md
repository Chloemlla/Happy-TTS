# 日志文件清理脚本

这是一个用于异步清理文件夹及其子文件夹下所有 `.log` 文件的 JavaScript 脚本。

## 功能特点

- ✅ **异步处理**: 使用 Node.js 的异步文件系统 API，提高性能
- ✅ **递归遍历**: 自动遍历所有子文件夹
- ✅ **详细日志**: 提供完整的操作日志和错误信息
- ✅ **安全模式**: 支持试运行模式，预览将要删除的文件
- ✅ **统计信息**: 显示删除文件数量、释放空间等统计
- ✅ **错误处理**: 完善的错误捕获和处理机制
- ✅ **命令行支持**: 支持命令行参数和选项

## 使用方法

### 命令行使用

```bash
# 基本用法 - 清理指定目录下的所有.log文件
node cleanup-logs.js ./logs

# 试运行模式 - 预览将要删除的文件（不实际删除）
node cleanup-logs.js ./logs --dry-run

# 静默模式 - 只显示重要信息
node cleanup-logs.js ./logs --quiet

# 组合使用
node cleanup-logs.js ./logs --dry-run --quiet
```

### 编程方式使用

```javascript
const { cleanupLogFiles } = require("./cleanup-logs.js");

// 基本使用
async function example() {
  try {
    const result = await cleanupLogFiles("./logs");
    console.log(`删除了 ${result.deletedFiles} 个文件`);
  } catch (error) {
    console.error("清理失败:", error.message);
  }
}

// 使用选项
async function exampleWithOptions() {
  const options = {
    dryRun: true, // 试运行模式
    verbose: false, // 静默模式
  };

  const result = await cleanupLogFiles("./logs", options);
  console.log("清理结果:", result);
}
```

## 命令行选项

| 选项        | 简写 | 说明                       |
| ----------- | ---- | -------------------------- |
| `--dry-run` | `-d` | 试运行模式，不实际删除文件 |
| `--quiet`   | `-q` | 静默模式，不显示详细日志   |

## 输出示例

```
[2024-01-15T10:30:00.000Z] [INFO] 开始清理日志文件...
[2024-01-15T10:30:00.001Z] [INFO] 目标路径: /path/to/logs
[2024-01-15T10:30:00.002Z] [INFO] 试运行模式: 否
[2024-01-15T10:30:00.003Z] [INFO] 详细日志: 是
[2024-01-15T10:30:00.004Z] [INFO] ------------------------------------------------------------
[2024-01-15T10:30:00.005Z] [INFO] 进入目录: /path/to/logs/app1
[2024-01-15T10:30:00.006Z] [INFO] 发现日志文件: /path/to/logs/app1/error.log (1.25 MB)
[2024-01-15T10:30:00.007Z] [INFO] 已删除: /path/to/logs/app1/error.log
[2024-01-15T10:30:00.008Z] [INFO] 发现日志文件: /path/to/logs/app1/access.log (2.50 MB)
[2024-01-15T10:30:00.009Z] [INFO] 已删除: /path/to/logs/app1/access.log
[2024-01-15T10:30:00.010Z] [INFO] ============================================================
[2024-01-15T10:30:00.011Z] [INFO] 清理完成！统计信息:
[2024-01-15T10:30:00.012Z] [INFO] 总扫描文件数: 2
[2024-01-15T10:30:00.013Z] [INFO] 成功删除文件数: 2
[2024-01-15T10:30:00.014Z] [INFO] 删除失败文件数: 0
[2024-01-15T10:30:00.015Z] [INFO] 释放空间: 3.75 MB
[2024-01-15T10:30:00.016Z] [INFO] 执行时间: 0.01 秒
[2024-01-15T10:30:00.017Z] [INFO] ============================================================
```

## 返回结果对象

脚本返回一个包含以下信息的统计对象：

```javascript
{
    totalFiles: 5,        // 总扫描文件数
    deletedFiles: 4,      // 成功删除文件数
    failedFiles: 1,       // 删除失败文件数
    totalSize: 1048576,   // 释放的总字节数
    startTime: Date,      // 开始时间
    errors: [             // 错误详情数组
        {
            path: '/path/to/file.log',
            error: 'Permission denied',
            type: 'file'
        }
    ]
}
```

## 安全注意事项

⚠️ **重要提醒**:

- 此脚本会**永久删除**所有 `.log` 文件，无法恢复
- 建议首次使用时先运行 `--dry-run` 模式预览将要删除的文件
- 确保在正确的目录上运行，避免误删重要文件
- 建议在删除前备份重要数据

## 系统要求

- Node.js 12.0 或更高版本
- 支持的文件系统权限

## 许可证

MIT License
