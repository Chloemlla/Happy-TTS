/**
 * FBI通缉犯相关类型定义
 * 统一管理所有FBI功能的TypeScript接口
 */

/**
 * FBI通缉犯完整信息
 */
export interface FBIWanted {
  _id: string;
  name: string;
  aliases: string[];
  age: number;
  height: string;
  weight: string;
  eyes: string;
  hair: string;
  race: string;
  nationality: string;
  dateOfBirth: string;
  placeOfBirth: string;
  charges: string[];
  description: string;
  reward: number;
  photoUrl: string;
  fingerprints: string[];
  lastKnownLocation: string;
  dangerLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'EXTREME';
  status: 'ACTIVE' | 'CAPTURED' | 'DECEASED' | 'REMOVED';
  dateAdded: string;
  lastUpdated: string;
  fbiNumber: string;
  ncicNumber: string;
  occupation: string;
  scarsAndMarks: string[];
  languages: string[];
  caution: string;
  remarks: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * FBI统计信息
 */
export interface FBIStatistics {
  total: number;
  active: number;
  captured: number;
  deceased: number;
  dangerLevels: Record<string, number>;
  recentAdded: Array<{
    name: string;
    fbiNumber: string;
    dateAdded: string;
    dangerLevel: string;
  }>;
}

/**
 * API响应格式（通用）
 */
export interface FBIApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
  pagination?: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}

/**
 * 分页查询参数
 */
export interface FBIPaginationParams {
  page?: number;
  limit?: number;
  status?: string;
  dangerLevel?: string;
  search?: string;
}

/**
 * 创建/更新通缉犯的数据（部分字段）
 */
export type FBIWantedInput = Partial<Omit<FBIWanted, '_id' | 'createdAt' | 'updatedAt' | 'fbiNumber' | 'ncicNumber'>>;

/**
 * 危险等级选项
 */
export const DANGER_LEVELS = ['LOW', 'MEDIUM', 'HIGH', 'EXTREME'] as const;
export type DangerLevel = typeof DANGER_LEVELS[number];

/**
 * 状态选项
 */
export const STATUS_OPTIONS = ['ACTIVE', 'CAPTURED', 'DECEASED', 'REMOVED'] as const;
export type WantedStatus = typeof STATUS_OPTIONS[number];

/**
 * 危险等级显示配置
 */
export const DANGER_LEVEL_CONFIG: Record<DangerLevel, { label: string; color: string; bgColor: string }> = {
  LOW: {
    label: '低危',
    color: 'text-green-700',
    bgColor: 'bg-green-100'
  },
  MEDIUM: {
    label: '中危',
    color: 'text-yellow-700',
    bgColor: 'bg-yellow-100'
  },
  HIGH: {
    label: '高危',
    color: 'text-orange-700',
    bgColor: 'bg-orange-100'
  },
  EXTREME: {
    label: '极危',
    color: 'text-red-700',
    bgColor: 'bg-red-100'
  }
};

/**
 * 状态显示配置
 */
export const STATUS_CONFIG: Record<WantedStatus, { label: string; color: string; bgColor: string }> = {
  ACTIVE: {
    label: '在逃',
    color: 'text-red-700',
    bgColor: 'bg-red-100'
  },
  CAPTURED: {
    label: '已抓获',
    color: 'text-blue-700',
    bgColor: 'bg-blue-100'
  },
  DECEASED: {
    label: '已死亡',
    color: 'text-gray-700',
    bgColor: 'bg-gray-100'
  },
  REMOVED: {
    label: '已移除',
    color: 'text-purple-700',
    bgColor: 'bg-purple-100'
  }
};
