# NexAI Artifacts 分享功能 - 后端技术规范

## 1. 功能概述

### 1.1 目标
实现类似 Claude.ai Artifacts 的独立分享页面功能，允许用户将 AI 生成的内容（代码、HTML、Markdown、图表等）生成为独立的可分享网页。

### 1.2 核心功能
- 生成唯一的分享链接
- 支持多种内容类型（HTML、代码、Markdown、Mermaid 图表等）
- 访问控制（公开/私密/密码保护）
- 访问统计
- 过期时间设置
- 内容版本管理

---

## 2. 技术架构

### 2.1 整体架构
```
┌─────────────┐      HTTPS      ┌──────────────┐
│  NexAI App  │ ◄──────────────► │  API Gateway │
└─────────────┘                  └──────┬───────┘
                                        │
                    ┌───────────────────┼───────────────────┐
                    │                   │                   │
              ┌─────▼─────┐      ┌─────▼─────┐      ┌─────▼─────┐
              │ Artifacts │      │   Auth    │      │  Storage  │
              │  Service  │      │  Service  │      │  Service  │
              └─────┬─────┘      └───────────┘      └─────┬─────┘
                    │                                      │
              ┌─────▼─────┐                         ┌─────▼─────┐
              │ PostgreSQL│                         │    S3/    │
              │  Database │                         │   MinIO   │
              └───────────┘                         └───────────┘
```

### 2.2 技术栈建议
- **后端框架**: Node.js (Express/Fastify) 或 Go (Gin/Fiber)
- **数据库**: PostgreSQL 14+
- **缓存**: Redis 7+
- **对象存储**: AWS S3 / MinIO / Cloudflare R2
- **CDN**: Cloudflare / AWS CloudFront
- **容器化**: Docker + Docker Compose
- **部署**: Kubernetes / Docker Swarm / Railway / Fly.io

---

## 3. 数据库设计

### 3.1 表结构

#### artifacts 表
```sql
CREATE TABLE artifacts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    short_id VARCHAR(12) UNIQUE NOT NULL,  -- 短链接 ID (如: abc123xyz)
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,

    -- 内容信息
    title VARCHAR(255) NOT NULL,
    content_type VARCHAR(50) NOT NULL,  -- html, code, markdown, mermaid, etc.
    language VARCHAR(50),  -- 编程语言 (如果是代码)
    content_url TEXT NOT NULL,  -- S3/MinIO 存储 URL
    content_hash VARCHAR(64) NOT NULL,  -- SHA-256 哈希，用于去重

    -- 访问控制
    visibility VARCHAR(20) NOT NULL DEFAULT 'private',  -- public, private, password
    password_hash VARCHAR(255),  -- bcrypt 哈希

    -- 元数据
    description TEXT,
    tags TEXT[],

    -- 统计
    view_count INTEGER DEFAULT 0,
    last_viewed_at TIMESTAMP,

    -- 时间管理
    expires_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),

    -- 索引
    CONSTRAINT valid_visibility CHECK (visibility IN ('public', 'private', 'password'))
);

CREATE INDEX idx_artifacts_short_id ON artifacts(short_id);
CREATE INDEX idx_artifacts_user_id ON artifacts(user_id);
CREATE INDEX idx_artifacts_content_hash ON artifacts(content_hash);
CREATE INDEX idx_artifacts_created_at ON artifacts(created_at DESC);
CREATE INDEX idx_artifacts_expires_at ON artifacts(expires_at) WHERE expires_at IS NOT NULL;
```

#### artifact_versions 表 (版本管理)
```sql
CREATE TABLE artifact_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    artifact_id UUID REFERENCES artifacts(id) ON DELETE CASCADE,
    version_number INTEGER NOT NULL,
    content_url TEXT NOT NULL,
    content_hash VARCHAR(64) NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),

    UNIQUE(artifact_id, version_number)
);

CREATE INDEX idx_artifact_versions_artifact_id ON artifact_versions(artifact_id);
```

#### artifact_views 表 (访问日志)
```sql
CREATE TABLE artifact_views (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    artifact_id UUID REFERENCES artifacts(id) ON DELETE CASCADE,

    -- 访问者信息
    ip_address INET,
    user_agent TEXT,
    referer TEXT,
    country_code VARCHAR(2),

    -- 时间
    viewed_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_artifact_views_artifact_id ON artifact_views(artifact_id);
CREATE INDEX idx_artifact_views_viewed_at ON artifact_views(viewed_at DESC);
```

---

## 4. API 设计

