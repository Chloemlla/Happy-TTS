# TurboScribe 私有接口研究文档（科研对照用）

> **状态**：基于 2026-07-21 前端 JS 逆向 + 浏览器抓包 + 有限鉴权探测整理  
> **用途**：科研项目功能/协议对照，**非官方公开 API**  
> **合规**：请仅在你本人账号、授权科研场景下使用；勿传播会话 Cookie / access-token；勿对目标做高频压测  
> **局限**：TurboScribe 无公开 REST/OpenAPI。业务操作走 **HTMX 不透明路径 + 服务端渲染 HTML**，路径 token 随构建/会话变化，不能当稳定公开 SDK 使用

相关中间产物：

- `docs/research/turboscribe-probe-results.md` — 基础设施探测
- `docs/research/turboscribe-cdn-url-analysis.md` — 媒体 CDN URL 分析
- `docs/research/turboscribe-js/` — 抓到的 HTML/HTMX/runtime 样本（含敏感 Cookie 的原始 hdr 请勿外传）

---

## 1. 总体架构

TurboScribe 不是典型的 `/api/v1/...` JSON REST，而是 **Leif Erikson Ventures 自研 full-stack 前端**（CLJS 编译的 `runtime.js` + HTMX + Turbolinks）：

```
Browser
  │  Cookie 会话鉴权
  ├─ HTML 页面导航 (Turbolinks XHR, header: x-lev-xhr / x-turbolinks-loaded)
  ├─ POST /_htmx/{opaque}          ← 业务动作（创建文件夹/导出/重命名/删除…）
  ├─ GET  /_content/htmx/{opaque}  ← 片段 HTML（转录正文、懒加载 UI）
  ├─ POST /_levscript/json         ← 客户端调用/遥测日志（transit-like JSON）
  ├─ POST /_fp                     ← 浏览器指纹上报
  ├─ Dropzone 预签名 PUT 上传      ← 原始媒体
  └─ GET  serve.leiferiksonventures.com/{sig}/{token}/{id}.mp3  ← 签名媒体流
```

| 层 | 域名 | 角色 |
|----|------|------|
| App | `turboscribe.ai` | 页面、HTMX、内容分发、鉴权 Cookie |
| Content twin | `content.leiferiksonventures.com` | 静态/内容（runtime 中引用） |
| Media | `serve.leiferiksonventures.com` | 签名音频/视频（Cloudflare + S3） |
| Analytics host | `{hash}.turboscribe.ai` | GA 代理等 |

构建指纹（样本）：

- `build-id`: `88cfdeda-acbb-4605-9cea-a6d188d37d51`
- `revision-id`: `64f83ccc5bac277603b4e51b1c4dc348db049410`
- 主包：`/_content/versioned/{build-id}/js/apps/web/runtime.js`

---

## 2. 鉴权与会话

### 2.1 关键 Cookie（首方）

| Cookie | 作用（推断） | 备注 |
|--------|--------------|------|
| `access-token` | 登录访问令牌 | **核心鉴权**，短字符串 |
| `session-secret` | 会话密钥 | 与 CSRF/签名相关 |
| `device-token` | 设备标识 | 长期 |
| `fingerprint` | 浏览器指纹摘要 | 与 `/_fp` 上报配合 |
| `snowflake` | 客户端实例 id | base64url |
| `lev` | 产品/平台标记 | 样本为 `1` |
| `js` / `webp` / `avif` | 能力探测 | 非鉴权 |
| `screen-width` / `screen-height` / `window-*` / `device-pixel-ratio` / `time-zone` | 客户端环境 | 非鉴权 |
| `i18n-activated-languages` | 语言偏好 | 如 `zh-CN,en` |
| `hwm-*` | 短时 WAF/会话边车 | 约 5s 过期，HttpOnly Secure |
| 第三方 | `_ga*` / `_fbp` / `_twpid` 等 | 分析像素，业务鉴权不依赖 |

响应头常见：

- `x-viewer: {numeric_id}` — 当前登录用户/视图 id（样本：`6124895493344691219`）
- `x-pod` / `x-pid` / `x-rt` / `x-tid` — K8s 源站调试信息
- `Set-Cookie: hwm-…` — 每次动态响应刷新

### 2.2 业务请求推荐头

```http
Cookie: access-token=…; session-secret=…; device-token=…; fingerprint=…; snowflake=…; lev=1; js=1; …
Origin: https://turboscribe.ai
Referer: https://turboscribe.ai/zh-CN/dashboard
User-Agent: Mozilla/5.0 …
x-lev-xhr;
x-turbolinks-loaded;
```

说明：

