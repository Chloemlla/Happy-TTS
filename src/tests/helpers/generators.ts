/**
 * Property-Based Testing Generators
 * 属性测试生成器 - 用于 fast-check
 * 
 * 注意：需要先安装 fast-check: npm install --save-dev fast-check
 */

import * as fc from 'fast-check';
import {
  VoiceStyle,
  GenerationRecord,
  ContentSuggestion,
  ChunkingStrategy,
  UserPreferences,
  RecommendationSettings,
  NotificationSettings,
  PrivacySettings,
  UsageStatistics,
  TimeSlot,
  LanguageUsage,
  OptimizationSuggestion,
  AnalyticsExport,
  ProfileExport
} from '../../types/recommendation';
import {
  Workspace,
  WorkspaceMember,
  WorkspaceSettings,
  Invitation,
  VoiceProject,
  ProjectContent,
  SharingSettings
} from '../../types/workspace';
import {
  CollaborationSession,
  SessionParticipant,
  Operation,
  CursorPosition,
  TextSelection,
  OperationData,
  SessionSummary
} from '../../types/collaboration';
import { Version, VersionDiff, TextChange, ConfigChange } from '../../types/versionControl';

// ============ 基础生成器 ============

// 生成有效的ID
export const arbId = (): fc.Arbitrary<string> =>
  fc.uuid();

// 生成用户ID
export const arbUserId = (): fc.Arbitrary<string> =>
  fc.string({ minLength: 8, maxLength: 24, unit: 'grapheme' }).filter(s => /^[a-zA-Z0-9]+$/.test(s));

// 生成非空字符串
export const arbNonEmptyString = (maxLength: number = 100): fc.Arbitrary<string> =>
  fc.string({ minLength: 1, maxLength });

// 生成语言代码
export const arbLanguage = (): fc.Arbitrary<string> =>
  fc.constantFrom('zh-CN', 'en-US', 'ja-JP', 'ko-KR', 'fr-FR', 'de-DE', 'es-ES');

// 生成情感类型
export const arbEmotionalTone = (): fc.Arbitrary<string> =>
  fc.constantFrom('neutral', 'happy', 'sad', 'angry', 'excited', 'calm', 'serious');

// ============ 推荐系统生成器 ============

// 生成语音风格
export const arbVoiceStyle = (): fc.Arbitrary<VoiceStyle> =>
  fc.record({
    id: arbId(),
    name: arbNonEmptyString(50),
    voice: fc.constantFrom('alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'),
    model: fc.constantFrom('tts-1', 'tts-1-hd'),
    speed: fc.float({ min: 0.25, max: 4.0, noNaN: true }),
    emotionalTone: arbEmotionalTone(),
    language: arbLanguage()
  });

// 生成分块策略
export const arbChunkingStrategy = (): fc.Arbitrary<ChunkingStrategy> =>
  fc.record({
    chunkSize: fc.integer({ min: 100, max: 2000 }),
    overlapSize: fc.integer({ min: 0, max: 100 }),
    breakPoints: fc.array(fc.constantFrom('.', '。', '!', '！', '?', '？', '\n'), { minLength: 1, maxLength: 5 })
  });

// 生成内容建议
export const arbContentSuggestion = (): fc.Arbitrary<ContentSuggestion> =>
  fc.record({
    voiceParameters: fc.record({
      speed: fc.option(fc.float({ min: 0.25, max: 4.0, noNaN: true })),
      emotionalTone: fc.option(arbEmotionalTone()),
      language: fc.option(arbLanguage())
    }),
    chunkingStrategy: fc.option(arbChunkingStrategy()),
    emotionalMatch: arbEmotionalTone(),
    confidence: fc.float({ min: 0, max: 1, noNaN: true })
  });

// 生成生成记录
export const arbGenerationRecord = (): fc.Arbitrary<GenerationRecord> =>
  fc.record({
    id: arbId(),
    timestamp: fc.date(),
    textContent: arbNonEmptyString(500),
    textLength: fc.integer({ min: 1, max: 10000 }),
    contentType: fc.constantFrom('article', 'dialogue', 'narration', 'news', 'story'),
    language: arbLanguage(),
    voiceStyle: arbVoiceStyle(),
    duration: fc.float({ min: 0.1, max: 3600, noNaN: true })
  });

