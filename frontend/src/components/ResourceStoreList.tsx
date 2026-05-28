import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import {
  FaCalendarAlt,
  FaCheckCircle,
  FaDownload,
  FaExclamationTriangle,
  FaGift,
  FaHistory,
  FaInfoCircle,
  FaKey,
  FaSearch,
  FaStore,
  FaSync,
  FaTag,
  FaUser,
} from 'react-icons/fa';
import { cdksApi, type RedeemedResource } from '../api/cdks';
import { resourcesApi, type Resource } from '../api/resources';
import { cn } from '../utils/cn';
import { UnifiedLoadingSpinner } from './LoadingSpinner';
import {
  studioDarkPanelClassName,
  studioDisplayFont,
  studioFieldClassName,
  studioGhostButtonClassName,
  studioHeroCardClassName,
  studioMainSurfaceClassName,
  studioMetricToneClassName,
  studioModalCardClassName,
  studioModalOverlayClassName,
  studioPageClassName,
  studioPageFont,
  studioPanelClassName,
  studioPillClassName,
  studioPrimaryButtonClassName,
} from './studioTheme';
import { TurnstileWidget } from './TurnstileWidget';
import { useTurnstileConfig } from '../hooks/useTurnstileConfig';

function formatRedeemedDate(value: Date | string): string {
  return new Date(value).toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function formatRedeemedTime(value: Date | string): string {
  return new Date(value).toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatRelativeAge(value: Date | string): string {
  const now = Date.now();
  const target = new Date(value).getTime();
  const diffMinutes = Math.max(0, Math.floor((now - target) / 60000));
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffDays > 0) {
    return `${diffDays} 天 ${diffHours % 24} 小时`;
  }
  if (diffHours > 0) {
    return `${diffHours} 小时 ${diffMinutes % 60} 分钟`;
  }
  if (diffMinutes > 0) {
    return `${diffMinutes} 分钟`;
  }
  return '刚刚';
}

export default function ResourceStoreList() {
  const [resources, setResources] = useState<Resource[]>([]);
  const [redeemedResources, setRedeemedResources] = useState<RedeemedResource[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [selectedCategory, setSelectedCategory] = useState('');
  const [cdkCode, setCdkCode] = useState('');
  const [loading, setLoading] = useState(true);
  const [cdkLoading, setCdkLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<'store' | 'owned'>('store');
  const [redeemedLoading, setRedeemedLoading] = useState(false);
  const [showDuplicateDialog, setShowDuplicateDialog] = useState(false);
  const [duplicateResourceInfo, setDuplicateResourceInfo] = useState<{ title: string; id: string } | null>(null);
  const [pendingCDKCode, setPendingCDKCode] = useState('');
  const [redeemedCount, setRedeemedCount] = useState(0);
  const { config: turnstileConfig, loading: turnstileConfigLoading } = useTurnstileConfig();
  const [turnstileToken, setTurnstileToken] = useState('');
  const [turnstileVerified, setTurnstileVerified] = useState(false);
  const [turnstileError, setTurnstileError] = useState('');
  const [turnstileKey, setTurnstileKey] = useState('turnstile-initial');

  const isAdmin = useMemo(() => {
    const userRole = localStorage.getItem('userRole');
    return userRole === 'admin' || userRole === 'administrator';
  }, []);

  const fetchResources = async () => {
    try {
      const response = await resourcesApi.getResources(1, selectedCategory);
      setResources(response.resources);
    } catch {
      setError('获取资源列表失败');
      setResources([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchCategories = async () => {
    try {
      const response = await resourcesApi.getCategories();
      setCategories(response);
    } catch {
      setCategories([]);
    }
  };

  const fetchRedeemedResources = async () => {
    setRedeemedLoading(true);
    try {
      const response = await cdksApi.getUserRedeemedResources();
      setRedeemedResources(response.resources);
      setRedeemedCount(response.resources.length);
    } catch {
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
    } catch {
      setRedeemedCount(0);
    }
  };

  useEffect(() => {
    fetchCategories();
    fetchRedeemedResourcesCount();
  }, []);

  useEffect(() => {
    fetchResources();
  }, [selectedCategory]);

  useEffect(() => {
    if (activeTab === 'owned') {
      fetchRedeemedResources();
    }
  }, [activeTab]);

  const resetTurnstile = (message = '') => {
    setTurnstileToken('');
    setTurnstileVerified(false);
    setTurnstileError(message);
    setTurnstileKey(`turnstile-${Date.now()}`);
  };

  const handleRedeemCDK = async (forceRedeem = false) => {
    const codeToRedeem = forceRedeem ? pendingCDKCode : cdkCode;

    if (!codeToRedeem.trim()) {
      setError('请输入 CDK 兑换码');
      return;
    }

    if (!isAdmin && !!turnstileConfig.siteKey && (!turnstileVerified || !turnstileToken)) {
      setError('请先完成人机验证');
      return;
    }

    setCdkLoading(true);
    setError('');
    setSuccess('');

    try {
      const generateSecureId = () => {
        const array = new Uint32Array(2);
        crypto.getRandomValues(array);
        return array[0].toString(36) + array[1].toString(36);
      };
      const generateSecureNumber = () => {
        const array = new Uint32Array(1);
        crypto.getRandomValues(array);
        return array[0] % 10000;
      };

      const requestParams: any = {
        code: codeToRedeem,
        userId: `user_${Date.now()}_${generateSecureId()}`,
        username: `用户${generateSecureNumber()}`,
        forceRedeem,
      };

      if (!isAdmin && !!turnstileConfig.siteKey && turnstileToken) {
        requestParams.cfToken = turnstileToken;
        requestParams.userRole = localStorage.getItem('userRole') || 'user';
      }

      const result = await cdksApi.redeemCDK(requestParams);
      setSuccess(`兑换成功：${result.resource.title}`);
      setCdkCode('');
      setPendingCDKCode('');
      setShowDuplicateDialog(false);
      resetTurnstile('');
      fetchRedeemedResourcesCount();
      if (activeTab === 'owned') {
        fetchRedeemedResources();
      }
      if (result.resource.downloadUrl) {
        window.setTimeout(() => {
          window.open(result.resource.downloadUrl, '_blank');
        }, 800);
      }
    } catch (err: any) {
      if (err.response?.status === 409 && err.response?.data?.message === 'DUPLICATE_RESOURCE') {
        setDuplicateResourceInfo({
          title: err.response.data.resourceTitle,
          id: err.response.data.resourceId,
        });
        setPendingCDKCode(codeToRedeem);
        setShowDuplicateDialog(true);
      } else {
        setError('兑换失败，CDK 无效或已经使用');
      }
    } finally {
      setCdkLoading(false);
    }
  };

  const handleRefresh = () => {
    setRefreshing(true);
    fetchResources().finally(() => setRefreshing(false));
    fetchRedeemedResourcesCount();
  };

  const statusCards = [
    { label: 'Catalog', value: `${resources.length} 个在架资源`, tone: 'sky' as const },
    { label: 'Owned', value: `${redeemedCount} 个已解锁`, tone: 'emerald' as const },
    {
      label: 'Security',
      value: isAdmin
        ? '管理员免验证'
        : turnstileConfig.siteKey
          ? turnstileVerified ? 'Turnstile 已通过' : '等待 Turnstile'
          : '未启用验证',
      tone: 'violet' as const,
    },
  ];

  const renderStoreCard = (resource: Resource, index: number) => (
    <motion.article
      key={resource.id}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04 }}
      className="overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-sm transition hover:-translate-y-1 hover:shadow-[0_18px_50px_rgba(32,48,90,0.12)]"
    >
      <div className="relative h-48 overflow-hidden bg-slate-100">
        <img src={resource.imageUrl || '/placeholder.jpg'} alt={resource.title} className="h-full w-full object-cover" />
        <span className="absolute left-3 top-3 rounded-full bg-white/90 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-700">
          {resource.category}
        </span>
      </div>
      <div className="space-y-4 p-5">
        <div>
          <h3 className="line-clamp-1 text-lg font-semibold text-slate-900">{resource.title}</h3>
          <p className="mt-2 line-clamp-2 text-sm leading-7 text-slate-500">{resource.description}</p>
        </div>
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-[10px] uppercase tracking-[0.24em] text-slate-400">Price</div>
            <div className="mt-1 text-xl font-semibold text-slate-900">￥{resource.price}</div>
          </div>
          <Link to={`/store/resources/${resource.id}`} className={cn(studioPrimaryButtonClassName, 'px-4 py-2 text-xs sm:text-xs')}>
            查看详情
          </Link>
        </div>
      </div>
    </motion.article>
  );

  const renderOwnedCard = (resource: RedeemedResource, index: number) => (
    <motion.article
      key={`owned-${resource.id}`}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04 }}
      className="overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-sm transition hover:-translate-y-1 hover:shadow-[0_18px_50px_rgba(32,48,90,0.12)]"
    >
      <div className="relative h-48 overflow-hidden bg-slate-100">
        <img src={resource.imageUrl || '/placeholder.jpg'} alt={resource.title} className="h-full w-full object-cover" />
        <span className="absolute left-3 top-3 rounded-full bg-white/90 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-700">
          {resource.category}
        </span>
        <span className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full bg-emerald-500 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-white">
          <FaCheckCircle />
          Owned
        </span>
      </div>
      <div className="space-y-4 p-5">
        <div>
          <h3 className="line-clamp-1 text-lg font-semibold text-slate-900">{resource.title}</h3>
          <p className="mt-2 line-clamp-2 text-sm leading-7 text-slate-500">{resource.description}</p>
        </div>
        <div className="grid gap-2 rounded-[20px] border border-slate-100 bg-slate-50 px-4 py-4 text-sm text-slate-600">
          <div className="flex items-center justify-between gap-3"><span className="inline-flex items-center gap-2"><FaCalendarAlt />兑换日期</span><span>{formatRedeemedDate(resource.redeemedAt)}</span></div>
          <div className="flex items-center justify-between gap-3"><span className="inline-flex items-center gap-2"><FaHistory />兑换时间</span><span>{formatRedeemedTime(resource.redeemedAt)}</span></div>
          <div className="flex items-center justify-between gap-3"><span className="inline-flex items-center gap-2"><FaUser />持有时长</span><span>{formatRelativeAge(resource.redeemedAt)}</span></div>
          <div className="flex items-center justify-between gap-3"><span className="inline-flex items-center gap-2"><FaKey />CDK</span><span className="rounded-full bg-white px-3 py-1 font-mono text-xs text-slate-700">{resource.cdkCode}</span></div>
        </div>
        <a href={resource.downloadUrl} target="_blank" rel="noopener noreferrer" className={cn(studioPrimaryButtonClassName, 'w-full px-4 py-2 text-xs sm:text-xs')}>
          <FaDownload />
          下载资源
        </a>
      </div>
    </motion.article>
  );

  if (loading) {
    return (
      <div className={studioPageClassName} style={{ fontFamily: studioPageFont }}>
        <div className="flex min-h-[70vh] items-center justify-center">
          <UnifiedLoadingSpinner size="lg" text="加载资源商店..." />
        </div>
      </div>
    );
  }

  return (
    <div className={studioPageClassName} style={{ fontFamily: studioPageFont }}>
      <div className="mx-auto max-w-7xl min-w-0">
        <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45 }} className={cn('mb-5 sm:mb-8', studioHeroCardClassName)}>
          <div className="flex min-w-0 flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl min-w-0">
              <div className="mb-3 inline-flex max-w-full items-center gap-2 rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-sky-700 sm:px-3 sm:text-xs sm:tracking-[0.18em]">
                <FaStore />
                Resource Store Studio
              </div>
              <h1 className="text-[2rem] font-semibold leading-[1.05] text-slate-900 sm:text-5xl sm:leading-tight" style={{ fontFamily: studioDisplayFont }}>
                资源商店
              </h1>
            </div>
            <div className="w-full lg:w-auto">
              <div className="grid gap-2 sm:grid-cols-3 sm:gap-3">
                {statusCards.map((item) => (
                  <div key={item.label} className={cn('min-w-0 rounded-[22px] border px-3 py-2.5 sm:rounded-2xl sm:px-4 sm:py-3', studioMetricToneClassName(item.tone))}>
                    <div className="text-[10px] uppercase tracking-[0.24em] text-slate-400">{item.label}</div>
                    <div className="mt-2 break-words text-sm font-semibold text-slate-800">{item.value}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </motion.div>

        <div className="grid gap-4 sm:gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
          <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.05 }} className={studioMainSurfaceClassName}>
            <div className="rounded-[24px] border border-slate-200 bg-white p-3 sm:rounded-[28px] sm:p-5">
              <div className="mb-4 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => setActiveTab('store')} className={studioPillClassName(activeTab === 'store', 'blue')}>商店资源</button>
                  <button type="button" onClick={() => setActiveTab('owned')} className={studioPillClassName(activeTab === 'owned', 'green')}>我的资源 {redeemedCount > 0 ? `(${redeemedCount})` : ''}</button>
                </div>
                <button type="button" onClick={handleRefresh} disabled={refreshing} className={studioGhostButtonClassName}>
                  <FaSync className={refreshing ? 'animate-spin' : undefined} />
                  刷新内容
                </button>
              </div>

              {activeTab === 'store' ? (
                <>
                  <div className="mb-5 flex flex-wrap gap-2">
                    <button type="button" onClick={() => setSelectedCategory('')} className={studioPillClassName(selectedCategory === '', 'dark')}>全部分类</button>
                    {categories.map((category) => (
                      <button key={category} type="button" onClick={() => setSelectedCategory(category)} className={studioPillClassName(selectedCategory === category, 'blue')}>
                        {category}
                      </button>
                    ))}
                  </div>
                  {resources.length > 0 ? (
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">{resources.map(renderStoreCard)}</div>
                  ) : (
                    <div className="rounded-[24px] border border-dashed border-slate-200 bg-[#f8faff] px-6 py-14 text-center text-slate-400">
                      {selectedCategory ? `当前分类 ${selectedCategory} 暂无资源。` : '当前没有可展示的资源。'}
                    </div>
                  )}
                </>
              ) : redeemedLoading ? (
                <div className="flex min-h-[380px] items-center justify-center"><UnifiedLoadingSpinner size="lg" text="加载我的资源..." /></div>
              ) : redeemedResources.length > 0 ? (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">{redeemedResources.map(renderOwnedCard)}</div>
              ) : (
                <div className="rounded-[24px] border border-dashed border-slate-200 bg-[#f8faff] px-6 py-14 text-center text-slate-400">
                  还没有已兑换资源，先在右侧输入 CDK 试试看。
                </div>
              )}
            </div>
          </motion.div>

          <div className="min-w-0 space-y-4 sm:space-y-6">
            <motion.section initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.12 }} className={studioPanelClassName}>
              <div className="mb-4 flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-900 text-white"><FaGift /></div>
                <div>
                  <div className="text-lg font-semibold text-slate-900">CDK 兑换</div>
                  <div className="text-sm text-slate-500">右侧保留快速输入与验证状态</div>
                </div>
              </div>
              <div className="space-y-3">
                <input type="text" value={cdkCode} onChange={(event) => setCdkCode(event.target.value)} placeholder="输入 CDK 兑换码" className={cn(studioFieldClassName, 'sm:rounded-[18px]')} />
                <button type="button" onClick={() => handleRedeemCDK()} disabled={cdkLoading || (!isAdmin && !!turnstileConfig.siteKey && !turnstileVerified)} className={cn(studioPrimaryButtonClassName, 'w-full')}>
                  {cdkLoading ? <FaSync className="animate-spin" /> : <FaKey />}
                  {cdkLoading ? '正在兑换...' : '立即兑换'}
                </button>
              </div>

              {!isAdmin && !turnstileConfigLoading && turnstileConfig.siteKey ? (
                <div className="mt-4 rounded-[22px] border border-slate-200 bg-slate-50 p-4">
                  <div className="mb-3 flex items-center gap-2 text-sm text-slate-600">
                    {turnstileVerified ? <FaCheckCircle className="text-emerald-500" /> : <FaExclamationTriangle className="text-amber-500" />}
                    {turnstileVerified ? '验证已通过' : '请先完成人机验证'}
                  </div>
                  <TurnstileWidget
                    key={turnstileKey}
                    siteKey={turnstileConfig.siteKey}
                    onVerify={(token) => {
                      setTurnstileToken(token);
                      setTurnstileVerified(true);
                      setTurnstileError('');
                      setTurnstileKey(token);
                    }}
                    onExpire={() => resetTurnstile('验证已过期，请重新完成')}
                    onError={() => resetTurnstile('验证失败，请重试')}
                    theme="light"
                    size="normal"
                  />
                </div>
              ) : null}

              <AnimatePresence>
                {error ? <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="mt-4 rounded-[20px] border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</motion.div> : null}
              </AnimatePresence>
              <AnimatePresence>
                {success ? <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="mt-4 rounded-[20px] border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{success}</motion.div> : null}
              </AnimatePresence>
              <AnimatePresence>
                {turnstileError ? <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="mt-4 rounded-[20px] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">{turnstileError}</motion.div> : null}
              </AnimatePresence>
            </motion.section>

            <motion.section initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.18 }} className={studioPanelClassName}>
              <div className="mb-4 flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-900 text-white"><FaInfoCircle /></div>
                <div>
                  <div className="text-lg font-semibold text-slate-900">当前摘要</div>
                  <div className="text-sm text-slate-500">快速确认本页上下文</div>
                </div>
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between rounded-[20px] border border-slate-100 px-3 py-3 text-sm"><span className="text-slate-500">当前视图</span><span className="font-semibold text-slate-900">{activeTab === 'store' ? '商店资源' : '我的资源'}</span></div>
                <div className="flex items-center justify-between rounded-[20px] border border-slate-100 px-3 py-3 text-sm"><span className="text-slate-500">选中分类</span><span className="font-semibold text-slate-900">{selectedCategory || '全部'}</span></div>
                <div className="flex items-center justify-between rounded-[20px] border border-slate-100 px-3 py-3 text-sm"><span className="text-slate-500">分类数量</span><span className="font-semibold text-slate-900">{categories.length}</span></div>
                <div className="flex items-center justify-between rounded-[20px] border border-slate-100 px-3 py-3 text-sm"><span className="text-slate-500">验证策略</span><span className="font-semibold text-slate-900">{isAdmin ? 'Admin bypass' : turnstileConfig.siteKey ? 'Turnstile enabled' : 'Disabled'}</span></div>
              </div>
            </motion.section>

            <motion.section initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.24 }} className={studioDarkPanelClassName}>
              <div className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Usage Flow</div>
              <div className="space-y-2">
                {[
                  '先浏览分类和资源卡片，再决定是否前往详情页。',
                  '已兑换资源会自动进入“我的资源”，并展示兑换时间与下载入口。',
                  '当兑换到已有资源时，系统会二次确认，避免误耗 CDK。',
                ].map((item) => (
                  <div key={item} className="rounded-[20px] border border-white/10 bg-white/5 px-3.5 py-3 text-left text-[13px] text-slate-200 sm:rounded-2xl sm:px-4 sm:text-sm">
                    {item}
                  </div>
                ))}
              </div>
            </motion.section>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {showDuplicateDialog && duplicateResourceInfo ? (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className={studioModalOverlayClassName} onClick={() => { setShowDuplicateDialog(false); setPendingCDKCode(''); setDuplicateResourceInfo(null); }}>
            <motion.div initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 20 }} className={cn(studioModalCardClassName, 'max-w-md')} onClick={(event) => event.stopPropagation()}>
              <div className="flex items-start gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-100 text-amber-600"><FaExclamationTriangle /></div>
                <div>
                  <h3 className="text-xl font-semibold text-slate-900">重复资源提醒</h3>
                  <p className="mt-2 text-sm leading-7 text-slate-500">你已经拥有资源“{duplicateResourceInfo.title}”。继续兑换会消耗一个 CDK，但不会新增访问权限。</p>
                </div>
              </div>
              <div className="mt-6 flex flex-col gap-2 sm:flex-row">
                <button type="button" onClick={() => { setShowDuplicateDialog(false); setPendingCDKCode(''); setDuplicateResourceInfo(null); }} className={cn(studioGhostButtonClassName, 'w-full sm:w-auto')}>
                  取消兑换
                </button>
                <button type="button" onClick={() => handleRedeemCDK(true)} className={cn(studioPrimaryButtonClassName, 'w-full sm:w-auto bg-amber-500 hover:bg-amber-600 shadow-amber-500/20')}>
                  继续兑换
                </button>
              </div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
