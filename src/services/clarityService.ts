import { mongoose } from './mongoService';
import logger from '../utils/logger';

// 输入验证和清理函数
const sanitizeString = (input: string, maxLength: number = 1500): string | null => {
    if (!input || typeof input !== 'string') {
        return null;
    }

    // 移除危险字符和过长的输入
    const sanitized = input.trim().substring(0, maxLength);

    // 检查是否包含危险的字符序列
    const dangerousPatterns = [
        /[<>{}]/g, // 移除HTML/XML标签字符
        /javascript:/gi, // 移除JavaScript协议
        /data:/gi, // 移除data协议
        /vbscript:/gi, // 移除VBScript协议
        /on\w+\s*=/gi, // 移除事件处理器
    ];

    let cleaned = sanitized;
    dangerousPatterns.forEach(pattern => {
        cleaned = cleaned.replace(pattern, '');
    });

    return cleaned || null;
};

const validateConfigKey = (key: string): 'CLARITY_PROJECT_ID' | null => {
    if (!key || typeof key !== 'string') {
        return null;
    }

    // 只允许预定义的配置键
    const validKeys = ['CLARITY_PROJECT_ID'];
    return validKeys.includes(key) ? key as 'CLARITY_PROJECT_ID' : null;
};

const validateConfigValue = (value: string): string | null => {
    if (!value || typeof value !== 'string') {
        return null;
    }
    
    // 配置值应该是有效的字符串，长度在合理范围内
    const sanitized = sanitizeString(value, 1000);
    if (!sanitized || sanitized.length < 1) {
        return null;
    }

    return sanitized;
};

// Clarity配置文档接口
interface ClaritySettingDoc {
    key: string;
    value: string;
    updatedAt?: Date
}

// Clarity配置Schema
const ClaritySettingSchema = new mongoose.Schema<ClaritySettingDoc>({
    key: { type: String, required: true },
    value: { type: String, required: true },
    updatedAt: { type: Date, default: Date.now }
}, { collection: 'clarity_settings' });

const ClaritySettingModel = (mongoose.models.ClaritySetting as mongoose.Model<ClaritySettingDoc>) ||
    mongoose.model<ClaritySettingDoc>('ClaritySetting', ClaritySettingSchema);

// 从数据库获取Clarity项目ID
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

export class ClarityService {
    /**
     * 检查是否启用了 Clarity
     */
    public static async isEnabled(): Promise<boolean> {
        const projectId = await getClarityProjectId();
        return !!projectId;
    }

    /**
     * 获取Clarity配置
     */
    public static async getConfig(): Promise<{
        enabled: boolean;
        projectId: string | null;
    }> {
        const projectId = await getClarityProjectId();

        return {
            enabled: !!projectId,
            projectId
        };
    }

    /**
     * 更新Clarity配置
     */
    public static async updateConfig(value: string): Promise<boolean> {
        try {
            // 验证输入参数
            const validatedValue = validateConfigValue(value);

            if (!validatedValue) {
                logger.warn('Clarity配置更新失败：输入参数无效', { valueLength: value?.length });
                return false;
            }

            if (mongoose.connection.readyState !== 1) {
                logger.error('数据库连接不可用，无法更新Clarity配置');
                return false;
            }

            await ClaritySettingModel.findOneAndUpdate(
                { key: 'CLARITY_PROJECT_ID' },
                {
                    key: 'CLARITY_PROJECT_ID',
                    value: validatedValue,
                    updatedAt: new Date()
                },
                { upsert: true, new: true }
            );

            logger.info('Clarity配置更新成功: CLARITY_PROJECT_ID');
            return true;
        } catch (error) {
            logger.error('更新Clarity配置失败', error);
            return false;
        }
    }

    /**
     * 删除Clarity配置
     */
    public static async deleteConfig(): Promise<boolean> {
        try {
            if (mongoose.connection.readyState !== 1) {
                logger.error('数据库连接不可用，无法删除Clarity配置');
                return false;
            }

            await ClaritySettingModel.findOneAndDelete({ key: 'CLARITY_PROJECT_ID' });
            logger.info('Clarity配置删除成功: CLARITY_PROJECT_ID');
            return true;
        } catch (error) {
            logger.error('删除Clarity配置失败', error);
            return false;
        }
    }
}