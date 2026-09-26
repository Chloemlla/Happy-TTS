// Errors
export { ApiError, isApiError } from "./errors.js";

// Outemail
export { sendLoginCode } from "./outemail.service.js";

// Auth
// LumenClientInfo 是 lumen 会话的官方客户端身份字段（S-02），路由层要用它给
// resolveLumenClientInfo 定类型。
export {
  startEmailLogin,
  verifyEmailLogin,
  refreshSession,
  createSessionResponse,
  tierRank as authTierRank,
} from "./auth.service.js";
export type { LumenClientInfo } from "./auth.service.js";

// Sessions (设备与会话, S-03)
export { listLumenDevices, revokeLumenDevice, LumenSessionError } from "./session.service.js";
export type { LumenDeviceView, LumenSessionView } from "./session.service.js";

// Entitlements
export {
  listEntitlements,
  userHasTierAtLeast,
  verifyGooglePurchase,
  tierForProduct,
  resolveActiveTier,
  tierRank as entitlementsTierRank,
} from "./entitlements.service.js";

// Sync
export { pushChanges, changesSince, reserveSyncCursors } from "./sync.service.js";

// Backups
export { saveBackup, latestBackup } from "./backups.service.js";

// Telemetry
export { recordTelemetryUpload, latestTelemetryDebugItems, sanitizeTelemetryUpload } from "./telemetry.service.js";

// Crash Reports
export { recordCrashReport } from "./crash.service.js";

// Face Analysis
export { recordFaceAnalysisFrame } from "./face-analysis.service.js";

// Privileged Control
export {
  getDeviceControlPolicy,
  upsertDeviceControlPolicy,
  startVisionSession,
  heartbeatVisionSession,
  uploadVisionFrame,
  recordLifecycleEvent,
  recentVisionSessions,
  recentLifecycleEvents,
  globalDeviceControlPolicy,
} from "./privileged-control.service.js";

// Config
export { getFeatureFlags, getConfigSync } from "./config.service.js";

// Release
export { checkRelease } from "./release.service.js";

// Admin
export {
  createAdminSession,
  refreshAdminSession,
  adminOperatorForToken,
  applyAdminAction,
} from "./admin.service.js";

// Admin Dashboard
export { adminDashboardSnapshot } from "./admin-dashboard.service.js";

// ── Named service objects for route imports ─────────────────────────────
// Routes import individual service objects:
//   import { authService, entitlementsService, ... } from "../../services/lumen/index.js";

import * as authService from "./auth.service.js";
import * as sessionService from "./session.service.js";
import * as entitlementsService from "./entitlements.service.js";
import * as syncService from "./sync.service.js";
import * as backupsService from "./backups.service.js";
import * as telemetryService from "./telemetry.service.js";
import * as crashService from "./crash.service.js";
import * as faceAnalysisService from "./face-analysis.service.js";
import * as privilegedControlService from "./privileged-control.service.js";
import * as configService from "./config.service.js";
import * as releaseService from "./release.service.js";
import * as adminService from "./admin.service.js";
import * as adminDashboardService from "./admin-dashboard.service.js";

export {
  authService,
  sessionService,
  entitlementsService,
  syncService,
  backupsService,
  telemetryService,
  crashService,
  faceAnalysisService,
  privilegedControlService,
  configService,
  releaseService,
  adminService,
  adminDashboardService,
};