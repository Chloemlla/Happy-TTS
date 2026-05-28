import React, { useState, useEffect, useCallback } from 'react';
import { motion as m } from 'framer-motion';
import { FaSync, FaGithub, FaDollarSign, FaCalendarAlt, FaUser, FaTrash } from 'react-icons/fa';
import { useNotification } from './Notification';
import { getApiBaseUrl, getAuthToken } from '../api/api';
import { getFingerprint, getAccessToken } from '../utils/fingerprint';

// 动画配置
const ENTER_INITIAL = { opacity: 0, y: 20 };
const ENTER_ANIMATE = { opacity: 1, y: 0 };
const trans06 = { duration: 0.6 };

// 折扣目标接口
interface DiscountTarget {
  id: string;
  type: string;
}

// 折扣详情接口
interface DiscountDetail {
  targets: DiscountTarget[];
  percentage: number;
  targetAmount: number;
  uuid: string;
  startDate: number;
  endDate: number;
  discountType: string;
  fundingSource: string;
}

// GitHub使用项接口（新格式）
interface GitHubUsageItem {
  billedAmount: number;
  totalAmount: number;
  discountAmount: number;
  quantity: number | null;
  product: string | null;
  repo: {
    name: string;
  };
  org: {
    name: string;
    avatarSrc: string;
    login: string;
  };
  usageAt: string;
}

// GitHub其他项接口（新格式）
interface GitHubOtherItem {
  billedAmount: number;
  netAmount: number;
  discountAmount: number;
  usageAt: string;
}

// 折扣项接口
interface BillingDiscount {
  isFullyApplied: boolean;
  currentAmount: number;
  targetAmount: number;
  percentage: number;
  uuid: string;
  targets: DiscountTarget[];
  discount: DiscountDetail;
  name: string | null;
}

// 计费使用数据接口（支持多种格式）
interface BillingUsageData {
  // 通用字段
  billableAmount?: number;
  customerId?: string;

  // 新折扣格式字段
  billable_amount?: number;
  discount_details?: BillingDiscount[];

  // 传统格式字段
  total_usage?: number;
  included_usage?: number;
  billable_usage?: number;
  usage_breakdown?: {
    actions: number;
    packages: number;
    codespaces: number;
    copilot: number;
  };
  billing_cycle?: {
    start_date: string;
    end_date: string;
  };

  // 新增字段：支持新的usage数组格式
  total_discount_amount?: number;
  usage_details?: GitHubUsageItem[];
  other_details?: GitHubOtherItem[];
  repo_breakdown?: Record<string, number>;
  org_breakdown?: Record<string, number>;
  daily_breakdown?: Record<string, number>;
  [key: string]: any;
}

interface CachedCustomer {
  customerId: string;
  lastFetched: string;
  billableAmount: number;
}