### 4.1 RESTful API 端点

#### 4.1.1 创建 Artifact
```http
POST /api/v1/artifacts
Authorization: Bearer <token>
Content-Type: application/json

{
  "title": "React Counter Component",
  "content_type": "code",
  "language": "javascript",
  "content": "<base64_encoded_content>",
  "visibility": "public",
  "password": "optional_password",
  "description": "A simple React counter component",
  "tags": ["react", "component", "tutorial"],
  "expires_in_days": 30
}

Response 201:
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "short_id": "abc123xyz",
  "share_url": "https://artifacts.nexai.app/abc123xyz",
  "embed_url": "https://artifacts.nexai.app/embed/abc123xyz",
  "created_at": "2026-03-14T10:30:00Z",
  "expires_at": "2026-04-13T10:30:00Z"
}
```

#### 4.1.2 获取 Artifact
```http
GET /api/v1/artifacts/:short_id
X-Password: <optional_password>

Response 200:
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "short_id": "abc123xyz",
  "title": "React Counter Component",
  "content_type": "code",
  "language": "javascript",
  "content_url": "https://cdn.nexai.app/artifacts/abc123xyz.js",
  "description": "A simple React counter component",
  "tags": ["react", "component", "tutorial"],
  "view_count": 42,
  "created_at": "2026-03-14T10:30:00Z",
  "expires_at": "2026-04-13T10:30:00Z"
}

Response 403 (密码保护):
{
  "error": "password_required",
  "message": "This artifact is password protected"
}

Response 404:
{
  "error": "not_found",
  "message": "Artifact not found or expired"
}
```

#### 4.1.3 更新 Artifact
```http
PATCH /api/v1/artifacts/:short_id
Authorization: Bearer <token>
Content-Type: application/json

{
  "title": "Updated Title",
  "visibility": "private",
  "expires_in_days": 60
}

Response 200:
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "short_id": "abc123xyz",
  "updated_at": "2026-03-14T11:00:00Z"
}
```

#### 4.1.4 删除 Artifact
```http
DELETE /api/v1/artifacts/:short_id
Authorization: Bearer <token>

Response 204 No Content
```

#### 4.1.5 获取用户的 Artifacts 列表
```http
GET /api/v1/artifacts?page=1&limit=20&sort=created_at&order=desc
Authorization: Bearer <token>

Response 200:
{
  "artifacts": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "short_id": "abc123xyz",
      "title": "React Counter Component",
      "content_type": "code",
      "visibility": "public",
      "view_count": 42,
      "created_at": "2026-03-14T10:30:00Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 100,
    "total_pages": 5
  }
}
```

#### 4.1.6 记录访问
```http
POST /api/v1/artifacts/:short_id/view
Content-Type: application/json

{
  "referer": "https://example.com",
  "user_agent": "Mozilla/5.0..."
}

Response 204 No Content
```

---

## 5. 分享页面设计

### 5.1 页面路由
- **主页面**: `https://artifacts.nexai.app/:short_id`
- **嵌入页面**: `https://artifacts.nexai.app/embed/:short_id`
- **原始内容**: `https://artifacts.nexai.app/raw/:short_id`

### 5.2 HTML 模板结构
```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{{title}} - NexAI Artifacts</title>

    <!-- SEO Meta Tags -->
    <meta name="description" content="{{description}}">
    <meta name="keywords" content="{{tags}}">

    <!-- Open Graph -->
    <meta property="og:title" content="{{title}}">
    <meta property="og:description" content="{{description}}">
    <meta property="og:type" content="website">
    <meta property="og:url" content="{{share_url}}">

    <!-- Twitter Card -->
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="{{title}}">
    <meta name="twitter:description" content="{{description}}">

    <!-- Styles -->
    <link rel="stylesheet" href="/static/artifacts.css">

    <!-- Syntax Highlighting (if code) -->
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/github-dark.min.css">
</head>
<body>
    <div class="artifact-container">
        <header class="artifact-header">
            <div class="artifact-info">
                <h1>{{title}}</h1>
                <p class="artifact-meta">
                    <span class="content-type">{{content_type}}</span>
                    <span class="view-count">{{view_count}} views</span>
                    <span class="created-at">{{created_at}}</span>
                </p>
            </div>
            <div class="artifact-actions">
                <button class="btn-copy" data-clipboard-target="#artifact-content">
                    Copy
                </button>
                <button class="btn-download" data-download-url="{{raw_url}}">
                    Download
                </button>
                <button class="btn-share" data-share-url="{{share_url}}">
                    Share
                </button>
            </div>
        </header>

        <main class="artifact-content" id="artifact-content">
            <!-- 根据 content_type 渲染不同内容 -->
            {{#if is_html}}
                <iframe src="{{content_url}}" sandbox="allow-scripts allow-same-origin"></iframe>
            {{/if}}

            {{#if is_code}}
                <pre><code class="language-{{language}}">{{content}}</code></pre>
            {{/if}}

            {{#if is_markdown}}
                <div class="markdown-body">{{rendered_markdown}}</div>
            {{/if}}

            {{#if is_mermaid}}
                <div class="mermaid">{{content}}</div>
            {{/if}}
        </main>

        <footer class="artifact-footer">
            <p>Created with <a href="https://nexai.app">NexAI</a></p>
            <p class="powered-by">Powered by NexAI Artifacts</p>
        </footer>
    </div>

    <!-- Scripts -->
    <script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/highlight.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/mermaid/dist/mermaid.min.js"></script>
    <script src="/static/artifacts.js"></script>
</body>
</html>
```