- `x-lev-xhr` 与 `x-turbolinks-loaded` 在抓包中为**无值头**（`Header;` 形式），runtime 会给同源 XHR 自动注入 `x-lev-xhr`。
- 完整 document 导航部分路径在本机自动化环境会被 Cloudflare **403 Managed Challenge**；**同源 HTMX POST** 在带 Cookie 时更易 200。
- **不要**把 Cookie 提交进 git；下方示例一律用占位符。

### 2.3 最小鉴权 curl 模板

```bash
export TS_COOKIE='access-token=REDACTED; session-secret=REDACTED; device-token=REDACTED; fingerprint=REDACTED; snowflake=REDACTED; lev=1; js=1; i18n-activated-languages=zh-CN%2Cen'

curl -sS 'https://turboscribe.ai/_htmx/OPAQUE' \
  -X POST \
  -H "Cookie: $TS_COOKIE" \
  -H 'Content-Type: application/json' \
  -H 'Content-Length: 0' \
  -H 'Origin: https://turboscribe.ai' \
  -H 'Referer: https://turboscribe.ai/zh-CN/dashboard' \
  -H 'x-lev-xhr;' \
  -H 'x-turbolinks-loaded;' \
  -H 'User-Agent: Mozilla/5.0 …'
```

---

## 3. 协议层

### 3.1 HTMX 动作：`POST /_htmx/{opaque}`

- **方法**：多数 `POST`；部分懒加载为 `GET`
- **路径**：`/{opaque}` 为 **压缩/签名的服务器端 handler 引用**，不可手写语义；从页面 `hx-post` / `hx-get` 读取
- **Content-Type**：
  - 空 body 触发：`application/json` + `Content-Length: 0`
  - 表单提交：`application/x-www-form-urlencoded` 或 multipart
- **响应**：`text/html; charset=utf-8` 片段；可能带：
  - `hx-swap-oob` 脚本
  - `hx-noswap:` 头
  - `application/json-rpc` 内联脚本
- **鉴权**：需要 Cookie；成功响应常带 `x-viewer`

**不透明路径中嵌有 base64 业务键**（可解码理解意图）：

| 路径中 base64 片段 | 解码 |
|--------------------|------|
| `bWVkaWEtaWQ` | `media-id` |
| `bWVkaWEtaWRz` | `media-ids` |
| `YWJicmV2aWF0ZWQ` | `abbreviated` |
| `ZWRpdGluZw` | `editing` |
| `Zm9sZGVyLWlk` | `folder-id` |
| `ZHJvcHpvbmUtaWQ` | `dropzone-id` |
| `d2luZG93LWRyb3B6b25l` | `window-dropzone` |
| `YXV0b21hdGljYWxseS1jcmVhdGUtYWNjb3VudD8` | `automatically-create-account?` |
| `aW50ZXJ2YWw` / `bW9udGhseQ` | `interval` / `monthly`（计费） |
| `bnVtYmVyLW9mLXNlYXRz` | `number-of-seats` |
| `Y291cG9u` | `coupon` |

查询参数（部分动作）：

| 参数 | 含义 |
|------|------|
| `vid` | viewer id，与 `x-viewer` 一致 |
| `e` | 过期时间戳（毫秒级，签名有效期） |
| `s` | 请求签名 |
| `language` | 如 `zh-CN` |
| `etag` | 片段缓存校验 |
| `_pf` | 预取/页面指纹 |

### 3.2 内容片段：`GET /_content/htmx/{opaque}`

样本（转录正文，可缓存）：

```http
GET /_content/htmx/BlRs0QAEkpMBzQNtlQcAkwjOB6LA3s5tQAAAAcKSqG1lZGlhLWlkqGVkaXRpbmc_?vid=…&language=zh-CN&etag=…&e=…&s=… HTTP/1.1
Host: turboscribe.ai
Cookie: …
x-lev-xhr;
```

- 响应：`200 text/html`，含带时间戳的转录 span
- 缓存：`Cache-Control: public,max-age=31557600,…immutable` + `cf-cache-status: HIT`
- DOM 结构要点：
  - `#transcript-{mediaId}`
  - `#audio-{mediaId}`
  - `data-start` / `data-end`（毫秒）
  - `data-timestamp` 文本如 `(0:00)`
  - 内联 `application/json-rpc` 绑定滚动/时间戳控件

### 3.3 客户端 RPC 脚本：`application/json-rpc`

SSR 与 HTMX 响应中大量：

```html
<script type="application/json-rpc">[[0,668,[9,0],[9,1],[7,2,true,3,[9,4]]],["transcript-…","audio-…",…]]</script>
```

- runtime 扫描 `script[type='application/json-rpc']`，解码后 `invoke_fn_id` 注册到 `c$rpc$_registered_rpcs`
- **不是** 标准 JSON-RPC 2.0 over HTTP；是 **内联 bootstrap 指令**

