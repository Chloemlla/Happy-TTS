// 「语音转文本」用户态路由(/api/transcribe):普通登录用户即可使用。
// 与 /api/admin/media-tool 共用 serverRuntime 单例(store / settings / runner),
// 保证同一进程只有一个 job 队列;作用域由 transcribeUserHttp 锁在 users/<uid>/ 内。
import type { Request } from "express";
import type { AuthenticatedRequest } from "../types/authRequest";
import { createTranscribeUserRouter } from "../mediaTool/http/transcribeUserHttp";
import {
  ensureMediaJobRecovery,
  getMediaToolRunner,
  getServerMediaJobStore,
  getServerMediaSettingsStore,
  getServerTranscriptStore,
} from "../mediaTool/serverRuntime";

const router = createTranscribeUserRouter({
  store: getServerMediaJobStore(),
  transcripts: getServerTranscriptStore(),
  settingsStore: getServerMediaSettingsStore(),
  runner: getMediaToolRunner(),
  resolveUser: (req: Request) => {
    const user = (req as AuthenticatedRequest).user;
    if (!user?.id) return null;
    return { id: String(user.id), username: String(user.username || user.id) };
  },
});

// 进程重启自恢复(整队列一次,幂等;见 serverRuntime.ensureMediaJobRecovery)
ensureMediaJobRecovery();

export default router;