// 生成推荐设置
export const arbRecommendationSettings = (): fc.Arbitrary<RecommendationSettings> =>
  fc.record({
    enabledCategories: fc.array(fc.constantFrom('news', 'story', 'dialogue', 'narration'), { maxLength: 4 }),
    disabledCategories: fc.array(fc.constantFrom('adult', 'violent'), { maxLength: 2 }),
    preferredLanguages: fc.array(arbLanguage(), { maxLength: 3 }),
    preferredVoices: fc.array(fc.constantFrom('alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'), { maxLength: 3 })
  });

// 生成通知设置
export const arbNotificationSettings = (): fc.Arbitrary<NotificationSettings> =>
  fc.record({
    emailNotifications: fc.boolean(),
    collaborationAlerts: fc.boolean(),
    weeklyDigest: fc.boolean()
  });

// 生成隐私设置
export const arbPrivacySettings = (): fc.Arbitrary<PrivacySettings> =>
  fc.record({
    shareUsageData: fc.boolean(),
    allowAnalytics: fc.boolean()
  });

// 生成用户偏好
export const arbUserPreferences = (): fc.Arbitrary<UserPreferences> =>
  fc.record({
    userId: arbUserId(),
    recommendationSettings: arbRecommendationSettings(),
    notificationSettings: arbNotificationSettings(),
    privacySettings: arbPrivacySettings(),
    updatedAt: fc.date()
  });

// ============ 工作空间生成器 ============

// 生成工作空间成员角色
export const arbMemberRole = (): fc.Arbitrary<'admin' | 'editor' | 'viewer'> =>
  fc.constantFrom('admin', 'editor', 'viewer');

// 生成工作空间成员
export const arbWorkspaceMember = (): fc.Arbitrary<WorkspaceMember> =>
  fc.record({
    userId: arbUserId(),
    role: arbMemberRole(),
    joinedAt: fc.date(),
    invitedBy: arbUserId()
  });

// 生成工作空间设置
export const arbWorkspaceSettings = (): fc.Arbitrary<WorkspaceSettings> =>
  fc.record({
    allowPublicSharing: fc.boolean(),
    defaultPermission: fc.constantFrom('editor', 'viewer'),
    notificationsEnabled: fc.boolean()
  });

// 生成工作空间
export const arbWorkspace = (): fc.Arbitrary<Workspace> =>
  fc.record({
    id: arbId(),
    name: arbNonEmptyString(100),
    description: fc.string({ maxLength: 500 }),
    creatorId: arbUserId(),
    members: fc.array(arbWorkspaceMember(), { minLength: 1, maxLength: 10 }),
    settings: arbWorkspaceSettings(),
    memberLimit: fc.integer({ min: 1, max: 100 }),
    createdAt: fc.date(),
    updatedAt: fc.date()
  });

// 生成邀请
export const arbInvitation = (): fc.Arbitrary<Invitation> =>
  fc.record({
    id: arbId(),
    workspaceId: arbId(),
    inviteeEmail: fc.emailAddress(),
    role: fc.constantFrom('editor', 'viewer'),
    status: fc.constantFrom('pending', 'accepted', 'declined', 'expired'),
    createdAt: fc.date(),
    expiresAt: fc.date()
  });

// 生成项目内容
export const arbProjectContent = (): fc.Arbitrary<ProjectContent> =>
  fc.record({
    text: arbNonEmptyString(1000),
    voiceConfig: arbVoiceStyle(),
    generatedAudioUrl: fc.option(fc.webUrl()),
    metadata: fc.dictionary(fc.string({ minLength: 1, maxLength: 20 }), fc.jsonValue())
  });

// 生成共享设置
export const arbSharingSettings = (): fc.Arbitrary<SharingSettings> =>
  fc.record({
    isShared: fc.boolean(),
    sharedWith: fc.array(arbUserId(), { maxLength: 10 }),
    permission: fc.constantFrom('view', 'edit')
  });

