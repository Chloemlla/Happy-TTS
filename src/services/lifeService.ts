import axios from 'axios';
import logger from '../utils/logger';

export interface LifeResponse {
    success: boolean;
    data?: any;
    error?: string;
}

export class LifeService {
    private static readonly BASE_URL = 'https://v2.xxapi.cn/api';

    /**
     * 手机号码归属地查询
     * @param phone 手机号码
     * @returns 手机号码归属地信息
     */
    public static async phoneAddress(phone: string): Promise<LifeResponse> {
        try {
            logger.info('开始查询手机号码归属地', { phone });

            const response = await axios.get(`${this.BASE_URL}/phoneAddress`, {
                params: { phone },
                timeout: 8000, // 8秒超时
            });

            logger.info('手机号码归属地查询完成', { phone, result: response.data });

            return {
                success: true,
                data: response.data
            };
        } catch (error) {
            logger.error('手机号码归属地查询失败', { phone, error: error instanceof Error ? error.message : '未知错误' });

            if (axios.isAxiosError(error)) {
                if (error.response) {
                    return {
                        success: false,
                        error: `手机号码归属地查询失败: ${error.response.status} - ${error.response.data?.message || '服务器错误'}`
                    };
                } else if (error.request) {
                    return {
                        success: false,
                        error: '生活信息服务无响应，请稍后重试'
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
     * 油价查询
     * @param city 城市名称（可选）
     * @returns 油价信息
     */
    public static async oilPrice(city?: string): Promise<LifeResponse> {
        try {
            logger.info('开始查询油价信息', { city });

            const params: any = {};
            if (city) {
                params.city = city;
            }

            const response = await axios.get(`${this.BASE_URL}/oilPrice`, {
                params,
                timeout: 8000, // 8秒超时
            });

            logger.info('油价查询完成', { city, result: response.data });

            return {
                success: true,
                data: response.data
            };
        } catch (error) {
            logger.error('油价查询失败', { city, error: error instanceof Error ? error.message : '未知错误' });

            if (axios.isAxiosError(error)) {
                if (error.response) {
                    return {
                        success: false,
                        error: `油价查询失败: ${error.response.status} - ${error.response.data?.message || '服务器错误'}`
                    };
                } else if (error.request) {
                    return {
                        success: false,
                        error: '生活信息服务无响应，请稍后重试'
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