### 3.4 调用日志：`POST /_levscript/json`

```http
POST /_levscript/json HTTP/1.1
Content-Type: text/plain
Origin: https://turboscribe.ai
Cookie: …
```

Body 为 transit-like 嵌套数组，含：

- `invocations`
- `title` / `url` / `referrer` / `counter`
- `build-id` / `process-id` / `revision-id`
- 偶发浏览器 `warning`（如 Meta Pixel 参数错误）

用途：前端运行时遥测 / 错误回传，**不是**转录业务 API。

### 3.5 指纹：`POST /_fp`

```http
POST /_fp
Content-Type: text/plain
Content-Encoding: gzip
```

Body：`{"thumbmark":{ audio, canvas, fonts, hardware, locales, math, permissions, plugins, screen, system, webgl }}`  
对应 Cookie `fingerprint` 更新。

### 3.6 其它首方端点

| 路径 | 说明 |
|------|------|
| `POST /_cloudflare_turnstile_verify/` | Turnstile 校验（runtime 引用） |
| `POST /_googleonetaplogin/` | Google One Tap |
| `GET /_content/versioned/{build}/…` | 版本化 JS/CSS |
| `GET /_content/i18n/{build}/{lang}/translations.js` | 翻译 |
| `GET /_content/hashed/{hash}.{ext}?cr=1&s=…` | 签名静态资源 |
| `GET /_content/id/{mediaId}.mp3?s=…` | **同源**签名音频直链（下载按钮） |
| `GET /_content/thirdparty/…` | 代理的 CDN 依赖（plyr、dropzone、turbolinks…） |
| `GET /_content/{f,g,l,t}lowntown.js` | 混淆辅助脚本 |
| `GET /robots.txt` / `GET /__sitemap.xml` | 公开站点地图 |

---

## 4. 功能对照：页面路由

统一前缀：`/{locale}/…`，locale 示例 `zh-CN`、`en`、`ja`…

| 功能 | 路由 | 方法 | 说明 |
|------|------|------|------|
| 首页/上传 | `/{locale}/` | GET | 含 dropzone + 高级设置表单 |
| 登录/注册 | `/{locale}/login` `/{locale}/signup` | GET | |
| 仪表盘 | `/{locale}/dashboard` | GET | 最新文件列表 |
| 文件夹 | `/{locale}/dashboard/folder/{folderId}` | GET | |
| 未分类 | `/{locale}/dashboard/uncategorized` | GET | |
| 转录详情 | `/{locale}/transcript/{mediaId}/{slug}` | GET | slug 为标题拼音化 |
| 账户 | `/{locale}/account` | GET | |
| 支持/隐私/条款 | `/{locale}/support` `privacy` `terms` | GET | |
| 定价/博客 | `/{locale}/` 锚点 `#pricing` / `blog` | GET | |
| 媒体转换工具 | `/{locale}/convert/*` `/{locale}/u/tools/*` | GET | 营销/转换工具页 |
| 下载器 | `/{locale}/downloader` | GET | |

Turbolinks 导航时：

```http
GET /zh-CN/dashboard HTTP/1.1
Accept: text/html, application/xhtml+xml
turbolinks-referrer: https://turboscribe.ai/zh-CN/transcript/…
x-lev-xhr;
x-turbolinks-loaded;
```

可选预取：

```http
GET /zh-CN/transcript/{id}/{slug}?_pf={hash}
x-lev-prefetched;
x-lev-xhr;
```

---

## 5. 功能对照：业务动作（HTMX）

下列 opaque 为 **2026-07-21 样本**，会过期/换 build 失效，**只作协议形状参考**。

### 5.1 新建文件夹

1. 打开弹窗：

```http
POST /_htmx/9Lt35AAEkZMBzQPAwA
Content-Type: application/json
Content-Length: 0
```

响应 HTML 含：

```html
<form hx-post="/_htmx/OIKDSAAEkZMBzQKvkQc" hx-page-load-indicator="true">
  <input name="name" required …/>
  <button type="submit">创建文件夹</button>
</form>
```

2. 提交：

```http
POST /_htmx/OIKDSAAEkZMBzQKvkQc
Content-Type: application/x-www-form-urlencoded

name={folderName}
```

成功时响应可能 `hx-swap-oob` 注入整页 HTML，并导航到：

`/{locale}/dashboard/folder/{newFolderId}`

### 5.2 文件菜单（右键/更多 — `media-id` + `editing`）

`POST /_htmx/…media-id…abbreviated…editing…?vid=&e=&s=`

菜单项（中文 UI）：

