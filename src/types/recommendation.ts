/**
 * 智能推荐系统类型定义
 * Intelligent Recommendation System Type Definitions
 */

// 语音风格配置接口
export interface VoiceStyle {
  id: string;
  name: string;
  voice: string;
  model: string;
  speed: number;
  emotionalTone: string;
  language: string;
}

// 用户偏好接口
export interface UserPreferences {
  userId: string;
  recommendationSettings: RecommendationSettings;
  notificationSettings: NotificationSettings;
  privacySettings: PrivacySettings;
  updatedAt: Date;
}

// 推荐设置接口
export interface RecommendationSettings {
  enabledCategories: string[];
  disabledCategories: string[];
  preferredLanguages: string[];
  preferredVoices: string[];
}

// 通知设置接口
export interface NotificationSettings {
  emailNotifications: boolean;
  collaborationAlerts: boolean;
  weeklyDigest: boolean;
}

// 隐私设置接口
export interface PrivacySettings {
  shareUsageData: boolean;
  allowAnalytics: boolean;
}

// 用户历史记录接口
export interface UserHistory {
  userId: string;
  generations: GenerationRecord[];
  preferences: UserPreferences;
  lastUpdated: Date;
}

// 生成记录接口
export interface GenerationRecord {
  id: string;
  timestamp: Date;
  textContent: string;
  textLength: number;
  contentType: string;
  language: string;
  voiceStyle: VoiceStyle;
  duration: number;
}

// 推荐结果接口
export interface Recommendation {
  voiceStyle: VoiceStyle;
  similarityScore: number;
  reason: string;
  sampleAudioUrl: string;
}

// 内容建议接口
export interface ContentSuggestion {
  voiceParameters: Partial<VoiceStyle>;
  chunkingStrategy?: ChunkingStrategy;
  emotionalMatch: string;
  confidence: number;
}

// 分块策略接口
export interface ChunkingStrategy {
  chunkSize: number;
  overlapSize: number;
  breakPoints: string[];
}

// 使用统计接口
export interface UsageStatistics {
  totalGenerations: number;
  favoriteStyles: VoiceStyle[];
  peakUsageTimes: TimeSlot[];
  averageTextLength: number;
  mostUsedLanguages: LanguageUsage[];
}

// 时间段接口
export interface TimeSlot {
  hour: number;
  dayOfWeek: number;
  count: number;
}

// 语言使用统计接口
export interface LanguageUsage {
  language: string;
  percentage: number;
}

// 优化建议接口
export interface OptimizationSuggestion {
  type: 'template' | 'workflow' | 'setting';
  title: string;
  description: string;
  actionUrl?: string;
  priority: 'high' | 'medium' | 'low';
}

// 模式检测接口
export interface PatternDetection {
  patternType: string;
  frequency: number;
  configurations: VoiceStyle[];
  suggestion: string;
}

// 分析导出接口
export interface AnalyticsExport {
  userId: string;
  exportDate: Date;
  statistics: UsageStatistics;
  suggestions: OptimizationSuggestion[];
  rawData?: GenerationRecord[];
}

// 用户配置导出接口
export interface ProfileExport {
  userId: string;
  exportDate: Date;
  preferences: UserPreferences;
  history: GenerationRecord[];
}