const GitHubBillingDashboard: React.FC = () => {
  const { setNotification } = useNotification();
  const [billingData, setBillingData] = useState<BillingUsageData | null>(null);
  const [cachedCustomers, setCachedCustomers] = useState<CachedCustomer[]>([]);
  const [loading, setLoading] = useState(false);
  const [customersLoading, setCustomersLoading] = useState(false);
  const [clearingCache, setClearingCache] = useState(false);
  const [, setLoadingStage] = useState<'idle' | 'initial' | 'cached' | 'complete'>('idle');

  // 获取带Turnstile访问令牌的请求头（令牌可选，有则携带）
  const getTurnstileAuthHeaders = async (): Promise<Record<string, string>> => {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };

    // 开发环境下跳过Turnstile验证
    if (isDevelopment()) {
      return headers;
    }

    // 尝试获取浏览器指纹和访问令牌，有则携带，无则跳过
    try {
      const fingerprint = await getFingerprint();
      if (fingerprint) {
        headers['X-Fingerprint'] = fingerprint;
        const turnstileToken = getAccessToken(fingerprint);
        if (turnstileToken) {
          headers['Authorization'] = `Bearer ${turnstileToken}`;
        }
      }
    } catch {
      // 获取失败不阻塞请求
    }

    return headers;
  };

  // 检测是否为开发环境
  const isDevelopment = () => {
    return process.env.NODE_ENV === 'development' ||
           process.env.NODE_ENV === 'dev' ||
           window.location.hostname === 'localhost' ||
           window.location.hostname === '127.0.0.1';
  };

  // 获取带管理员令牌和Turnstile访问令牌的请求头（用于缓存操作，Turnstile令牌可选）
  const getAdminTurnstileAuthHeaders = async (): Promise<Record<string, string>> => {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };

    // 获取管理员令牌
    const adminToken = getAuthToken();
    if (!adminToken) {
      throw new Error('缺少管理员访问令牌');
    }

    // 设置管理员令牌作为主要认证
    headers['Authorization'] = `Bearer ${adminToken}`;

    // 尝试获取Turnstile令牌，有则携带
    if (!isDevelopment()) {
      try {
        const fingerprint = await getFingerprint();
        if (fingerprint) {
          headers['X-Fingerprint'] = fingerprint;
          const turnstileToken = getAccessToken(fingerprint);
          if (turnstileToken) {
            headers['X-Turnstile-Token'] = turnstileToken;
          }
        }
      } catch {
        // 获取失败不阻塞请求
      }
    }

    return headers;
  };

  // 智能处理响应数据格式
  const processResponseData = (rawData: any): BillingUsageData => {
    // 检查是否是嵌套的usage数据结构
    if (rawData.usage) {
      return {
        billableAmount: rawData.usage.billableAmount,
        customerId: rawData.customerId,
        ...rawData
      };
    }

    // 直接返回数据（可能是新的折扣格式或传统格式）
    return rawData;
  };

  // 智能提取计费金额
  const extractBillableAmount = (data: BillingUsageData): number => {
    // 优先使用新的usage数组格式中的 billable_amount
    if (typeof data.billable_amount === 'number') {
      return data.billable_amount;
    }

    // 如果有usage_details，计算所有项目的billedAmount总和
    if (data.usage_details && Array.isArray(data.usage_details)) {
      const usageTotal = data.usage_details.reduce((total, item) => {
        return total + (item.billedAmount || 0);
      }, 0);

      // 加上other_details的billedAmount
      const otherTotal = data.other_details ? data.other_details.reduce((total, item) => {
        return total + (item.billedAmount || 0);
      }, 0) : 0;

      return usageTotal + otherTotal;
    }

    // 如果有折扣详情，计算所有折扣的 currentAmount 总和
    if (data.discount_details && Array.isArray(data.discount_details)) {
      return data.discount_details.reduce((total, discount) => {
        return total + (discount.currentAmount || 0);
      }, 0);
    }

    // 使用传统字段
    if (typeof data.billableAmount === 'number') {
      return data.billableAmount;
    }

    if (typeof data.billable_usage === 'number') {
      return data.billable_usage;
    }

    return 0;
  };

  // 格式化金额显示（保留两位小数）
  const formatAmount = (amount: number | undefined | null): string => {
    if (amount === undefined || amount === null || isNaN(amount)) {
      return '0.00';
    }
    return amount.toFixed(2);
  };

  // 获取数据格式类型
  const getDataFormatType = (data: BillingUsageData): 'usage_array' | 'discount' | 'traditional' | 'nested' => {
    if (data.usage_details && Array.isArray(data.usage_details)) {
      return 'usage_array';
    }
    if (data.discount_details && Array.isArray(data.discount_details)) {
      return 'discount';
    }
    if (data.usage && typeof data.usage === 'object') {
      return 'nested';
    }
    return 'traditional';
  };

  // 初始化时加载缓存数据（如果有的话）
  const initializeCachedData = useCallback(() => {
    setLoadingStage('initial');
    // 从localStorage获取上次的缓存数据
    const savedData = localStorage.getItem('github-billing-cache');
    if (savedData) {
      try {
        const parsedData = JSON.parse(savedData);
        setCachedCustomers(parsedData);
        setLoadingStage('cached');
      } catch (e) {
        // 忽略解析错误
        setLoadingStage('complete');
      }
    } else {
      setLoadingStage('complete');
    }
  }, []);

  // 获取账单数据
  const fetchBillingData = useCallback(async (forceRefresh: boolean = false) => {
    setLoading(true);
    try {
      const headers = await getTurnstileAuthHeaders();
      const url = forceRefresh
        ? `${getApiBaseUrl()}/api/github-billing/usage?force=true`
        : `${getApiBaseUrl()}/api/github-billing/usage`;

      const res = await fetch(url, {
        headers
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 401) {
          setNotification({
            message: '请刷新页面',
            type: 'error'
          });
        } else {
          setNotification({ message: data.error || '获取账单数据失败', type: 'error' });
        }
        return;
      }
      if (data.success) {
        // 智能处理多种数据格式
        const processedData = processResponseData(data.data);
        setBillingData(processedData);
        const message = forceRefresh ? '账单数据强制刷新成功' : '账单数据获取成功';
        setNotification({ message, type: 'success' });

        // 将当前获取的数据作为缓存客户数据
        if (processedData.customerId) {
          const customerData = {
            customerId: processedData.customerId,
            lastFetched: new Date().toISOString(),
            billableAmount: extractBillableAmount(processedData)
          };
          setCachedCustomers([customerData]);
          // 保存到localStorage
          localStorage.setItem('github-billing-cache', JSON.stringify([customerData]));
          setLoadingStage('complete');
        }
      }
    } catch (e) {
      setNotification({ message: '获取账单数据失败：' + (e instanceof Error ? e.message : '未知错误'), type: 'error' });
    } finally {
      setLoading(false);
    }
  }, [setNotification]);

  // 检查是否有管理员访问令牌（Turnstile令牌不再强制要求）
  const checkAdminAndTurnstileToken = async (): Promise<boolean> => {
    try {
      const adminToken = getAuthToken();
      if (!adminToken) {
        setNotification({
          message: '缺少管理员访问令牌',
          type: 'error'
        });
        return false;
      }
      return true;
    } catch (error) {
      setNotification({
        message: '检查访问令牌失败：' + (error instanceof Error ? error.message : '未知错误'),
        type: 'error'
      });
      return false;
    }
  };

  // 清除缓存
  const clearCache = useCallback(async (customerId?: string) => {
    if (!(await checkAdminAndTurnstileToken())) {
      return;
    }

    setClearingCache(true);
    try {
      const url = customerId
        ? `${getApiBaseUrl()}/api/github-billing/cache/${customerId}`
        : `${getApiBaseUrl()}/api/github-billing/cache/expired`;

      const headers = await getAdminTurnstileAuthHeaders();

      const res = await fetch(url, {
        method: 'DELETE',
        headers
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 401) {
          setNotification({
            message: '请刷新页面',
            type: 'error'
          });
        } else {
          setNotification({ message: data.error || '清除缓存失败', type: 'error' });
        }
        return;
      }
      if (data.success) {
        setNotification({ message: '缓存清除成功', type: 'success' });
        // 清空本地缓存数据
        setCachedCustomers([]);
        localStorage.removeItem('github-billing-cache');
        // 如果清除的是当前显示的数据，则清空显示
        if (customerId && billingData?.customerId === customerId) {
          setBillingData(null);
        }
      }
    } catch (e) {
      setNotification({ message: '清除缓存失败：' + (e instanceof Error ? e.message : '未知错误'), type: 'error' });
    } finally {
      setClearingCache(false);
    }
  }, [setNotification, billingData]);

  // 渐进式数据加载
  useEffect(() => {
    const loadDataProgressively = async () => {
      // 第一阶段：立即加载本地缓存数据
      initializeCachedData();

      // 第二阶段：延迟加载远程缓存客户列表（如果需要）
      setTimeout(async () => {
        try {
          setCustomersLoading(true);
          const res = await fetch(`${getApiBaseUrl()}/api/github-billing/customers`);
          const data = await res.json();

          if (res.ok && data.success && data.data?.length > 0) {
            // 合并远程数据和本地数据，去重
            const remoteCustomers = data.data;
            setCachedCustomers(prevCustomers => {
              const existingIds = new Set(prevCustomers.map(c => c.customerId));
              const newCustomers = remoteCustomers.filter((c: CachedCustomer) => !existingIds.has(c.customerId));
              return [...prevCustomers, ...newCustomers];
            });
          }
        } catch (error) {
          console.log('远程缓存数据加载失败，使用本地数据:', error);
        } finally {
          setCustomersLoading(false);
          setLoadingStage('complete');
        }
      }, 1200);
    };

    loadDataProgressively();
  }, [initializeCachedData]);

  return (
    <section className="mx-auto max-w-6xl px-4 py-10 sm:py-12">
      <div className="space-y-6">
        {/* 主面板：标题与操作 */}
        <m.div
          className="relative overflow-hidden rounded-[34px] border border-white/70 bg-white/88 p-6 shadow-[0_28px_110px_rgba(15,23,42,0.1)] backdrop-blur-xl sm:p-10"
          initial={ENTER_INITIAL}
          animate={ENTER_ANIMATE}
          transition={trans06}
        >
          <div className="pointer-events-none absolute -right-16 top-0 h-48 w-48 rounded-full bg-[radial-gradient(circle,_rgba(59,130,246,0.22),_transparent_68%)]" />
          <div className="pointer-events-none absolute -left-10 bottom-0 h-40 w-40 rounded-full bg-[radial-gradient(circle,_rgba(14,165,233,0.16),_transparent_70%)]" />
          <div className="relative">
            <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">
              <FaGithub className="text-[10px]" /> GITHUB BILLING
            </div>
            <h1 className="mt-5 text-3xl font-semibold leading-tight text-slate-900 sm:text-4xl">GitHub 账单</h1>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-600 sm:text-base">
              查看 GitHub 账单使用情况数据，支持多种数据格式与缓存管理。
            </p>

            <div className="mt-8 flex flex-wrap gap-2">
              <m.button
                onClick={() => fetchBillingData(false)}
                disabled={loading}
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2"
                whileTap={{ scale: 0.97 }}
              >
                <FaSync className={`text-xs ${loading ? 'animate-spin' : ''}`} />
                {loading ? '获取中...' : '获取数据'}
              </m.button>
              <m.button
                onClick={() => fetchBillingData(true)}
                disabled={loading}
                className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white/80 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-60"
                whileTap={{ scale: 0.97 }}
              >
                <FaSync className={`text-xs ${loading ? 'animate-spin' : ''}`} />
                {loading ? '刷新中...' : '强制刷新'}
              </m.button>
              <m.button
                onClick={() => clearCache()}
                disabled={clearingCache}
                className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white/80 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-60"
                whileTap={{ scale: 0.97 }}
              >
                <FaTrash className="text-xs" />
                {clearingCache ? '清除中...' : '清除过期缓存'}
              </m.button>
            </div>
          </div>
        </m.div>

        {/* 账单数据显示 */}
        {billingData && (
          <m.div
            className="relative overflow-hidden rounded-[26px] border border-white/70 bg-white/82 p-5 shadow-[0_18px_60px_rgba(15,23,42,0.06)] backdrop-blur-xl sm:p-6"
            initial={ENTER_INITIAL}
            animate={ENTER_ANIMATE}
            transition={trans06}
          >
            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.26em] text-slate-500">
              <FaDollarSign className="text-slate-500" /> 当前账单数据
            </div>

            <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              {/* 可计费金额 */}
              <div className="relative overflow-hidden rounded-[24px] border border-white/70 bg-white/82 p-5 shadow-[0_18px_60px_rgba(15,23,42,0.06)] backdrop-blur-xl">
                <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.26em] text-slate-400">
                  <FaDollarSign className="text-[10px]" /> 可计费金额
                </div>
                <div className="mt-2 text-2xl font-semibold text-slate-900 sm:text-3xl">
                  ${formatAmount(extractBillableAmount(billingData))}
                </div>
                <div className="mt-2 text-xs text-slate-500">
                  原始值: {extractBillableAmount(billingData)}
                </div>
                <div className="mt-1 text-xs text-slate-500">
                  格式类型: <span className="font-medium text-slate-700">
                    {getDataFormatType(billingData) === 'usage_array' ? 'Usage数组格式' :
                     getDataFormatType(billingData) === 'discount' ? '折扣格式' :
                     getDataFormatType(billingData) === 'nested' ? '嵌套格式' : '传统格式'}
                  </span>
                </div>
              </div>

              {/* Customer ID */}
              {billingData.customerId && (
                <div className="relative overflow-hidden rounded-[24px] border border-white/70 bg-white/82 p-5 shadow-[0_18px_60px_rgba(15,23,42,0.06)] backdrop-blur-xl">
                  <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.26em] text-slate-400">
                    <FaUser className="text-[10px]" /> Customer ID
                  </div>
                  <div className="mt-2 font-mono text-sm text-slate-900 break-all">
                    {billingData.customerId}
                  </div>
                </div>
              )}

              {/* 获取时间 */}
              <div className="relative overflow-hidden rounded-[24px] border border-white/70 bg-white/82 p-5 shadow-[0_18px_60px_rgba(15,23,42,0.06)] backdrop-blur-xl">
                <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.26em] text-slate-400">
                  <FaCalendarAlt className="text-[10px]" /> 获取时间
                </div>
                <div className="mt-2 text-sm text-slate-700">
                  {new Date().toLocaleString()}
                </div>
              </div>
            </div>

            {/* 折扣详情（仅在新格式下显示） */}
            {getDataFormatType(billingData) === 'discount' && billingData.discount_details && (
              <div className="mt-8">
                <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.26em] text-slate-500">
                  折扣详情
                </div>
                <div className="mt-3 space-y-3">
                  {billingData.discount_details.map((discount, index) => (
                    <div key={discount.uuid || index} className="relative overflow-hidden rounded-[22px] border border-slate-200 bg-white/80 p-4 backdrop-blur-xl">
                      <div className="grid grid-cols-1 gap-4 text-sm md:grid-cols-2 lg:grid-cols-4">
                        <div>
                          <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-400">名称</span>
                          <div className="mt-1 text-slate-800">{discount.name || '未命名'}</div>
                        </div>
                        <div>
                          <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-400">当前金额</span>
                          <div className="mt-1 font-semibold text-slate-900">${formatAmount(discount.currentAmount)}</div>
                        </div>
                        <div>
                          <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-400">目标金额</span>
                          <div className="mt-1 text-slate-800">${formatAmount(discount.targetAmount)}</div>
                        </div>
                        <div>
                          <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-400">状态</span>
                          <div className={`mt-1 font-medium ${discount.isFullyApplied ? 'text-emerald-700' : 'text-amber-700'}`}>
                            {discount.isFullyApplied ? '完全应用' : '部分应用'}
                          </div>
                        </div>
                        <div>
                          <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-400">百分比</span>
                          <div className="mt-1 text-slate-800">{discount.percentage}%</div>
                        </div>
                        <div>
                          <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-400">类型</span>
                          <div className="mt-1 text-slate-800">{discount.discount.discountType}</div>
                        </div>
                        <div>
                          <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-400">资金来源</span>
                          <div className="mt-1 text-slate-800">{discount.discount.fundingSource}</div>
                        </div>
                        <div>
                          <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-400">目标数量</span>
                          <div className="mt-1 text-slate-800">{discount.targets.length} 个</div>
                        </div>
                      </div>
                      {discount.targets.length > 0 && (
                        <div className="mt-4 border-t border-slate-100 pt-3">
                          <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-400">目标服务</span>
                          <div className="mt-2 flex flex-wrap gap-2">
                            {discount.targets.map((target, targetIndex) => (
                              <span
                                key={`${target.id}-${targetIndex}`}
                                className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-700"
                              >
                                {target.id}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Usage数组格式数据详情 */}
            {getDataFormatType(billingData) === 'usage_array' && (
              <div className="mt-8 space-y-6">
                {/* 统计概览 */}
                <div>
                  <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.26em] text-slate-500">
                    统计概览
                  </div>
                  <div className="mt-3 grid grid-cols-1 gap-4 md:grid-cols-3">
                    {billingData.repo_breakdown && (
                      <div className="relative overflow-hidden rounded-[24px] border border-white/70 bg-white/82 p-5 shadow-[0_18px_60px_rgba(15,23,42,0.06)] backdrop-blur-xl">
                        <div className="text-[10px] font-semibold uppercase tracking-[0.26em] text-slate-400">仓库数量</div>
                        <div className="mt-2 text-2xl font-semibold text-slate-900 sm:text-3xl">
                          {Object.keys(billingData.repo_breakdown).length}
                        </div>
                      </div>
                    )}
                    {billingData.usage_details && (
                      <div className="relative overflow-hidden rounded-[24px] border border-white/70 bg-white/82 p-5 shadow-[0_18px_60px_rgba(15,23,42,0.06)] backdrop-blur-xl">
                        <div className="text-[10px] font-semibold uppercase tracking-[0.26em] text-slate-400">使用记录</div>
                        <div className="mt-2 text-2xl font-semibold text-slate-900 sm:text-3xl">
                          {billingData.usage_details.length}
                        </div>
                      </div>
                    )}
                    {billingData.total_discount_amount !== undefined && (
                      <div className="relative overflow-hidden rounded-[24px] border border-white/70 bg-white/82 p-5 shadow-[0_18px_60px_rgba(15,23,42,0.06)] backdrop-blur-xl">
                        <div className="text-[10px] font-semibold uppercase tracking-[0.26em] text-slate-400">总折扣金额</div>
                        <div className="mt-2 text-2xl font-semibold text-slate-900 sm:text-3xl">
                          ${formatAmount(billingData.total_discount_amount)}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* 仓库使用分布 */}
                {billingData.repo_breakdown && Object.keys(billingData.repo_breakdown).length > 0 && (
                  <div>
                    <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.26em] text-slate-500">
                      仓库使用分布
                    </div>
                    <div className="mt-3 rounded-[22px] border border-slate-200 bg-white/80 p-4 backdrop-blur-xl">
                      <div className="space-y-2">
                        {Object.entries(billingData.repo_breakdown)
                          .sort(([, a], [, b]) => b - a)
                          .slice(0, 10)
                          .map(([repo, amount]) => (
                            <div key={repo} className="flex items-center justify-between">
                              <span className="mr-4 flex-1 truncate text-sm font-medium text-slate-700">
                                {repo}
                              </span>
                              <span className="text-sm font-semibold text-slate-900">
                                ${formatAmount(amount)}
                              </span>
                            </div>
                          ))}
                        {Object.keys(billingData.repo_breakdown).length > 10 && (
                          <div className="border-t border-slate-100 pt-2 text-xs text-slate-500">
                            还有 {Object.keys(billingData.repo_breakdown).length - 10} 个仓库...
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* 组织使用分布 */}
                {billingData.org_breakdown && Object.keys(billingData.org_breakdown).length > 0 && (
                  <div>
                    <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.26em] text-slate-500">
                      组织使用分布
                    </div>
                    <div className="mt-3 rounded-[22px] border border-slate-200 bg-white/80 p-4 backdrop-blur-xl">
                      <div className="space-y-2">
                        {Object.entries(billingData.org_breakdown)
                          .sort(([, a], [, b]) => b - a)
                          .map(([org, amount]) => (
                            <div key={org} className="flex items-center justify-between">
                              <span className="text-sm font-medium text-slate-700">
                                {org}
                              </span>
                              <span className="text-sm font-semibold text-slate-900">
                                ${formatAmount(amount)}
                              </span>
                            </div>
                          ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* 最近使用记录 */}
                {billingData.usage_details && billingData.usage_details.length > 0 && (
                  <div>
                    <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.26em] text-slate-500">
                      最近使用记录 (前10条)
                    </div>
                    <div className="mt-3 overflow-hidden rounded-[26px] border border-slate-200 bg-white/80 backdrop-blur-xl">
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr>
                              <th className="border-b border-slate-100 bg-slate-50/60 px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-500">仓库</th>
                              <th className="border-b border-slate-100 bg-slate-50/60 px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-500">组织</th>
                              <th className="border-b border-slate-100 bg-slate-50/60 px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-500">计费金额</th>
                              <th className="border-b border-slate-100 bg-slate-50/60 px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-500">折扣金额</th>
                              <th className="border-b border-slate-100 bg-slate-50/60 px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-500">使用时间</th>
                            </tr>
                          </thead>
                          <tbody>
                            {billingData.usage_details
                              .sort((a, b) => new Date(b.usageAt).getTime() - new Date(a.usageAt).getTime())
                              .slice(0, 10)
                              .map((item, index) => (
                                <tr key={index}>
                                  <td className="border-b border-slate-100/70 px-4 py-3 font-mono text-xs text-slate-700">
                                    {item.repo?.name || 'N/A'}
                                  </td>
                                  <td className="border-b border-slate-100/70 px-4 py-3 text-sm text-slate-700">
                                    <div className="flex items-center gap-2">
                                      {item.org?.avatarSrc && (
                                        <img
                                          src={item.org.avatarSrc}
                                          alt={item.org.name}
                                          className="h-4 w-4 rounded-full"
                                        />
                                      )}
                                      <span>{item.org?.name || 'N/A'}</span>
                                    </div>
                                  </td>
                                  <td className="border-b border-slate-100/70 px-4 py-3 text-sm font-semibold text-slate-900">
                                    ${formatAmount(item.billedAmount)}
                                  </td>
                                  <td className="border-b border-slate-100/70 px-4 py-3 text-sm font-semibold text-slate-700">
                                    ${formatAmount(item.discountAmount)}
                                  </td>
                                  <td className="border-b border-slate-100/70 px-4 py-3 text-xs text-slate-500">
                                    {new Date(item.usageAt).toLocaleString()}
                                  </td>
                                </tr>
                              ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* 传统格式数据详情 */}
            {getDataFormatType(billingData) === 'traditional' && billingData.usage_breakdown && (
              <div className="mt-8">
                <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.26em] text-slate-500">
                  使用详情
                </div>
                <div className="mt-3 grid grid-cols-2 gap-4 md:grid-cols-4">
                  <div className="relative overflow-hidden rounded-[20px] border border-white/70 bg-white/82 p-4 shadow-[0_18px_60px_rgba(15,23,42,0.06)] backdrop-blur-xl">
                    <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-400">Actions</div>
                    <div className="mt-2 text-lg font-semibold text-slate-900">{billingData.usage_breakdown.actions}</div>
                  </div>
                  <div className="relative overflow-hidden rounded-[20px] border border-white/70 bg-white/82 p-4 shadow-[0_18px_60px_rgba(15,23,42,0.06)] backdrop-blur-xl">
                    <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-400">Packages</div>
                    <div className="mt-2 text-lg font-semibold text-slate-900">{billingData.usage_breakdown.packages}</div>
                  </div>
                  <div className="relative overflow-hidden rounded-[20px] border border-white/70 bg-white/82 p-4 shadow-[0_18px_60px_rgba(15,23,42,0.06)] backdrop-blur-xl">
                    <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-400">Codespaces</div>
                    <div className="mt-2 text-lg font-semibold text-slate-900">{billingData.usage_breakdown.codespaces}</div>
                  </div>
                  <div className="relative overflow-hidden rounded-[20px] border border-white/70 bg-white/82 p-4 shadow-[0_18px_60px_rgba(15,23,42,0.06)] backdrop-blur-xl">
                    <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-400">Copilot</div>
                    <div className="mt-2 text-lg font-semibold text-slate-900">{billingData.usage_breakdown.copilot}</div>
                  </div>
                </div>
                {billingData.billing_cycle && (
                  <div className="mt-4 rounded-[22px] border border-slate-200 bg-white/80 p-4 backdrop-blur-xl">
                    <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-400">计费周期</div>
                    <div className="mt-2 text-sm text-slate-700">
                      {billingData.billing_cycle.start_date} 至 {billingData.billing_cycle.end_date}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* 其他数据字段 */}
            {Object.keys(billingData).filter(key => !['billableAmount', 'customerId', 'billable_amount', 'discount_details', 'usage_breakdown', 'billing_cycle', 'total_usage', 'included_usage', 'billable_usage'].includes(key)).length > 0 && (
              <div className="mt-8">
                <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.26em] text-slate-500">
                  其他数据
                </div>
                <div className="mt-3 rounded-[22px] border border-slate-200 bg-white/80 p-4 backdrop-blur-xl">
                  <pre className="overflow-x-auto text-xs text-slate-700">
                    {JSON.stringify(
                      Object.fromEntries(
                        Object.entries(billingData).filter(([key]) => !['billableAmount', 'customerId', 'billable_amount', 'discount_details', 'usage_breakdown', 'billing_cycle', 'total_usage', 'included_usage', 'billable_usage'].includes(key))
                      ),
                      null,
                      2
                    )}
                  </pre>
                </div>
              </div>
            )}
          </m.div>
        )}

        {/* 缓存的客户列表 */}
        <m.div
          className="relative overflow-hidden rounded-[26px] border border-white/70 bg-white/82 p-5 shadow-[0_18px_60px_rgba(15,23,42,0.06)] backdrop-blur-xl sm:p-6"
          initial={ENTER_INITIAL}
          animate={ENTER_ANIMATE}
          transition={trans06}
          style={{ minHeight: 160 }}
        >
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.26em] text-slate-500">
              缓存的客户数据
              {customersLoading && (
                <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-400 normal-case">正在同步...</span>
              )}
            </div>
            <m.button
              onClick={() => fetchBillingData()}
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white/80 px-4 py-2 text-xs font-semibold text-slate-700 transition hover:border-slate-300 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-60"
              whileTap={{ scale: 0.97 }}
            >
              <FaSync className={`text-[10px] ${loading ? 'animate-spin' : ''}`} />
              刷新
            </m.button>
          </div>

          {customersLoading && cachedCustomers.length === 0 ? (
            <div className="space-y-3">
              {[...Array(3)].map((_, index) => (
                <div key={index} className="flex animate-pulse items-center justify-between rounded-[20px] border border-slate-200 bg-slate-50/60 p-4">
                  <div className="flex-1 space-y-2">
                    <div className="h-4 w-48 rounded bg-slate-200"></div>
                    <div className="h-3 w-32 rounded bg-slate-200"></div>
                  </div>
                  <div className="flex gap-2">
                    <div className="h-6 w-12 rounded bg-slate-200"></div>
                    <div className="h-6 w-12 rounded bg-slate-200"></div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="overflow-hidden rounded-[22px] border border-slate-200 bg-white/80 backdrop-blur-xl">
              {cachedCustomers.length === 0 ? (
                <div className="py-8 text-center text-sm text-slate-500">暂无缓存数据</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr>
                        <th className="border-b border-slate-100 bg-slate-50/60 px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-500">Customer ID</th>
                        <th className="border-b border-slate-100 bg-slate-50/60 px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-500">可计费金额</th>
                        <th className="border-b border-slate-100 bg-slate-50/60 px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-500">缓存时间</th>
                        <th className="border-b border-slate-100 bg-slate-50/60 px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-500">操作</th>
                      </tr>
                    </thead>
                    <tbody>
                      {cachedCustomers.map((customer, index) => (
                        <tr key={`customer-${customer.customerId}-${index}`}>
                          <td className="border-b border-slate-100/70 px-4 py-3 font-mono text-xs text-slate-700 break-all">{customer.customerId}</td>
                          <td className="border-b border-slate-100/70 px-4 py-3 text-sm font-semibold text-slate-900">
                            ${formatAmount(customer.billableAmount)}
                            <div className="text-xs font-normal text-slate-500">原始: {customer.billableAmount}</div>
                          </td>
                          <td className="border-b border-slate-100/70 px-4 py-3 text-xs text-slate-500">
                            {customer.lastFetched ?
                              new Date(customer.lastFetched).toLocaleString() :
                              '未知时间'
                            }
                          </td>
                          <td className="border-b border-slate-100/70 px-4 py-3">
                            <div className="flex gap-2">
                              <m.button
                                onClick={() => fetchBillingData()}
                                className="rounded-full bg-slate-900 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-white transition hover:bg-slate-800"
                                whileTap={{ scale: 0.95 }}
                              >
                                查看
                              </m.button>
                              <m.button
                                onClick={() => clearCache(customer.customerId)}
                                disabled={clearingCache}
                                className="rounded-full border border-slate-200 bg-white/80 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500 transition hover:border-slate-300 hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
                                whileTap={{ scale: 0.95 }}
                              >
                                清除
                              </m.button>
                            </div>
                          </td>
                        </tr>
                      ))}
                      {customersLoading && cachedCustomers.length > 0 && (
                        <tr className="animate-pulse">
                          <td colSpan={4} className="px-4 py-3 text-center text-xs text-slate-500">
                            正在同步更多数据...
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </m.div>

        {/* 使用说明 */}
        <m.div
          className="relative overflow-hidden rounded-[26px] border border-white/70 bg-white/82 p-5 shadow-[0_18px_60px_rgba(15,23,42,0.06)] backdrop-blur-xl sm:p-6"
          initial={ENTER_INITIAL}
          animate={ENTER_ANIMATE}
          transition={trans06}
        >
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.26em] text-slate-500">
            使用说明
          </div>
          <ul className="mt-4 space-y-2 text-sm leading-7 text-slate-600">
            <li>• <strong className="text-slate-800">获取数据：</strong>点击“获取数据”按钮从 GitHub API 获取最新的账单数据</li>
            <li>• <strong className="text-slate-800">访问令牌：</strong>如果后端启用了首次访问验证（ENABLE_FIRST_VISIT_VERIFICATION），需要通过 Turnstile 验证获取访问令牌</li>
            <li>• <strong className="text-slate-800">Customer ID：</strong>系统自动使用后端配置的默认值</li>
            <li>• <strong className="text-slate-800">数据缓存：</strong>系统会自动缓存获取的数据，避免频繁调用 GitHub API</li>
            <li>• <strong className="text-slate-800">金额显示：</strong>billableAmount 会自动格式化为两位小数，同时显示原始值</li>
            <li>• <strong className="text-slate-800">缓存管理：</strong>可以清除特定客户的缓存或清除所有过期缓存</li>
          </ul>
        </m.div>
      </div>
    </section>
  );
};

export default GitHubBillingDashboard;