| UI | 行为 | 协议形态 |
|----|------|----------|
| **打开转录** | 导航 | `GET /{locale}/transcript/{id}/{slug}` |
| **导出转录文本** | 弹窗懒加载 | `hx-post /_htmx/…media-ids…` |
| **分享转录** | 弹窗懒加载 | `hx-post /_htmx/…media-id…` |
| **下载音频** | 直链 | `GET /_content/id/{mediaId}.mp3?s={sig}` + `download=` 文件名 |
| **重命名文件** | 弹窗懒加载 | `hx-post /_htmx/…media-id…` |
| **删除文件** | 确认后 POST | `hx-post /_htmx/…media-id…` |

样本下载链：

```http
GET /_content/id/6296032279188486328.mp3?s=WW6dvb996AbChlrv5DHh2AS1KCbYq2-KYvc1jKsSa-4
```

实际播放常跳转/镜像到：

```text
https://serve.leiferiksonventures.com/{pathSeg}/{longToken}/{mediaId}.mp3
```

### 5.3 导出转录

触发后 HTMX 加载导出面板（格式在产品文案/站点中声明）：

| 格式 | 用途 |
|------|------|
| TXT | 纯文本 |
| DOCX | Word |
| PDF | 文档 |
| SRT | 字幕 |
| VTT | WebVTT 字幕 |

导出 UI 路径含 `media-ids`（复数），支持批量语义。

### 5.4 分享转录

弹窗 HTMX（`media-id`），生成分享链接/权限（细节随面板 HTML 下发）。

### 5.5 重命名 / 删除

均为 `POST /_htmx/…` + 表单字段（名称/确认），响应 HTML 更新列表。

### 5.6 主业务：上传并转录（详细请求格式）

这是 TurboScribe **核心业务链路**。UI 文案对应：

> 转录文件 · 音频/视频文件 · 音频语言 · 转录模式 · 说话人识别及更多设置

整条链路分 **三步**：本地选文件 → 预签名 PUT 上传媒体 → 带设置表单 `POST /_htmx/...` 启动转录。

---

#### 5.6.1 端到端时序

```
用户选择/拖放 音频|视频
        │
        ▼
[1] Dropzone 本地校验
    · MIME: audio/* / video/*
    · 扩展名白名单（见下）
    · require-audio-track / require-duration
        │
        ▼
[2] 申请预签名 URL（runtime: dropzone$signed_upload_urls）
    · 服务端返回可 PUT 的 upload URL + handle
        │
        ▼
[3] PUT {binary body} → 预签名存储 URL
    · method: "put"
    · binaryBody: true
    · 成功后 handle 写入隐藏域 json:handles
        │
        ▼
[4] 用户确认：音频语言 / 转录模式 / 说话人 / 更多设置
        │
        ▼
[5] POST /_htmx/{opaque}   （主表单提交，启动转录）
    Content-Type: application/x-www-form-urlencoded
    Body: json:handles + language + whisper-model + bool:* + …
        │
        ▼
[6] 服务端创建 media 任务 → 仪表盘列表出现「处理中」
        │
        ▼
[7] 完成后：
    · GET /{locale}/transcript/{mediaId}/{slug}
    · GET /_content/htmx/…  拉带时间戳正文
    · GET serve…/{token}/{mediaId}.mp3  播音频
```

首页主表单（SSR 实测）形态：

```html
<form
  hx-post="/_htmx/{opaque-folder-id-window-dropzone-automatically-create-account}"
  hx-page-load-indicator="true">

  <!-- ① 已上传文件句柄（Dropzone 成功后写入，required） -->
  <input name="json:handles" required autocomplete="off" …/>

  <!-- ② 音频语言 -->
  <select name="language" class="dui3-select …">…</select>

  <!-- ③ 转录模式（三选一 radio） -->
  <input type="radio" name="whisper-model" value="base"/>     <!-- Cheetah 猎豹 -->
  <input type="radio" name="whisper-model" value="small"/>    <!-- Dolphin 海豚 -->
  <input type="radio" name="whisper-model" value="large-v2" checked/> <!-- Whale 鲸鱼 默认 -->

  <!-- ④ 说话人识别及更多（高级设置） -->
  <input type="checkbox" name="bool:diarize?"/>
  <select name="int:num-speakers">…</select>
  <input type="checkbox" name="bool:translate-to-english?"/>
  <input type="checkbox" name="bool:clean-up-audio?"/>

  <!-- 可选 -->
  <input/textarea name="description"/>

  <!-- 提交：开始转录 -->
</form>
```

副入口 HTMX：

| UI | hx 形态 | 说明 |
|----|---------|------|
| 拖放/选文件区 | `hx-post /_htmx/…dropzone-id…` | Dropzone 生命周期、签 URL |
| 录音 | 弹窗 + 同 dropzone 管线 | `aria-label="录音"` |
| 从链接导入 | `hx-post /_htmx/…` 弹窗 | YouTube 等 URL → 服务端拉取 |
| 匿名上传 | 路径含 `automatically-create-account?` | 无账号也可开户并转录 |

