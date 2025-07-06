import axios from 'axios';
import logger from '../utils/logger';

export interface MediaResponse {
    success: boolean;
    data?: any;
    error?: string;
}

export class MediaService {
    private static readonly BASE_URL = 'https://v2.xxapi.cn/api';

    /**
     * 网抑云音乐解析
     * @param id 歌曲ID
     * @returns 歌曲详细信息及播放链接
     */
    public static async music163(id: string): Promise<MediaResponse> {
        try {
            logger.info('开始网抑云音乐解析', { id });

            const response = await axios.get(`${this.BASE_URL}/music163`, {
                params: { id },
                timeout: 15000, // 15秒超时
            });

            logger.info('网抑云音乐解析完成', { id, result: response.data });

            return {
                success: true,
                data: response.data
            };
        } catch (error) {
            logger.error('网抑云音乐解析失败', { id, error: error instanceof Error ? error.message : '未知错误' });

            if (axios.isAxiosError(error)) {
                if (error.response) {
                    return {
                        success: false,
                        error: `网抑云音乐解析失败: ${error.response.status} - ${error.response.data?.message || '服务器错误'}`
                    };
                } else if (error.request) {
                    return {
                        success: false,
                        error: '音乐解析服务无响应，请稍后重试'
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
     * 皮皮虾视频解析
     * @param url 皮皮虾视频链接
     * @returns 视频播放地址
     */
    public static async pipixia(url: string): Promise<MediaResponse> {
        try {
            logger.info('开始皮皮虾视频解析', { url });

            const response = await axios.get(`${this.BASE_URL}/pipixia`, {
                params: { url },
                timeout: 20000, // 20秒超时
            });

            logger.info('皮皮虾视频解析完成', { url, result: response.data });

            return {
                success: true,
                data: response.data
            };
        } catch (error) {
            logger.error('皮皮虾视频解析失败', { url, error: error instanceof Error ? error.message : '未知错误' });

            if (axios.isAxiosError(error)) {
                if (error.response) {
                    return {
                        success: false,
                        error: `皮皮虾视频解析失败: ${error.response.status} - ${error.response.data?.message || '服务器错误'}`
                    };
                } else if (error.request) {
                    return {
                        success: false,
                        error: '视频解析服务无响应，请稍后重试'
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