// 共享的类型定义
export interface GenerationRecord {
  userId: string;
  text: string;
  voice?: string;
  model?: string;
  outputFormat?: string;
  speed?: number;
  fileName?: string;
  contentHash?: string;
  timestamp?: Date | string;
}

// 共享的工具函数
export async function isAdminUser(userId: string): Promise<boolean> {
  const { getUserById } = await import('../userService');
  const user = await getUserById(userId);
  return !!(user && user.role === 'admin');
} 