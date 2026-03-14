# Flutter 客户端 Artifacts 分享功能集成文档

## 概述

本文档说明如何在 Flutter 应用中集成 NexAI Artifacts 分享功能，实现内容的创建、获取、管理和分享。

## API 基础信息

- **Base URL**: `https://api.951100.xyz/api/nexai`
- **认证方式**: Bearer Token (JWT)
- **Content-Type**: `application/json`

## 1. 数据模型

### Artifact 模型

```dart
class Artifact {
  final String id;
  final String shortId;
  final String title;
  final String contentType; // html, code, markdown, mermaid
  final String? language;
  final String content;
  final String? description;
  final List<String> tags;
  final String visibility; // public, private, password
  final int viewCount;
  final DateTime createdAt;
  final DateTime? expiresAt;

  Artifact({
    required this.id,
    required this.shortId,
    required this.title,
    required this.contentType,
    this.language,
    required this.content,
    this.description,
    required this.tags,
    required this.visibility,
    required this.viewCount,
    required this.createdAt,
    this.expiresAt,
  });

  factory Artifact.fromJson(Map<String, dynamic> json) {
    return Artifact(
      id: json['_id'] ?? json['id'],
      shortId: json['shortId'],
      title: json['title'],
      contentType: json['contentType'],
      language: json['language'],
      content: json['content'],
      description: json['description'],
      tags: List<String>.from(json['tags'] ?? []),
      visibility: json['visibility'],
      viewCount: json['viewCount'] ?? 0,
      createdAt: DateTime.parse(json['createdAt']),
      expiresAt: json['expiresAt'] != null
          ? DateTime.parse(json['expiresAt'])
          : null,
    );
  }
}

class ArtifactCreateResponse {
  final String id;
  final String shortId;
  final String shareUrl;
  final String embedUrl;
  final DateTime createdAt;
  final DateTime? expiresAt;

  ArtifactCreateResponse({
    required this.id,
    required this.shortId,
    required this.shareUrl,
    required this.embedUrl,
    required this.createdAt,
    this.expiresAt,
  });

  factory ArtifactCreateResponse.fromJson(Map<String, dynamic> json) {
    return ArtifactCreateResponse(
      id: json['id'],
      shortId: json['shortId'],
      shareUrl: json['shareUrl'],
      embedUrl: json['embedUrl'],
      createdAt: DateTime.parse(json['createdAt']),
      expiresAt: json['expiresAt'] != null
          ? DateTime.parse(json['expiresAt'])
          : null,
    );
  }
}
```

## 2. API 服务类

### ArtifactsService