---

## 6. 安全考虑

### 6.1 内容安全
- **XSS 防护**: 对用户生成的 HTML 进行严格的 sanitization
- **CSP 策略**: 实施严格的 Content Security Policy
- **Sandbox**: HTML 内容在 iframe 中使用 sandbox 属性隔离
- **文件大小限制**: 单个 artifact 最大 10MB

### 6.2 访问控制
- **速率限制**:
  - 创建: 10 次/小时/用户
  - 查看: 100 次/分钟/IP
- **密码保护**: 使用 bcrypt 哈希存储密码
- **过期清理**: 定时任务清理过期内容

### 6.3 DDoS 防护
- Cloudflare DDoS Protection
- Rate limiting at API Gateway level
- IP 黑名单机制

---

## 7. 存储策略

### 7.1 对象存储结构
```
artifacts/
├── {year}/
│   ├── {month}/
│   │   ├── {short_id}/
│   │   │   ├── content.{ext}
│   │   │   ├── v1.{ext}
│   │   │   ├── v2.{ext}
│   │   │   └── metadata.json
```

### 7.2 CDN 配置
- **缓存策略**:
  - 公开内容: Cache-Control: public, max-age=31536000
  - 私密内容: Cache-Control: private, no-cache
- **压缩**: 启用 Gzip/Brotli 压缩
- **HTTPS**: 强制 HTTPS

---

## 8. 性能优化

### 8.1 缓存策略
```
Redis 缓存层次:
1. Artifact 元数据: TTL 1小时
2. 内容 URL: TTL 24小时
3. 访问统计: 实时写入，批量更新数据库
```

### 8.2 数据库优化
- 使用索引优化查询
- 分区表（按创建时间）
- 定期归档旧数据

---

## 9. 监控与日志

### 9.1 关键指标
- API 响应时间
- 错误率
- 创建/查看 QPS
- 存储使用量
- CDN 流量

### 9.2 日志记录
```json
{
  "timestamp": "2026-03-14T10:30:00Z",
  "level": "info",
  "event": "artifact_created",
  "user_id": "550e8400-e29b-41d4-a716-446655440000",
  "artifact_id": "abc123xyz",
  "content_type": "code",
  "size_bytes": 1024,
  "ip_address": "192.168.1.1"
}
```

---

## 10. 部署方案

### 10.1 Docker Compose 示例
```yaml
version: '3.8'

services:
  api:
    image: nexai-artifacts-api:latest
    ports:
      - "3000:3000"
    environment:
      - DATABASE_URL=postgresql://user:pass@postgres:5432/artifacts
      - REDIS_URL=redis://redis:6379
      - S3_ENDPOINT=http://minio:9000
      - S3_BUCKET=artifacts
    depends_on:
      - postgres
      - redis
      - minio

  postgres:
    image: postgres:14-alpine
    volumes:
      - postgres_data:/var/lib/postgresql/data
    environment:
      - POSTGRES_DB=artifacts
      - POSTGRES_USER=user
      - POSTGRES_PASSWORD=pass

  redis:
    image: redis:7-alpine
    volumes:
      - redis_data:/data

  minio:
    image: minio/minio:latest
    command: server /data --console-address ":9001"
    ports:
      - "9000:9000"
      - "9001:9001"
    volumes:
      - minio_data:/data
    environment:
      - MINIO_ROOT_USER=minioadmin
      - MINIO_ROOT_PASSWORD=minioadmin

volumes:
  postgres_data:
  redis_data:
  minio_data:
```