// 生成语音项目
export const arbVoiceProject = (): fc.Arbitrary<VoiceProject> =>
  fc.record({
    id: arbId(),
    name: arbNonEmptyString(100),
    ownerId: arbUserId(),
    workspaceId: fc.option(arbId()),
    content: arbProjectContent(),
    sharing: arbSharingSettings(),
    activeViewers: fc.array(arbUserId(), { maxLength: 5 }),
    createdAt: fc.date(),
    updatedAt: fc.date()
  });

// ============ 协作生成器 ============

// 生成光标位置
export const arbCursorPosition = (): fc.Arbitrary<CursorPosition> =>
  fc.record({
    line: fc.integer({ min: 0, max: 1000 }),
    column: fc.integer({ min: 0, max: 500 })
  });

// 生成文本选择
export const arbTextSelection = (): fc.Arbitrary<TextSelection> =>
  fc.record({
    start: arbCursorPosition(),
    end: arbCursorPosition()
  });

// 生成操作数据
export const arbOperationData = (): fc.Arbitrary<OperationData> =>
  fc.record({
    position: fc.option(arbCursorPosition()),
    text: fc.option(fc.string({ maxLength: 200 })),
    length: fc.option(fc.integer({ min: 0, max: 1000 })),
    configKey: fc.option(fc.string({ minLength: 1, maxLength: 50 })),
    configValue: fc.option(fc.jsonValue())
  });

// 生成操作
export const arbOperation = (): fc.Arbitrary<Operation> =>
  fc.record({
    id: arbId(),
    type: fc.constantFrom('insert', 'delete', 'replace', 'config_change'),
    userId: arbUserId(),
    timestamp: fc.date(),
    data: arbOperationData()
  });

// 生成会话参与者
export const arbSessionParticipant = (): fc.Arbitrary<SessionParticipant> =>
  fc.record({
    userId: arbUserId(),
    cursorPosition: arbCursorPosition(),
    selection: fc.option(arbTextSelection()),
    isConnected: fc.boolean(),
    lastSeen: fc.date(),
    pendingChanges: fc.array(arbOperation(), { maxLength: 5 })
  });

// 生成协作会话
export const arbCollaborationSession = (): fc.Arbitrary<CollaborationSession> =>
  fc.record({
    id: arbId(),
    projectId: arbId(),
    participants: fc.array(arbSessionParticipant(), { minLength: 1, maxLength: 10 }),
    state: arbProjectContent(),
    pendingOperations: fc.array(arbOperation(), { maxLength: 20 }),
    startedAt: fc.date(),
    lastActivity: fc.date()
  });

// 生成会话摘要
export const arbSessionSummary = (): fc.Arbitrary<SessionSummary> =>
  fc.record({
    sessionId: arbId(),
    duration: fc.integer({ min: 0, max: 86400000 }),
    participantCount: fc.integer({ min: 1, max: 100 }),
    operationCount: fc.integer({ min: 0, max: 10000 }),
    finalState: arbProjectContent()
  });

// ============ 版本控制生成器 ============

// 生成版本
export const arbVersion = (): fc.Arbitrary<Version> =>
  fc.record({
    id: arbId(),
    projectId: arbId(),
    versionNumber: fc.integer({ min: 1, max: 10000 }),
    snapshot: arbProjectContent(),
    authorId: arbUserId(),
    changeSummary: fc.string({ maxLength: 500 }),
    createdAt: fc.date()
  });

// 生成文本变更
export const arbTextChange = (): fc.Arbitrary<TextChange> =>
  fc.record({
    type: fc.constantFrom('added', 'removed', 'modified'),
    lineNumber: fc.integer({ min: 1, max: 10000 }),
    oldText: fc.option(fc.string({ maxLength: 200 })),
    newText: fc.option(fc.string({ maxLength: 200 }))
  });

// 生成配置变更
export const arbConfigChange = (): fc.Arbitrary<ConfigChange> =>
  fc.record({
    key: fc.string({ minLength: 1, maxLength: 50 }),
    oldValue: fc.jsonValue(),
    newValue: fc.jsonValue()
  });

