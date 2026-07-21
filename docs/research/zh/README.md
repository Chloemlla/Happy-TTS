# TurboScribe 接口研究文档（中文版）

> **状态**：2026-07-21 基于前端 JS 逆向 + 鉴权抓包整理  
> **用途**：科研项目功能/协议对照，**非官方公开 API**  
> **合规**：仅限本人账号与授权科研；Cookie/签名 URL 一律 REDACTED；勿高频压测

## 文档结构

| 文件 | 内容 |
|------|------|
| [01-协议与鉴权.md](./01-协议与鉴权.md) | 架构、域名、Cookie、HTMX/json-rpc、opaque 解码 |
| [02-上传与转录.md](./02-上传与转录.md) | **主业务**：文件 / 语言 / 模式 / 说话人 / 更多设置 |
| [03-文件管理与导出.md](./03-文件管理与导出.md) | 打开/导出/分享/下载/重命名/删除/文件夹/CDN |
| [04-产品功能与科研对照.md](./04-产品功能与科研对照.md) | 套餐、功能总表、与公开 ASR 对照 |

英文/混合底稿（更全的探测附录）：

- `../turboscribe-api-reference.md`
- `../turboscribe-public-features.md`
- `../turboscribe-probe-results.md`
- `../turboscribe-cdn-url-analysis.md`

## 主业务一句话

```
音频/视频 → 预签名 PUT → POST /_htmx
  body: json:handles + language + whisper-model
      + bool:diarize? + int:num-speakers
      + bool:translate-to-english? + bool:clean-up-audio?
```

| UI | 字段 |
|----|------|
| 转录文件 | Dropzone + `json:handles` |
| 音频语言 | `language` |
| 转录模式 | `whisper-model` = base/small/large-v2 |
| 说话人识别 | `bool:diarize?` + `int:num-speakers` |
| 更多设置 | 译英 / 恢复音频 / description |

详见 [02-上传与转录.md](./02-上传与转录.md)。