---

#### 5.6.2 字段总表（主业务请求 body）

提交到 `POST /_htmx/{opaque}` 的表单字段：

| # | UI 文案 | 字段名 | 类型 | 必填 | 取值 / 说明 |
|---|---------|--------|------|------|-------------|
| 1 | **转录文件 / 音频·视频文件** | `json:handles` | JSON 字符串 | **是** | 预签名 PUT 成功后的 handle 数组；空则无法提交（`required`） |
| 2 | **音频语言** | `language` | string | 是（有默认） | 英文枚举值，见 5.6.4；样本默认 `Chinese (Simplified)` |
| 3 | **转录模式** | `whisper-model` | enum | 是 | `base` \| `small` \| `large-v2`；默认 **`large-v2`** |
| 4 | **👥 识别说话人** | `bool:diarize?` | checkbox | 否 | 勾选后分段标注说话人 |
| 5 | **有多少说话人？** | `int:num-speakers` | int | 条件 | 仅 diarize 时有效：`2`…`8` 或 **`-1`=自动检测** |
| 6 | **转录为英语** | `bool:translate-to-english?` | checkbox | 否 | 将原始音频语言直接转录为英语 |
| 7 | **恢复音频** | `bool:clean-up-audio?` | checkbox | 否 | 差音质兜底（降噪等），更慢；文案建议仅作最后手段 |
| 8 | （可选描述） | `description` | string | 否 | 备注/描述 |

> 命名风格：Clojure/EDN 风格。`bool:…?` 为布尔，`int:…` 为整型，`json:…` 为 JSON 编码字符串。checkbox 未勾选时通常 **不出现在 body**；勾选后由浏览器按 HTML checkbox 规则提交（常见为 `on` 或服务端约定真值）。

---

#### 5.6.3 音频 / 视频文件（`json:handles` + Dropzone）

**不是**把文件直接 multipart 到 `/_htmx`，而是：

```http
PUT {signed-upload-url}
Content-Type: {file-mime 或 application/octet-stream}
Body: <raw binary>
```

Dropzone / runtime 配置要点：

| 项 | 值 |
|----|-----|
| 库 | Dropzone 6（cdnjs） |
| 上传方法 | `PUT`，`binaryBody: true` |
| URL 来源 | `w$dropzone$signed_upload_urls` |
| MIME | `audio/*`、`video/*` |
| 文案列举格式 | `MP3, MP4, M4A, MOV, AAC, WAV, OGG, OPUS, MPEG, WMA, WMV` |
| 扩展白名单（SSR/rpc） | `mp3, mp4, m4a, m4b, m4v, mov, aac, wav, ogg, oga, ogv, opus, mpeg, mpga, wma, wmv, flac, webm, mkv, mk3d, mka, aif, aiff, aifc, amr, caf, mid, midi, ra, trm, ts, mts, m2ts, ac3, qt, …` |
| 约束标志 | `require-audio-track`、`require-duration`、`skip-checksums`、`disable-auto-deletion` |
| 大视频实验 | `scribe_uploader_discard_video_tracks_1_to_2_gib_2026_06_26`（1–2 GiB 丢弃视频轨只留音频） |
| 错误文案 | 该文件为空 / 不能上传此类型 / 缺少音轨 / 文件过大 / 文件过多 / 无效媒体 / 正在处理视频… |

额度（公开定价，会变更）：

| 档位 | 单文件 | 并发上传 |
|------|--------|----------|
| Free | ≤ 30 分钟 | 1 个文件 |
| Unlimited | ≤ 10 小时 / 5 GB | 最多 50 个文件 |

`json:handles` 在 PUT 成功后由前端写入，形状为 **JSON 数组字符串**（精确 schema 随 build，逆向可见 handle/url 字段；科研时以抓包 Network 中该字段为准）。

示例（逻辑形状，非固定 schema）：

```json
[
  {
    "handle": "…",
    "name": "meeting.mp3",
    "size": 14400618,
    "type": "audio/mpeg"
  }
]
```

表单里：

```http
json:handles=%5B%7B%22handle%22%3A%22…%22%2C%22name%22%3A%22meeting.mp3%22%7D%5D
```

---

#### 5.6.4 音频语言（`language`）

```html
<select name="language" class="dui3-select dui3-select-bordered w-full …">
  <!-- 分组：流行 / 完整列表；option 的 value 为英文枚举，展示为本地化 + 旗帜 -->
</select>
```

- **提交值**：英文名（如 `Chinese (Simplified)`），**不是** `zh-CN`
- 样本默认选中：`Chinese (Simplified)`
- option 数量约 **100+**（含区域变体）