```dart
import 'dart:convert';
import 'package:http/http.dart' as http;

class ArtifactsService {
  final String baseUrl;
  final String? accessToken;

  ArtifactsService({
    required this.baseUrl,
    this.accessToken,
  });

  Map<String, String> get _headers {
    final headers = {
      'Content-Type': 'application/json',
    };
    if (accessToken != null) {
      headers['Authorization'] = 'Bearer $accessToken';
    }
    return headers;
  }

  /// 创建 Artifact
  ///
  /// [title] 标题
  /// [contentType] 内容类型: html, code, markdown, mermaid
  /// [content] 内容（会自动进行 base64 编码）
  /// [language] 编程语言（当 contentType 为 code 时）
  /// [visibility] 可见性: public, private, password
  /// [password] 密码（当 visibility 为 password 时）
  /// [description] 描述
  /// [tags] 标签列表
  /// [expiresInDays] 过期天数
  Future<ArtifactCreateResponse> createArtifact({
    required String title,
    required String contentType,
    required String content,
    String? language,
    String visibility = 'public',
    String? password,
    String? description,
    List<String>? tags,
    int? expiresInDays,
  }) async {
    // Base64 编码内容
    final encodedContent = base64Encode(utf8.encode(content));

    final body = {
      'title': title,
      'content_type': contentType,
      'content': encodedContent,
      if (language != null) 'language': language,
      'visibility': visibility,
      if (password != null) 'password': password,
      if (description != null) 'description': description,
      if (tags != null) 'tags': tags,
      if (expiresInDays != null) 'expires_in_days': expiresInDays,
    };

    final response = await http.post(
      Uri.parse('$baseUrl/artifacts'),
      headers: _headers,
      body: jsonEncode(body),
    );

    if (response.statusCode == 201) {
      final data = jsonDecode(response.body);
      return ArtifactCreateResponse.fromJson(data['data']);
    } else {
      final error = jsonDecode(response.body);
      throw Exception(error['error'] ?? 'Failed to create artifact');
    }
  }

  /// 获取 Artifact
  ///
  /// [shortId] 短链接 ID
  /// [password] 密码（如果需要）
  Future<Artifact> getArtifact(String shortId, {String? password}) async {
    final headers = Map<String, String>.from(_headers);
    if (password != null) {
      headers['X-Password'] = password;
    }

    final response = await http.get(
      Uri.parse('$baseUrl/artifacts/$shortId'),
      headers: headers,
    );

    if (response.statusCode == 200) {
      final data = jsonDecode(response.body);
      return Artifact.fromJson(data['data']);
    } else if (response.statusCode == 403) {
      final error = jsonDecode(response.body);
      if (error['error'] == 'password_required') {
        throw PasswordRequiredException();
      } else if (error['error'] == 'invalid_password') {
        throw InvalidPasswordException();
      }
      throw Exception(error['message']);
    } else if (response.statusCode == 404) {
      throw ArtifactNotFoundException();
    } else {
      final error = jsonDecode(response.body);
      throw Exception(error['error'] ?? 'Failed to get artifact');
    }
  }

  /// 更新 Artifact
  ///
  /// [shortId] 短链接 ID
  /// [title] 新标题
  /// [visibility] 新可见性
  /// [password] 新密码
  /// [description] 新描述
  /// [tags] 新标签
  /// [expiresInDays] 新过期天数
  Future<void> updateArtifact(
    String shortId, {
    String? title,
    String? visibility,
    String? password,
    String? description,
    List<String>? tags,
    int? expiresInDays,
  }) async {
    final body = <String, dynamic>{};
    if (title != null) body['title'] = title;
    if (visibility != null) body['visibility'] = visibility;
    if (password != null) body['password'] = password;
    if (description != null) body['description'] = description;
    if (tags != null) body['tags'] = tags;
    if (expiresInDays != null) body['expires_in_days'] = expiresInDays;

    final response = await http.patch(
      Uri.parse('$baseUrl/artifacts/$shortId'),
      headers: _headers,
      body: jsonEncode(body),
    );

    if (response.statusCode != 200) {
      final error = jsonDecode(response.body);
      throw Exception(error['error'] ?? 'Failed to update artifact');
    }
  }

  /// 删除 Artifact
  Future<void> deleteArtifact(String shortId) async {
    final response = await http.delete(
      Uri.parse('$baseUrl/artifacts/$shortId'),
      headers: _headers,
    );

    if (response.statusCode != 204) {
      final error = jsonDecode(response.body);
      throw Exception(error['error'] ?? 'Failed to delete artifact');
    }
  }

  /// 获取用户的 Artifacts 列表
  ///
  /// [page] 页码（从 1 开始）
  /// [limit] 每页数量
  /// [sort] 排序字段
  /// [order] 排序方向: asc, desc
  Future<ArtifactListResponse> listArtifacts({
    int page = 1,
    int limit = 20,
    String sort = 'createdAt',
    String order = 'desc',
  }) async {
    final queryParams = {
      'page': page.toString(),
      'limit': limit.toString(),
      'sort': sort,
      'order': order,
    };

    final uri = Uri.parse('$baseUrl/artifacts').replace(
      queryParameters: queryParams,
    );

    final response = await http.get(uri, headers: _headers);

    if (response.statusCode == 200) {
      final data = jsonDecode(response.body);
      return ArtifactListResponse.fromJson(data['data']);
    } else {
      final error = jsonDecode(response.body);
      throw Exception(error['error'] ?? 'Failed to list artifacts');
    }
  }

  /// 记录访问
  Future<void> recordView(String shortId) async {
    await http.post(
      Uri.parse('$baseUrl/artifacts/$shortId/view'),
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode({
        'referer': '',
        'user_agent': 'Flutter App',
      }),
    );
    // 忽略错误
  }
}

// 自定义异常
class PasswordRequiredException implements Exception {}
class InvalidPasswordException implements Exception {}
class ArtifactNotFoundException implements Exception {}

// 列表响应模型
class ArtifactListResponse {
  final List<ArtifactSummary> artifacts;
  final Pagination pagination;

  ArtifactListResponse({
    required this.artifacts,
    required this.pagination,
  });

  factory ArtifactListResponse.fromJson(Map<String, dynamic> json) {
    return ArtifactListResponse(
      artifacts: (json['artifacts'] as List)
          .map((e) => ArtifactSummary.fromJson(e))
          .toList(),
      pagination: Pagination.fromJson(json['pagination']),
    );
  }
}

class ArtifactSummary {
  final String id;
  final String shortId;
  final String title;
  final String contentType;
  final String visibility;
  final int viewCount;
  final DateTime createdAt;

  ArtifactSummary({
    required this.id,
    required this.shortId,
    required this.title,
    required this.contentType,
    required this.visibility,
    required this.viewCount,
    required this.createdAt,
  });

  factory ArtifactSummary.fromJson(Map<String, dynamic> json) {
    return ArtifactSummary(
      id: json['_id'] ?? json['id'],
      shortId: json['shortId'],
      title: json['title'],
      contentType: json['contentType'],
      visibility: json['visibility'],
      viewCount: json['viewCount'] ?? 0,
      createdAt: DateTime.parse(json['createdAt']),
    );
  }
}

class Pagination {
  final int page;
  final int limit;
  final int total;
  final int totalPages;

  Pagination({
    required this.page,
    required this.limit,
    required this.total,
    required this.totalPages,
  });

  factory Pagination.fromJson(Map<String, dynamic> json) {
    return Pagination(
      page: json['page'],
      limit: json['limit'],
      total: json['total'],
      totalPages: json['totalPages'],
    );
  }
}
```

