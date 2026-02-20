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
    <div className="space-y-6">
      {/* 页面标题 */}
      <m.div
        className="bg-gradient-to-r from-blue-600 to-purple-600 rounded-xl p-6 text-white"
        initial={ENTER_INITIAL}
        animate={ENTER_ANIMATE}
        transition={trans06}
      >
        <div className="flex items-center gap-3">
          <FaGithub className="w-8 h-8" />
          <div>
            <h1 className="text-2xl font-bold">GitHub Billing Dashboard</h1>
            <p className="text-blue-100 mt-1">查看 GitHub 账单使用情况数据</p>
          </div>
        </div>
      </m.div>

      {/* 操作面板 */}
      <m.div
        className="bg-white rounded-xl p-6 shadow-sm border border-gray-200"
        initial={ENTER_INITIAL}
        animate={ENTER_ANIMATE}
        transition={trans06}
      >
        <div className="flex flex-col lg:flex-row gap-4 items-end">
          <div className="flex gap-2">
            <m.button
              onClick={() => fetchBillingData(false)}
              disabled={loading}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-50 text-sm font-medium flex items-center gap-2"
              whileTap={{ scale: 0.95 }}
            >
              <FaSync className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              {loading ? '获取中...' : '获取数据'}
            </m.button>
            <m.button
              onClick={() => fetchBillingData(true)}
              disabled={loading}
              className="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition disabled:opacity-50 text-sm font-medium flex items-center gap-2"
              whileTap={{ scale: 0.95 }}
            >
              <FaSync className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              {loading ? '刷新中...' : '强制刷新'}
            </m.button>
            <m.button
              onClick={() => clearCache()}
              disabled={clearingCache}
              className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition disabled:opacity-50 text-sm font-medium flex items-center gap-2"
              whileTap={{ scale: 0.95 }}
            >
              <FaTrash className="w-4 h-4" />
              {clearingCache ? '清除中...' : '清除过期缓存'}
            </m.button>
          </div>
        </div>
      </m.div>

      {/* 账单数据显示 */}
      {billingData && (
        <m.div
          className="bg-white rounded-xl p-6 shadow-sm border border-gray-200"
          initial={ENTER_INITIAL}
          animate={ENTER_ANIMATE}
          transition={trans06}
        >
          <div className="flex items-center gap-2 mb-4">
            <FaDollarSign className="w-5 h-5 text-green-600" />
            <h3 className="text-lg font-semibold text-gray-800">当前账单数据</h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* 可计费金额 */}
            <div className="bg-gradient-to-br from-green-50 to-green-100 p-4 rounded-lg border border-green-200">
              <div className="flex items-center gap-2 mb-2">
                <FaDollarSign className="w-4 h-4 text-green-600" />
                <span className="text-sm font-medium text-green-800">可计费金额</span>
              </div>
              <div className="text-2xl font-bold text-green-900">
                ${formatAmount(extractBillableAmount(billingData))}
              </div>
              <div className="text-xs text-green-700 mt-1">
                原始值: {extractBillableAmount(billingData)}
              </div>
              <div className="text-xs text-green-600 mt-1">
                格式类型: <span className="font-medium text-blue-600">
                  {getDataFormatType(billingData) === 'usage_array' ? 'Usage数组格式' : 
                   getDataFormatType(billingData) === 'discount' ? '折扣格式' :
                   getDataFormatType(billingData) === 'nested' ? '嵌套格式' : '传统格式'}
                </span>
              </div>
            </div>

            {/* Customer ID */}
            {billingData.customerId && (
              <div className="bg-gradient-to-br from-blue-50 to-blue-100 p-4 rounded-lg border border-blue-200">
                <div className="flex items-center gap-2 mb-2">
                  <FaUser className="w-4 h-4 text-blue-600" />
                  <span className="text-sm font-medium text-blue-800">Customer ID</span>
                </div>
                <div className="text-lg font-mono text-blue-900 break-all">
                  {billingData.customerId}
                </div>
              </div>
            )}

            {/* 获取时间 */}
            <div className="bg-gradient-to-br from-purple-50 to-purple-100 p-4 rounded-lg border border-purple-200">
              <div className="flex items-center gap-2 mb-2">
                <FaCalendarAlt className="w-4 h-4 text-purple-600" />
                <span className="text-sm font-medium text-purple-800">获取时间</span>
              </div>
              <div className="text-sm text-purple-900">
                {new Date().toLocaleString()}
              </div>
            </div>
          </div>

          {/* 折扣详情（仅在新格式下显示） */}
          {getDataFormatType(billingData) === 'discount' && billingData.discount_details && (
            <div className="mt-6">
              <h4 className="text-md font-semibold text-gray-700 mb-3">折扣详情</h4>
              <div className="space-y-3">
                {billingData.discount_details.map((discount, index) => (
                  <div key={discount.uuid || index} className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
                      <div>
                        <span className="font-medium text-gray-600">名称:</span>
                        <div className="text-gray-800">{discount.name || '未命名'}</div>
                      </div>
                      <div>
                        <span className="font-medium text-gray-600">当前金额:</span>
                        <div className="text-green-600 font-bold">${formatAmount(discount.currentAmount)}</div>
                      </div>
                      <div>
                        <span className="font-medium text-gray-600">目标金额:</span>
                        <div className="text-gray-800">${formatAmount(discount.targetAmount)}</div>
                      </div>
                      <div>
                        <span className="font-medium text-gray-600">状态:</span>
                        <div className={`font-medium ${discount.isFullyApplied ? 'text-green-600' : 'text-orange-600'}`}>
                          {discount.isFullyApplied ? '完全应用' : '部分应用'}
                        </div>
                      </div>
                      <div>
                        <span className="font-medium text-gray-600">百分比:</span>
                        <div className="text-gray-800">{discount.percentage}%</div>
                      </div>
                      <div>
                        <span className="font-medium text-gray-600">类型:</span>
                        <div className="text-gray-800">{discount.discount.discountType}</div>
                      </div>
                      <div>
                        <span className="font-medium text-gray-600">资金来源:</span>
                        <div className="text-gray-800">{discount.discount.fundingSource}</div>
                      </div>
                      <div>
                        <span className="font-medium text-gray-600">目标数量:</span>
                        <div className="text-gray-800">{discount.targets.length} 个</div>
                      </div>
                    </div>
                    {discount.targets.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-gray-200">
                        <span className="font-medium text-gray-600 text-sm">目标服务:</span>
                        <div className="flex flex-wrap gap-2 mt-1">
                          {discount.targets.map((target, targetIndex) => (
                            <span
                              key={`${target.id}-${targetIndex}`}
                              className="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded-full"
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
            <div className="mt-6 space-y-6">
              {/* 统计概览 */}
              <div>
                <h4 className="text-md font-semibold text-gray-700 mb-3">统计概览</h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {billingData.repo_breakdown && (
                    <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                      <div className="text-sm font-medium text-blue-800 mb-2">仓库数量</div>
                      <div className="text-2xl font-bold text-blue-900">
                        {Object.keys(billingData.repo_breakdown).length}
                      </div>
                    </div>
                  )}
                  {billingData.usage_details && (
                    <div className="bg-green-50 p-4 rounded-lg border border-green-200">
                      <div className="text-sm font-medium text-green-800 mb-2">使用记录</div>
                      <div className="text-2xl font-bold text-green-900">
                        {billingData.usage_details.length}
                      </div>
                    </div>
                  )}
                  {billingData.total_discount_amount !== undefined && (
                    <div className="bg-orange-50 p-4 rounded-lg border border-orange-200">
                      <div className="text-sm font-medium text-orange-800 mb-2">总折扣金额</div>
                      <div className="text-2xl font-bold text-orange-900">
                        ${formatAmount(billingData.total_discount_amount)}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* 仓库使用分布 */}
              {billingData.repo_breakdown && Object.keys(billingData.repo_breakdown).length > 0 && (
                <div>
                  <h4 className="text-md font-semibold text-gray-700 mb-3">仓库使用分布</h4>
                  <div className="bg-gray-50 p-4 rounded-lg">
                    <div className="space-y-2">
                      {Object.entries(billingData.repo_breakdown)
                        .sort(([,a], [,b]) => b - a)
                        .slice(0, 10)
                        .map(([repo, amount]) => (
                          <div key={repo} className="flex justify-between items-center">
                            <span className="text-sm font-medium text-gray-700 truncate flex-1 mr-4">
                              {repo}
                            </span>
                            <span className="text-sm font-bold text-green-600">
                              ${formatAmount(amount)}
                            </span>
                          </div>
                        ))}
                      {Object.keys(billingData.repo_breakdown).length > 10 && (
                        <div className="text-xs text-gray-500 pt-2 border-t">
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
                  <h4 className="text-md font-semibold text-gray-700 mb-3">组织使用分布</h4>
                  <div className="bg-gray-50 p-4 rounded-lg">
                    <div className="space-y-2">
                      {Object.entries(billingData.org_breakdown)
                        .sort(([,a], [,b]) => b - a)
                        .map(([org, amount]) => (
                          <div key={org} className="flex justify-between items-center">
                            <span className="text-sm font-medium text-gray-700">
                              {org}
                            </span>
                            <span className="text-sm font-bold text-blue-600">
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
                  <h4 className="text-md font-semibold text-gray-700 mb-3">最近使用记录 (前10条)</h4>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm border border-gray-200 rounded-lg">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="text-left py-2 px-3 font-medium text-gray-700">仓库</th>
                          <th className="text-left py-2 px-3 font-medium text-gray-700">组织</th>
                          <th className="text-left py-2 px-3 font-medium text-gray-700">计费金额</th>
                          <th className="text-left py-2 px-3 font-medium text-gray-700">折扣金额</th>
                          <th className="text-left py-2 px-3 font-medium text-gray-700">使用时间</th>
                        </tr>
                      </thead>
                      <tbody>
                        {billingData.usage_details
                          .sort((a, b) => new Date(b.usageAt).getTime() - new Date(a.usageAt).getTime())
                          .slice(0, 10)
                          .map((item, index) => (
                            <tr key={index} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                              <td className="py-2 px-3 font-mono text-xs">
                                {item.repo?.name || 'N/A'}
                              </td>
                              <td className="py-2 px-3 text-xs">
                                <div className="flex items-center gap-2">
                                  {item.org?.avatarSrc && (
                                    <img 
                                      src={item.org.avatarSrc} 
                                      alt={item.org.name}
                                      className="w-4 h-4 rounded-full"
                                    />
                                  )}
                                  <span>{item.org?.name || 'N/A'}</span>
                                </div>
                              </td>
                              <td className="py-2 px-3 font-bold text-green-600">
                                ${formatAmount(item.billedAmount)}
                              </td>
                              <td className="py-2 px-3 font-bold text-orange-600">
                                ${formatAmount(item.discountAmount)}
                              </td>
                              <td className="py-2 px-3 text-xs text-gray-600">
                                {new Date(item.usageAt).toLocaleString()}
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 传统格式数据详情 */}
          {getDataFormatType(billingData) === 'traditional' && billingData.usage_breakdown && (
            <div className="mt-6">
              <h4 className="text-md font-semibold text-gray-700 mb-3">使用详情</h4>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-blue-50 p-3 rounded-lg border border-blue-200">
                  <div className="text-sm font-medium text-blue-800">Actions</div>
                  <div className="text-lg font-bold text-blue-900">{billingData.usage_breakdown.actions}</div>
                </div>
                <div className="bg-green-50 p-3 rounded-lg border border-green-200">
                  <div className="text-sm font-medium text-green-800">Packages</div>
                  <div className="text-lg font-bold text-green-900">{billingData.usage_breakdown.packages}</div>
                </div>
                <div className="bg-purple-50 p-3 rounded-lg border border-purple-200">
                  <div className="text-sm font-medium text-purple-800">Codespaces</div>
                  <div className="text-lg font-bold text-purple-900">{billingData.usage_breakdown.codespaces}</div>
                </div>
                <div className="bg-orange-50 p-3 rounded-lg border border-orange-200">
                  <div className="text-sm font-medium text-orange-800">Copilot</div>
                  <div className="text-lg font-bold text-orange-900">{billingData.usage_breakdown.copilot}</div>
                </div>
              </div>
              {billingData.billing_cycle && (
                <div className="mt-4 bg-gray-50 p-3 rounded-lg">
                  <div className="text-sm font-medium text-gray-600">计费周期</div>
                  <div className="text-sm text-gray-800">
                    {billingData.billing_cycle.start_date} 至 {billingData.billing_cycle.end_date}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 其他数据字段 */}
          {Object.keys(billingData).filter(key => !['billableAmount', 'customerId', 'billable_amount', 'discount_details', 'usage_breakdown', 'billing_cycle', 'total_usage', 'included_usage', 'billable_usage'].includes(key)).length > 0 && (
            <div className="mt-6">
              <h4 className="text-md font-semibold text-gray-700 mb-3">其他数据</h4>
              <div className="bg-gray-50 p-4 rounded-lg">
                <pre className="text-xs text-gray-700 overflow-x-auto">
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

      {/* 缓存的客户列表：始终挂载面板以避免表格闪现，内部根据状态切换内容 */}
      <m.div
        className="bg-white rounded-xl p-6 shadow-sm border border-gray-200"
        initial={ENTER_INITIAL}
        animate={ENTER_ANIMATE}
        transition={trans06}
        style={{ minHeight: 160 }}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-800">
            缓存的客户数据
            {customersLoading && (
              <span className="ml-2 text-sm text-blue-600">正在同步...</span>
            )}
          </h3>
          <m.button
            onClick={() => fetchBillingData()}
            disabled={loading}
            className="px-3 py-1 bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition disabled:opacity-50 text-sm flex items-center gap-2"
            whileTap={{ scale: 0.95 }}
          >
            <FaSync className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
            刷新
          </m.button>
        </div>

        {customersLoading && cachedCustomers.length === 0 ? (
          <div className="space-y-3">
            {[...Array(3)].map((_, index) => (
              <div key={index} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg animate-pulse">
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-gray-300 rounded w-48"></div>
                  <div className="h-3 bg-gray-300 rounded w-32"></div>
                </div>
                <div className="flex gap-2">
                  <div className="h-6 bg-gray-300 rounded w-12"></div>
                  <div className="h-6 bg-gray-300 rounded w-12"></div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="overflow-x-auto">
            {cachedCustomers.length === 0 ? (
              <div className="text-center text-sm text-gray-600 py-6">暂无缓存数据</div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-2 px-3 font-medium text-gray-700">Customer ID</th>
                    <th className="text-left py-2 px-3 font-medium text-gray-700">可计费金额</th>
                    <th className="text-left py-2 px-3 font-medium text-gray-700">缓存时间</th>
                    <th className="text-left py-2 px-3 font-medium text-gray-700">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {cachedCustomers.map((customer, index) => (
                    <tr key={`customer-${customer.customerId}-${index}`} className={index % 2 === 0 ? 'bg-gray-50' : 'bg-white'}>
                      <td className="py-2 px-3 font-mono text-xs break-all">{customer.customerId}</td>
                      <td className="py-2 px-3 font-bold text-green-600">
                        ${formatAmount(customer.billableAmount)}
                        <div className="text-xs text-gray-500">原始: {customer.billableAmount}</div>
                      </td>
                      <td className="py-2 px-3 text-xs text-gray-600">
                        {customer.lastFetched ?
                          new Date(customer.lastFetched).toLocaleString() :
                          '未知时间'
                        }
                      </td>
                      <td className="py-2 px-3">
                        <div className="flex gap-1">
                          <m.button
                            onClick={() => fetchBillingData()}
                            className="px-2 py-1 bg-blue-500 text-white rounded text-xs hover:bg-blue-600 transition"
                            whileTap={{ scale: 0.95 }}
                          >
                            查看
                          </m.button>
                          <m.button
                            onClick={() => clearCache(customer.customerId)}
                            disabled={clearingCache}
                            className="px-2 py-1 bg-red-500 text-white rounded text-xs hover:bg-red-600 transition disabled:opacity-50"
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
                      <td colSpan={4} className="py-2 px-3 text-center text-sm text-blue-600">
                        正在同步更多数据...
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}
          </div>
        )}
      </m.div>

      {/* 使用说明 */}
      <m.div
        className="bg-blue-50 rounded-xl p-6 border border-blue-200"
        initial={ENTER_INITIAL}
        animate={ENTER_ANIMATE}
        transition={trans06}
      >
        <h3 className="text-lg font-semibold text-blue-800 mb-3">使用说明</h3>
        <ul className="text-sm text-blue-700 space-y-2">
          <li>• <strong>获取数据：</strong>点击"获取数据"按钮从 GitHub API 获取最新的账单数据</li>
          <li>• <strong>访问令牌：</strong>如果后端启用了首次访问验证（ENABLE_FIRST_VISIT_VERIFICATION），需要通过Turnstile验证获取访问令牌</li>
          <li>• <strong>Customer ID：</strong>系统自动使用后端配置的默认值</li>
          <li>• <strong>数据缓存：</strong>系统会自动缓存获取的数据，避免频繁调用 GitHub API</li>
          <li>• <strong>金额显示：</strong>billableAmount 会自动格式化为两位小数，同时显示原始值</li>
          <li>• <strong>缓存管理：</strong>可以清除特定客户的缓存或清除所有过期缓存</li>
        </ul>
      </m.div>
    </div>
  );
};

export default GitHubBillingDashboard;
