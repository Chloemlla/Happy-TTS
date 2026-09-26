/**
 * 进程级后台任务的停机登记表。
 *
 * 多个服务在构造期就装上 setInterval（健康检查、缓存清理、SSE 清理……）。生产进程里
 * 它们活到进程退出，没有问题；测试进程里却没有任何东西拆它们，于是回调会活过 Jest
 * 拆卸测试环境的时点——那时 mongoose 的惰性 require 会撞上 jest-runtime 的拆卸守卫，
 * 把 process.exitCode 悄悄置 1。症状是「断言全绿、步骤仍 exit 1」，极难反推。
 *
 * 登记本身在生产侧无副作用（不会自动执行）；测试侧由 src/tests/setup.ts 的全局
 * afterAll 排空，见 stopRegisteredBackgroundTasks。
 */
type BackgroundTaskStopper = () => void;

const stoppers = new Set<BackgroundTaskStopper>();

export function registerBackgroundTaskStopper(stopper: BackgroundTaskStopper): void {
  stoppers.add(stopper);
}

/** 停止所有已登记的后台任务。 */
export function stopRegisteredBackgroundTasks(): void {
  for (const stopper of stoppers) {
    stopper();
  }
}