## 3. 使用示例

### 3.1 创建代码分享

```dart
final service = ArtifactsService(
  baseUrl: 'https://your-domain.com/api/nexai',
  accessToken: 'your_jwt_token',
);

try {
  final response = await service.createArtifact(
    title: 'React Counter Component',
    contentType: 'code',
    language: 'javascript',
    content: '''
function Counter() {
  const [count, setCount] = useState(0);
  return (
    <div>
      <p>Count: {count}</p>
      <button onClick={() => setCount(count + 1)}>+</button>
    </div>
  );
}
''',
    visibility: 'public',
    description: 'A simple React counter component',
    tags: ['react', 'component', 'tutorial'],
    expiresInDays: 30,
  );

  print('分享链接: ${response.shareUrl}');
  print('短链接 ID: ${response.shortId}');
} catch (e) {
  print('创建失败: $e');
}
```

### 3.2 获取并显示分享内容

```dart
try {
  final artifact = await service.getArtifact('abc123xyz');

  print('标题: ${artifact.title}');
  print('类型: ${artifact.contentType}');
  print('查看次数: ${artifact.viewCount}');
  print('内容: ${artifact.content}');

  // 记录访问
  await service.recordView('abc123xyz');
} on PasswordRequiredException {
  // 需要密码
  final password = await showPasswordDialog();
  final artifact = await service.getArtifact('abc123xyz', password: password);
} on InvalidPasswordException {
  print('密码错误');
} on ArtifactNotFoundException {
  print('Artifact 不存在或已过期');
} catch (e) {
  print('获取失败: $e');
}
```

