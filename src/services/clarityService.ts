import { mongoose } from './mongoService';
import logger from '../utils/logger';

// =============== 类型定义 ===============

/** 服务响应结果 */
export interface ClarityServiceResult<T = void> {
    success: boolean;
    data?: T;
    error?: {
        code: string;
        message: string;
    };
}

/** 错误码定义 */
export enum ClarityErrorCode {
    INVALID_FORMAT = 'INVALID_FORMAT',
    INVALID_INPUT = 'INVALID_INPUT',
    DB_NOT_CONNECTED = 'DB_NOT_CONNECTED',
    UPDATE_FAILED = 'UPDATE_FAILED',
    DELETE_FAILED = 'DELETE_FAILED',
    READ_FAILED = 'READ_FAILED',
}

// =============== 验证函数 ===============

/**
 * 验证 Clarity Project ID 格式
 * Microsoft Clarity Project ID 格式：10位小写字母数字组合
 * 示例：t1dkcavsyz
 */
const validateClarityProjectId = (projectId: string): ClarityServiceResult<string> => {
    if (!projectId || typeof projectId !== 'string') {
        return {
            success: false,
            error: {
                code: ClarityErrorCode.INVALID_INPUT,
                message: 'Project ID 不能为空'
            }
        };
    }

    const trimmed = projectId.trim().toLowerCase();

    // Clarity Project ID 格式：10位小写字母数字组合
    const clarityIdPattern = /^[a-z0-9]{10}$/;
    
    if (!clarityIdPattern.test(trimmed)) {
        return {
            success: false,
            error: {
                code: ClarityErrorCode.INVALID_FORMAT,
                message: 'Project ID 格式无效，应为10位小写字母数字组合（例如：t1dkcavsyz）'
            }
        };
    }

    return {
        success: true,
        data: trimmed
    };
};

// =============== 数据模型 ===============

// Clarity配置文档接口
interface ClaritySettingDoc {
    key: string;
    value: string;
    updatedAt?: Date;
}

// Clarity配置历史记录接口
export interface ClarityHistoryDoc {
    key: string;
    oldValue: string | null;
    newValue: string | null;
    operation: 'create' | 'update' | 'delete';
    changedBy?: string;
    changedAt: Date;
    metadata?: {
        ip?: string;
        userAgent?: string;
        reason?: string;
    };
}

// Clarity配置Schema
const ClaritySettingSchema = new mongoose.Schema<ClaritySettingDoc>({
    key: { type: String, required: true, unique: true, index: true },
    value: { type: String, required: true },
    updatedAt: { type: Date, default: Date.now }
}, { collection: 'clarity_settings' });

// Clarity配置历史Schema
const ClarityHistorySchema = new mongoose.Schema<ClarityHistoryDoc>({
    key: { type: String, required: true, index: true },
    oldValue: { type: String, default: null },
    newValue: { type: String, default: null },
    operation: { type: String, required: true, enum: ['create', 'update', 'delete'] },
    changedBy: { type: String, default: null },
    changedAt: { type: Date, default: Date.now, index: true },
    metadata: {
        ip: { type: String },
        userAgent: { type: String },
        reason: { type: String }
    }
}, { collection: 'clarity_history' });

const ClaritySettingModel = (mongoose.models.ClaritySetting as mongoose.Model<ClaritySettingDoc>) ||
    mongoose.model<ClaritySettingDoc>('ClaritySetting', ClaritySettingSchema);

const ClarityHistoryModel = (mongoose.models.ClarityHistory as mongoose.Model<ClarityHistoryDoc>) ||
    mongoose.model<ClarityHistoryDoc>('ClarityHistory', ClarityHistorySchema);

// =============== 辅助函数 ===============

/**
 * 记录配置变更历史
 */
