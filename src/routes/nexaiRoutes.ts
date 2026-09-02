/**
 * NexAI 路由定义
 * 所有路由挂载在 /api/nexai 前缀下
 */
// 端点的 OpenAPI 注释在 `src/routes/openapi/nexaiRoutes.*.openapi.ts`（同一 swagger-jsdoc glob：`src/routes/**/*.ts`）。
import express from "express";
import { ArtifactController } from "../controllers/artifactController";
import { NexaiAuthController } from "../controllers/nexaiAuthController";
import { NexaiReleaseController } from "../controllers/nexaiReleaseController";
import { NexaiSyncController } from "../controllers/nexaiSyncController";
import { NexaiSyncV2Controller } from "../controllers/nexaiSyncV2Controller";
import { nexaiAuthOptional, nexaiAuthRequired } from "../middleware/nexaiAuth";
import { createLimiter } from "../middleware/rateLimiter";

const router = express.Router();

// ========== 限流器 ==========

const nexaiAuthLimiter = createLimiter({
  windowMs: 15 * 60 * 1000, // 15 分钟
  max: 20,
  message: "NexAI 认证请求过于频繁，请稍后再试",
  code: "NEXAI_RATE_LIMIT",
  stage: "rate_limit",
});

const nexaiLoginLimiter = createLimiter({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: "登录尝试次数过多，请 15 分钟后再试",
  code: "NEXAI_RATE_LIMIT",
  stage: "rate_limit",
});

const nexaiRegisterLimiter = createLimiter({
  windowMs: 60 * 60 * 1000, // 1 小时
  max: 5,
  message: "注册尝试次数过多，请稍后再试",
  code: "NEXAI_RATE_LIMIT",
  stage: "rate_limit",
});

const nexaiOAuthLimiter = createLimiter({
  windowMs: 15 * 60 * 1000,
  max: 15,
  message: "OAuth 请求过于频繁，请稍后再试",
  code: "NEXAI_RATE_LIMIT",
  stage: "rate_limit",
});

const nexaiRefreshLimiter = createLimiter({
  windowMs: 5 * 60 * 1000,
  max: 10,
  message: "Token 刷新过于频繁",
  code: "NEXAI_RATE_LIMIT",
  stage: "rate_limit",
});

const nexaiProfileLimiter = createLimiter({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: "操作过于频繁，请稍后再试",
  code: "NEXAI_RATE_LIMIT",
  stage: "rate_limit",
});

const nexaiSyncLimiter = createLimiter({
  windowMs: 5 * 60 * 1000,
  max: 30,
  message: "同步请求过于频繁，请稍后再试",
  code: "NEXAI_RATE_LIMIT",
  stage: "rate_limit",
});

const artifactCreateLimiter = createLimiter({
  windowMs: 60 * 60 * 1000, // 1 小时
  max: 10,
  message: "Artifact 创建过于频繁，请稍后再试",
  code: "NEXAI_RATE_LIMIT",
  stage: "rate_limit",
});

const artifactViewLimiter = createLimiter({
  windowMs: 60 * 1000, // 1 分钟
  max: 100,
  message: "访问过于频繁，请稍后再试",
  code: "NEXAI_RATE_LIMIT",
  stage: "rate_limit",
});

const artifactManageLimiter = createLimiter({
  windowMs: 15 * 60 * 1000, // 15 分钟
  max: 30,
  message: "操作过于频繁，请稍后再试",
  code: "NEXAI_RATE_LIMIT",
  stage: "rate_limit",
});

const releaseManifestLimiter = createLimiter({
  windowMs: 60 * 1000,
  max: 60,
  message: "Release manifest 请求过于频繁，请稍后再试",
  code: "NEXAI_RATE_LIMIT",
  stage: "rate_limit",
});

// ========== 公开端点（无需登录） ==========

router.post("/auth/register", nexaiRegisterLimiter, NexaiAuthController.register);
router.post("/auth/login", nexaiLoginLimiter, NexaiAuthController.login);
router.post("/auth/passkey/login/options", nexaiLoginLimiter, NexaiAuthController.generatePasskeyAuthenticationOptions);
router.post("/auth/passkey/login/verify", nexaiLoginLimiter, NexaiAuthController.verifyPasskeyAuthentication);
router.post(
  "/auth/passkey/login/discoverable/options",
  nexaiLoginLimiter,
  NexaiAuthController.generateDiscoverablePasskeyAuthenticationOptions,
);
router.post(
  "/auth/passkey/login/discoverable/verify",
  nexaiLoginLimiter,
  NexaiAuthController.verifyDiscoverablePasskeyAuthentication,
);
router.post("/auth/google", nexaiOAuthLimiter, NexaiAuthController.googleAuth);
router.post("/auth/github", nexaiOAuthLimiter, NexaiAuthController.githubAuth);
router.get("/auth/github/callback", nexaiOAuthLimiter, NexaiAuthController.githubCallback);
router.post("/auth/refresh", nexaiRefreshLimiter, NexaiAuthController.refreshToken);
router.post("/auth/forgot-password", nexaiAuthLimiter, NexaiAuthController.forgotPassword);
router.post("/auth/reset-password", nexaiAuthLimiter, NexaiAuthController.resetPassword);
router.get("/auth/oauth-config", NexaiAuthController.getOAuthConfig);