### 3.3 获取用户的分享列表

```dart
try {
  final response = await service.listArtifacts(
    page: 1,
    limit: 20,
    sort: 'createdAt',
    order: 'desc',
  );

  print('总数: ${response.pagination.total}');
  for (final artifact in response.artifacts) {
    print('${artifact.title} - ${artifact.viewCount} 次查看');
  }
} catch (e) {
  print('获取列表失败: $e');
}
```

### 3.4 更新分享设置

```dart
try {
  await service.updateArtifact(
    'abc123xyz',
    visibility: 'password',
    password: 'my_secret_password',
    expiresInDays: 60,
  );
  print('更新成功');
} catch (e) {
  print('更新失败: $e');
}
```

### 3.5 删除分享

```dart
try {
  await service.deleteArtifact('abc123xyz');
  print('删除成功');
} catch (e) {
  print('删除失败: $e');
}
```

## 4. UI 组件示例

### 4.1 分享按钮

```dart
class ShareArtifactButton extends StatelessWidget {
  final String content;
  final String contentType;
  final String? language;

  const ShareArtifactButton({
    Key? key,
    required this.content,
    required this.contentType,
    this.language,
  }) : super(key: key);

  @override
  Widget build(BuildContext context) {
    return IconButton(
      icon: Icon(Icons.share),
      onPressed: () => _showShareDialog(context),
    );
  }

  void _showShareDialog(BuildContext context) {
    showDialog(
      context: context,
      builder: (ctx) => ShareArtifactDialog(
        content: content,
        contentType: contentType,
        language: language,
      ),
    );
  }
}
```

### 4.2 分享对话框

```dart
class ShareArtifactDialog extends StatefulWidget {
  final String content;
  final String contentType;
  final String? language;

  const ShareArtifactDialog({
    Key? key,
    required this.content,
    required this.contentType,
    this.language,
  }) : super(key: key);

  @override
  _ShareArtifactDialogState createState() => _ShareArtifactDialogState();
}

class _ShareArtifactDialogState extends State<ShareArtifactDialog> {
  final _titleController = TextEditingController();
  final _descriptionController = TextEditingController();
  String _visibility = 'public';
  String? _password;
  int? _expiresInDays = 30;
  bool _loading = false;
  String? _shareUrl;

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: Text('分享内容'),
      content: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextField(
              controller: _titleController,
              decoration: InputDecoration(labelText: '标题'),
            ),
            SizedBox(height: 16),
            TextField(
              controller: _descriptionController,
              decoration: InputDecoration(labelText: '描述（可选）'),
              maxLines: 3,
            ),
            SizedBox(height: 16),
            DropdownButtonFormField<String>(
              value: _visibility,
              decoration: InputDecoration(labelText: '可见性'),
              items: [
                DropdownMenuItem(value: 'public', child: Text('公开')),
                DropdownMenuItem(value: 'private', child: Text('私密')),
                DropdownMenuItem(value: 'password', child: Text('密码保护')),
              ],
              onChanged: (value) {
                setState(() {
                  _visibility = value!;
                });
              },
            ),
            if (_visibility == 'password') ...[
              SizedBox(height: 16),
              TextField(
                onChanged: (value) => _password = value,
                decoration: InputDecoration(labelText: '密码'),
                obscureText: true,
              ),
            ],
            SizedBox(height: 16),
            TextField(
              decoration: InputDecoration(labelText: '过期天数（可选）'),
              keyboardType: TextInputType.number,
              onChanged: (value) {
                _expiresInDays = int.tryParse(value);
              },
            ),
            if (_shareUrl != null) ...[
              SizedBox(height: 16),
              SelectableText(
                _shareUrl!,
                style: TextStyle(color: Colors.blue),
              ),
              SizedBox(height: 8),
              ElevatedButton.icon(
                icon: Icon(Icons.copy),
                label: Text('复制链接'),
                onPressed: () {
                  Clipboard.setData(ClipboardData(text: _shareUrl!));
                  ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(content: Text('已复制到剪贴板')),
                  );
                },
              ),
            ],
          ],
        ),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(context),
          child: Text('取消'),
        ),
        if (_shareUrl == null)
          ElevatedButton(
            onPressed: _loading ? null : _createArtifact,
            child: _loading
                ? SizedBox(
                    width: 20,
                    height: 20,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : Text('创建分享'),
          ),
      ],
    );
  }

  Future<void> _createArtifact() async {
    if (_titleController.text.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('请输入标题')),
      );
      return;
    }

    setState(() {
      _loading = true;
    });

    try {
      final service = ArtifactsService(
        baseUrl: 'https://your-domain.com/api/nexai',
        accessToken: 'your_jwt_token', // 从存储中获取
      );

      final response = await service.createArtifact(
        title: _titleController.text,
        contentType: widget.contentType,
        content: widget.content,
        language: widget.language,
        visibility: _visibility,
        password: _password,
        description: _descriptionController.text.isEmpty
            ? null
            : _descriptionController.text,
        expiresInDays: _expiresInDays,
      );

      setState(() {
        _shareUrl = response.shareUrl;
        _loading = false;
      });
    } catch (e) {
      setState(() {
        _loading = false;
      });
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('创建失败: $e')),
      );
    }
  }

  @override
  void dispose() {
    _titleController.dispose();
    _descriptionController.dispose();
    super.dispose();
  }
}
```

