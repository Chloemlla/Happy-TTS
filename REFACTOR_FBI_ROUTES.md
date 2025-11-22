# FBI通缉犯路由重构方案

## 当前问题
1. 路由入口混乱，存在3个不同的挂载点
2. 公开API被重复定义在两个路由文件中
3. 认证和限流策略不统一
4. fbiWantedRoutes.ts 既有管理员路由又有公开路由，职责不清

## 推荐方案：统一到单一路由文件

### 方案A：保留 fbiWantedRoutes.ts，删除 fbiWantedPublicRoutes.ts

```typescript
// src/routes/fbiWantedRoutes.ts
import express from 'express';
import { fbiWantedController } from '../controllers/fbiWantedController';
import { authenticateToken } from '../middleware/authenticateToken';
import { authenticateAdmin } from '../middleware/auth';
import { createLimiter } from '../middleware/rateLimiter';
import multer from 'multer';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

// ===== 公开路由（无需认证） =====
const publicLimiter = createLimiter({
    windowMs: 60 * 1000,
    max: 60,
    routeName: 'fbi.public',
    message: '公开API请求过于频繁，请稍后再试'
});

router.get('/public/list', publicLimiter, fbiWantedController.getAllWanted);
router.get('/public/statistics', publicLimiter, fbiWantedController.getStatistics);
router.get('/public/:id', publicLimiter, fbiWantedController.getWantedById);

// ===== 管理员路由（需要认证+管理员权限） =====
const adminLimiter = createLimiter({
    windowMs: 5 * 60 * 1000,
    max: 100,
    routeName: 'fbi.admin',
    message: '管理员操作过于频繁，请稍后再试'
});

const uploadPhotoLimiter = createLimiter({
    windowMs: 15 * 60 * 1000,
    max: 20,
    routeName: 'fbi.admin.photo_upload',
    message: '头像上传过于频繁，请稍后再试'
});

// 应用认证中间件到所有管理员路由
router.use(authenticateToken);
router.use(authenticateAdmin);

// 管理员API
router.get('/', adminLimiter, fbiWantedController.getAllWanted);
router.get('/statistics', adminLimiter, fbiWantedController.getStatistics);
router.get('/:id', adminLimiter, fbiWantedController.getWantedById);
router.post('/', adminLimiter, fbiWantedController.createWanted);
router.put('/:id', adminLimiter, fbiWantedController.updateWanted);
router.patch('/:id/status', adminLimiter, fbiWantedController.updateWantedStatus);
router.patch('/:id/photo', uploadPhotoLimiter, upload.single('photo'), fbiWantedController.updateWantedPhoto);
router.delete('/multiple', adminLimiter, fbiWantedController.deleteMultiple);
router.delete('/:id', adminLimiter, fbiWantedController.deleteWanted);
router.post('/batch-delete', adminLimiter, fbiWantedController.batchDeleteWanted);

export default router;
```

```typescript
// src/app.ts 修改挂载
// 删除这些行：
// app.use('/api/fbi-wanted', adminLimiter, fbiWantedRoutes);
// app.use('/api/fbi-wanted-public', frontendLimiter, fbiWantedPublicRoutes);
// app.use('/public/fbi-wanted', frontendLimiter, fbiWantedPublicRoutes);

// 替换为：
app.use('/api/fbi-wanted', fbiWantedRoutes);  // 单一入口，内部路由已处理认证和限流
```

### 路由结构对比

**重构前（混乱）:**
```
/api/fbi-wanted/                    [管理员] GET 列表
/api/fbi-wanted/public              [公开] GET 列表
/api/fbi-wanted-public/             [公开] GET 列表（重复）
/public/fbi-wanted/                 [公开] GET 列表（重复）
```

**重构后（清晰）:**
```
/api/fbi-wanted/public/list         [公开] GET 列表
/api/fbi-wanted/public/statistics   [公开] GET 统计
/api/fbi-wanted/public/:id          [公开] GET 详情
/api/fbi-wanted/                    [管理员] GET 列表
/api/fbi-wanted/statistics          [管理员] GET 统计
/api/fbi-wanted/:id                 [管理员] GET 详情
```

## 优势
1. **单一入口**: 所有FBI相关API统一在 `/api/fbi-wanted` 下
2. **路径清晰**: 公开API有明确的 `/public` 前缀
3. **职责分明**: 路由内部使用中间件区分公开和管理员权限
4. **易于维护**: 删除冗余文件 fbiWantedPublicRoutes.ts
5. **限流统一**: 在路由级别控制限流策略

## 需要修改的文件
1. `src/routes/fbiWantedRoutes.ts` - 重构路由结构
2. `src/app.ts` - 简化路由挂载
3. `src/routes/fbiWantedPublicRoutes.ts` - 删除此文件
4. `frontend/src/api/fbi.ts` - 更新API端点路径
5. `frontend/src/components/FBIWantedPublic.tsx` - 更新API调用路径
