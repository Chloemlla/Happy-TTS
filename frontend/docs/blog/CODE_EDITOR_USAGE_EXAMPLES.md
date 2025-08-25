---
title: PromptModal 代码编辑器使用示例
date: 2025-08-27
slug: promptmodal-code-editor-examples
tags: [promptmodal, code-editor, examples, frontend, react, typescript]
---

# PromptModal 代码编辑器使用示例

## 概述

本文档提供了 PromptModal 代码编辑器功能的使用示例，帮助开发者快速集成到自己的组件中。

## 基础用法

### 1. 简单的代码编辑器

```typescript
import React, { useState } from 'react';
import PromptModal from './components/PromptModal';

const MyComponent: React.FC = () => {
  const [modalOpen, setModalOpen] = useState(false);

  const handleEditCode = () => {
    setModalOpen(true);
  };

  return (
    <div>
      <button onClick={handleEditCode}>编辑代码</button>

      <PromptModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onConfirm={(content) => {
          console.log('编辑的内容:', content);
          setModalOpen(false);
        }}
        title="编辑代码"
        message="请输入您的代码："
        defaultValue="function hello() {\n  console.log('Hello World!');\n}"
        codeEditor={true}
        language="auto"
        maxLength={5000}
      />
    </div>
  );
};
```

### 2. 指定语言的编辑器

```typescript
const JsonEditor: React.FC = () => {
  const [modalOpen, setModalOpen] = useState(false);

  return (
    <PromptModal
      open={modalOpen}
      onClose={() => setModalOpen(false)}
      onConfirm={(content) => {
        try {
          const parsed = JSON.parse(content);
          console.log('解析的JSON:', parsed);
        } catch (error) {
          console.error('JSON格式错误:', error);
        }
        setModalOpen(false);
      }}
      title="编辑JSON配置"
      message="请输入JSON配置："
      defaultValue='{\n  "name": "example",\n  "version": "1.0.0"\n}'
      codeEditor={true}
      language="json"
      maxLength={2000}
    />
  );
};
```

## 高级用法

### 3. 动态语言检测

```typescript
const SmartCodeEditor: React.FC = () => {
  const [modalOpen, setModalOpen] = useState(false);
  const [currentCode, setCurrentCode] = useState('');

  const handleEditWithDetection = (code: string) => {
    setCurrentCode(code);
    setModalOpen(true);
  };

  return (
    <PromptModal
      open={modalOpen}
      onClose={() => setModalOpen(false)}
      onConfirm={(content) => {
        setCurrentCode(content);
        setModalOpen(false);
      }}
      title="智能代码编辑器"
      message="编辑器会自动检测代码类型并应用相应的语法高亮"
      defaultValue={currentCode}
      codeEditor={true}
      language="auto" // 自动检测语言
      maxLength={10000}
    />
  );
};
```

### 4. 多语言支持示例

```typescript
const MultiLanguageEditor: React.FC = () => {
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedLanguage, setSelectedLanguage] = useState('auto');

  const codeExamples = {
    javascript: `function fibonacci(n) {
  if (n <= 1) return n;
  return fibonacci(n - 1) + fibonacci(n - 2);
}

console.log(fibonacci(10));`,

    python: `def fibonacci(n):
    if n <= 1:
        return n
    return fibonacci(n - 1) + fibonacci(n - 2)

print(fibonacci(10))`,

    sql: `SELECT
    u.name,
    COUNT(o.id) as order_count
FROM users u
LEFT JOIN orders o ON u.id = o.user_id
GROUP BY u.id, u.name
HAVING COUNT(o.id) > 0;`,

    html: `<!DOCTYPE html>
<html>
<head>
    <title>示例页面</title>
</head>
<body>
    <h1>Hello World</h1>
    <p>这是一个示例页面</p>
