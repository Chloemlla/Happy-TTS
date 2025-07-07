import axios from 'axios';
import { createHash } from 'crypto';
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

    /**
     * 抖音热榜查询
     * @returns 抖音热榜数据
     */
    public static async douyinHot(): Promise<NetworkTestResponse> {
        try {
            logger.info('开始获取抖音热榜');

            const response = await axios.get(`${this.BASE_URL}/douyinhot`, {
                timeout: 15000, // 15秒超时
            });

            logger.info('抖音热榜获取完成', { result: response.data });

            return {
                success: true,
                data: response.data
            };
        } catch (error) {
            logger.error('抖音热榜获取失败', { error: error instanceof Error ? error.message : '未知错误' });

            if (axios.isAxiosError(error)) {
                if (error.response) {
                    return {
                        success: false,
                        error: `抖音热榜获取失败: ${error.response.status} - ${error.response.data?.message || '服务器错误'}`
                    };
                } else if (error.request) {
                    return {
                        success: false,
                        error: '抖音热榜服务无响应，请稍后重试'
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
     * 字符串Hash加密
     * @param type 加密算法类型：md4 | md5 | sha1 | sha256 | sha512
     * @param text 需要加密的字符串
     * @returns Hash加密结果
     */
    public static hashEncrypt(type: 'md4' | 'md5' | 'sha1' | 'sha256' | 'sha512', text: string): NetworkTestResponse {
        try {
            // 验证参数
            if (!text || typeof text !== 'string' || text.trim() === '') {
                return {
                    success: false,
                    error: '加密文本不能为空'
                };
            }

            logger.info('开始字符串Hash加密', { type, textLength: text.length });

            const validTypes = ['md4', 'md5', 'sha1', 'sha256', 'sha512'];
            if (!validTypes.includes(type)) {
                return {
                    success: false,
                    error: `不支持的加密算法: ${type}。支持的算法: ${validTypes.join(', ')}`
                };
            }

            let hash: string;

            switch (type) {
                case 'md4':
                    // Node.js 不直接支持 MD4，使用 MD5 作为替代
                    hash = createHash('md5').update(text).digest('hex');
                    logger.warn('MD4算法不可用，使用MD5替代', { originalType: type });
                    break;
                case 'md5':
                    hash = createHash('md5').update(text).digest('hex');
                    break;
                case 'sha1':
                    hash = createHash('sha1').update(text).digest('hex');
                    break;
                case 'sha256':
                    hash = createHash('sha256').update(text).digest('hex');
                    break;
                case 'sha512':
                    hash = createHash('sha512').update(text).digest('hex');
                    break;
                default:
                    return {
                        success: false,
                        error: `不支持的加密算法: ${type}`
                    };
            }

            logger.info('字符串Hash加密完成', { type, textLength: text.length, hashLength: hash.length });

            return {
                success: true,
                data: {
                    code: 200,
                    msg: '数据请求成功',
                    data: hash
                }
            };
        } catch (error) {
            logger.error('字符串Hash加密失败', { type, textLength: text ? text.length : 0, error: error instanceof Error ? error.message : '未知错误' });

            return {
                success: false,
                error: `Hash加密失败: ${error instanceof Error ? error.message : '未知错误'}`
            };
        }
    }

    /**
     * Base64编码与解码
     * @param type 操作类型：encode(编码) | decode(解码)
     * @param text 需要编码或解码的字符串
     * @returns Base64编码或解码结果
     */
    public static base64Operation(type: 'encode' | 'decode', text: string): NetworkTestResponse {
        try {
            // 验证参数
            if (!text || typeof text !== 'string') {
                return {
                    success: false,
                    error: '操作文本不能为空'
                };
            }

            if (!type || (type !== 'encode' && type !== 'decode')) {
                return {
                    success: false,
                    error: '操作类型必须是 encode(编码) 或 decode(解码)'
                };
            }

            logger.info('开始Base64操作', { type, textLength: text.length });

            let result: string;

            if (type === 'encode') {
                // Base64编码
                result = Buffer.from(text, 'utf8').toString('base64');
                logger.info('Base64编码完成', { type, textLength: text.length, resultLength: result.length });
            } else {
                // Base64解码前严格校验格式
                const base64Regex = /^(?:[A-Za-z0-9+\/]{4})*(?:[A-Za-z0-9+\/]{2}==|[A-Za-z0-9+\/]{3}=)?$/;
                if (!base64Regex.test(text)) {
                    logger.error('Base64解码失败', { type, text, error: '格式非法' });
                    return {
                        success: false,
                        error: 'Base64解码失败：输入不是有效的Base64字符串'
                    };
                }
                try {
                    result = Buffer.from(text, 'base64').toString('utf8');
                    // 检查解码后重新编码是否一致，防止容错解码
                    if (Buffer.from(result, 'utf8').toString('base64').replace(/=+$/, '') !== text.replace(/=+$/, '')) {
                        logger.error('Base64解码失败', { type, text, error: '内容不匹配' });
                        return {
                            success: false,
                            error: 'Base64解码失败：输入不是有效的Base64字符串'
                        };
                    }
                    logger.info('Base64解码完成', { type, textLength: text.length, resultLength: result.length });
                } catch (decodeError) {
                    logger.error('Base64解码异常', { type, text, error: decodeError instanceof Error ? decodeError.message : '未知错误' });
                    return {
                        success: false,
                        error: 'Base64解码失败：输入不是有效的Base64字符串'
                    };
                }
            }

            return {
                success: true,
                data: {
                    code: 200,
                    msg: '数据请求成功',
                    data: result
                }
            };
        } catch (error) {
            logger.error('Base64操作失败', { type, textLength: text ? text.length : 0, error: error instanceof Error ? error.message : '未知错误' });

            return {
                success: false,
                error: `Base64操作失败: ${error instanceof Error ? error.message : '未知错误'}`
            };
        }
    }

    /**
     * BMI身体指数计算
     * @param height 身高（厘米）
     * @param weight 体重（公斤）
     * @returns BMI值和健康建议
     */
    public static bmiCalculate(height: string, weight: string): NetworkTestResponse {
        // 参数校验
        if (!height || !weight) {
            return {
                success: false,
                error: '身高和体重参数不能为空'
            };
        }
        const h = parseFloat(height);
        const w = parseFloat(weight);
        if (isNaN(h) || isNaN(w) || h <= 0 || w <= 0) {
            return {
                success: false,
                error: '身高和体重必须为正数'
            };
        }
        // 计算BMI
        const bmi = w / Math.pow(h / 100, 2);
        // 理想体重（BMI=22）
        const idealWeight = (22 * Math.pow(h / 100, 2)).toFixed(1);
        // 健康建议
        let msg = '';
        if (bmi < 18.5) {
            msg = `您的身体指数偏低，理想体重为${idealWeight}KG`;
        } else if (bmi < 24) {
            msg = '您的身体指数正常，继续保持';
        } else if (bmi < 28) {
            msg = `您的身体指数偏高，理想体重为${idealWeight}KG`;
        } else {
            msg = `您的身体指数过高，理想体重为${idealWeight}KG`;
        }
        return {
            success: true,
            data: {
                code: 200,
                msg: '数据请求成功',
                data: {
                    bmi: Number(bmi.toFixed(2)),
                    msg
                }
            }
        };
    }

    /**
     * FLAC转MP3音频转换
     * @param url 需要转换的FLAC文件URL
     * @param returnType 返回类型：json | 302
     * @returns 转换结果或重定向URL
     */
    public static async flacToMp3(url: string, returnType: 'json' | '302' = 'json'): Promise<NetworkTestResponse> {
        try {
            logger.info('开始FLAC转MP3转换', { url, returnType });

            // 参数验证
            if (!url || typeof url !== 'string') {
                return {
                    success: false,
                    error: 'URL参数不能为空'
                };
            }

            // 验证URL格式
            try {
                new URL(url);
            } catch {
                return {
                    success: false,
                    error: 'URL格式不正确'
                };
            }

            // 构建转发请求URL
            const targetUrl = `${this.BASE_URL}/flactomp3`;
            const params = new URLSearchParams({
                url: url,
                return: returnType
            });

            const response = await axios.get(`${targetUrl}?${params.toString()}`, {
                timeout: 60000, // 60秒超时，音频转换可能需要较长时间
                maxRedirects: 5
            });

            logger.info('FLAC转MP3转换完成', { url, returnType, result: response.data });

            return {
                success: true,
                data: response.data
            };
        } catch (error) {
            logger.error('FLAC转MP3转换失败', { url, returnType, error: error instanceof Error ? error.message : '未知错误' });

            if (axios.isAxiosError(error)) {
                if (error.response) {
                    return {
                        success: false,
                        error: `FLAC转MP3转换失败: ${error.response.status} - ${error.response.data?.message || '服务器错误'}`
                    };
                } else if (error.request) {
                    return {
                        success: false,
                        error: '音频转换服务无响应，请稍后重试'
                    };
                }
            }

            return {
                success: false,
                error: `FLAC转MP3转换失败: ${error instanceof Error ? error.message : '未知错误'}`
            };
        }
    }

    /**
     * 随机驾考题目
     * @param subject 科目类型：1(科目1) | 4(科目4)
     * @returns 随机驾考题目
     */
    public static async randomJiakao(subject: '1' | '4'): Promise<NetworkTestResponse> {
        try {
            logger.info('开始获取随机驾考题目', { subject });

            // 参数验证
            if (!subject || (subject !== '1' && subject !== '4')) {
                return {
                    success: false,
                    error: '科目参数必须是 1(科目1) 或 4(科目4)'
                };
            }

            // 构建转发请求URL
            const targetUrl = `${this.BASE_URL}/jiakao`;
            const params = new URLSearchParams({
                subject: subject
            });

            const response = await axios.get(`${targetUrl}?${params.toString()}`, {
                timeout: 15000, // 15秒超时
                maxRedirects: 3
            });

            logger.info('随机驾考题目获取完成', { subject, result: response.data });

            return {
                success: true,
                data: response.data
            };
        } catch (error) {
            logger.error('随机驾考题目获取失败', { subject, error: error instanceof Error ? error.message : '未知错误' });

            if (axios.isAxiosError(error)) {
                if (error.response) {
                    return {
                        success: false,
                        error: `随机驾考题目获取失败: ${error.response.status} - ${error.response.data?.message || '服务器错误'}`
                    };
                } else if (error.request) {
                    return {
                        success: false,
                        error: '驾考题目服务无响应，请稍后重试'
                    };
                }
            }

            return {
                success: false,
                error: `随机驾考题目获取失败: ${error instanceof Error ? error.message : '未知错误'}`
            };
        }
    }
} 