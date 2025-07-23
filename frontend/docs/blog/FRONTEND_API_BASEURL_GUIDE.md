---
title: 前端 API 请求统一设置 base URL 实践指南
date: 2025-07-11
slug: frontend-api-baseurl-guide
tags: [api, baseurl, frontend, blog]
---

# 前端 API 请求统一设置 base URL 实践指南

## 为什么要统一设置 base URL？

- **多环境适配**：开发、测试、生产环境 API 地址不同，统一 base URL 可自动适配。
- **代理与部署**：前后端分离、Nginx 代理、Docker 部署等场景，API 路径需灵活切换。
- **防止 hardcode**：避免在代码中写死 http://localhost:3000 或生产地址，便于维护和迁移。

---

## 常见坑与问题

- **fetch/axios 404**：未拼接 base URL，导致请求本地静态资源或 404。
- **跨域问题**：base URL 配置错误，跨域请求失败。
- **环境切换失效**：环境变量未生效，API 请求仍指向错误地址。

---

## 推荐实践：getApiBaseUrl 工具函数

项目中建议统一用工具函数管理 base URL，例如：

```ts
// frontend/src/api/index.ts
export default function getApiBaseUrl() {
  if (import.meta.env.DEV) return "";
  if (import.meta.env.VITE_API_URL) return import.meta.env.VITE_API_URL;
  return "https://api.example.com";
}
```

---

## 典型代码片段

### fetch 请求

```ts
fetch(getApiBaseUrl() + "/api/user/profile", {
  headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
});
```

### axios 封装

```ts
import axios from "axios";
import getApiBaseUrl from "./index";

const api = axios.create({
  baseURL: getApiBaseUrl(),
  headers: { "Content-Type": "application/json" },
});

// 用法
api.get("/api/user/profile");
```

---

## 项目实际用法与注意事项

- 所有 fetch/axios 请求都应拼接 base URL，不要写死路径。
- 环境变量（如 VITE_API_URL）需在部署时正确注入。
- SSR/静态部署等场景也需适配 base URL。

---