**流行组（样本前段）**

| value | UI（zh-CN） |
|-------|-------------|
| `English` | 英语 |
| `English (US)` | 英语（美国） |
| `English (UK)` | 英语（英国） |
| `Spanish` | 西班牙语 |
| `Portuguese` | 葡萄牙语 |
| `French` | 法语 |
| `Italian` | 意大利语 |
| `German` | 德语 |
| `Dutch` | 荷兰语 |
| `Polish` | 波兰语 |
| `Danish` | 丹麦语 |
| `Japanese` | 日语 |
| `Korean` | 韩语 |
| `Hungarian` | 匈牙利语 |
| `Czech` | 捷克语 |
| `Chinese` | 中文 |
| `Hebrew` | 希伯来语 |

**完整列表节选**

`Arabic`, `Azerbaijani`, `Estonian`, `Belarusian`, `Bulgarian`, `Icelandic`, `Bosnian`, `Persian`, `Russian`, `Chinese (Traditional)`, `Finnish`, `Kazakh`, `Galician`, `Catalan`, `Chinese (Simplified)`, `Kannada`, `Croatian`, `Latvian`, `Lithuanian`, `Romanian`, `Marathi`, `Malay`, `Macedonian`, `Maori`, `Afrikaans`, `Nepali`, `Norwegian`, `Swedish`, `Serbian`, `Slovak`, `Slovenian`, `Swahili`, `Tagalog`, `Tamil`, `Thai`, `Turkish`, `Welsh`, `Urdu`, `Ukrainian`, `Greek`, `Armenian`, `Hindi`, `Indonesian`, `Vietnamese`, `Albanian`, `Amharic`, `Assamese`, `Occitan`, `Valencian`, `Bashkir`, `Basque`, `Breton`, `Tibetan`, `Faroese`, `Sanskrit`, `Flemish`, `Khmer`, `Georgian`, `Gujarati`, `Haitian Creole`, `Haitian`, `Hausa`, `Castilian`, `Latin`, `Lao`, `Lingala`, `Luxembourgish`, `Malagasy`, `Maltese`, `Malayalam`, `Mongolian`, `Bengali`, `Myanmar`, `Burmese`, `Moldovan`, `Punjabi`, …, `Hawaiian`, `Nynorsk`, `Sindhi`, `Sundanese`, `Yiddish`, `Yoruba`, `Javanese`

（完整以页面 `<option value>` 为准，产品宣传 98+ 语言。）

---

#### 5.6.5 转录模式（`whisper-model`）

UI 三档 ↔ 字段 ↔ Whisper：

| UI | 图标语义 | `whisper-model` | Whisper | 速度（约 1h 音） | 定位 |
|----|----------|-----------------|---------|------------------|------|
| **Cheetah 猎豹** | 最快 | `base` | base ~74M | ~20–30s | 尽快出稿 |
| **Dolphin 海豚** | 均衡 | `small` | small ~244M | ~2–3 min | 高准确仍快 |
| **Whale 鲸鱼** | 最准（默认） | `large-v2` | large-v2 ~1.55B | &lt;10 min | 默认最高准确 |

```html
<input type="radio" name="whisper-model" value="base"/>
<input type="radio" name="whisper-model" value="small"/>
<input type="radio" name="whisper-model" value="large-v2" checked/>
```

来源：官博 *Transcription Modes, Explained* + 首页 SSR。

---

#### 5.6.6 说话人识别及更多设置

| UI | 字段 | 交互 |
|----|------|------|
| **识别说话人** | `bool:diarize?` | checkbox；「为转录的每个部分标注说话人」 |
| **有多少说话人？** | `int:num-speakers` | diarize 开启后：`2`–`8` 个说话人，或 `-1` 自动检测 |
| **转录为英语** | `bool:translate-to-english?` | 「直接将原始音频语言转录为英语」 |
| **恢复音频** | `bool:clean-up-audio?` | 差背景噪音/音质兜底；更慢，建议最后手段 |

```html
<input type="checkbox" name="bool:diarize?"/>
<select name="int:num-speakers">
  <option value="2">2 个说话人</option>
  …
  <option value="8">8 个说话人</option>
  <option value="-1">自动检测</option>
</select>
<input type="checkbox" name="bool:translate-to-english?"/>
<input type="checkbox" name="bool:clean-up-audio?"/>
```

---

#### 5.6.7 完整请求示例（逻辑 curl，opaque/签名需从页面现抓）

