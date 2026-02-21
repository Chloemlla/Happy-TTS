import React, { useState, useEffect, useCallback } from 'react';
import { motion as m } from 'framer-motion';
import { FaDatabase, FaClock, FaTrash, FaSync, FaUsers, FaChartLine, FaEye, FaHdd, FaFire } from 'react-icons/fa';
import { getFingerprint, getAccessToken } from '../utils/fingerprint';
import { useNotification } from '../components/Notification';
import { getApiBaseUrl, getAuthToken } from '../api/api';

interface CachedCustomer {
    customerId: string;
    lastFetched: string;
    billableAmount: number;
}

interface CacheStats {
    totalCached: number;
    totalExpired: number;
    hitRate: number;
    avgAccessCount: number;
    cacheSize: number;
    topAccessedEntries: Array<{ customerId: string; accessCount: number }>;
    lastCleanup?: string;
}

const GitHubBillingCacheManager: React.FC = () => {
    const [cachedCustomers, setCachedCustomers] = useState<CachedCustomer[]>([]);
    const [cacheStats, setCacheStats] = useState<CacheStats>({
        totalCached: 0,
        totalExpired: 0,
        hitRate: 0,
        avgAccessCount: 0,
        cacheSize: 0,
        topAccessedEntries: [] as Array<{ customerId: string; accessCount: number }>
    });
    const [loading, setLoading] = useState(false);
    const [metricsLoading, setMetricsLoading] = useState(false);
    const [clearingCache, setClearingCache] = useState<string | null>(null);
    const [clearingExpired, setClearingExpired] = useState(false);
    const [loadingStage, setLoadingStage] = useState<'idle' | 'customers' | 'metrics' | 'complete'>('idle');
    const { setNotification } = useNotification();

    // 获取管理员和Turnstile认证头部
    const getAdminTurnstileAuthHeaders = async () => {
        const adminToken = getAuthToken();
        if (!adminToken) {
            throw new Error('缺少管理员访问令牌');
        }

        const fingerprint = await getFingerprint();
        if (!fingerprint) {
            throw new Error('缺少浏览器指纹');
        }

        const turnstileToken = getAccessToken(fingerprint);
        if (!turnstileToken) {
            throw new Error('缺少 Turnstile 访问令牌');
        }

        return {
            'Authorization': `Bearer ${adminToken}`,
            'X-Turnstile-Token': turnstileToken,
            'X-Fingerprint': fingerprint,
            'Content-Type': 'application/json'
        };
    };

    // 加载缓存客户列表
    const loadCachedCustomers = useCallback(async () => {
        setLoading(true);
        setLoadingStage('customers');
        try {
            const res = await fetch(`${getApiBaseUrl()}/api/github-billing/customers`);
            const data = await res.json();

            if (res.ok && data.success) {
                setCachedCustomers(data.data || []);
                setCacheStats(prevStats => ({
                    ...prevStats,
                    totalCached: data.count || 0
                }));
            } else {
                setNotification({ message: data.error || '获取缓存列表失败', type: 'error' });
            }
        } catch (error) {
            setNotification({
                message: '获取缓存列表失败：' + (error instanceof Error ? error.message : '未知错误'),
                type: 'error'
            });
        } finally {
            setLoading(false);
        }
    }, [setNotification]);

    // 获取详细缓存性能指标
    const fetchCacheMetrics = useCallback(async () => {
        setMetricsLoading(true);
        setLoadingStage('metrics');
        try {
            const headers = await getAdminTurnstileAuthHeaders();
            const response = await fetch(`${getApiBaseUrl()}/api/github-billing/cache/metrics`, {
                headers
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const data = await response.json();
            if (data.success && data.data) {
                setCacheStats(prevStats => ({
                    ...prevStats,
                    totalExpired: data.data.expiredEntries || 0,
                    hitRate: data.data.hitRate || 0,
                    avgAccessCount: data.data.avgAccessCount || 0,
                    cacheSize: data.data.cacheSize || 0,
                    topAccessedEntries: data.data.topAccessedEntries || []
                }));
                setLoadingStage('complete');
            }
        } catch (error) {
            console.error('获取缓存性能指标失败:', error);
        } finally {
            setMetricsLoading(false);
        }
    }, []);

    // 清除指定客户缓存
    const clearCustomerCache = async (customerId: string) => {
        setClearingCache(customerId);
        try {
            const headers = await getAdminTurnstileAuthHeaders();
            const res = await fetch(`${getApiBaseUrl()}/api/github-billing/cache/${customerId}`, {
                method: 'DELETE',
                headers
            });

            const data = await res.json();
            if (res.ok && data.success) {
                setNotification({ message: `客户 ${customerId} 的缓存已清除`, type: 'success' });
                await loadCachedCustomers(); // 重新加载列表
                // 延迟加载指标以避免过于频繁的请求
                setTimeout(() => fetchCacheMetrics(), 500);
            } else {
                setNotification({ message: data.error || '清除缓存失败', type: 'error' });
            }
        } catch (error) {
            setNotification({
                message: '清除缓存失败：' + (error instanceof Error ? error.message : '未知错误'),
                type: 'error'
            });
        } finally {
            setClearingCache(null);
        }
    };

    // 清除所有过期缓存
    const clearExpiredCache = async () => {
        setClearingExpired(true);
        try {
            const headers = await getAdminTurnstileAuthHeaders();
            const res = await fetch(`${getApiBaseUrl()}/api/github-billing/cache/expired`, {
                method: 'DELETE',
                headers
            });

            const data = await res.json();
            if (res.ok && data.success) {
                setNotification({ message: '过期缓存已清除', type: 'success' });
                await loadCachedCustomers(); // 重新加载列表
                // 延迟加载指标以避免过于频繁的请求
                setTimeout(() => fetchCacheMetrics(), 500);
            } else {
                setNotification({ message: data.error || '清除过期缓存失败', type: 'error' });
            }
        } catch (error) {
            setNotification({
                message: '清除过期缓存失败：' + (error instanceof Error ? error.message : '未知错误'),
                type: 'error'
            });
        } finally {
            setClearingExpired(false);
        }
    };

    // 渐进式数据加载
    useEffect(() => {
        const loadDataProgressively = async () => {
            // 第一阶段：立即加载基础客户数据
            await loadCachedCustomers();
            
            // 第二阶段：延迟加载性能指标（避免同时请求造成阻塞）
            setTimeout(() => {
                fetchCacheMetrics();
            }, 800);
        };
        loadDataProgressively();
    }, [loadCachedCustomers, fetchCacheMetrics]);

    const ENTER_INITIAL = { opacity: 0, y: 20 };
    const ENTER_ANIMATE = { opacity: 1, y: 0 };
    const trans06 = { duration: 0.6 };

    return (
        <div className="space-y-6">
            {/* 标题和统计 */}
            <m.div
                className="bg-[#023047] text-white p-6 rounded-xl"
                initial={ENTER_INITIAL}
                animate={ENTER_ANIMATE}
                transition={trans06}
            >
                <div className="flex items-center gap-3">
                    <FaDatabase className="w-8 h-8 text-[#FFB703]" />
                    <div>
                        <h1 className="text-2xl font-bold font-songti">GitHub 账单缓存管理</h1>
                        <p className="text-[#8ECAE6] mt-1">管理 GitHub Billing 数据缓存</p>
                    </div>
                </div>
            </m.div>

            {/* 缓存统计 */}
            <m.div
                className="bg-white/80 backdrop-blur-sm rounded-2xl p-6 shadow-xl border border-[#8ECAE6]/30"
                initial={ENTER_INITIAL}
                animate={ENTER_ANIMATE}
                transition={{ ...trans06, delay: 0.1 }}
            >
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-semibold text-[#023047] font-songti flex items-center gap-2">
                        <FaDatabase className="w-5 h-5 text-[#FFB703]" />
                        缓存统计
                    </h2>
                    <m.button
                        onClick={loadCachedCustomers}
                        disabled={loading}
                        className="px-4 py-2 bg-[#FFB703] text-[#023047] rounded-lg hover:bg-[#FB8500] transition disabled:opacity-50 text-sm font-medium flex items-center gap-2"
                        whileTap={{ scale: 0.95 }}
                    >
                        <FaSync className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                        {loading ? '刷新中...' : '刷新'}
                    </m.button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div className="bg-[#8ECAE6]/10 rounded-lg p-4">
                        <div className="flex items-center">
                            <FaDatabase className="text-[#219EBC] text-xl mr-3" />
                            <div>
                                <p className="text-sm text-[#023047]/50">缓存总数</p>
                                <p className="text-2xl font-bold text-[#023047]">{cacheStats.totalCached}</p>
                            </div>
                        </div>
                    </div>
                    <div className="bg-red-50 rounded-lg p-4">
                        <div className="flex items-center">
                            <FaClock className="text-red-500 text-xl mr-3" />
                            <div>
                                <p className="text-sm text-[#023047]/50">过期缓存</p>
                                {metricsLoading ? (
                                    <div className="h-8 bg-red-200 rounded animate-pulse"></div>
                                ) : (
                                    <p className="text-2xl font-bold text-red-600">{cacheStats.totalExpired}</p>
                                )}
                            </div>
                        </div>
                    </div>
                    <div className="bg-[#8ECAE6]/15 rounded-lg p-4">
                        <div className="flex items-center">
                            <FaEye className="text-[#219EBC] text-xl mr-3" />
                            <div>
                                <p className="text-sm text-[#023047]/50">平均访问次数</p>
                                {metricsLoading ? (
                                    <div className="h-8 bg-purple-200 rounded animate-pulse"></div>
                                ) : (
                                    <p className="text-2xl font-bold text-[#023047]">{cacheStats.avgAccessCount.toFixed(1)}</p>
                                )}
                            </div>
                        </div>
                    </div>
                    <div className="bg-green-50 rounded-lg p-4">
                        <div className="flex items-center">
                            <FaChartLine className="text-green-500 text-xl mr-3" />
                            <div>
                                <p className="text-sm text-[#023047]/50">命中率</p>
                                {metricsLoading ? (
                                    <div className="h-8 bg-green-200 rounded animate-pulse"></div>
                                ) : (
                                    <p className="text-2xl font-bold text-green-600">{(cacheStats.hitRate * 100).toFixed(1)}%</p>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                {/* 缓存大小和热门条目 */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
                    <div className="bg-[#8ECAE6]/10 rounded-lg p-4">
                        <h3 className="text-lg font-semibold text-[#023047] mb-3 flex items-center">
                            <FaHdd className="mr-2 text-[#023047]/70" />
                            缓存大小
                        </h3>
                        {metricsLoading ? (
                            <div className="space-y-2">
                                <div className="h-10 bg-gray-200 rounded animate-pulse"></div>
                                <div className="h-4 bg-gray-200 rounded animate-pulse w-16"></div>
                            </div>
                        ) : (
                            <>
                                <p className="text-3xl font-bold text-[#023047]">
                                    {(cacheStats.cacheSize / 1024 / 1024).toFixed(2)} MB
                                </p>
                                <p className="text-sm text-[#023047]/50 mt-1">估算值</p>
                            </>
                        )}
                    </div>

                    <div className="bg-[#FFB703]/10 rounded-lg p-4">
                        <h3 className="text-lg font-semibold text-[#023047] mb-3 flex items-center">
                            <FaFire className="mr-2 text-[#FFB703]" />
                            热门缓存 (Top 5)
                        </h3>
                        {metricsLoading ? (
                            <div className="space-y-2">
                                {[...Array(3)].map((_, index) => (
                                    <div key={index} className="flex justify-between items-center">
                                        <div className="h-4 bg-yellow-200 rounded animate-pulse w-32"></div>
                                        <div className="h-4 bg-yellow-200 rounded animate-pulse w-12"></div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="space-y-2">
                                {cacheStats.topAccessedEntries.slice(0, 5).map((entry, index) => (
                                    <div key={`top-entry-${entry.customerId}-${entry.accessCount}-${index}`} className="flex justify-between items-center">
                                        <span className="text-sm font-medium text-[#023047]">
                                            #{index + 1} {entry.customerId}
                                        </span>
                                        <span className="text-sm text-[#FFB703] font-semibold">
                                            {entry.accessCount} 次
                                        </span>
                                    </div>
                                ))}
                                {cacheStats.topAccessedEntries.length === 0 && !metricsLoading && (
                                    <p className="text-sm text-[#023047]/50">暂无数据</p>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </m.div>

            {/* 操作面板 */}
            <m.div
                className="bg-white/80 backdrop-blur-sm rounded-2xl p-6 shadow-xl border border-[#8ECAE6]/30"
                initial={ENTER_INITIAL}
                animate={ENTER_ANIMATE}
                transition={{ ...trans06, delay: 0.2 }}
            >
                <h2 className="text-xl font-semibold text-[#023047] font-songti mb-4 flex items-center">
                    <FaTrash className="mr-2 text-red-500" />
                    缓存管理操作
                </h2>

                <div className="flex flex-col sm:flex-row gap-4">
                    <m.button
                        onClick={clearExpiredCache}
                        disabled={clearingExpired}
                        className="px-6 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 transition disabled:opacity-50 font-medium flex items-center justify-center gap-2"
                        whileTap={{ scale: 0.95 }}
                    >
                        <FaClock className={`w-4 h-4 ${clearingExpired ? 'animate-spin' : ''}`} />
                        {clearingExpired ? '清理中...' : '清理过期缓存'}
                    </m.button>
                </div>
            </m.div>

            {/* 缓存列表 */}
            <m.div
                className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-xl border border-[#8ECAE6]/30"
                initial={ENTER_INITIAL}
                animate={ENTER_ANIMATE}
                transition={{ ...trans06, delay: 0.4 }}
            >
                <div className="p-6">
                    <h2 className="text-xl font-semibold text-[#023047] font-songti mb-4 flex items-center">
                        <FaUsers className="mr-2 text-[#219EBC]" />
                        缓存客户列表 ({cachedCustomers.length})
                    </h2>

                    {cachedCustomers.length === 0 ? (
                        <div className="text-center py-8">
                            <FaDatabase className="mx-auto text-4xl text-[#8ECAE6]/50 mb-4" />
                            <p className="text-[#023047]/50">暂无缓存数据</p>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {cachedCustomers.map((customer) => (
                                <div key={customer.customerId} className="flex items-center justify-between p-4 bg-[#8ECAE6]/10 rounded-lg">
                                    <div className="flex-1">
                                        <div className="flex items-center gap-3">
                                            <span className="font-medium text-[#023047]">{customer.customerId}</span>
                                            <span className="text-sm text-[#023047]/50">
                                                最后获取: {customer.lastFetched || '未知时间'}
                                            </span>
                                        </div>
                                        <div className="text-sm text-[#023047]/70 mt-1">
                                            计费金额: ${customer.billableAmount !== undefined && customer.billableAmount !== null ? customer.billableAmount.toFixed(2) : '0.00'}
                                        </div>
                                    </div>

                                    <m.button
                                        onClick={() => clearCustomerCache(customer.customerId)}
                                        disabled={clearingCache === customer.customerId}
                                        className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition disabled:opacity-50 text-sm font-medium flex items-center gap-2"
                                        whileTap={{ scale: 0.95 }}
                                    >
                                        <FaTrash className={`w-3 h-3 ${clearingCache === customer.customerId ? 'animate-spin' : ''}`} />
                                        {clearingCache === customer.customerId ? '清除中...' : '清除'}
                                    </m.button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </m.div>
        </div>
    );
};

export default GitHubBillingCacheManager;
