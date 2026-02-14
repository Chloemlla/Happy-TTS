/**
 * 使用分析服务 - Usage Analytics Service
 * 提供使用统计、优化建议和数据导出功能
 * 
 * Requirements: 3.1, 3.2, 3.3, 3.5, 3.6
 */

import RecommendationHistoryModel from '../models/recommendationHistoryModel';
import {
  GenerationRecord,
  VoiceStyle,
  UsageStatistics,
  TimeSlot,
  LanguageUsage,
  OptimizationSuggestion,
  PatternDetection,
  AnalyticsExport
} from '../types/recommendation';
import logger from '../utils/logger';

// 重复模式检测阈值：相同配置出现3次以上视为重复模式
const REPETITIVE_PATTERN_THRESHOLD = 3;

// 分析导出JSON Schema用于验证
const ANALYTICS_EXPORT_SCHEMA = {
  type: 'object',
  required: ['userId', 'exportDate', 'statistics', 'suggestions'],
  properties: {
    userId: { type: 'string' },
    exportDate: { type: 'string' },
    statistics: {
      type: 'object',
      required: ['totalGenerations', 'favoriteStyles', 'peakUsageTimes', 'averageTextLength', 'mostUsedLanguages'],
      properties: {
        totalGenerations: { type: 'number' },
        favoriteStyles: { type: 'array' },
        peakUsageTimes: { type: 'array' },
        averageTextLength: { type: 'number' },
        mostUsedLanguages: { type: 'array' }
      }
    },
    suggestions: { type: 'array' },
    rawData: { type: 'array' }
  }
};

/**
 * 使用分析服务类
 */
export class UsageAnalyticsService {
  /**
   * 获取用户使用统计
   * Requirements: 3.1
   * 
   * @param userId 用户ID
   * @returns 使用统计数据
   */
  async getStatistics(userId: string): Promise<UsageStatistics> {
    try {
      const history = await RecommendationHistoryModel.findOne({ userId }).lean();

      if (!history || history.generations.length === 0) {
        return this.getEmptyStatistics();
      }

      const generations = history.generations;

      // 计算总生成次数
      const totalGenerations = generations.length;

      // 计算最常用的语音风格
      const favoriteStyles = this.calculateFavoriteStyles(generations);

      // 计算高峰使用时间
      const peakUsageTimes = this.calculatePeakUsageTimes(generations);

      // 计算平均文本长度
      const averageTextLength = this.calculateAverageTextLength(generations);

      // 计算最常用语言
      const mostUsedLanguages = this.calculateLanguageUsage(generations);

      return {
        totalGenerations,
        favoriteStyles,
        peakUsageTimes,
        averageTextLength,
        mostUsedLanguages
      };
    } catch (error) {
      logger.error('[UsageAnalyticsService] 获取统计数据失败:', error);
      return this.getEmptyStatistics();
    }
  }

  /**
   * 获取优化建议
   * Requirements: 3.2
   * 
   * @param userId 用户ID
   * @returns 优化建议列表
   */
  async getOptimizationSuggestions(userId: string): Promise<OptimizationSuggestion[]> {
    try {
      const suggestions: OptimizationSuggestion[] = [];
      const history = await RecommendationHistoryModel.findOne({ userId }).lean();

      if (!history || history.generations.length === 0) {
        suggestions.push({
          type: 'workflow',
          title: '开始使用语音生成',
          description: '您还没有任何生成记录，开始创建您的第一个语音项目吧！',
          actionUrl: '/create',
          priority: 'high'
        });
        return suggestions;
      }

      const generations = history.generations;

      // 检测重复模式并建议创建模板（Requirements 3.3）
      const patterns = await this.detectRepetitivePatterns(userId);
      for (const pattern of patterns) {
        if (pattern.frequency >= REPETITIVE_PATTERN_THRESHOLD) {
          suggestions.push({
            type: 'template',
            title: `创建"${pattern.patternType}"模板`,
            description: pattern.suggestion,
            actionUrl: '/templates/create',
            priority: 'high'
          });
        }
      }

      // 分析工作流效率
      const workflowSuggestions = this.analyzeWorkflowEfficiency(generations);
      suggestions.push(...workflowSuggestions);

      // 分析设置优化
      const settingSuggestions = this.analyzeSettingOptimizations(generations);
      suggestions.push(...settingSuggestions);

      return suggestions;
    } catch (error) {
      logger.error('[UsageAnalyticsService] 获取优化建议失败:', error);
      return [];
    }
  }