```bash
# 0) 会话
export TS_COOKIE='access-token=REDACTED; session-secret=REDACTED; device-token=REDACTED; fingerprint=REDACTED; snowflake=REDACTED; lev=1; js=1; i18n-activated-languages=zh-CN%2Cen'

# 1) 预签名 PUT（URL 来自 signed_upload_urls，此处占位）
curl -sS -X PUT "$SIGNED_UPLOAD_URL" \
  -H 'Content-Type: audio/mpeg' \
  --data-binary @meeting.mp3

# 2) 启动转录（主业务）
curl -sS 'https://turboscribe.ai/_htmx/OPAQUE_FROM_hx-post' \
  -X POST \
  -H "Cookie: $TS_COOKIE" \
  -H 'Origin: https://turboscribe.ai' \
  -H 'Referer: https://turboscribe.ai/zh-CN/' \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  -H 'x-lev-xhr;' \
  -H 'x-turbolinks-loaded;' \
  --data-urlencode 'json:handles=[{"handle":"REDACTED","name":"meeting.mp3","size":1234567,"type":"audio/mpeg"}]' \
  --data-urlencode 'language=Chinese (Simplified)' \
  --data-urlencode 'whisper-model=large-v2' \
  --data-urlencode 'bool:diarize?=on' \
  --data-urlencode 'int:num-speakers=-1' \
  --data-urlencode 'bool:clean-up-audio?=on'
  # 未勾选的 checkbox 不要传
```

响应：`text/html` 片段（可能 `hx-swap-oob` 整页跳转仪表盘/文件夹）；**不是** JSON `{jobId}`。任务 id 出现在后续列表 HTML 的 `/transcript/{mediaId}/…` 链接中。

---

#### 5.6.8 字段 ↔ 产品功能速查

| 产品功能 | 请求字段 / 步骤 |
|----------|-----------------|
| 转录文件（上传） | Dropzone → PUT 预签名 → `json:handles` |
| 音频 / 视频文件 | MIME `audio/*` `video/*` + 扩展白名单 |
| 音频语言 | `language` |
| 转录模式 | `whisper-model` = base/small/large-v2 |
| 👥 说话人识别 | `bool:diarize?` + `int:num-speakers` |
| 更多设置 | `bool:translate-to-english?`、`bool:clean-up-audio?`、`description` |
| 从链接导入 / 录音 | 独立 HTMX 弹窗，最终仍汇入 handles + 同上设置 |
| 开始转录 | `POST /_htmx/{opaque}` 提交整表 |

### 5.7 计费相关 HTMX 键

路径中可见：`interval=monthly`、`number-of-seats`、`coupon`、`target` — 对应 Teams/席位/优惠码，非转录核心。

---

## 6. 媒体 CDN 协议

### 6.1 URL

```text
https://serve.leiferiksonventures.com/{path_segment}/{capability_token}/{numeric_id}.mp3
```

### 6.2 鉴权

- **路径内 capability token**（持有 URL ≈ 授权），非 Cookie、非 Bearer
- 无效路径：`401 Invalid URL.` 或 `500`
- App 侧 `/_content/id/{id}.mp3?s=` 再签发/重定向到 serve 域

### 6.3 实测响应头（有效 URL，HEAD/Range）

```http
HTTP/1.1 206 Partial Content
Content-Type: audio/mpeg
Content-Range: bytes 0-{n-1}/{n}
Content-Length: {n}
Accept-Ranges: (via Range 请求)
Cache-Control: public,max-age=31557600,immutable
CF-Cache-Status: HIT
Access-Control-Allow-Origin: *
x-amz-request-id: …
x-amz-server-side-encryption: AES256
x-amz-version-id: …
Server: cloudflare
```

结论：Cloudflare 边缘 + **S3 兼容对象存储** 源；支持 Range 流式播放。

### 6.4 播放器

- Plyr 3.7.8 + 可选 wavesurfer
- 浏览器：`Range: bytes=0-`，`sec-fetch-dest: audio`，`Referer: https://turboscribe.ai/`

---

## 7. 转录数据模型（从 HTML 反推）

```text
mediaId: snowflake 整型字符串（如 7872292148771733726）
folderId: snowflake
viewerId (vid): snowflake
slug: 标题的拼音/slug + 源平台 id 片段（如 bv1…）
```

片段：

```html
<div id="transcript-{mediaId}">
  <span data-timestamp> (0:00) </span>
  <span data-start="0" data-end="2490">文本…</span>
  …
</div>
```

- 时间单位：**毫秒**
- 点击句段 seek 音频（json-rpc 绑定 `scroll-on-seek?`、`timestamps-checkbox-id`）

---

## 8. 高级设置（产品语义速查）

> 完整字段、curl、语言列表与时序见 **§5.6 主业务：上传并转录**。