## 5. 错误处理

### 常见错误码

| 状态码 | 错误类型 | 说明 |
|--------|---------|------|
| 400 | Bad Request | 请求参数错误 |
| 401 | Unauthorized | 未授权（需要登录） |
| 403 | Forbidden | 需要密码或密码错误 |
| 404 | Not Found | Artifact 不存在或已过期 |
| 429 | Too Many Requests | 请求过于频繁 |
| 500 | Internal Server Error | 服务器错误 |

### 错误响应格式

```json
{
  "success": false,
  "error": "error_code",
  "message": "错误描述"
}
```

## 6. 最佳实践

1. **Token 管理**: 使用 `flutter_secure_storage` 安全存储 JWT token
2. **错误处理**: 为所有 API 调用添加 try-catch
3. **加载状态**: 显示加载指示器提升用户体验
4. **缓存**: 对列表数据进行本地缓存
5. **重试机制**: 网络错误时实现自动重试
6. **内容编码**: 确保内容正确进行 base64 编码
7. **密码保护**: 敏感内容使用密码保护
8. **过期时间**: 合理设置内容过期时间

## 7. 依赖包

在 `pubspec.yaml` 中添加：

```yaml
dependencies:
  http: ^1.1.0
  flutter_secure_storage: ^9.0.0
```

## 8. 完整示例项目结构

```
lib/
├── models/
│   ├── artifact.dart
│   └── artifact_list_response.dart
├── services/
│   └── artifacts_service.dart
├── widgets/
│   ├── share_artifact_button.dart
│   └── share_artifact_dialog.dart
└── screens/
    ├── artifact_list_screen.dart
    └── artifact_detail_screen.dart
```

## 9. 注意事项

1. **认证**: 所有需要认证的接口必须在 Header 中携带 `Authorization: Bearer <token>`
2. **内容编码**: 创建 Artifact 时，content 字段必须是 base64 编码
3. **密码保护**: 获取密码保护的 Artifact 时，需要在 Header 中添加 `X-Password`
4. **限流**: 注意 API 限流规则，避免请求过于频繁
5. **过期处理**: 已过期的 Artifact 会返回 404 错误

## 10. 技术支持

如有问题，请联系：
- GitHub Issues: https://github.com/your-repo/issues
- Email: support@your-domain.com
