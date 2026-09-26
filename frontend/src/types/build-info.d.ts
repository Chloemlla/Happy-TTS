/**
 * 由 `frontend/vite.config.ts` 的 `define` 在构建期注入的常量。
 * 消费者：`src/config/buildInfo.ts`（页脚展示前后端版本 + 短 SHA）。
 */
declare const __FRONTEND_VERSION__: string;
declare const __BACKEND_VERSION__: string;
declare const __GIT_SHORT_SHA__: string;