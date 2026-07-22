import React, { useState, useEffect, useCallback } from 'react';
import { FaDatabase, FaClock, FaTrash, FaSync, FaUsers, FaChartLine, FaEye, FaHdd, FaFire } from 'react-icons/fa';
import { getFingerprint, getAccessToken } from '../utils/fingerprint';
import { useNotification } from '../components/Notification';
import { getApiBaseUrl, getAuthToken } from '../api/api';
import { isFirstVisitVerificationEnabled } from '../utils/firstVisitVerificationConfig';
import {
    InfoMetricCard,
    InfoPanel,
    InfoSectionTitle,
    logShareDangerButtonClass,
    logShareSecondaryButtonClass,
} from './LogShareStyleScaffold';

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

        const headers: Record<string, string> = {
            'Authorization': `Bearer ${adminToken}`,
            'Content-Type': 'application/json'
        };

        if (!isFirstVisitVerificationEnabled()) {
            return headers;
        }

        const fingerprint = await getFingerprint();
        if (!fingerprint) {
            throw new Error('缺少浏览器指纹');
        }

        const turnstileToken = getAccessToken(fingerprint);
        if (!turnstileToken) {
            throw new Error('缺少 Turnstile 访问令牌');
        }

        headers['X-Turnstile-Token'] = turnstileToken;
        headers['X-Fingerprint'] = fingerprint;

        return headers;
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
            setNotification({
                message: '获取缓存性能指标失败：' + (error instanceof Error ? error.message : '未知错误'),
                type: 'error'
            });
        } finally {
            setMetricsLoading(false);
        }
    }, [setNotification]);

    // 清除指定客户缓存
    const clearCustomerCache = async (customerId: string) => {
        if (!window.confirm(`确定清除客户「${customerId}」的缓存？`)) return;
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
        if (!window.confirm('确定清除全部过期缓存条目？')) return;
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

    return (
        <div className="space-y-6">
            <InfoPanel>
                <InfoSectionTitle
                    eyebrow="GitHub Billing"
                    title="GitHub 账单缓存管理"
                    description="查看 GitHub Billing 缓存规模、命中表现和高访问客户，并按客户或过期状态清理缓存。"
                    icon={FaDatabase}
                    action={
                        <button
                            onClick={loadCachedCustomers}
                            disabled={loading}
                            className={logShareSecondaryButtonClass}
                        >
                            <FaSync className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                            {loading ? '刷新中' : '刷新'}
                        </button>
                    }
                />
            </InfoPanel>

            {/* 缓存统计 */}
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
                <InfoMetricCard label="缓存总数" value={cacheStats.totalCached} detail={`阶段 ${loadingStage}`} icon={FaDatabase} />
                <InfoMetricCard label="过期缓存" value={metricsLoading ? '...' : cacheStats.totalExpired} detail="可手动清理" icon={FaClock} />
                <InfoMetricCard label="平均访问" value={metricsLoading ? '...' : cacheStats.avgAccessCount.toFixed(1)} detail="按客户缓存统计" icon={FaEye} />
                <InfoMetricCard label="命中率" value={metricsLoading ? '...' : `${(cacheStats.hitRate * 100).toFixed(1)}%`} detail="缓存性能指标" icon={FaChartLine} />
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <InfoPanel>
                    <InfoSectionTitle eyebrow="Storage" title="缓存大小" icon={FaHdd} />
                        {metricsLoading ? (
                            <div className="space-y-2">
                                <div className="h-10 rounded-2xl bg-slate-100 animate-pulse"></div>
                                <div className="h-4 w-16 rounded-2xl bg-slate-100 animate-pulse"></div>
                            </div>
                        ) : (
                            <>
                                <p className="text-3xl font-semibold text-slate-950">
                                    {(cacheStats.cacheSize / 1024 / 1024).toFixed(2)} MB
                                </p>
                                <p className="mt-2 text-sm text-slate-500">估算值</p>
                            </>
                        )}
                </InfoPanel>

                <InfoPanel>
                    <InfoSectionTitle eyebrow="Hot Entries" title="热门缓存" icon={FaFire} />
                        {metricsLoading ? (
                            <div className="space-y-2">
                                {[...Array(3)].map((_, index) => (
                                    <div key={index} className="flex items-center justify-between">
                                        <div className="h-4 w-32 rounded-2xl bg-slate-100 animate-pulse"></div>
                                        <div className="h-4 w-12 rounded-2xl bg-slate-100 animate-pulse"></div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="space-y-2">
                                {cacheStats.topAccessedEntries.slice(0, 5).map((entry, index) => (
                                    <div key={`top-entry-${entry.customerId}-${entry.accessCount}-${index}`} className="flex items-center justify-between rounded-2xl border border-slate-100 bg-slate-50 px-3 py-2">
                                        <span className="text-sm font-medium text-slate-700">
                                            #{index + 1} {entry.customerId}
                                        </span>
                                        <span className="text-sm font-semibold text-slate-950">
                                            {entry.accessCount} 次
                                        </span>
                                    </div>
                                ))}
                                {cacheStats.topAccessedEntries.length === 0 && !metricsLoading && (
                                    <p className="text-sm text-slate-500">暂无数据</p>
                                )}
                            </div>
                        )}
                </InfoPanel>
            </div>

            {/* 操作面板 */}
            <InfoPanel>
                <InfoSectionTitle eyebrow="Cache Actions" title="缓存管理操作" icon={FaTrash} />
                <div className="flex flex-col sm:flex-row gap-4">
                    <button
                        onClick={clearExpiredCache}
                        disabled={clearingExpired}
                        className={logShareDangerButtonClass}
                    >
                        <FaClock className={`w-4 h-4 ${clearingExpired ? 'animate-spin' : ''}`} />
                        {clearingExpired ? '清理中' : '清理过期缓存'}
                    </button>
                </div>
            </InfoPanel>

            {/* 缓存列表 */}
            <InfoPanel>
                    <InfoSectionTitle eyebrow="Customers" title={`缓存客户列表 (${cachedCustomers.length})`} icon={FaUsers} />
                    {cachedCustomers.length === 0 ? (
                        <div className="text-center py-8">
                            <FaDatabase className="mx-auto mb-4 text-4xl text-slate-300" />
                            <p className="text-slate-500">暂无缓存数据</p>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {cachedCustomers.map((customer) => (
                                <div key={customer.customerId} className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white/80 p-4 sm:flex-row sm:items-center sm:justify-between">
                                    <div className="flex-1">
                                        <div className="flex flex-wrap items-center gap-3">
                                            <span className="font-medium text-slate-900">{customer.customerId}</span>
                                            <span className="text-sm text-slate-500">
                                                最后获取: {customer.lastFetched || '未知时间'}
                                            </span>
                                        </div>
                                        <div className="text-sm text-slate-600 mt-1">
                                            计费金额: ${customer.billableAmount !== undefined && customer.billableAmount !== null ? customer.billableAmount.toFixed(2) : '0.00'}
                                        </div>
                                    </div>

                                    <button
                                        onClick={() => clearCustomerCache(customer.customerId)}
                                        disabled={clearingCache === customer.customerId}
                                        className={logShareDangerButtonClass}
                                    >
                                        <FaTrash className={`w-3 h-3 ${clearingCache === customer.customerId ? 'animate-spin' : ''}`} />
                                        {clearingCache === customer.customerId ? '清除中' : '清除'}
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
            </InfoPanel>
        </div>
    );
};

export default GitHubBillingCacheManager;