### 10.2 环境变量配置
```env
# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/artifacts
DATABASE_POOL_SIZE=20

# Redis
REDIS_URL=redis://localhost:6379
REDIS_TTL=3600

# S3/MinIO
S3_ENDPOINT=https://s3.amazonaws.com
S3_REGION=us-east-1
S3_BUCKET=nexai-artifacts
S3_ACCESS_KEY=your_access_key
S3_SECRET_KEY=your_secret_key

# CDN
CDN_URL=https://cdn.nexai.app

# Security
JWT_SECRET=your_jwt_secret
BCRYPT_ROUNDS=12
RATE_LIMIT_MAX=100
RATE_LIMIT_WINDOW=60000

# Application
PORT=3000
NODE_ENV=production
BASE_URL=https://artifacts.nexai.app
```

---

## 11. 前端集成

### 11.1 Flutter 客户端集成
```dart
// lib/services/artifacts_service.dart
class ArtifactsService {
  final Dio _dio;

  Future<ArtifactResponse> createArtifact({
    required String title,
    required String contentType,
    required String content,
    String? language,
    String visibility = 'public',
    String? password,
    int? expiresInDays,
  }) async {
    final response = await _dio.post(
      '/api/v1/artifacts',
      data: {
        'title': title,
        'content_type': contentType,
        'content': base64Encode(utf8.encode(content)),
        'language': language,
        'visibility': visibility,
        'password': password,
        'expires_in_days': expiresInDays,
      },
    );

    return ArtifactResponse.fromJson(response.data);
  }
}
```

### 11.2 分享按钮 UI
```dart
// lib/widgets/share_artifact_button.dart
class ShareArtifactButton extends StatelessWidget {
  final String content;
  final String contentType;

  @override
  Widget build(BuildContext context) {
    return IconButton(
      icon: Icon(Icons.share_rounded),
      onPressed: () => _showShareDialog(context),
    );
  }

  void _showShareDialog(BuildContext context) {
    showDialog(
      context: context,
      builder: (ctx) => ShareArtifactDialog(
        content: content,
        contentType: contentType,
      ),
    );
  }
}
```

---

## 12. 成本估算

### 12.1 基础设施成本（月度）
- **服务器**: $20-50 (2 vCPU, 4GB RAM)
- **数据库**: $15-30 (PostgreSQL managed)
- **对象存储**: $5-20 (100GB, 1TB 流量)
- **CDN**: $10-50 (1TB 流量)
- **总计**: ~$50-150/月

### 12.2 扩展成本
- 每增加 10,000 活跃用户: +$50-100/月
- 每增加 1TB 存储: +$20/月
- 每增加 10TB CDN 流量: +$100/月

---

## 13. 路线图

### Phase 1: MVP (4-6 周)
- [ ] 基础 API 实现
- [ ] PostgreSQL 数据库设置
- [ ] S3/MinIO 集成
- [ ] 基础分享页面
- [ ] Flutter 客户端集成

### Phase 2: 增强功能 (4-6 周)
- [ ] 密码保护
- [ ] 访问统计
- [ ] 版本管理
- [ ] 嵌入模式
- [ ] 自定义域名

### Phase 3: 高级功能 (6-8 周)
- [ ] 协作编辑
- [ ] 评论系统
- [ ] 收藏/点赞
- [ ] 搜索功能
- [ ] API 速率限制优化

---

## 14. 参考资源

- [Claude Artifacts](https://www.anthropic.com/news/artifacts)
- [CodePen API Documentation](https://blog.codepen.io/documentation/api/)
- [GitHub Gist API](https://docs.github.com/en/rest/gists)
- [Pastebin API](https://pastebin.com/doc_api)

---

## 附录 A: 示例代码

### A.1 短链接生成算法
```javascript
const crypto = require('crypto');

function generateShortId(length = 12) {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const bytes = crypto.randomBytes(length);
  let result = '';

  for (let i = 0; i < length; i++) {
    result += chars[bytes[i] % chars.length];
  }

  return result;
}
```

### A.2 内容 Sanitization
```javascript
const DOMPurify = require('isomorphic-dompurify');

function sanitizeHTML(html) {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'u', 'h1', 'h2', 'h3', 'ul', 'ol', 'li', 'code', 'pre'],
    ALLOWED_ATTR: ['class', 'id'],
    ALLOW_DATA_ATTR: false,
  });
}
```

---

**文档版本**: 1.0
**最后更新**: 2026-03-14
**维护者**: NexAI Development Team
