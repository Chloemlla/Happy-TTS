# Artifacts 分享功能测试指南

## 功能概述

已实现类似 Claude.ai Artifacts 的独立分享页面功能，支持代码、HTML、Markdown、Mermaid 图表等多种内容类型的分享。

## 已实现的功能

### 后端 API

1. **创建 Artifact** - `POST /api/nexai/artifacts`
2. **获取 Artifact** - `GET /api/nexai/artifacts/:shortId`
3. **更新 Artifact** - `PATCH /api/nexai/artifacts/:shortId`
4. **删除 Artifact** - `DELETE /api/nexai/artifacts/:shortId`
5. **获取列表** - `GET /api/nexai/artifacts`
6. **记录访问** - `POST /api/nexai/artifacts/:shortId/view`

### 前端页面

- 分享页面路由：`/artifacts/:shortId`
- 支持密码保护
- 支持代码高亮显示
- 支持复制、下载、分享功能

### 数据库

- `artifacts` - 主表
- `artifact_versions` - 版本管理
- `artifact_views` - 访问日志

## 测试步骤

### 1. 启动服务

```bash
# 启动后端
npm run dev:backend

# 启动前端
npm run dev:frontend
```

### 2. 测试创建 Artifact

使用 Postman 或 curl 测试：

```bash
curl -X POST http://localhost:3000/api/nexai/artifacts \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "title": "测试代码分享",
    "content_type": "code",
    "language": "javascript",
    "content": "Y29uc29sZS5sb2coIkhlbGxvIFdvcmxkIik7",
    "visibility": "public",
    "description": "这是一个测试",
    "tags": ["test", "javascript"],
    "expires_in_days": 30
  }'
```

**注意**: `content` 字段需要 base64 编码。上面的例子是 `console.log("Hello World");` 的 base64 编码。

### 3. 测试获取 Artifact

```bash
curl http://localhost:3000/api/nexai/artifacts/abc123xyz
```

### 4. 测试前端页面

访问：`http://localhost:3001/artifacts/abc123xyz`

### 5. 测试密码保护

创建密码保护的 Artifact：

```bash
curl -X POST http://localhost:3000/api/nexai/artifacts \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "title": "密码保护的内容",
    "content_type": "code",
    "content": "Y29uc29sZS5sb2coIlNlY3JldCIp",
    "visibility": "password",
    "password": "mypassword"
  }'
```

获取时需要提供密码：

```bash
curl http://localhost:3000/api/nexai/artifacts/abc123xyz \
  -H "X-Password: mypassword"
```

### 6. 测试列表功能

```bash
curl http://localhost:3000/api/nexai/artifacts?page=1&limit=20 \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### 7. 测试更新功能

```bash
curl -X PATCH http://localhost:3000/api/nexai/artifacts/abc123xyz \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "title": "更新后的标题",
    "visibility": "private"
  }'
```

### 8. 测试删除功能

```bash
curl -X DELETE http://localhost:3000/api/nexai/artifacts/abc123xyz \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

## 快速测试脚本

创建一个测试文件 `test-artifacts.js`：

```javascript
const axios = require('axios');

const BASE_URL = 'http://localhost:3000/api/nexai';
const TOKEN = 'YOUR_JWT_TOKEN'; // 替换为实际的 token

async function testCreateArtifact() {
  try {
    const content = Buffer.from('console.log("Hello World");').toString('base64');

    const response = await axios.post(`${BASE_URL}/artifacts`, {
      title: '测试代码分享',
      content_type: 'code',
      language: 'javascript',
      content: content,
      visibility: 'public',
      description: '这是一个测试',
      tags: ['test', 'javascript'],
      expires_in_days: 30
    }, {
      headers: {
        'Authorization': `Bearer ${TOKEN}`,
        'Content-Type': 'application/json'
      }
    });

    console.log('创建成功:');
    console.log('Short ID:', response.data.data.shortId);
    console.log('分享链接:', response.data.data.shareUrl);

    return response.data.data.shortId;
  } catch (error) {
    console.error('创建失败:', error.response?.data || error.message);
  }
}

async function testGetArtifact(shortId) {
  try {
    const response = await axios.get(`${BASE_URL}/artifacts/${shortId}`);
    console.log('获取成功:');
    console.log('标题:', response.data.data.title);
    console.log('查看次数:', response.data.data.viewCount);
  } catch (error) {
    console.error('获取失败:', error.response?.data || error.message);
  }
}

async function testListArtifacts() {
  try {
    const response = await axios.get(`${BASE_URL}/artifacts?page=1&limit=10`, {
      headers: {
        'Authorization': `Bearer ${TOKEN}`
      }
    });
    console.log('列表获取成功:');
    console.log('总数:', response.data.data.pagination.total);
    console.log('Artifacts:', response.data.data.artifacts.length);
  } catch (error) {
    console.error('列表获取失败:', error.response?.data || error.message);
  }
}

async function runTests() {
  console.log('=== 开始测试 ===\n');

  console.log('1. 测试创建 Artifact');
  const shortId = await testCreateArtifact();
  console.log('\n');

  if (shortId) {
    console.log('2. 测试获取 Artifact');
    await testGetArtifact(shortId);
    console.log('\n');
  }

  console.log('3. 测试获取列表');
  await testListArtifacts();
  console.log('\n');

  console.log('=== 测试完成 ===');
}

runTests();
```