async function recordHistory(
    key: string,
    oldValue: string | null,
    newValue: string | null,
    operation: 'create' | 'update' | 'delete',
    metadata?: {
        changedBy?: string;
        ip?: string;
        userAgent?: string;
        reason?: string;
    }
): Promise<void> {
    try {
        if (mongoose.connection.readyState === 1) {
            await ClarityHistoryModel.create({
                key,
                oldValue,
                newValue,
                operation,
                changedBy: metadata?.changedBy,
                changedAt: new Date(),
                metadata: {
                    ip: metadata?.ip,
                    userAgent: metadata?.userAgent,
                    reason: metadata?.reason
                }
            });
            logger.info('Clarity配置历史记录成功', { operation, key });
        }
    } catch (error) {
        // 历史记录失败不应影响主流程
        logger.warn('记录Clarity配置历史失败', error);
    }
}

/**
 * 从数据库获取Clarity项目ID
 */
async function getClarityProjectId(): Promise<string | null> {
    try {
        if (mongoose.connection.readyState === 1) {
            const doc = await ClaritySettingModel.findOne({ key: 'CLARITY_PROJECT_ID' }).lean().exec();
            if (doc && typeof doc.value === 'string' && doc.value.trim().length > 0) {
                return doc.value.trim();
            }
        }
    } catch (e) {
        logger.error('读取Clarity项目ID失败，回退到环境变量', e);
    }

    // 回退到环境变量
    const envKey = process.env.CLARITY_PROJECT_ID?.trim();
    return envKey && envKey.length > 0 ? envKey : null;
}

// =============== 主服务类 ===============

export class ClarityService {
    // =============== 缓存机制 ===============
    private static configCache: {
        projectId: string | null;
        cachedAt: number;
    } | null = null;
    
    private static readonly CACHE_TTL_MS = 60_000; // 60秒缓存

    /**
     * 检查缓存是否有效
     */
    private static isCacheValid(): boolean {
        if (!this.configCache) return false;
        return Date.now() - this.configCache.cachedAt < this.CACHE_TTL_MS;
    }

    /**
     * 清除缓存
     */
    public static clearCache(): void {
        this.configCache = null;
        logger.debug('Clarity配置缓存已清除');
    }

    /**
     * 更新缓存
     */
    private static updateCache(projectId: string | null): void {
        this.configCache = {
            projectId,
            cachedAt: Date.now()
        };
    }

    // =============== 公共方法 ===============

    /**
     * 检查是否启用了 Clarity
     * @returns 是否启用
     */
    public static async isEnabled(): Promise<boolean> {
        const projectId = await this.getProjectIdWithCache();
        return !!projectId;
    }

    /**
     * 获取 Clarity 配置
     * @returns 配置信息
     */
    public static async getConfig(): Promise<{
        enabled: boolean;
        projectId: string | null;
    }> {
        const projectId = await this.getProjectIdWithCache();

        return {
            enabled: !!projectId,
            projectId
        };
    }

    /**
     * 获取 Project ID（带缓存）
     */
    private static async getProjectIdWithCache(): Promise<string | null> {
        // 检查缓存
        if (this.isCacheValid() && this.configCache) {
            logger.debug('使用Clarity配置缓存');
            return this.configCache.projectId;
        }

        // 从数据库获取
        const projectId = await getClarityProjectId();
        
        // 更新缓存
        this.updateCache(projectId);
        
        return projectId;
    }

    /**
     * 更新 Clarity 配置
     * @param value Project ID
     * @param metadata 元数据（操作人、IP等）
     * @returns 操作结果
     */
    public static async updateConfig(
        value: string,
        metadata?: {
            changedBy?: string;
            ip?: string;
            userAgent?: string;
            reason?: string;
        }
    ): Promise<ClarityServiceResult<string>> {
        try {
            // 1. 验证 Project ID 格式
            const validationResult = validateClarityProjectId(value);
            if (!validationResult.success) {
                logger.warn('Clarity配置更新失败：格式验证失败', { 
                    error: validationResult.error,
                    valueLength: value?.length 
                });
                return validationResult;
            }

            const validatedValue = validationResult.data!;

            // 2. 检查数据库连接
            if (mongoose.connection.readyState !== 1) {
                logger.error('数据库连接不可用，无法更新Clarity配置');
                return {
                    success: false,
                    error: {
                        code: ClarityErrorCode.DB_NOT_CONNECTED,
                        message: '数据库连接不可用'
                    }
                };
            }

            // 3. 获取旧值（用于历史记录）
            const oldDoc = await ClaritySettingModel.findOne({ key: 'CLARITY_PROJECT_ID' }).lean().exec();
            const oldValue = oldDoc?.value || null;

            // 4. 更新配置
            await ClaritySettingModel.findOneAndUpdate(
                { key: 'CLARITY_PROJECT_ID' },
                {
                    key: 'CLARITY_PROJECT_ID',
                    value: validatedValue,
                    updatedAt: new Date()
                },
                { upsert: true, new: true }
            );

            // 5. 记录历史
            const operation = oldValue ? 'update' : 'create';
            await recordHistory('CLARITY_PROJECT_ID', oldValue, validatedValue, operation, metadata);

            // 6. 清除缓存
            this.clearCache();

            logger.info('Clarity配置更新成功', { 
                operation,
                oldValue: oldValue ? '***' : null,
                newValue: '***' 
            });

            return {
                success: true,
                data: validatedValue
            };
        } catch (error) {
            logger.error('更新Clarity配置失败', error);
            return {
                success: false,
                error: {
                    code: ClarityErrorCode.UPDATE_FAILED,
                    message: '配置更新失败，请稍后重试'
                }
            };
        }
    }

