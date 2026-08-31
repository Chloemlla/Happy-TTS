import logger from "../utils/logger";

/**
 * G5-21: 统一优雅关闭编排。
 *
 * 各服务不再自行 process.on("SIGTERM"/"SIGINT")（那会让进程永远不退出，docker stop
 * 只能等超时被 SIGKILL，内存缓冲全部丢失）。它们改为调用 registerShutdownStep 注册
 * 自己的 flush/close，由本模块安装一次信号处理器，按序执行所有步骤后在总宽限内强制退出。
 */

type ShutdownStep = { name: string; run: () => Promise<void> | void };

const shutdownSteps: ShutdownStep[] = [];
let shuttingDown = false;
let handlersInstalled = false;
let exitTimer: NodeJS.Timeout | null = null;

const SHUTDOWN_GRACE_MS = 8_000;

/** 注册一个优雅关闭步骤（各服务在模块加载期调用）。 */
export function registerShutdownStep(name: string, run: () => Promise<void> | void): void {
  shutdownSteps.push({ name, run });
}

/** 幂等安装信号处理器；多模块各自调用也不会重复注册。 */
export function installShutdownHandlers(): void {
  if (handlersInstalled) return;
  handlersInstalled = true;

  const handleSignal = (signal: NodeJS.Signals): void => {
    if (shuttingDown) return;
    shuttingDown = true;

    logger.warn(`[Shutdown] 收到 ${signal}，开始优雅关闭（${shutdownSteps.length} 个步骤）`);

    void (async () => {
      for (const step of shutdownSteps) {
        try {
          await step.run();
        } catch (error) {
          logger.error(`[Shutdown] 步骤 "${step.name}" 失败`, {
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
      // 所有步骤完成后退出；若仍有句柄阻止自然退出，由总宽限定时器兜底。
      process.exit(0);
    })();

    // 总宽限后强制退出，避免容器等待 --time 超时被 SIGKILL。
    exitTimer = setTimeout(() => {
      logger.warn("[Shutdown] 优雅关闭超时，强制退出");
      process.exit(0);
    }, SHUTDOWN_GRACE_MS);
    exitTimer.unref?.();
  };

  process.on("SIGTERM", handleSignal);
  process.on("SIGINT", handleSignal);
  // nodemon 重启信号：不消费，重新抛出让 nodemon 处理热重启。
  process.once("SIGUSR2", () => {
    process.kill(process.pid, "SIGUSR2");
  });
}