// 生成版本差异
export const arbVersionDiff = (): fc.Arbitrary<VersionDiff> =>
  fc.record({
    textChanges: fc.array(arbTextChange(), { maxLength: 50 }),
    configChanges: fc.array(arbConfigChange(), { maxLength: 10 })
  });

// ============ 分析导出生成器 ============

// 生成时间段
export const arbTimeSlot = (): fc.Arbitrary<TimeSlot> =>
  fc.record({
    hour: fc.integer({ min: 0, max: 23 }),
    dayOfWeek: fc.integer({ min: 0, max: 6 }),
    count: fc.integer({ min: 0, max: 10000 })
  });

// 生成语言使用统计
export const arbLanguageUsage = (): fc.Arbitrary<LanguageUsage> =>
  fc.record({
    language: arbLanguage(),
    percentage: fc.float({ min: 0, max: 100, noNaN: true })
  });

// 生成使用统计
export const arbUsageStatistics = (): fc.Arbitrary<UsageStatistics> =>
  fc.record({
    totalGenerations: fc.integer({ min: 0, max: 100000 }),
    favoriteStyles: fc.array(arbVoiceStyle(), { maxLength: 5 }),
    peakUsageTimes: fc.array(arbTimeSlot(), { maxLength: 10 }),
    averageTextLength: fc.float({ min: 0, max: 10000, noNaN: true }),
    mostUsedLanguages: fc.array(arbLanguageUsage(), { maxLength: 5 })
  });

// 生成优化建议
export const arbOptimizationSuggestion = (): fc.Arbitrary<OptimizationSuggestion> =>
  fc.record({
    type: fc.constantFrom('template', 'workflow', 'setting'),
    title: arbNonEmptyString(100),
    description: arbNonEmptyString(500),
    actionUrl: fc.option(fc.webUrl()),
    priority: fc.constantFrom('high', 'medium', 'low')
  });

// 生成分析导出
export const arbAnalyticsExport = (): fc.Arbitrary<AnalyticsExport> =>
  fc.record({
    userId: arbUserId(),
    exportDate: fc.date(),
    statistics: arbUsageStatistics(),
    suggestions: fc.array(arbOptimizationSuggestion(), { maxLength: 10 }),
    rawData: fc.option(fc.array(arbGenerationRecord(), { maxLength: 100 }))
  });

// 生成配置导出
export const arbProfileExport = (): fc.Arbitrary<ProfileExport> =>
  fc.record({
    userId: arbUserId(),
    exportDate: fc.date(),
    preferences: arbUserPreferences(),
    history: fc.array(arbGenerationRecord(), { maxLength: 100 })
  });

// ============ 配置 ============

// 配置 fast-check 全局设置
export const configureFastCheck = () => {
  fc.configureGlobal({ numRuns: 100 });
};

export default {
  // 基础
  arbId,
  arbUserId,
  arbNonEmptyString,
  arbLanguage,
  arbEmotionalTone,
  // 推荐
  arbVoiceStyle,
  arbChunkingStrategy,
  arbContentSuggestion,
  arbGenerationRecord,
  arbRecommendationSettings,
  arbNotificationSettings,
  arbPrivacySettings,
  arbUserPreferences,
  // 工作空间
  arbMemberRole,
  arbWorkspaceMember,
  arbWorkspaceSettings,
  arbWorkspace,
  arbInvitation,
  arbProjectContent,
  arbSharingSettings,
  arbVoiceProject,
  // 协作
  arbCursorPosition,
  arbTextSelection,
  arbOperationData,
  arbOperation,
  arbSessionParticipant,
  arbCollaborationSession,
  arbSessionSummary,
  // 版本控制
  arbVersion,
  arbTextChange,
  arbConfigChange,
  arbVersionDiff,
  // 分析
  arbTimeSlot,
  arbLanguageUsage,
  arbUsageStatistics,
  arbOptimizationSuggestion,
  arbAnalyticsExport,
  arbProfileExport,
  // 配置
  configureFastCheck
};
