---
title: 头像缓存一致性与API请求适配方案
date: 2025-07-11
slug: avatar-cache-hash-readme
tags: [avatar, cache, hash, api, blog]
---

# 头像缓存一致性与API请求适配方案

## 背景

为提升用户体验和带宽利用率，前后端已实现“强一致性”头像缓存方案，确保用户头像图片只要内容未变，前端始终本地读取，变更时自动刷新。

## 方案核心

- **后端** `/user/profile` 接口返回 `avatarUrl` 和 `avatarHash`（hash优先用文件名hash，否则用url的md5）。
- **前端** `MobileNav` 和 `UserProfile` 组件都用 `userId:avatarHash` 作为 IndexedDB 缓存 key。
- 只要 hash 不变，图片始终本地读取；hash 变更时自动重新拉取和缓存，确保图片内容一致性。
- 所有 API 请求均拼接统一 base URL，适配多环境部署。

## 使用说明

1. **头像上传/更换**：用户上传新头像后，后端生成新 hash，前端自动拉取新图片并缓存。
2. **页面刷新/多端切换**：只要 hash 不变，图片直接本地读取，无需重复请求。
3. **API 请求**：所有 fetch 请求均拼接 `getApiBaseUrl()`，确保 base URL 一致。

## 技术细节

- **缓存 key**：`userId:avatarHash`，hash 变更即强制刷新。
- **hash 生成**：优先用文件名 hash，否则用 avatarUrl 的 md5。
- **缓存存储**：前端用 IndexedDB（idb 库）持久化图片 blob。
- **图片一致性**：hash 变更即视为内容变更，自动拉取新图片。

## 注意事项

- 若后端 avatarUrl 变更但内容未变，hash 也会变，前端会重新拉取图片。
- 若需更细粒度的缓存失效策略，可扩展 hash 生成逻辑。
- 适用于所有支持 IndexedDB 的现代浏览器。

## 参考实现

- 后端：`src/routes/adminRoutes.ts` `/user/profile` 接口
- 前端：`frontend/src/components/MobileNav.tsx`、`frontend/src/components/UserProfile.tsx`

## 关键代码示例

### 后端：/user/profile 接口 avatarHash 返回

```js
// src/routes/adminRoutes.ts
router.get("/user/profile", authMiddleware, async (req, res) => {
  try {
    const user = req.user;
    if (!user) return res.status(401).json({ error: "未登录" });
    const { id, username, role } = user;
    let email = undefined;
    let avatarUrl = undefined;
    let avatarHash = undefined;
    const { UserStorage } = require("../utils/userStorage");
    const dbUser = await UserStorage.getUserById(id);
    if (dbUser) {
      email = dbUser.email;
      if (
        dbUser.avatarUrl &&
        typeof dbUser.avatarUrl === "string" &&
        dbUser.avatarUrl.length > 0
      ) {
        avatarUrl = dbUser.avatarUrl;
        // 尝试从URL中提取hash（如文件名带hash），否则用md5
        const match = dbUser.avatarUrl.match(
          /([a-fA-F0-9]{8,})\.(jpg|jpeg|png|webp|gif)$/
        );
        if (match) {
          avatarHash = match[1];
        } else {
          const crypto = require("crypto");
          avatarHash = crypto
            .createHash("md5")
            .update(dbUser.avatarUrl)
            .digest("hex");
        }
      }
    }
    const resp = { id, username, email, role };
    if (avatarUrl) {
      resp.avatarUrl = avatarUrl;
      resp.avatarHash = avatarHash;
    }
    res.json(resp);
  } catch (e) {
    res.status(500).json({ error: "获取用户信息失败" });
  }
});
```

### 前端：MobileNav 组件 IndexedDB 缓存逻辑

```tsx
// frontend/src/components/MobileNav.tsx
import { openDB } from "idb";
import getApiBaseUrl from "../api";

const AVATAR_DB = "avatar-store";
const AVATAR_STORE = "avatars";

async function getCachedAvatar(
  userId: string,
  avatarHash: string
): Promise<string | undefined> {
  const db = await openDB(AVATAR_DB, 1, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(AVATAR_STORE)) {
        db.createObjectStore(AVATAR_STORE);
      }
    },
  });
  const key = `${userId}:${avatarHash}`;
  return await db.get(AVATAR_STORE, key);
}

async function setCachedAvatar(
  userId: string,
  avatarHash: string,
  blobUrl: string
) {
  const db = await openDB(AVATAR_DB, 1, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(AVATAR_STORE)) {
        db.createObjectStore(AVATAR_STORE);
      }
    },
  });
  const key = `${userId}:${avatarHash}`;
  await db.put(AVATAR_STORE, blobUrl, key);
}

// 组件内
const [avatarHash, setAvatarHash] = useState<string | undefined>(undefined);
useEffect(() => {
  if (user) {
    fetch(getApiBaseUrl() + "/api/admin/user/profile", {
      headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
    })
      .then((res) => res.json())
      .then((data) => setAvatarHash(data.avatarHash))
      .catch(() => setAvatarHash(undefined));
  }
}, [user]);

useEffect(() => {
  let cancelled = false;
  async function loadAvatar() {
    if (
      hasAvatar &&
      typeof user?.avatarUrl === "string" &&
      typeof user?.id === "string" &&
      typeof avatarHash === "string"
    ) {
      if (lastAvatarUrl.current === avatarHash && avatarImg) {
        return;
      }
      // 先查IndexedDB
      const cached = await getCachedAvatar(
        user.id as string,
        avatarHash as string
      );
      if (cached) {
        setAvatarImg(cached);
        lastAvatarUrl.current = avatarHash;
        return;
      }
      // 下载图片
      fetch(user.avatarUrl)
        .then((res) => res.blob())
        .then(async (blob) => {
          if (cancelled) return;
          const url = URL.createObjectURL(blob);
          setAvatarImg(url);
          lastAvatarUrl.current = avatarHash;
          lastObjectUrl.current = url;
          await setCachedAvatar(user.id as string, avatarHash as string, url);
        })
        .catch(() => setAvatarImg(undefined));
    } else {
      setAvatarImg(undefined);
      lastAvatarUrl.current = undefined;
    }
  }
  loadAvatar();
  return () => {
    cancelled = true;
    if (lastObjectUrl.current) {
      URL.revokeObjectURL(lastObjectUrl.current);
      lastObjectUrl.current = undefined;
    }
  };
}, [hasAvatar, user?.avatarUrl, user?.id, avatarHash]);
```

### 前端：UserProfile 组件 IndexedDB 缓存逻辑

```tsx
// frontend/src/components/UserProfile.tsx
// ...同理，缓存key用 profile.id:avatarHash，逻辑与上方一致
```

---

提示：以上代码片段仅供参考，具体实现可能会因业务需求而有所不同。
确保上述代码片段中的逻辑与您的实际需求一致，并请务必在测试和开发过程中进行 appropriate 测试，并确保代码符合您的项目规范。