</body>
</html>`
  };

  return (
    <div>
      <div className="mb-4">
        <label>选择语言：</label>
        <select
          value={selectedLanguage}
          onChange={(e) => setSelectedLanguage(e.target.value)}
        >
          <option value="auto">自动检测</option>
          <option value="javascript">JavaScript</option>
          <option value="python">Python</option>
          <option value="sql">SQL</option>
          <option value="html">HTML</option>
        </select>
      </div>

      <button onClick={() => setModalOpen(true)}>
        编辑 {selectedLanguage === 'auto' ? '代码' : selectedLanguage} 代码
      </button>

      <PromptModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onConfirm={(content) => {
          console.log(`编辑的${selectedLanguage}代码:`, content);
          setModalOpen(false);
        }}
        title={`编辑${selectedLanguage === 'auto' ? '代码' : selectedLanguage}代码`}
        message="请在下方编辑您的代码："
        defaultValue={codeExamples[selectedLanguage as keyof typeof codeExamples] || ''}
        codeEditor={true}
        language={selectedLanguage}
        maxLength={5000}
      />
    </div>
  );
};
```

## 实际应用场景

### 5. 配置文件编辑器

```typescript
const ConfigEditor: React.FC = () => {
  const [modalOpen, setModalOpen] = useState(false);
  const [config, setConfig] = useState('');

  const defaultConfig = `{
  "server": {
    "port": 3000,
    "host": "localhost"
  },
  "database": {
    "url": "mongodb://localhost:27017",
    "name": "myapp"
  },
  "features": {
    "caching": true,
    "logging": false
  }
}`;

  const handleSaveConfig = async (content: string) => {
    try {
      const parsed = JSON.parse(content);
      // 验证配置
      if (!parsed.server || !parsed.database) {
        throw new Error('配置格式不正确');
      }

      // 保存配置
      await saveConfig(parsed);
      setConfig(content);
      setModalOpen(false);
    } catch (error) {
      console.error('配置保存失败:', error);
    }
  };

  return (
    <PromptModal
      open={modalOpen}
      onClose={() => setModalOpen(false)}
      onConfirm={handleSaveConfig}
      title="编辑配置文件"
      message="请编辑您的配置文件（JSON格式）："
      defaultValue={config || defaultConfig}
      codeEditor={true}
      language="json"
      maxLength={5000}
    />
  );
};
```

### 6. SQL查询编辑器

```typescript
const SqlQueryEditor: React.FC = () => {
  const [modalOpen, setModalOpen] = useState(false);
  const [query, setQuery] = useState('');

  const handleExecuteQuery = async (sqlQuery: string) => {
    try {
      // 执行SQL查询
      const result = await executeQuery(sqlQuery);
      console.log('查询结果:', result);
      setQuery(sqlQuery);
      setModalOpen(false);
    } catch (error) {
      console.error('查询执行失败:', error);
    }
  };

  return (
    <PromptModal
      open={modalOpen}
      onClose={() => setModalOpen(false)}
      onConfirm={handleExecuteQuery}
      title="SQL查询编辑器"
      message="请输入您的SQL查询语句："
      defaultValue={query || `SELECT * FROM users
WHERE created_at >= '2024-01-01'
ORDER BY created_at DESC
LIMIT 10;`}
      codeEditor={true}
      language="sql"
      maxLength={2000}
    />
  );
};
```

### 7. Markdown文档编辑器

```typescript
const MarkdownEditor: React.FC = () => {
  const [modalOpen, setModalOpen] = useState(false);
  const [content, setContent] = useState('');

  const defaultMarkdown = `# 文档标题

这是一个示例文档。

## 功能列表

- 功能1
- 功能2
- 功能3

## 代码示例

