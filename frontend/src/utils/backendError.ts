/**
 * 统一的后端错误信息提取。
 *
 * 优先展示后端返回的具体错误（4xx/5xx 的 { error } 或 { message }），
 * 其次退回运行时 error.message，最后退回通用文案。
 * 避免各页面各自硬编码/吞掉后端错误。
 */
export function getBackendErrorMessage(error: unknown, fallback: string): string {
  if (error && typeof error === 'object') {
    const data = (error as { response?: { data?: { error?: unknown; message?: unknown } } }).response?.data;
    if (typeof data?.error === 'string' && data.error.trim()) return data.error;
    if (typeof data?.message === 'string' && data.message.trim()) return data.message;
  }
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === 'string' && error.trim()) return error;
  return fallback;
}