运行测试：

```bash
node test-artifacts.js
```

## 前端测试清单

- [ ] 访问分享链接能正常显示内容
- [ ] 代码高亮显示正常
- [ ] 复制按钮功能正常
- [ ] 下载按钮功能正常
- [ ] 分享按钮功能正常
- [ ] 密码保护功能正常
- [ ] 过期内容显示 404
- [ ] 移动端显示正常
- [ ] 访问统计正常增加

## 常见问题

### 1. 创建失败：401 Unauthorized

**原因**: JWT token 无效或未提供

**解决**: 确保在 Header 中正确设置 `Authorization: Bearer <token>`

### 2. 获取失败：403 Forbidden

**原因**: 内容需要密码但未提供

**解决**: 在 Header 中添加 `X-Password: <password>`

### 3. 前端页面空白

**原因**: 可能是路由未正确配置或组件加载失败

**解决**:
- 检查浏览器控制台错误
- 确认 `ArtifactSharePage.tsx` 已正确导入
- 确认路由已添加到 `App.tsx`

### 4. 代码高亮不显示

**原因**: `react-syntax-highlighter` 未正确导入

**解决**: 确认已安装依赖并正确导入样式

### 5. MongoDB 连接失败

**原因**: MongoDB 未启动或连接字符串错误

**解决**:
- 确认 MongoDB 服务正在运行
- 检查 `MONGO_URI` 环境变量

## 性能测试

### 并发测试

使用 Apache Bench 测试：

```bash
# 测试获取 Artifact 的并发性能
ab -n 1000 -c 10 http://localhost:3000/api/nexai/artifacts/abc123xyz
```

### 负载测试

使用 Artillery 测试：

```yaml
# artillery-test.yml
config:
  target: 'http://localhost:3000'
  phases:
    - duration: 60
      arrivalRate: 10
scenarios:
  - name: "Get Artifact"
    flow:
      - get:
          url: "/api/nexai/artifacts/abc123xyz"
```

运行：

```bash
artillery run artillery-test.yml
```

## 安全测试

### 1. SQL 注入测试

尝试在 shortId 中注入 SQL：

```bash
curl http://localhost:3000/api/nexai/artifacts/abc'; DROP TABLE artifacts;--
```

应该返回 404 或错误，不应该执行 SQL。

### 2. XSS 测试

创建包含 XSS 代码的 Artifact：

```bash
curl -X POST http://localhost:3000/api/nexai/artifacts \
  -H "Authorization: Bearer TOKEN" \
  -d '{
    "title": "<script>alert(\"XSS\")</script>",
    "content_type": "html",
    "content": "PHNjcmlwdD5hbGVydCgiWFNTIik8L3NjcmlwdD4="
  }'
```

前端应该正确转义，不执行脚本。

### 3. 密码暴力破解测试

尝试多次使用错误密码：

```bash
for i in {1..100}; do
  curl http://localhost:3000/api/nexai/artifacts/abc123xyz \
    -H "X-Password: wrong$i"
done
```

应该触发限流机制。

## 监控指标

建议监控以下指标：

1. **API 响应时间**: 平均 < 200ms
2. **错误率**: < 1%
3. **创建成功率**: > 99%
4. **数据库查询时间**: < 50ms
5. **内存使用**: 稳定，无泄漏
6. **并发处理能力**: > 100 req/s

## 下一步优化

1. 添加内容预览功能
2. 支持更多内容类型（PDF、图片等）
3. 添加评论功能
4. 添加点赞/收藏功能
5. 实现协作编辑
6. 添加搜索功能
7. 优化移动端体验
8. 添加分析统计面板
