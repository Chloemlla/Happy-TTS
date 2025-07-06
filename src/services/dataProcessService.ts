import axios from 'axios';
import logger from '../utils/logger';

export interface DataProcessResponse {
    success: boolean;
    data?: any;
    error?: string;
}

export class DataProcessService {
    private static readonly BASE_URL = 'https://v2.xxapi.cn/api';

    /**
     * Base64编码
     * @param text 要编码的文本
     * @returns Base64编码结果
     */
    public static async base64Encode(text: string): Promise<DataProcessResponse> {
        try {
            logger.info('开始Base64编码', { textLength: text.length });

            const response = await axios.get(`${this.BASE_URL}/base64`, {
                params: { type: 'encode', text },
                timeout: 5000, // 5秒超时
            });

            logger.info('Base64编码完成', { textLength: text.length, result: response.data });

            return {
                success: true,
                data: response.data
            };
        } catch (error) {
            logger.error('Base64编码失败', { textLength: text.length, error: error instanceof Error ? error.message : '未知错误' });

            if (axios.isAxiosError(error)) {
                if (error.response) {
                    return {
                        success: false,
                        error: `Base64编码失败: ${error.response.status} - ${error.response.data?.message || '服务器错误'}`
                    };
                } else if (error.request) {
                    return {
                        success: false,
                        error: '数据处理服务无响应，请稍后重试'
                    };
                }
            }

            return {
                success: false,
                error: error instanceof Error ? error.message : '未知错误'
            };
        }
    }

    /**
     * Base64解码
     * @param text 要解码的Base64文本
     * @returns Base64解码结果
     */
    public static async base64Decode(text: string): Promise<DataProcessResponse> {
        try {
            logger.info('开始Base64解码', { textLength: text.length });

            const response = await axios.get(`${this.BASE_URL}/base64`, {
                params: { type: 'decode', text },
                timeout: 5000, // 5秒超时
            });

            logger.info('Base64解码完成', { textLength: text.length, result: response.data });

            return {
                success: true,
                data: response.data
            };
        } catch (error) {
            logger.error('Base64解码失败', { textLength: text.length, error: error instanceof Error ? error.message : '未知错误' });

            if (axios.isAxiosError(error)) {
                if (error.response) {
                    return {
                        success: false,
                        error: `Base64解码失败: ${error.response.status} - ${error.response.data?.message || '服务器错误'}`
                    };
                } else if (error.request) {
                    return {
                        success: false,
                        error: '数据处理服务无响应，请稍后重试'
                    };
                }
            }

            return {
                success: false,
                error: error instanceof Error ? error.message : '未知错误'
            };
        }
    }

    /**
     * MD5哈希加密
     * @param text 要加密的文本
     * @returns MD5哈希结果
     */
    public static async md5Hash(text: string): Promise<DataProcessResponse> {
        try {
            logger.info('开始MD5哈希加密', { textLength: text.length });

            const response = await axios.get(`${this.BASE_URL}/hash`, {
                params: { type: 'md5', text },
                timeout: 5000, // 5秒超时
            });

            logger.info('MD5哈希加密完成', { textLength: text.length, result: response.data });

            return {
                success: true,
                data: response.data
            };
        } catch (error) {
            logger.error('MD5哈希加密失败', { textLength: text.length, error: error instanceof Error ? error.message : '未知错误' });

            if (axios.isAxiosError(error)) {
                if (error.response) {
                    return {
                        success: false,
                        error: `MD5哈希加密失败: ${error.response.status} - ${error.response.data?.message || '服务器错误'}`
                    };
                } else if (error.request) {
                    return {
                        success: false,
                        error: '数据处理服务无响应，请稍后重试'
                    };
                }
            }

            return {
                success: false,
                error: error instanceof Error ? error.message : '未知错误'
            };
        }
    }
} 