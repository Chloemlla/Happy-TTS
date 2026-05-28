import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FaSearch,
  FaExclamationTriangle,
  FaShieldAlt,
  FaUserSecret,
  FaInfoCircle,
  FaPhone,
  FaEnvelope,
  FaSpinner,
  FaEye,
  FaTimes,
  FaUser,
  FaBullhorn,
  FaFilter,
  FaMapMarkerAlt,
  FaDollarSign,
  FaCalendarAlt,
} from 'react-icons/fa';
import { FBIWanted, FBIStatistics } from '../types/fbi';
import { fbiAPI } from '../api/fbi';
import { imageCacheService } from '../utils/imageCache';
import {
  InfoBadge,
  InfoMetricCard,
  InfoPanel,
  InfoPrimaryButton,
  InfoQueryHero,
  InfoQueryShell,
  InfoSectionTitle,
} from './InfoQueryScaffold';

const PAGE_SIZE = 12;

const CachedImage: React.FC<{ src?: string; alt?: string; className?: string; imageId?: string }> = React.memo(({
  src,
  alt = '通缉人员照片',
  className = '',
  imageId,
}) => {
  const [imageSrc, setImageSrc] = useState('');
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    let mounted = true;
    let objectUrlToRevoke: string | null = null;

    const loadImage = async () => {
      if (!src) {
        setLoading(false);
        return;
      }

      if (/^https?:\/\//.test(src)) {
        setImageSrc(src);
        setLoading(false);
        return;
      }

      if (imageId) {
        const cached = await imageCacheService.get(imageId, src);
        if (cached && mounted) {
          setImageSrc(cached);
          setLoading(false);
          return;
        }
      }

      try {
        abortControllerRef.current = new AbortController();
        const response = await fetch(src, { signal: abortControllerRef.current.signal });
        if (!response.ok) {
          throw new Error('image response failed');
        }

        const blob = await response.blob();
        const objectUrl = URL.createObjectURL(blob);
        objectUrlToRevoke = objectUrl;

        if (mounted) {
          setImageSrc(objectUrl);
          setLoading(false);
          if (imageId) {
            imageCacheService.set(imageId, src, blob);
          }
        }
      } catch (_) {
        if (mounted && !abortControllerRef.current?.signal.aborted) {
          setError(true);
          setLoading(false);
        }
      }
    };

    loadImage();

    return () => {
      mounted = false;
      abortControllerRef.current?.abort();
      if (objectUrlToRevoke) {
        URL.revokeObjectURL(objectUrlToRevoke);
      }
    };
  }, [src, imageId]);

  if (loading) {
    return (
      <div className={`flex items-center justify-center bg-slate-100 ${className}`}>
        <FaSpinner className="animate-spin text-slate-400" />
      </div>
    );
  }

  if (error || !imageSrc) {
    return (
      <div className={`flex items-center justify-center bg-slate-100 ${className}`}>
        <FaUser className="text-slate-400" />
      </div>
    );
  }

  return <img src={imageSrc} alt={alt} className={className} onError={() => setError(true)} />;
});

const getDangerLevelText = (level: string) => {
  switch (level) {
    case 'LOW': return '低危险';
    case 'MEDIUM': return '中等危险';
    case 'HIGH': return '高危险';
    case 'EXTREME': return '极度危险';
    default: return '未知';
  }
};

const getDangerLevelClass = (level: string) => {
  switch (level) {
    case 'LOW': return 'border-emerald-200 bg-emerald-50 text-emerald-700';
    case 'MEDIUM': return 'border-amber-200 bg-amber-50 text-amber-700';
    case 'HIGH': return 'border-orange-200 bg-orange-50 text-orange-700';
    case 'EXTREME': return 'border-rose-200 bg-rose-50 text-rose-700';
    default: return 'border-slate-200 bg-slate-100 text-slate-600';
  }
};