// ========== 发布完整性端点（公开） ==========

router.get("/releases/:tag/manifest", releaseManifestLimiter, NexaiReleaseController.getManifest);

// ========== 需要登录的端点 ==========

router.post(
  "/auth/passkey/register/options",
  nexaiAuthRequired,
  NexaiAuthController.generatePasskeyRegistrationOptions,
);
router.post("/auth/passkey/register/verify", nexaiAuthRequired, NexaiAuthController.verifyPasskeyRegistration);
router.get(
  "/auth/passkey/signal/options",
  nexaiAuthRequired,
  nexaiProfileLimiter,
  NexaiAuthController.getPasskeySignalOptions,
);
router.get("/auth/me", nexaiAuthRequired, NexaiAuthController.getCurrentUser);
router.post("/auth/logout", nexaiAuthRequired, NexaiAuthController.logout);
router.put("/auth/profile", nexaiAuthRequired, nexaiProfileLimiter, NexaiAuthController.updateProfile);
router.post("/auth/link-google", nexaiAuthRequired, nexaiOAuthLimiter, NexaiAuthController.linkGoogle);
router.post("/auth/unlink-google", nexaiAuthRequired, NexaiAuthController.unlinkGoogle);
router.post("/auth/link-github", nexaiAuthRequired, nexaiOAuthLimiter, NexaiAuthController.linkGithub);
router.post("/auth/unlink-github", nexaiAuthRequired, NexaiAuthController.unlinkGithub);

// ========== 云同步端点（需要登录） ==========

router.get("/sync", nexaiAuthRequired, nexaiSyncLimiter, NexaiSyncController.getSyncData);
router.put("/sync", nexaiAuthRequired, nexaiSyncLimiter, NexaiSyncController.putSyncData);
router.get("/sync/meta", nexaiAuthRequired, nexaiSyncLimiter, NexaiSyncController.getSyncMeta);
router.get("/sync/changes", nexaiAuthRequired, nexaiSyncLimiter, NexaiSyncController.getChangesSince);
router.post("/sync/incremental", nexaiAuthRequired, nexaiSyncLimiter, NexaiSyncController.incrementalSync);
router.patch("/sync/:category", nexaiAuthRequired, nexaiSyncLimiter, NexaiSyncController.patchSyncData);
router.delete("/sync", nexaiAuthRequired, nexaiSyncLimiter, NexaiSyncController.deleteSyncData);

// ========== 加密云同步端点（需要登录） ==========

router.put("/sync/v2", nexaiAuthRequired, nexaiSyncLimiter, NexaiSyncV2Controller.putSnapshot);
router.get("/sync/v2", nexaiAuthRequired, nexaiSyncLimiter, NexaiSyncV2Controller.getSnapshot);
router.get("/sync/v2/meta", nexaiAuthRequired, nexaiSyncLimiter, NexaiSyncV2Controller.getMeta);
router.post("/sync/v2/incremental", nexaiAuthRequired, nexaiSyncLimiter, NexaiSyncV2Controller.incrementalSync);
router.delete("/sync/v2", nexaiAuthRequired, nexaiSyncLimiter, NexaiSyncV2Controller.deleteSnapshot);

// ========== Artifacts 分享端点 ==========

router.post("/artifacts", nexaiAuthRequired, artifactCreateLimiter, ArtifactController.createArtifact);
router.get("/artifacts/:shortId", artifactViewLimiter, nexaiAuthOptional, ArtifactController.getArtifact);
router.patch("/artifacts/:shortId", nexaiAuthRequired, artifactManageLimiter, ArtifactController.updateArtifact);
router.delete("/artifacts/:shortId", nexaiAuthRequired, artifactManageLimiter, ArtifactController.deleteArtifact);
router.get("/artifacts", nexaiAuthRequired, artifactManageLimiter, ArtifactController.listArtifacts);
router.post("/artifacts/:shortId/view", artifactViewLimiter, ArtifactController.recordView);

export default router;
