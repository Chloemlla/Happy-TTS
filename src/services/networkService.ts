import axios from 'axios';
import logger from '../utils/logger';

export interface NetworkTestResponse {
    success: boolean;
    data?: any;
    error?: string;
}

export class NetworkService {
    private static readonly BASE_URL = 'https://v2.xxapi.cn/api';

    /**
     * TCP连接检测
     * @param address 目标地址
     * @param port 端口号
     * @returns TCP连接状态
     */
    public static async tcpPing(address: string, port: number): Promise<NetworkTestResponse> {
        try {
            logger.info('开始TCP连接检测', { address, port });

            const response = await axios.get(`${this.BASE_URL}/tcping`, {
                params: { address, port },
                timeout: 10000, // 10秒超时
            });

            logger.info('TCP连接检测完成', { address, port, result: response.data });

            return {
                success: true,
                data: response.data
            };
        } catch (error) {
            logger.error('TCP连接检测失败', { address, port, error: error instanceof Error ? error.message : '未知错误' });

            if (axios.isAxiosError(error)) {
                if (error.response) {
                    return {
                        success: false,
                        error: `TCP连接检测失败: ${error.response.status} - ${error.response.data?.message || '服务器错误'}`
                    };
                } else if (error.request) {
                    return {
                        success: false,
                        error: '网络服务无响应，请稍后重试'
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
     * Ping检测
     * @param url 目标URL
     * @returns Ping检测结果
     */
    public static async ping(url: string): Promise<NetworkTestResponse> {
        try {
            logger.info('开始Ping检测', { url });

            const response = await axios.get(`${this.BASE_URL}/ping`, {
                params: { url },
                timeout: 15000, // 15秒超时
            });

            logger.info('Ping检测完成', { url, result: response.data });

            return {
                success: true,
                data: response.data
            };
        } catch (error) {
            logger.error('Ping检测失败', { url, error: error instanceof Error ? error.message : '未知错误' });

            if (axios.isAxiosError(error)) {
                if (error.response) {
                    return {
                        success: false,
                        error: `Ping检测失败: ${error.response.status} - ${error.response.data?.message || '服务器错误'}`
                    };
                } else if (error.request) {
                    return {
                        success: false,
                        error: '网络服务无响应，请稍后重试'
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
     * 网站测速
     * @param url 目标URL
     * @returns 网站测速结果
     */
    public static async speedTest(url: string): Promise<NetworkTestResponse> {
        try {
            logger.info('开始网站测速', { url });

            const response = await axios.get(`${this.BASE_URL}/speed`, {
                params: { url },
                timeout: 30000, // 30秒超时
            });

            logger.info('网站测速完成', { url, result: response.data });

            return {
                success: true,
                data: response.data
            };
        } catch (error) {
            logger.error('网站测速失败', { url, error: error instanceof Error ? error.message : '未知错误' });

            if (axios.isAxiosError(error)) {
                if (error.response) {
                    return {
                        success: false,
                        error: `网站测速失败: ${error.response.status} - ${error.response.data?.message || '服务器错误'}`
                    };
                } else if (error.request) {
                    return {
                        success: false,
                        error: '网络服务无响应，请稍后重试'
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
     * 端口扫描
     * @param address 目标IP地址
     * @returns 端口扫描结果
     */
    public static async portScan(address: string): Promise<NetworkTestResponse> {
        try {
            logger.info('开始端口扫描', { address });

            const response = await axios.get(`${this.BASE_URL}/portscan`, {
                params: { address },
                timeout: 60000, // 60秒超时
            });

            logger.info('端口扫描完成', { address, result: response.data });

            return {
                success: true,
                data: response.data
            };
        } catch (error) {
            logger.error('端口扫描失败', { address, error: error instanceof Error ? error.message : '未知错误' });

            if (axios.isAxiosError(error)) {
                if (error.response) {
                    return {
                        success: false,
                        error: `端口扫描失败: ${error.response.status} - ${error.response.data?.message || '服务器错误'}`
                    };
                } else if (error.request) {
                    return {
                        success: false,
                        error: '网络服务无响应，请稍后重试'
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
     * 精准IP查询（可定位到县）
     * @param ip IP地址
     * @returns IP地理位置信息
     */
    public static async ipQuery(ip: string): Promise<NetworkTestResponse> {
        try {
            logger.info('开始精准IP查询', { ip });

            const response = await axios.get(`${this.BASE_URL}/ipv2`, {
                params: { ip },
                timeout: 10000, // 10秒超时
            });

            logger.info('精准IP查询完成', { ip, result: response.data });

            return {
                success: true,
                data: response.data
            };
        } catch (error) {
            logger.error('精准IP查询失败', { ip, error: error instanceof Error ? error.message : '未知错误' });

            if (axios.isAxiosError(error)) {
                if (error.response) {
                    return {
                        success: false,
                        error: `精准IP查询失败: ${error.response.status} - ${error.response.data?.message || '服务器错误'}`
                    };
                } else if (error.request) {
                    return {
                        success: false,
                        error: 'IP查询服务无响应，请稍后重试'
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
     * 随机一言古诗词
     * @param type 类型：hitokoto(一言) | poetry(古诗词)
     * @returns 随机一言或古诗词
     */
    public static async randomQuote(type: 'hitokoto' | 'poetry'): Promise<NetworkTestResponse> {
        try {
            logger.info('开始获取随机一言古诗词', { type });

            const response = await axios.get(`${this.BASE_URL}/yiyan`, {
                params: { type },
                timeout: 8000, // 8秒超时
            });

            logger.info('随机一言古诗词获取完成', { type, result: response.data });

            return {
                success: true,
                data: response.data
            };
        } catch (error) {
            logger.error('随机一言古诗词获取失败', { type, error: error instanceof Error ? error.message : '未知错误' });

            if (axios.isAxiosError(error)) {
                if (error.response) {
                    return {
                        success: false,
                        error: `随机一言古诗词获取失败: ${error.response.status} - ${error.response.data?.message || '服务器错误'}`
                    };
                } else if (error.request) {
                    return {
                        success: false,
                        error: '一言古诗词服务无响应，请稍后重试'
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