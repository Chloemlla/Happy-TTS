import express, { type Request, type RequestHandler } from "express";
import { authenticateAdmin, authenticateSuperAdmin } from "../middleware/auth";
import { createMediaToolRouter } from "../mediaTool/http/mediaToolHttp";
import { createMongoMediaJobStore } from "../mediaTool/jobs/mediaJobStore";
import { MediaJobRunner } from "../mediaTool/jobs/mediaJobRunner";
import { createMongoMediaSettingsStore } from "../mediaTool/settingsStore";

const jobStore = createMongoMediaJobStore();
const settingsStore = createMongoMediaSettingsStore();
const runner = new MediaJobRunner(
  { store: jobStore, getSettings: () => settingsStore.get(), mode: "server" },
  2,
);

export function getMediaToolRunner(): MediaJobRunner {
  return runner;
}

const router = createMediaToolRouter({
  mode: "server",
  store: jobStore,
  settingsStore,
  runner,
  requireAdmin: authenticateAdmin as unknown as RequestHandler,
  requireSuper: authenticateSuperAdmin as unknown as RequestHandler,
  identity: (req: Request) => {
    const user = (req as Request & { user?: { username?: string; role?: string; id?: string } }).user;
    return user?.username || user?.id || "admin";
  },
});

export default router;

// 进程重启后自恢复:残留 running 置为失败(中断),残留 queued 重新入队。
// mongoose 默认缓冲队列,连接就绪前查询会等待,因此延后一拍执行即可。
setTimeout(() => {
  jobStore
    .list(200)
    .then((records) => {
      for (const r of records) {
        if (r.status === "running") {
          void jobStore.patch(r.id, {
            status: "failed",
            error: "服务重启,任务被中断(可重试)",
            finishedAt: Date.now(),
          });
        } else if (r.status === "queued" && !r.cancelRequested) {
          runner.enqueue(r.id);
        }
      }
    })
    .catch(() => undefined);
}, 2500);
