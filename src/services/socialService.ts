import axios from 'axios';
import logger from '../utils/logger';

export interface SocialResponse {
    success: boolean;
    data?: any;
    error?: string;
}

export class SocialService {
    private static readonly BASE_URL = 'https://v2.xxapi.cn/api';

    /**
     * 微博热搜
     * @returns 微博当前热搜榜单
     */
    public static async weiboHot(): Promise<SocialResponse> {
        try {
            logger.info('开始获取微博热搜');

            const response = await axios.get(`${this.BASE_URL}/weibohot`, {
                timeout: 10000, // 10秒超时
            });

            logger.info('微博热搜获取完成', { result: response.data });

            return {
                success: true,
                data: response.data
            };
        } catch (error) {
            logger.error('微博热搜获取失败', { error: error instanceof Error ? error.message : '未知错误' });

            if (axios.isAxiosError(error)) {
                if (error.response) {
                    return {
                        success: false,
                        error: `微博热搜获取失败: ${error.response.status} - ${error.response.data?.message || '服务器错误'}`
                    };
                } else if (error.request) {
                    return {
                        success: false,
                        error: '社交媒体服务无响应，请稍后重试'
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
     * 百度热搜
     * @returns 百度热搜数据
     */
    public static async baiduHot(): Promise<SocialResponse> {
        try {
            logger.info('开始获取百度热搜');

            const response = await axios.get(`${this.BASE_URL}/baiduhot`, {
                timeout: 10000, // 10秒超时
            });

            logger.info('百度热搜获取完成', { result: response.data });

            return {
                success: true,
                data: response.data
            };
        } catch (error) {
            logger.error('百度热搜获取失败', { error: error instanceof Error ? error.message : '未知错误' });

            if (axios.isAxiosError(error)) {
                if (error.response) {
                    return {
                        success: false,
                        error: `百度热搜获取失败: ${error.response.status} - ${error.response.data?.message || '服务器错误'}`
                    };
                } else if (error.request) {
                    return {
                        success: false,
                        error: '社交媒体服务无响应，请稍后重试'
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