  /**
   * 检测重复使用模式
   * Requirements: 3.3
   * 
   * @param userId 用户ID
   * @returns 检测到的模式列表
   */
  async detectRepetitivePatterns(userId: string): Promise<PatternDetection[]> {
    try {
      const history = await RecommendationHistoryModel.findOne({ userId }).lean();

      if (!history || history.generations.length === 0) {
        return [];
      }

      const generations = history.generations;
      const patterns: PatternDetection[] = [];

      // 按语音配置分组
      const configGroups = this.groupByVoiceConfig(generations);

      Array.from(configGroups.entries()).forEach(([configKey, records]) => {
        if (records.length >= REPETITIVE_PATTERN_THRESHOLD) {
          const voiceStyle = records[0].voiceStyle;
          patterns.push({
            patternType: `${voiceStyle.name} (${voiceStyle.emotionalTone})`,
            frequency: records.length,
            configurations: [voiceStyle],
            suggestion: `您已使用"${voiceStyle.name}"配置${records.length}次，建议创建模板以提高效率`
          });
        }
      });

      // 按内容类型分组
      const contentTypeGroups = this.groupByContentType(generations);
      Array.from(contentTypeGroups.entries()).forEach(([contentType, records]) => {
        if (records.length >= REPETITIVE_PATTERN_THRESHOLD) {
          const commonStyles = this.findCommonStyles(records);
          if (commonStyles.length > 0) {
            patterns.push({
              patternType: `${contentType}类型内容`,
              frequency: records.length,
              configurations: commonStyles,
              suggestion: `您经常生成${contentType}类型的内容，建议为此类内容创建专用模板`
            });
          }
        }
      });

      return patterns;
    } catch (error) {
      logger.error('[UsageAnalyticsService] 检测重复模式失败:', error);
      return [];
    }
  }

  /**
   * 导出分析数据
   * Requirements: 3.5
   * 
   * @param userId 用户ID
   * @param format 导出格式 ('json' | 'csv')
   * @returns 导出的数据字符串
   */
  async exportData(userId: string, format: 'json' | 'csv'): Promise<string> {
    try {
      const statistics = await this.getStatistics(userId);
      const suggestions = await this.getOptimizationSuggestions(userId);
      const history = await RecommendationHistoryModel.findOne({ userId }).lean();

      const exportData: AnalyticsExport = {
        userId,
        exportDate: new Date(),
        statistics,
        suggestions,
        rawData: history?.generations || []
      };

      if (format === 'json') {
        return JSON.stringify(exportData, null, 2);
      } else {
        return this.convertToCSV(exportData);
      }
    } catch (error) {
      logger.error('[UsageAnalyticsService] 导出数据失败:', error);
      throw new Error('导出数据失败');
    }
  }

