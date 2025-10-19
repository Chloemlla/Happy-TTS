import axios from 'axios';
import logger from '../utils/logger';
import { ProductionServiceBase, createServiceConfig } from '../utils/ProductionServiceBase';

export interface LifeResponse {
    success: boolean;
    data?: any;
    error?: string;
}

export class LifeService extends ProductionServiceBase {
    private static instance: LifeService;
    private static readonly BASE_URL = 'https://v2.xxapi.cn/api';
    
    private constructor() {
        super(createServiceConfig('LifeService', {
            // 自定义配置
            rateLimit: {
                enabled: true,
                maxRequests: 200,      // 生活信息查询允许200次/分钟
                window: 60000
            },
            cache: {
                enabled: true,
                ttl: 600000,           // 查询结果缓存10分钟
                maxSize: 500
            },
            circuitBreaker: {
                enabled: true,
                threshold: 3,          // 外部API更敏感，3次失败即打开
                timeout: 30000,        // 30秒后尝试恢复
                successThreshold: 2
            },
            healthThresholds: {
                degradedResponseTime: 3000,     // 外部API 3秒算降级
                unhealthyResponseTime: 8000,    // 8秒算不健康
                degradedErrorRate: 0.1,
                unhealthyErrorRate: 0.3
            },
            performance: {
                maxSamples: 100,
                queryTimeout: 5000,
                operationTimeout: 10000
            }
        }));
        
        logger.info('[LifeService] Service initialized with production enhancements');
    }
    
    public static getInstance(): LifeService {
        if (!LifeService.instance) {
            LifeService.instance = new LifeService();
        }
        return LifeService.instance;
    }

    /**
     * 手机号码归属地查询
     * @param phone 手机号码
     * @returns 手机号码归属地信息
     */
    public async phoneAddress(phone: string): Promise<LifeResponse> {
        // 输入验证
        if (!phone || typeof phone !== 'string' || !/^\d{11}$/.test(phone)) {
            return {
                success: false,
                error: '手机号码格式无效，请输入11位数字'
            };
        }
        
        // 限流检查（使用手机号作为标识）
        if (!this.checkRateLimit(phone)) {
            return {
                success: false,
                error: '查询过于频繁，请稍后重试'
            };
        }
        
        // 检查缓存
        const cacheKey = `phone_${phone}`;
        const cached = this.getCachedValue<any>(cacheKey);
        if (cached) {
            logger.debug('[LifeService] Cache hit for phone:', phone);
            return {
                success: true,
                data: cached
            };
        }

        try {
            // 使用executeWithMonitoring自动处理断路器、性能统计
            const result = await this.executeWithMonitoring(async () => {
                logger.info('[LifeService] 开始查询手机号码归属地', { phone });

                const response = await axios.get(`${LifeService.BASE_URL}/phoneAddress`, {
                    params: { phone },
                    timeout: 8000, // 8秒超时
                });

                logger.info('[LifeService] 手机号码归属地查询完成', { phone });
                
                return response.data;
            }, 'phoneAddress');
            
            // 缓存成功结果
            this.setCachedValue(cacheKey, result);

            return {
                success: true,
                data: result
            };
        } catch (error) {
            logger.error('[LifeService] 手机号码归属地查询失败', { 
                phone, 
                error: error instanceof Error ? error.message : '未知错误' 
            });

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
    public async oilPrice(city?: string): Promise<LifeResponse> {
        // 输入验证
        if (city && (typeof city !== 'string' || city.length > 50)) {
            return {
                success: false,
                error: '城市名称格式无效'
            };
        }
        
        // 限流检查（使用城市名或'default'作为标识）
        const rateLimitKey = city || 'default';
        if (!this.checkRateLimit(rateLimitKey)) {
            return {
                success: false,
                error: '查询过于频繁，请稍后重试'
            };
        }
        
        // 检查缓存
        const cacheKey = `oil_${city || 'default'}`;
        const cached = this.getCachedValue<any>(cacheKey);
        if (cached) {
            logger.debug('[LifeService] Cache hit for oil price:', { city });
            return {
                success: true,
                data: cached
            };
        }

        try {
            // 使用executeWithMonitoring自动处理断路器、性能统计
            const result = await this.executeWithMonitoring(async () => {
                logger.info('[LifeService] 开始查询油价信息', { city });

                const params: any = {};
                if (city) {
                    params.city = city;
                }

                const response = await axios.get(`${LifeService.BASE_URL}/oilPrice`, {
                    params,
                    timeout: 8000, // 8秒超时
                });

                logger.info('[LifeService] 油价查询完成', { city });
                
                return response.data;
            }, 'oilPrice');
            
            // 缓存成功结果
            this.setCachedValue(cacheKey, result);

            return {
                success: true,
                data: result
            };
        } catch (error) {
            logger.error('[LifeService] 油价查询失败', { 
                city, 
                error: error instanceof Error ? error.message : '未知错误' 
            });

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

// 导出单例
export const lifeService = LifeService.getInstance(); 