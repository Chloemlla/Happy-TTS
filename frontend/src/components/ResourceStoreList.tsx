import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link } from 'react-router-dom';
import { FaStore, FaKey, FaSearch, FaSync, FaInfoCircle, FaExclamationTriangle, FaCheckCircle, FaTag, FaDollarSign, FaEye, FaDownload, FaGift, FaUser, FaHistory, FaCalendarAlt } from 'react-icons/fa';
import { resourcesApi, Resource } from '../api/resources';
import { cdksApi, RedeemedResource } from '../api/cdks';
import { UnifiedLoadingSpinner } from './LoadingSpinner';
import { TurnstileWidget } from './TurnstileWidget';
import { useTurnstileConfig } from '../hooks/useTurnstileConfig';

export default function ResourceStoreList() {
  const [resources, setResources] = useState<Resource[]>([]);
  const [redeemedResources, setRedeemedResources] = useState<RedeemedResource[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [cdkCode, setCdkCode] = useState('');
  const [loading, setLoading] = useState(true);
  const [cdkLoading, setCdkLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<'store' | 'owned'>('store');
  const [redeemedLoading, setRedeemedLoading] = useState(false);
  const [showDuplicateDialog, setShowDuplicateDialog] = useState(false);
  const [duplicateResourceInfo, setDuplicateResourceInfo] = useState<{ title: string, id: string } | null>(null);
  const [pendingCDKCode, setPendingCDKCode] = useState('');
  const [redeemedCount, setRedeemedCount] = useState(0);
  
  // Turnstile 相关状态
  const { config: turnstileConfig, loading: turnstileConfigLoading } = useTurnstileConfig();
  const [turnstileToken, setTurnstileToken] = useState<string>('');
  const [turnstileVerified, setTurnstileVerified] = useState<boolean>(false);
  const [turnstileError, setTurnstileError] = useState<string>('');
  const [turnstileKey, setTurnstileKey] = useState<string>('');

  // 检查是否为管理员
  const isAdmin = useMemo(() => {
    const userRole = localStorage.getItem('userRole');
    return userRole === 'admin' || userRole === 'administrator';
  }, []);

  // Turnstile 回调函数
  const handleTurnstileVerify = (token: string) => {
    setTurnstileToken(token);
    setTurnstileVerified(true);
    setTurnstileError('');
    setTurnstileKey(token);
  };

  const handleTurnstileExpire = () => {
    setTurnstileToken('');
    setTurnstileVerified(false);
    setTurnstileError('');
    setTurnstileKey('');
  };

  const handleTurnstileError = () => {
    setTurnstileToken('');
    setTurnstileVerified(false);
    setTurnstileError('验证失败，请重试');
    setTurnstileKey('');
  };

  useEffect(() => {
    fetchResources();
    fetchCategories();
    // 初始化时获取已兑换资源数量
    fetchRedeemedResourcesCount();
  }, [selectedCategory]);

  useEffect(() => {
    if (activeTab === 'owned') {
      fetchRedeemedResources();
    }
  }, [activeTab]);

  const fetchResources = async () => {
    try {
      const response = await resourcesApi.getResources(1, selectedCategory);
      setResources(response.resources);
    } catch (error) {
      setError('获取资源列表失败');
      // 设置默认值，防止组件崩溃
      setResources([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchCategories = async () => {
    try {
      const response = await resourcesApi.getCategories();
      setCategories(response);
    } catch (error) {
      console.error('获取分类失败:', error);
      // 设置默认值，防止组件崩溃
      setCategories([]);
    }
  };

  const fetchRedeemedResources = async () => {
    setRedeemedLoading(true);
    try {
      const response = await cdksApi.getUserRedeemedResources();
      setRedeemedResources(response.resources);
      setRedeemedCount(response.resources.length);
    } catch (error) {
      setError('获取已兑换资源失败');
      setRedeemedResources([]);
      setRedeemedCount(0);
    } finally {
      setRedeemedLoading(false);
    }
  };

  const fetchRedeemedResourcesCount = async () => {
    try {
      const response = await cdksApi.getUserRedeemedResources();
      setRedeemedCount(response.resources.length);
    } catch (error) {
      setRedeemedCount(0);
    }
  };

  const handleRedeemCDK = async (forceRedeem = false) => {
    const codeToRedeem = forceRedeem ? pendingCDKCode : cdkCode;

    if (!codeToRedeem.trim()) {
      setError('请输入CDK兑换码');
      return;
    }

    // 检查非管理员用户的 Turnstile 验证
    if (!isAdmin && !!turnstileConfig.siteKey && (!turnstileVerified || !turnstileToken)) {
      setError('请先完成人机验证');
      return;
    }

    setCdkLoading(true);
    setError('');
    setSuccess('');

    try {
      // 生成或获取用户信息 - 使用加密安全的随机数生成
      const generateSecureId = () => {
        const array = new Uint32Array(2);
        crypto.getRandomValues(array);
        return array[0].toString(36) + array[1].toString(36);
      };
      
      const generateSecureNumber = () => {
        const array = new Uint32Array(1);
        crypto.getRandomValues(array);
        return array[0] % 10000; // 0-9999 范围内的安全随机数
      };

      const userInfo = {
        userId: `user_${Date.now()}_${generateSecureId()}`, // 使用加密安全的ID生成
        username: `用户${generateSecureNumber()}` // 使用加密安全的随机用户名
      };

      // 构建请求参数
      const requestParams: any = {
        code: codeToRedeem,
        ...userInfo,
        forceRedeem
      };

      // 如果不是管理员且Turnstile已启用，添加验证token
      if (!isAdmin && !!turnstileConfig.siteKey && turnstileToken) {
        requestParams.cfToken = turnstileToken;
        requestParams.userRole = localStorage.getItem('userRole') || 'user';
      }

      const result = await cdksApi.redeemCDK(requestParams);
      setSuccess(`兑换成功！获得资源：${result.resource.title}`);
      setCdkCode('');
      setPendingCDKCode('');
      setShowDuplicateDialog(false);
      
      // 重置 Turnstile 状态
      setTurnstileToken('');
      setTurnstileVerified(false);
      setTurnstileKey('');

      // 刷新已兑换资源列表和数量
      fetchRedeemedResourcesCount();
      if (activeTab === 'owned') {
        fetchRedeemedResources();
      }

      // 显示下载链接
      if (result.resource.downloadUrl) {
        setTimeout(() => {
          window.open(result.resource.downloadUrl, '_blank');
        }, 1000);
      }
    } catch (error: any) {
      if (error.response?.status === 409 && error.response?.data?.message === 'DUPLICATE_RESOURCE') {
        // 显示重复资源确认对话框
        setDuplicateResourceInfo({
          title: error.response.data.resourceTitle,
          id: error.response.data.resourceId
        });
        setPendingCDKCode(codeToRedeem);
        setShowDuplicateDialog(true);
      } else {
        setError('兑换失败：CDK无效或已使用');
      }
    } finally {
      setCdkLoading(false);
    }
  };

  const handleConfirmDuplicate = () => {
    handleRedeemCDK(true);
  };

  const handleCancelDuplicate = () => {
    setShowDuplicateDialog(false);
    setPendingCDKCode('');
    setDuplicateResourceInfo(null);
  };

  const handleRefresh = () => {
    setRefreshing(true);
    fetchResources().then(() => setRefreshing(false));
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <UnifiedLoadingSpinner size="lg" text="加载资源商店..." />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8 space-y-6">
        {/* 标题和说明 */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-gradient-to-r from-indigo-50 to-blue-50 rounded-xl p-6 border border-indigo-100"
        >
          <div className="flex items-center justify-between mb-4">
            <div className="text-center sm:text-left">
              <h1 className="text-3xl font-bold text-indigo-700 flex items-center justify-center sm:justify-start gap-2">
                <FaStore className="w-8 h-8" />
                资源商店
              </h1>
              <p className="mt-2 text-gray-600">探索和下载各种优质资源</p>
            </div>
            <motion.button
              onClick={handleRefresh}
              disabled={refreshing}
              className="px-3 py-2 bg-indigo-500 text-white rounded-lg hover:bg-indigo-600 transition disabled:opacity-50 text-sm font-medium flex items-center gap-2"
              whileTap={{ scale: 0.95 }}
            >
              <FaSync className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
              刷新
            </motion.button>
          </div>
          <div className="flex items-start gap-2 text-sm">
            <FaInfoCircle className="w-4 h-4 text-indigo-500 mt-0.5 flex-shrink-0" />
            <div>
              <p className="font-semibold text-indigo-700">使用说明：</p>
              <ul className="list-disc list-inside space-y-1 mt-1">
                <li>浏览各种分类的资源，找到你需要的</li>
                <li>使用CDK兑换码解锁资源下载</li>
                <li>点击查看详情了解更多信息</li>
                <li>支持按分类筛选资源</li>
              </ul>
            </div>
          </div>
        </motion.div>

        {/* CDK兑换区域 */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-xl shadow-sm border border-gray-200 p-6"
        >
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <FaGift className="w-5 h-5 text-green-500" />
            CDK兑换
          </h2>
          <div className="flex flex-col sm:flex-row gap-4">
            <input
              type="text"
              placeholder="请输入CDK兑换码"
              className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-all duration-200"
              value={cdkCode}
              onChange={(e) => setCdkCode(e.target.value)}
            />
            <motion.button
              onClick={() => handleRedeemCDK()}
              disabled={cdkLoading || (!isAdmin && !!turnstileConfig.siteKey && !turnstileVerified)}
              className="px-6 py-2 bg-gradient-to-r from-green-500 to-blue-600 text-white rounded-lg hover:from-green-600 hover:to-blue-700 disabled:opacity-50 transition-all duration-200 font-medium flex items-center justify-center gap-2"
              whileHover={!cdkLoading ? { scale: 1.02 } : {}}
              whileTap={!cdkLoading ? { scale: 0.98 } : {}}
            >
              {cdkLoading ? (
                <>
                  <FaSync className="animate-spin w-4 h-4" />
                  兑换中...
                </>
              ) : (
                <>
                  <FaKey className="w-4 h-4" />
                  兑换
                </>
              )}
            </motion.button>
          </div>
          
          {/* Turnstile 验证组件（非管理员用户） */}
          {!isAdmin && !turnstileConfigLoading && turnstileConfig.siteKey && typeof turnstileConfig.siteKey === 'string' && (
            <div className="mt-4">
              <div className="flex items-center gap-2 mb-2">
                {turnstileVerified ? (
                  <>
                    <FaCheckCircle className="w-4 h-4 text-green-500" />
                    <span className="text-sm text-green-600 font-medium">已完成</span>
                  </>
                ) : (
                  <>
                    <FaExclamationTriangle className="w-4 h-4 text-yellow-500" />
                    <span className="text-sm text-gray-600">请完成人机验证</span>
                  </>
                )}
              </div>
              <TurnstileWidget
                siteKey={turnstileConfig.siteKey}
                onVerify={handleTurnstileVerify}
                onExpire={handleTurnstileExpire}
                onError={handleTurnstileError}
                theme="light"
                size="normal"
              />
            </div>
          )}
          <AnimatePresence>
            {error && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="mt-2 text-red-600 text-sm bg-red-50 p-3 rounded-lg border border-red-200 flex items-center gap-2"
              >
                <FaExclamationTriangle className="w-4 h-4" />
                {error}
              </motion.div>
            )}
            {success && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="mt-2 text-green-600 text-sm bg-green-50 p-3 rounded-lg border border-green-200 flex items-center gap-2"
              >
                <FaCheckCircle className="w-4 h-4" />
                {success}
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

        {/* 标签页切换 */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-xl shadow-sm border border-gray-200 p-6"
        >
          <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between mb-4">
            <div className="flex gap-2">
              <motion.button
                onClick={() => setActiveTab('store')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 flex items-center gap-2 ${activeTab === 'store'
                    ? 'bg-indigo-600 text-white shadow-md'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                <FaStore className="w-4 h-4" />
                资源商店
              </motion.button>
              <motion.button
                onClick={() => setActiveTab('owned')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 flex items-center gap-2 ${activeTab === 'owned'
                    ? 'bg-green-600 text-white shadow-md'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                <FaUser className="w-4 h-4" />
                我的资源 ({redeemedCount})
              </motion.button>
            </div>
          </div>
        </motion.div>

        {/* 分类筛选 (仅在商店页面显示) */}
        {activeTab === 'store' && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white rounded-xl shadow-sm border border-gray-200 p-6"
          >
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <FaSearch className="w-5 h-5 text-indigo-500" />
              分类筛选
            </h3>
            <div className="flex flex-wrap gap-2">
              <motion.button
                onClick={() => setSelectedCategory('')}
                className={`px-4 py-2 rounded-full text-sm font-medium transition-all duration-200 ${selectedCategory === ''
                    ? 'bg-indigo-600 text-white shadow-md'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                全部
              </motion.button>
              {categories.map((category) => (
                <motion.button
                  key={category}
                  onClick={() => setSelectedCategory(category)}
                  className={`px-4 py-2 rounded-full text-sm font-medium transition-all duration-200 ${selectedCategory === category
                      ? 'bg-indigo-600 text-white shadow-md'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                >
                  {category}
                </motion.button>
              ))}
            </div>
          </motion.div>
        )}

        {/* 资源网格 */}
        {activeTab === 'store' ? (
          <>
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
            >
              {resources.map((resource, index) => (
                <motion.div
                  key={resource.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.1 }}
                  className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden hover:shadow-lg transition-all duration-200"
                  whileHover={{ scale: 1.02 }}
                >
                  <div className="relative">
                    <img
                      src={resource.imageUrl || '/placeholder.jpg'}
                      alt={resource.title}
                      className="w-full h-48 object-cover"
                    />
                    <div className="absolute top-2 right-2">
                      <span className="inline-flex items-center gap-1 px-2 py-1 bg-indigo-600 text-white text-xs font-medium rounded-full">
                        <FaTag className="w-3 h-3" />
                        {resource.category}
                      </span>
                    </div>
                  </div>
                  <div className="p-6">
                    <h3 className="text-lg font-semibold text-gray-900 mb-2 line-clamp-1">
                      {resource.title}
                    </h3>
                    <p className="text-gray-600 text-sm mb-4 line-clamp-2">
                      {resource.description}
                    </p>
                    <div className="flex items-center justify-between">
                      <div className="flex flex-col">
                        <div className="flex items-center gap-1">
                          <FaDollarSign className="w-4 h-4 text-green-500" />
                          <span className="text-lg font-bold text-green-600">
                            ¥{resource.price}
                          </span>
                        </div>
                        <span className="text-xs text-gray-500">
                          {resource.category}
                        </span>
                      </div>
                      <motion.div
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                      >
                        <Link
                          to={`/store/resources/${resource.id}`}
                          className="px-4 py-2 bg-gradient-to-r from-indigo-500 to-blue-600 text-white rounded-lg hover:from-indigo-600 hover:to-blue-700 text-sm font-medium transition-all duration-200 flex items-center gap-2"
                        >
                          <FaEye className="w-4 h-4" />
                          查看详情
                        </Link>
                      </motion.div>
                    </div>
                  </div>
                </motion.div>
              ))}
            </motion.div>

            {resources.length === 0 && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-center py-12 bg-white rounded-xl shadow-sm border border-gray-200"
              >
                <div className="flex flex-col items-center gap-4">
                  <FaStore className="text-4xl text-gray-300" />
                  <div>
                    <p className="text-lg font-medium text-gray-500">
                      {selectedCategory ? `暂无${selectedCategory}分类的资源` : '暂无资源'}
                    </p>
                    <p className="text-sm text-gray-400 mt-1">
                      {selectedCategory ? '尝试选择其他分类' : '请稍后再来查看'}
                    </p>
                  </div>
                </div>
              </motion.div>
            )}
          </>
        ) : (
          /* 我的资源页面 */
          <>
            {redeemedLoading ? (
              <div className="flex items-center justify-center py-12">
                <UnifiedLoadingSpinner size="lg" text="加载我的资源..." />
              </div>
            ) : (
              <>
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
                >
                  {redeemedResources.map((resource, index) => (
                    <motion.div
                      key={`redeemed-${resource.id}`}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.1 }}
                      className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden hover:shadow-lg transition-all duration-200"
                      whileHover={{ scale: 1.02 }}
                    >
                      <div className="relative">
                        <img
                          src={resource.imageUrl || '/placeholder.jpg'}
                          alt={resource.title}
                          className="w-full h-48 object-cover"
                        />
                        <div className="absolute top-2 right-2">
                          <span className="inline-flex items-center gap-1 px-2 py-1 bg-green-600 text-white text-xs font-medium rounded-full">
                            <FaCheckCircle className="w-3 h-3" />
                            已拥有
                          </span>
                        </div>
                        <div className="absolute top-2 left-2">
                          <span className="inline-flex items-center gap-1 px-2 py-1 bg-blue-600 text-white text-xs font-medium rounded-full">
                            <FaTag className="w-3 h-3" />
                            {resource.category}
                          </span>
                        </div>
                      </div>
                      <div className="p-6">
                        <h3 className="text-lg font-semibold text-gray-900 mb-2 line-clamp-1">
                          {resource.title}
                        </h3>
                        <p className="text-gray-600 text-sm mb-4 line-clamp-2">
                          {resource.description}
                        </p>
                        <div className="space-y-3">
                          <div className="space-y-2">
                            <div className="flex items-center justify-between text-sm">
                              <div className="flex items-center gap-1 text-gray-500">
                                <FaCalendarAlt className="w-4 h-4" />
                                兑换日期:
                              </div>
                              <span className="text-gray-700 font-medium">
                                {new Date(resource.redeemedAt).toLocaleDateString('zh-CN', {
                                  year: 'numeric',
                                  month: 'long',
                                  day: 'numeric'
                                })}
                              </span>
                            </div>
                            <div className="flex items-center justify-between text-sm">
                              <div className="flex items-center gap-1 text-gray-500">
                                <FaHistory className="w-4 h-4" />
                                兑换时间:
                              </div>
                              <span className="text-gray-700">
                                {new Date(resource.redeemedAt).toLocaleTimeString('zh-CN', {
                                  hour: '2-digit',
                                  minute: '2-digit',
                                  second: '2-digit'
                                })}
                              </span>
                            </div>
                            <div className="flex items-center justify-between text-sm">
                              <div className="flex items-center gap-1 text-gray-500">
                                <FaUser className="w-4 h-4" />
                                使用时长:
                              </div>
                              <span className="text-gray-700">
                                {(() => {
                                  const now = new Date();
                                  const redeemTime = new Date(resource.redeemedAt);
                                  const diffMs = now.getTime() - redeemTime.getTime();
                                  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
                                  const diffHours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
                                  const diffMinutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

                                  if (diffDays > 0) {
                                    return `${diffDays}天${diffHours}小时前`;
                                  } else if (diffHours > 0) {
                                    return `${diffHours}小时${diffMinutes}分钟前`;
                                  } else if (diffMinutes > 0) {
                                    return `${diffMinutes}分钟前`;
                                  } else {
                                    return '刚刚';
                                  }
                                })()}
                              </span>
                            </div>
                          </div>
                          <div className="flex items-center justify-between text-sm pt-2 border-t border-gray-100">
                            <div className="flex items-center gap-1 text-gray-500">
                              <FaKey className="w-4 h-4" />
                              CDK代码:
                            </div>
                            <span className="text-gray-700 font-mono text-xs bg-gray-50 px-2 py-1 rounded">
                              {resource.cdkCode}
                            </span>
                          </div>
                          <motion.div
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            className="pt-3"
                          >
                            <a
                              href={resource.downloadUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="w-full px-4 py-2 bg-gradient-to-r from-green-500 to-blue-600 text-white rounded-lg hover:from-green-600 hover:to-blue-700 text-sm font-medium transition-all duration-200 flex items-center justify-center gap-2"
                            >
                              <FaDownload className="w-4 h-4" />
                              下载资源
                            </a>
                          </motion.div>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </motion.div>

                {redeemedResources.length === 0 && (
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="text-center py-12 bg-white rounded-xl shadow-sm border border-gray-200"
                  >
                    <div className="flex flex-col items-center gap-4">
                      <FaHistory className="text-4xl text-gray-300" />
                      <div>
                        <p className="text-lg font-medium text-gray-500">
                          暂无已兑换的资源
                        </p>
                        <p className="text-sm text-gray-400 mt-1">
                          去商店页面使用CDK兑换资源吧！
                        </p>
                      </div>
                    </div>
                  </motion.div>
                )}
              </>
            )}
          </>
        )}
      </div>

      {/* 重复资源确认对话框 */}
      <AnimatePresence>
        {showDuplicateDialog && duplicateResourceInfo && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
            onClick={handleCancelDuplicate}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center gap-3 mb-4">
                <div className="flex-shrink-0">
                  <FaExclamationTriangle className="w-8 h-8 text-yellow-500" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">
                    重复资源提醒
                  </h3>
                  <p className="text-sm text-gray-500">
                    您已拥有此资源
                  </p>
                </div>
              </div>

              <div className="mb-6">
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                  <p className="text-gray-700 mb-2">
                    您已经拥有资源：
                    <span className="font-semibold text-gray-900">
                      {duplicateResourceInfo.title}
                    </span>
                  </p>
                  <p className="text-sm text-gray-600">
                    继续兑换将消耗一个CDK，但不会获得新的资源访问权限。
                  </p>
                </div>
              </div>

              <div className="flex gap-3">
                <motion.button
                  onClick={handleCancelDuplicate}
                  className="flex-1 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-all duration-200 font-medium"
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  取消兑换
                </motion.button>
                <motion.button
                  onClick={handleConfirmDuplicate}
                  className="flex-1 px-4 py-2 bg-gradient-to-r from-yellow-500 to-orange-600 text-white rounded-lg hover:from-yellow-600 hover:to-orange-700 transition-all duration-200 font-medium"
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  继续兑换
                </motion.button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
} 