  /**
   * 解析导出的数据
   * Requirements: 3.6
   * 
   * @param data 数据字符串
   * @param format 数据格式 ('json' | 'csv')
   * @returns 解析后的分析导出对象
   */
  parseExportedData(data: string, format: 'json' | 'csv'): AnalyticsExport {
    try {
      if (format === 'json') {
        const parsed = JSON.parse(data);
        
        // 验证必需字段
        if (!this.validateAnalyticsExport(parsed)) {
          throw new Error('Invalid AnalyticsExport format');
        }

        // 转换日期字符串为Date对象
        parsed.exportDate = new Date(parsed.exportDate);
        if (parsed.rawData) {
          parsed.rawData = parsed.rawData.map((record: any) => ({
            ...record,
            timestamp: new Date(record.timestamp)
          }));
        }

        return parsed as AnalyticsExport;
      } else {
        return this.parseCSV(data);
      }
    } catch (error) {
      logger.error('[UsageAnalyticsService] 解析导出数据失败:', error);
      throw new Error(`Failed to parse exported data: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  // ==================== 私有辅助方法 ====================

  /**
   * 返回空的统计数据
   */
  private getEmptyStatistics(): UsageStatistics {
    return {
      totalGenerations: 0,
      favoriteStyles: [],
      peakUsageTimes: [],
      averageTextLength: 0,
      mostUsedLanguages: []
    };
  }

  /**
   * 计算最常用的语音风格
   */
  private calculateFavoriteStyles(generations: GenerationRecord[]): VoiceStyle[] {
    const styleCount = new Map<string, { style: VoiceStyle; count: number }>();

    for (const gen of generations) {
      const styleId = gen.voiceStyle.id;
      const existing = styleCount.get(styleId);
      if (existing) {
        existing.count++;
      } else {
        styleCount.set(styleId, { style: gen.voiceStyle, count: 1 });
      }
    }

    return Array.from(styleCount.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 5)
      .map(item => item.style);
  }

  /**
   * 计算高峰使用时间
   */
  private calculatePeakUsageTimes(generations: GenerationRecord[]): TimeSlot[] {
    const timeSlots = new Map<string, TimeSlot>();

    for (const gen of generations) {
      const date = new Date(gen.timestamp);
      const hour = date.getHours();
      const dayOfWeek = date.getDay();
      const key = `${dayOfWeek}-${hour}`;

      const existing = timeSlots.get(key);
      if (existing) {
        existing.count++;
      } else {
        timeSlots.set(key, { hour, dayOfWeek, count: 1 });
      }
    }

    return Array.from(timeSlots.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }

  /**
   * 计算平均文本长度
   */
  private calculateAverageTextLength(generations: GenerationRecord[]): number {
    if (generations.length === 0) return 0;
    
    const totalLength = generations.reduce((sum, gen) => sum + gen.textLength, 0);
    return Math.round(totalLength / generations.length);
  }

  /**
   * 计算语言使用统计
   */
  private calculateLanguageUsage(generations: GenerationRecord[]): LanguageUsage[] {
    const languageCount = new Map<string, number>();

    for (const gen of generations) {
      const language = gen.language;
      languageCount.set(language, (languageCount.get(language) || 0) + 1);
    }

    const total = generations.length;
    return Array.from(languageCount.entries())
      .map(([language, count]) => ({
        language,
        percentage: Math.round((count / total) * 100)
      }))
      .sort((a, b) => b.percentage - a.percentage);
  }

  /**
   * 按语音配置分组
   */
  private groupByVoiceConfig(generations: GenerationRecord[]): Map<string, GenerationRecord[]> {
    const groups = new Map<string, GenerationRecord[]>();

    for (const gen of generations) {
      const key = `${gen.voiceStyle.id}-${gen.voiceStyle.speed}-${gen.voiceStyle.emotionalTone}`;
      const existing = groups.get(key) || [];
      existing.push(gen);
      groups.set(key, existing);
    }

    return groups;
  }

  /**
   * 按内容类型分组
   */
  private groupByContentType(generations: GenerationRecord[]): Map<string, GenerationRecord[]> {
    const groups = new Map<string, GenerationRecord[]>();

    for (const gen of generations) {
      const existing = groups.get(gen.contentType) || [];
      existing.push(gen);
      groups.set(gen.contentType, existing);
    }

    return groups;
  }

  /**
   * 查找常用风格
   */
  private findCommonStyles(records: GenerationRecord[]): VoiceStyle[] {
    const styleCount = new Map<string, { style: VoiceStyle; count: number }>();

    for (const record of records) {
      const styleId = record.voiceStyle.id;
      const existing = styleCount.get(styleId);
      if (existing) {
        existing.count++;
      } else {
        styleCount.set(styleId, { style: record.voiceStyle, count: 1 });
      }
    }

    return Array.from(styleCount.values())
      .filter(item => item.count >= 2)
      .sort((a, b) => b.count - a.count)
      .slice(0, 3)
      .map(item => item.style);
  }

  /**
   * 分析工作流效率
   */
  private analyzeWorkflowEfficiency(generations: GenerationRecord[]): OptimizationSuggestion[] {
    const suggestions: OptimizationSuggestion[] = [];

    // 检查是否有大量短文本生成
    const shortTextCount = generations.filter(g => g.textLength < 50).length;
    if (shortTextCount > generations.length * 0.5) {
      suggestions.push({
        type: 'workflow',
        title: '批量处理短文本',
        description: '您有大量短文本生成记录，建议使用批量处理功能提高效率',
        actionUrl: '/batch',
        priority: 'medium'
      });
    }

    // 检查是否频繁切换语音风格
    const uniqueStyles = new Set(generations.map(g => g.voiceStyle.id)).size;
    if (uniqueStyles > generations.length * 0.7) {
      suggestions.push({
        type: 'workflow',
        title: '固定常用风格',
        description: '您频繁切换语音风格，建议收藏常用风格以减少选择时间',
        actionUrl: '/favorites',
        priority: 'low'
      });
    }

    return suggestions;
  }

  /**
   * 分析设置优化
   */
  private analyzeSettingOptimizations(generations: GenerationRecord[]): OptimizationSuggestion[] {
    const suggestions: OptimizationSuggestion[] = [];

    // 检查是否总是使用默认速度
    const defaultSpeedCount = generations.filter(g => g.voiceStyle.speed === 1.0).length;
    if (defaultSpeedCount === generations.length && generations.length > 10) {
      suggestions.push({
        type: 'setting',
        title: '尝试调整语速',
        description: '您一直使用默认语速，尝试调整语速可能获得更好的效果',
        priority: 'low'
      });
    }

    return suggestions;
  }

  /**
   * 转换为CSV格式
   */
  private convertToCSV(exportData: AnalyticsExport): string {
    const lines: string[] = [];

    // 添加元数据
    lines.push('# Analytics Export');
    lines.push(`# User ID: ${exportData.userId}`);
    lines.push(`# Export Date: ${exportData.exportDate.toISOString()}`);
    lines.push('');

    // 添加统计摘要
    lines.push('# Statistics Summary');
    lines.push(`Total Generations,${exportData.statistics.totalGenerations}`);
    lines.push(`Average Text Length,${exportData.statistics.averageTextLength}`);
    lines.push('');

    // 添加语言使用统计
    lines.push('# Language Usage');
    lines.push('Language,Percentage');
    for (const lang of exportData.statistics.mostUsedLanguages) {
      lines.push(`${lang.language},${lang.percentage}`);
    }
    lines.push('');

    // 添加原始数据（如果有）
    if (exportData.rawData && exportData.rawData.length > 0) {
      lines.push('# Generation Records');
      lines.push('ID,Timestamp,TextLength,ContentType,Language,VoiceStyleId,VoiceStyleName,Speed,EmotionalTone');
      for (const record of exportData.rawData) {
        lines.push([
          record.id,
          new Date(record.timestamp).toISOString(),
          record.textLength,
          record.contentType,
          record.language,
          record.voiceStyle.id,
          record.voiceStyle.name,
          record.voiceStyle.speed,
          record.voiceStyle.emotionalTone
        ].join(','));
      }
    }

    return lines.join('\n');
  }

  /**
   * 解析CSV格式
   */
  private parseCSV(data: string): AnalyticsExport {
    const lines = data.split('\n').filter(line => line.trim() && !line.startsWith('#'));
    
    // 解析基本信息
    let userId = '';
    let exportDate = new Date();
    let totalGenerations = 0;
    let averageTextLength = 0;
    const mostUsedLanguages: LanguageUsage[] = [];
    const rawData: GenerationRecord[] = [];

    // 从注释中提取元数据
    const allLines = data.split('\n');
    for (const line of allLines) {
      if (line.startsWith('# User ID:')) {
        userId = line.replace('# User ID:', '').trim();
      } else if (line.startsWith('# Export Date:')) {
        exportDate = new Date(line.replace('# Export Date:', '').trim());
      }
    }

    // 解析数据行
    let section = '';
    for (const line of lines) {
      if (line.includes('Total Generations')) {
        totalGenerations = parseInt(line.split(',')[1]) || 0;
      } else if (line.includes('Average Text Length')) {
        averageTextLength = parseInt(line.split(',')[1]) || 0;
      } else if (line === 'Language,Percentage') {
        section = 'language';
      } else if (line === 'ID,Timestamp,TextLength,ContentType,Language,VoiceStyleId,VoiceStyleName,Speed,EmotionalTone') {
        section = 'records';
      } else if (section === 'language' && line.includes(',')) {
        const [language, percentage] = line.split(',');
        mostUsedLanguages.push({ language, percentage: parseInt(percentage) || 0 });
      } else if (section === 'records' && line.includes(',')) {
        const parts = line.split(',');
        if (parts.length >= 9) {
          rawData.push({
            id: parts[0],
            timestamp: new Date(parts[1]),
            textContent: '',
            textLength: parseInt(parts[2]) || 0,
            contentType: parts[3],
            language: parts[4],
            voiceStyle: {
              id: parts[5],
              name: parts[6],
              voice: '',
              model: '',
              speed: parseFloat(parts[7]) || 1.0,
              emotionalTone: parts[8],
              language: parts[4]
            },
            duration: 0
          });
        }
      }
    }

    return {
      userId,
      exportDate,
      statistics: {
        totalGenerations,
        favoriteStyles: [],
        peakUsageTimes: [],
        averageTextLength,
        mostUsedLanguages
      },
      suggestions: [],
      rawData
    };
  }

  /**
   * 验证AnalyticsExport对象格式
   */
  private validateAnalyticsExport(obj: any): boolean {
    if (!obj || typeof obj !== 'object') return false;
    if (typeof obj.userId !== 'string') return false;
    if (!obj.exportDate) return false;
    if (!obj.statistics || typeof obj.statistics !== 'object') return false;
    if (typeof obj.statistics.totalGenerations !== 'number') return false;
    if (!Array.isArray(obj.statistics.favoriteStyles)) return false;
    if (!Array.isArray(obj.statistics.peakUsageTimes)) return false;
    if (typeof obj.statistics.averageTextLength !== 'number') return false;
    if (!Array.isArray(obj.statistics.mostUsedLanguages)) return false;
    if (!Array.isArray(obj.suggestions)) return false;

    return true;
  }
}

// 导出单例实例
export const usageAnalyticsService = new UsageAnalyticsService();