\`\`\`javascript
function example() {
  return "Hello World";
}
\`\`\`

## 表格

| 列1 | 列2 | 列3 |
|-----|-----|-----|
| 数据1 | 数据2 | 数据3 |
`;

  return (
    <PromptModal
      open={modalOpen}
      onClose={() => setModalOpen(false)}
      onConfirm={(markdown) => {
        setContent(markdown);
        setModalOpen(false);
      }}
      title="Markdown文档编辑器"
      message="请编辑您的Markdown文档："
      defaultValue={content || defaultMarkdown}
      codeEditor={true}
      language="markdown"
      maxLength={10000}
    />
  );
};
```

## 自定义样式

### 8. 自定义主题配置

```typescript
// 在 PromptModal 组件中可以自定义样式
const CustomStyledEditor: React.FC = () => {
  return (
    <PromptModal
      open={modalOpen}
      onClose={() => setModalOpen(false)}
      onConfirm={handleConfirm}
      title="自定义样式编辑器"
      message="这是一个自定义样式的代码编辑器"
      defaultValue="// 自定义样式示例"
      codeEditor={true}
      language="javascript"
      maxLength={3000}
      // 可以通过CSS类名自定义样式
      className="custom-editor-modal"
    />
  );
};
```

## 错误处理

### 9. 带验证的编辑器

```typescript
const ValidatedEditor: React.FC = () => {
  const [modalOpen, setModalOpen] = useState(false);
  const [error, setError] = useState('');

  const handleConfirmWithValidation = (content: string) => {
    try {
      // 验证JSON格式
      const parsed = JSON.parse(content);

      // 验证必需字段
      if (!parsed.name || !parsed.version) {
        throw new Error('缺少必需的字段：name 和 version');
      }

      // 验证版本格式
      if (!/^\d+\.\d+\.\d+$/.test(parsed.version)) {
        throw new Error('版本格式不正确，应为 x.y.z 格式');
      }

      // 保存配置
      saveConfig(parsed);
      setModalOpen(false);
      setError('');
    } catch (error) {
      setError(error instanceof Error ? error.message : '验证失败');
    }
  };

  return (
    <div>
      {error && (
        <div className="error-message">
          错误: {error}
        </div>
      )}

      <PromptModal
        open={modalOpen}
        onClose={() => {
          setModalOpen(false);
          setError('');
        }}
        onConfirm={handleConfirmWithValidation}
        title="带验证的配置编辑器"
        message="请编辑配置文件（JSON格式）："
        defaultValue='{\n  "name": "myapp",\n  "version": "1.0.0"\n}'
        codeEditor={true}
        language="json"
        maxLength={2000}
      />
    </div>
  );
};
```

## 最佳实践

### 10. 性能优化建议

```typescript
const OptimizedEditor: React.FC = () => {
  const [modalOpen, setModalOpen] = useState(false);
  const [content, setContent] = useState('');

  // 使用 useCallback 优化性能
  const handleConfirm = useCallback((newContent: string) => {
    setContent(newContent);
    setModalOpen(false);
  }, []);

  const handleClose = useCallback(() => {
    setModalOpen(false);
  }, []);

  return (
    <PromptModal
      open={modalOpen}
      onClose={handleClose}
      onConfirm={handleConfirm}
      title="优化的编辑器"
      message="这是一个性能优化的代码编辑器示例"
      defaultValue={content}
      codeEditor={true}
      language="auto"
      maxLength={5000}
    />
  );
};
```

## 总结

PromptModal 代码编辑器提供了丰富的功能和灵活的配置选项，可以满足各种代码编辑需求。通过合理使用这些功能，可以为用户提供更好的编辑体验。

### 关键特性回顾

- ✅ VSCode Dark+ 主题
- ✅ 智能语言检测
- ✅ 语法高亮
- ✅ 行号显示
- ✅ 复制功能
- ✅ 视图切换
- ✅ 全屏编辑
- ✅ 响应式设计

### 使用建议

1. 根据内容类型选择合适的语言
2. 设置合理的字符限制
3. 添加适当的验证逻辑
4. 优化性能，避免不必要的重渲染
5. 提供清晰的用户反馈