| UI | 字段 | 取值要点 |
|----|------|----------|
| 转录文件 / 音视频 | `json:handles` + 预签名 PUT | 非直传 multipart |
| 音频语言 | `language` | 英文枚举，如 `Chinese (Simplified)`；98+ |
| 转录模式 | `whisper-model` | Cheetah=`base` / Dolphin=`small` / Whale=`large-v2`（默认） |
| 👥 识别说话人 | `bool:diarize?` | checkbox |
| 说话人数量 | `int:num-speakers` | `2`–`8` 或 `-1` 自动检测 |
| 转录为英语 | `bool:translate-to-english?` | checkbox |
| 恢复音频 | `bool:clean-up-audio?` | 差音质兜底，更慢 |
| 导出 | 导出面板 HTMX | TXT / DOCX / PDF / SRT / VTT / CSV；批量 ≤50 → ZIP |

额度：Free 日 3 次、单文件 ≤30 分钟；Unlimited 单文件 ≤10 小时/5GB、一次最多 50 文件（以官网为准）。

---

## 9. 功能 → 接口 总表（科研对照）

| 产品功能 | 接口形态 | 稳定性 |
|----------|----------|--------|
| 打开仪表盘 | `GET /{locale}/dashboard` | 路径稳定，需 Cookie，易遇 CF |
| 打开转录 | `GET /{locale}/transcript/{id}/{slug}` | 路径模式稳定 |
| 加载转录文本 | `GET /_content/htmx/{opaque}?vid&language&etag&e&s` | opaque/签名不稳，内容可 CDN 缓存 |
| 播放/下载音频 | `GET serve…/{seg}/{token}/{id}.mp3` 或 `/_content/id/{id}.mp3?s=` | 签名 URL 时效 |
| 新建文件夹 | `POST /_htmx/{opaque}` + `name=` | opaque 不稳 |
| 上传并转录 | Dropzone PUT + 表单字段 POST | 预签名 URL 短时 |
| 转录模式/语言/说话人等 | 上传表单字段 | 字段名相对稳定 |
| 导出文本 | `POST /_htmx/…media-ids…` → 导出面板 | opaque 不稳 |
| 分享 | `POST /_htmx/…media-id…` | opaque 不稳 |
| 重命名 | `POST /_htmx/…media-id…` | opaque 不稳 |
| 删除 | `POST /_htmx/…media-id…` | opaque 不稳 |
| 客户端日志 | `POST /_levscript/json` | 稳定路径，非业务 |
| 指纹 | `POST /_fp` | 稳定路径 |

---

## 10. 与 Synapse / 常见 Whisper API 对照建议

| 维度 | TurboScribe（私有 Web） | 典型公开 ASR API |
|------|-------------------------|------------------|
| 鉴权 | Cookie 会话 + 设备指纹 | API Key / Bearer |
| 调用面 | HTML/HTMX opaque | 稳定 REST/gRPC |
| 上传 | 预签名 PUT | `multipart` 直传 |
| 结果 | 带时间戳 HTML 片段 | JSON segments |
| 说话人 | `diarize` + `num-speakers` | 各家 diarization 扩展 |
| 模型档 | `base/small/large-v2` | 模型名自选 |
| 导出 | 服务端生成 DOCX/PDF/SRT… | 客户端自转 |
| 媒体 | 签名 CDN URL | 对象存储 URL |

科研对照时建议：

1. **只对照功能与字段语义**，不要依赖 opaque 路径做生产集成。  
2. 若需要可编程接入，应使用官方渠道或自建 Whisper/自有 TTS-ASR 栈（本仓库 Synapse）。  
3. 抓包样例中的 Cookie/token **按密钥轮换处理**，文档与仓库中保持 REDACTED。

---

## 11. 探测方法附录

1. Chrome DevTools → Network → 过滤 `htmx` / `levscript` / `transcript` / `serve.leiferikson`  
2. 导出 HAR，或复制为 curl  
3. 从 HTML 提取所有 `hx-post` / `hx-get` / `application/json-rpc`  
4. 解码 opaque 尾部 base64 得 `media-id` 等语义  
5. 对媒体 URL 仅 `HEAD`/`Range: bytes=0-0`，避免整文件下载  
6. PowerShell/`curl.exe` 注意：本环境对完整 document 易 403，对 HTMX POST 更友好

---

## 12. 安全与伦理

- 会话 Cookie = 账号完全控制权；**禁止**提交到公开仓库或聊天。  
- 签名媒体 URL 等同临时读权限，勿传播。  
- 自动化请限速，遵守 Cloudflare/站点 ToS。  
- 本文件仅供**授权科研对照**；逆向结论可能随发版失效。

---

## 13. 修订记录

| 日期 | 说明 |
|------|------|
| 2026-07-21 | 初版：JS 逆向 + 鉴权抓包 + HTMX/媒体实测；覆盖上传字段、文件菜单、CDN、协议层 |
