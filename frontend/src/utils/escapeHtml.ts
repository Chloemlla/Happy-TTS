// 简单的 HTML 转义函数，防止 XSS
export function escapeHtml(str: string): string {
  return str.replace(/[&<>"]|'/g, tag => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[tag] || tag));
}

// 类型声明，便于 TypeScript 正确识别
export type { }; 