    /**
     * 删除 Clarity 配置
     * @param metadata 元数据（操作人、IP等）
     * @returns 操作结果
     */
    public static async deleteConfig(
        metadata?: {
            changedBy?: string;
            ip?: string;
            userAgent?: string;
            reason?: string;
        }
    ): Promise<ClarityServiceResult> {
        try {
            // 1. 检查数据库连接
            if (mongoose.connection.readyState !== 1) {
                logger.error('数据库连接不可用，无法删除Clarity配置');
                return {
                    success: false,
                    error: {
                        code: ClarityErrorCode.DB_NOT_CONNECTED,
                        message: '数据库连接不可用'
                    }
                };
            }

            // 2. 获取旧值（用于历史记录）
            const oldDoc = await ClaritySettingModel.findOne({ key: 'CLARITY_PROJECT_ID' }).lean().exec();
            const oldValue = oldDoc?.value || null;

            // 3. 删除配置
            await ClaritySettingModel.findOneAndDelete({ key: 'CLARITY_PROJECT_ID' });

            // 4. 记录历史
            await recordHistory('CLARITY_PROJECT_ID', oldValue, null, 'delete', metadata);

            // 5. 清除缓存
            this.clearCache();

            logger.info('Clarity配置删除成功', { oldValue: oldValue ? '***' : null });

            return {
                success: true
            };
        } catch (error) {
            logger.error('删除Clarity配置失败', error);
            return {
                success: false,
                error: {
                    code: ClarityErrorCode.DELETE_FAILED,
                    message: '配置删除失败，请稍后重试'
                }
            };
        }
    }

    /**
     * 获取配置变更历史
     * @param limit 返回的记录数量（默认20条，最多100条）
     * @returns 历史记录列表
     */
    public static async getConfigHistory(limit: number = 20): Promise<ClarityServiceResult<ClarityHistoryDoc[]>> {
        try {
            if (mongoose.connection.readyState !== 1) {
                return {
                    success: false,
                    error: {
                        code: ClarityErrorCode.DB_NOT_CONNECTED,
                        message: '数据库连接不可用'
                    }
                };
            }

            const history = await ClarityHistoryModel
                .find({ key: 'CLARITY_PROJECT_ID' })
                .sort({ changedAt: -1 })
                .limit(Math.min(limit, 100)) // 最多返回100条
                .lean()
                .exec();

            return {
                success: true,
                data: history as ClarityHistoryDoc[]
            };
        } catch (error) {
            logger.error('获取Clarity配置历史失败', error);
            return {
                success: false,
                error: {
                    code: ClarityErrorCode.READ_FAILED,
                    message: '获取配置历史失败'
                }
            };
        }
    }

    /**
     * 获取缓存统计信息
     * @returns 缓存状态
     */
    public static getCacheStats(): {
        cached: boolean;
        age: number | null;
        ttl: number;
    } {
        return {
            cached: this.isCacheValid(),
            age: this.configCache ? Date.now() - this.configCache.cachedAt : null,
            ttl: this.CACHE_TTL_MS
        };
    }
}