const FBIWantedPublic: React.FC = () => {
  const [wantedList, setWantedList] = useState<FBIWanted[]>([]);
  const [selectedWanted, setSelectedWanted] = useState<FBIWanted | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [dangerFilter, setDangerFilter] = useState('ALL');
  const [statistics, setStatistics] = useState<FBIStatistics | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [showDisclaimer, setShowDisclaimer] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);

  const fetchWantedList = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const response = await fbiAPI.getPublicList({
        page: currentPage,
        limit: PAGE_SIZE,
        status: 'ACTIVE',
        ...(dangerFilter !== 'ALL' && { dangerLevel: dangerFilter }),
        ...(searchTerm && { search: searchTerm }),
      });

      setWantedList(response.data);
      setTotalPages(response.pagination?.pages || 1);
    } catch (fetchError) {
      console.error('获取通缉犯列表失败:', fetchError);
      setError('获取通缉信息失败，请稍后重试。');
    } finally {
      setLoading(false);
    }
  }, [currentPage, dangerFilter, searchTerm]);

  const fetchStatistics = useCallback(async () => {
    try {
      const response = await fbiAPI.getPublicStatistics();
      setStatistics(response.data);
    } catch (fetchError) {
      console.error('获取统计信息失败:', fetchError);
    }
  }, []);

  useEffect(() => {
    setCurrentPage(1);
  }, [dangerFilter, searchTerm]);

  useEffect(() => {
    fetchWantedList();
    fetchStatistics();
  }, [fetchWantedList, fetchStatistics]);

  useEffect(() => {
    const disclaimerKey = 'fbi_wanted_disclaimer_closed';
    const disclaimerClosedPermanently = localStorage.getItem(`${disclaimerKey}_forever`);
    const disclaimerClosedToday = localStorage.getItem(`${disclaimerKey}_today`);
    const today = new Date().toDateString();

    if (!disclaimerClosedPermanently && disclaimerClosedToday !== today) {
      const timer = window.setTimeout(() => setShowDisclaimer(true), 1000);
      return () => window.clearTimeout(timer);
    }
  }, []);

  const handleCloseDisclaimerToday = () => {
    localStorage.setItem('fbi_wanted_disclaimer_closed_today', new Date().toDateString());
    setShowDisclaimer(false);
  };

  const handleCloseDisclaimerForever = () => {
    localStorage.setItem('fbi_wanted_disclaimer_closed_forever', 'true');
    setShowDisclaimer(false);
  };

  const openWantedDetail = (wanted: FBIWanted) => {
    setSelectedWanted(wanted);
    setShowDetailModal(true);
  };

  return (
    <InfoQueryShell>
      <div className="space-y-6">
        <InfoQueryHero
          eyebrow="Public Intelligence Query"
          title="FBI 通缉信息公示"
          description="集中展示公开通缉信息、危险等级、悬赏与举报入口。页面仅用于信息展示，发现相关线索请联系执法部门。"
          icon={FaUserSecret}
          tone="sky"
          meta={(
            <>
              <InfoBadge tone="sky">公开资料</InfoBadge>
              <InfoBadge tone="rose">请勿私自接触</InfoBadge>
              <InfoBadge tone="slate">分页查询</InfoBadge>
            </>
          )}
        />

        {statistics && (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            <InfoMetricCard label="在逃通缉" value={statistics.active} detail="当前公开在逃记录" icon={FaExclamationTriangle} tone="rose" />
            <InfoMetricCard label="已抓获" value={statistics.captured} detail="历史公开结案记录" icon={FaShieldAlt} tone="emerald" />
            <InfoMetricCard label="极度危险" value={statistics.dangerLevels.EXTREME || 0} detail="高优先级安全提醒" icon={FaBullhorn} tone="amber" />
            <InfoMetricCard label="总记录" value={statistics.total} detail="公开数据总量" icon={FaInfoCircle} tone="sky" />
          </div>
        )}

        <InfoPanel>
          <InfoSectionTitle
            title="检索与筛选"
            description="按姓名、编号或罪名进行检索，并使用危险等级缩小范围。"
            icon={FaFilter}
            tone="sky"
          />
          <div className="flex flex-col gap-3 lg:flex-row">
            <label className="relative flex-1">
              <span className="sr-only">搜索通缉信息</span>
              <FaSearch className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="搜索姓名、FBI 编号或罪名..."
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                className="h-12 w-full rounded-2xl border border-slate-200 bg-white/80 pl-11 pr-4 text-sm text-slate-800 outline-none transition focus:border-sky-300 focus:ring-4 focus:ring-sky-100"
              />
            </label>

            <label className="relative lg:w-60">
              <span className="sr-only">危险等级</span>
              <select
                value={dangerFilter}
                onChange={(event) => setDangerFilter(event.target.value)}
                className="h-12 w-full rounded-2xl border border-slate-200 bg-white/80 px-4 text-sm font-medium text-slate-700 outline-none transition focus:border-sky-300 focus:ring-4 focus:ring-sky-100"
              >
                <option value="ALL">所有危险等级</option>
                <option value="EXTREME">极度危险</option>
                <option value="HIGH">高危险</option>
                <option value="MEDIUM">中等危险</option>
                <option value="LOW">低危险</option>
              </select>
            </label>
          </div>
        </InfoPanel>

        <InfoPanel>
          <InfoSectionTitle
            title="通缉列表"
            description={`第 ${currentPage} 页，共 ${totalPages} 页`}
            icon={FaUserSecret}
            tone="sky"
          />

          {error && (
            <div className="mb-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
              {error}
            </div>
          )}

          {loading ? (
            <div className="flex min-h-[320px] items-center justify-center text-slate-500">
              <FaSpinner className="mr-3 animate-spin text-2xl text-sky-600" />
              正在加载通缉信息...
            </div>
          ) : wantedList.length === 0 ? (
            <div className="flex min-h-[260px] flex-col items-center justify-center text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-[24px] bg-slate-100 text-slate-500">
                <FaSearch />
              </div>
              <h3 className="mt-4 text-lg font-semibold text-slate-900">没有匹配记录</h3>
              <p className="mt-2 text-sm text-slate-500">请调整搜索关键词或危险等级筛选条件。</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
              {wantedList.map((wanted) => (
                <motion.article
                  key={wanted._id}
                  className="group overflow-hidden rounded-[26px] border border-slate-200/80 bg-white shadow-[0_12px_40px_rgba(15,23,42,0.06)] transition hover:-translate-y-1 hover:shadow-[0_18px_60px_rgba(15,23,42,0.1)]"
                  whileHover={{ scale: 1.01 }}
                >
                  <button
                    type="button"
                    onClick={() => openWantedDetail(wanted)}
                    className="block w-full text-left"
                  >
                    <div className="relative h-52 overflow-hidden bg-slate-100">
                      <CachedImage src={wanted.photoUrl} alt={wanted.name} imageId={wanted._id} className="h-full w-full object-cover transition duration-500 group-hover:scale-105" />
                      <span className={`absolute right-3 top-3 rounded-full border px-2.5 py-1 text-xs font-semibold shadow-sm ${getDangerLevelClass(wanted.dangerLevel)}`}>
                        {getDangerLevelText(wanted.dangerLevel)}
                      </span>
                    </div>
                    <div className="p-4">
                      <h3 className="line-clamp-1 text-lg font-semibold text-slate-950">{wanted.name}</h3>
                      <p className="mt-1 text-xs font-medium uppercase tracking-[0.16em] text-slate-400">FBI {wanted.fbiNumber}</p>
                      <div className="mt-4 grid grid-cols-2 gap-2 text-sm text-slate-600">
                        <span>年龄 {wanted.age} 岁</span>
                        <span>身高 {wanted.height}</span>
                        <span>体重 {wanted.weight}</span>
                        <span className="truncate">国籍 {wanted.nationality}</span>
                      </div>
                      <div className="mt-4 flex flex-wrap gap-1.5">
                        {wanted.charges.slice(0, 2).map((charge) => (
                          <span key={charge} className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-600">
                            {charge}
                          </span>
                        ))}
                        {wanted.charges.length > 2 && (
                          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-600">
                            +{wanted.charges.length - 2}
                          </span>
                        )}
                      </div>
                      <div className="mt-5 flex items-center justify-between border-t border-slate-100 pt-4">
                        <span className="text-sm font-semibold text-emerald-700">${wanted.reward.toLocaleString()}</span>
                        <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-sky-700">
                          <FaEye /> 详情
                        </span>
                      </div>
                    </div>
                  </button>
                </motion.article>
              ))}
            </div>
          )}

          {totalPages > 1 && (
            <div className="mt-6 flex flex-col gap-3 border-t border-slate-100 pt-5 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-sm text-slate-500">第 {currentPage} 页，共 {totalPages} 页</div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                  disabled={currentPage === 1}
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  上一页
                </button>
                <button
                  type="button"
                  onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
                  disabled={currentPage === totalPages}
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  下一页
                </button>
              </div>
            </div>
          )}
        </InfoPanel>

        <InfoPanel>
          <InfoSectionTitle
            title="举报渠道"
            description="发现线索时请优先联系当地执法部门，不要靠近或尝试自行处置。"
            icon={FaPhone}
            tone="rose"
          />
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            {[
              { title: '紧急报警', value: '110', icon: FaPhone, tone: 'rose' as const },
              { title: 'FBI 热线', value: '1-800-CALL-FBI', icon: FaPhone, tone: 'sky' as const },
              { title: '在线举报', value: 'tips.fbi.gov', icon: FaEnvelope, tone: 'emerald' as const },
            ].map((item) => (
              <InfoMetricCard key={item.title} label={item.title} value={item.value} icon={item.icon} tone={item.tone} />
            ))}
          </div>
        </InfoPanel>
      </div>

      <AnimatePresence>
        {showDetailModal && selectedWanted && (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setShowDetailModal(false)}
          >
            <motion.div
              className="max-h-[90vh] w-full max-w-5xl overflow-y-auto rounded-[32px] border border-white/70 bg-white/95 shadow-[0_32px_100px_rgba(15,23,42,0.22)] backdrop-blur-xl"
              initial={{ scale: 0.96, opacity: 0, y: 16 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.96, opacity: 0, y: 16 }}
              onClick={(event) => event.stopPropagation()}
            >
              <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white/90 px-5 py-4 backdrop-blur">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">Wanted Detail</p>
                  <h2 className="text-xl font-semibold text-slate-950">{selectedWanted.name}</h2>
                </div>
                <button
                  type="button"
                  onClick={() => setShowDetailModal(false)}
                  className="flex h-10 w-10 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                  aria-label="关闭详情"
                >
                  <FaTimes />
                </button>
              </div>

              <div className="grid gap-6 p-5 lg:grid-cols-[320px_1fr]">
                <div>
                  <CachedImage src={selectedWanted.photoUrl} alt={selectedWanted.name} imageId={selectedWanted._id} className="aspect-[4/5] w-full rounded-[24px] object-cover" />
                  <div className="mt-4 rounded-[24px] border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
                    <div className="flex items-center gap-2 font-semibold">
                      <FaExclamationTriangle /> 安全提醒
                    </div>
                    <p className="mt-2 leading-6">{selectedWanted.caution || '如发现相关人员，请联系执法部门，切勿私自接触。'}</p>
                  </div>
                </div>

                <div className="space-y-5">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {[
                      ['FBI 编号', selectedWanted.fbiNumber],
                      ['NCIC 编号', selectedWanted.ncicNumber || '无'],
                      ['危险等级', getDangerLevelText(selectedWanted.dangerLevel)],
                      ['悬赏金额', `$${selectedWanted.reward.toLocaleString()}`],
                      ['年龄', `${selectedWanted.age} 岁`],
                      ['国籍', selectedWanted.nationality],
                      ['最后位置', selectedWanted.lastKnownLocation || '未公开'],
                      ['加入日期', selectedWanted.dateAdded ? new Date(selectedWanted.dateAdded).toLocaleDateString('zh-CN') : '未公开'],
                    ].map(([label, value]) => (
                      <div key={label} className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">{label}</p>
                        <p className="mt-1 font-semibold text-slate-900">{value}</p>
                      </div>
                    ))}
                  </div>

                  <div>
                    <h3 className="flex items-center gap-2 text-base font-semibold text-slate-950">
                      <FaInfoCircle className="text-sky-600" /> 案件描述
                    </h3>
                    <p className="mt-3 text-sm leading-7 text-slate-600">{selectedWanted.description}</p>
                  </div>

                  <div>
                    <h3 className="flex items-center gap-2 text-base font-semibold text-slate-950">
                      <FaDollarSign className="text-emerald-600" /> 主要罪名
                    </h3>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {selectedWanted.charges.map((charge) => (
                        <span key={charge} className="rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-sm font-medium text-rose-700">
                          {charge}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <div className="rounded-[24px] border border-slate-200 bg-white p-4">
                      <h3 className="flex items-center gap-2 text-base font-semibold text-slate-950">
                        <FaMapMarkerAlt className="text-sky-600" /> 身份特征
                      </h3>
                      <p className="mt-3 text-sm leading-7 text-slate-600">
                        身高 {selectedWanted.height}，体重 {selectedWanted.weight}，眼睛 {selectedWanted.eyes}，头发 {selectedWanted.hair}，种族 {selectedWanted.race}。
                      </p>
                    </div>
                    <div className="rounded-[24px] border border-slate-200 bg-white p-4">
                      <h3 className="flex items-center gap-2 text-base font-semibold text-slate-950">
                        <FaCalendarAlt className="text-sky-600" /> 其他信息
                      </h3>
                      <p className="mt-3 text-sm leading-7 text-slate-600">
                        别名：{selectedWanted.aliases.join('、') || '无'}。标记：{selectedWanted.scarsAndMarks.join('、') || '未公开'}。
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showDisclaimer && (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setShowDisclaimer(false)}
          >
            <motion.div
              className="w-full max-w-xl rounded-[32px] border border-white/70 bg-white/95 p-6 shadow-[0_28px_90px_rgba(15,23,42,0.2)] backdrop-blur-xl"
              initial={{ scale: 0.96, y: 16, opacity: 0 }}
              animate={{ scale: 1, y: 0, opacity: 1 }}
              exit={{ scale: 0.96, y: 16, opacity: 0 }}
              onClick={(event) => event.stopPropagation()}
            >
              <div className="flex items-start gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[22px] bg-rose-50 text-rose-700 ring-1 ring-rose-100">
                  <FaBullhorn />
                </div>
                <div>
                  <h2 className="text-xl font-semibold text-slate-950">重要免责声明</h2>
                  <p className="mt-3 text-sm leading-7 text-slate-600">
                    本页面展示的信息仅供参考和娱乐用途，本站不保证数据准确性与时效性。需要权威信息请访问官方渠道，发现可疑人员请联系当地执法部门。
                  </p>
                </div>
              </div>

              <div className="mt-6 grid gap-3 sm:grid-cols-3">
                <InfoPrimaryButton tone="rose" onClick={handleCloseDisclaimerToday}>
                  今日不再提示
                </InfoPrimaryButton>
                <button
                  type="button"
                  onClick={() => setShowDisclaimer(false)}
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                >
                  关闭
                </button>
                <button
                  type="button"
                  onClick={handleCloseDisclaimerForever}
                  className="rounded-xl border border-slate-200 bg-slate-100 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-200"
                >
                  永不提示
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </InfoQueryShell>
  );
};

export default FBIWantedPublic;
