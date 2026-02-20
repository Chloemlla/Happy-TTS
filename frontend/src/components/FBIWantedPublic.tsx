import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FaSearch,
  FaExclamationTriangle,
  FaShieldAlt,
  FaUserSecret,
  FaFilter,
  FaInfoCircle,
  FaPhone,
  FaEnvelope,
  FaGlobe,
  FaSpinner,
  FaEye,
  FaTimes,
  FaCalendarAlt,
  FaMapMarkerAlt,
  FaWeight,
  FaRuler,
  FaUser,
  FaBullhorn
} from 'react-icons/fa';
import { FBIWanted, FBIStatistics, DANGER_LEVEL_CONFIG, STATUS_CONFIG } from '../types/fbi';
import { fbiAPI } from '../api/fbi';
import { imageCacheService } from '../utils/imageCache';

// 图片组件，支持缓存和错误处理
const CachedImage: React.FC<{ src?: string; alt?: string; className?: string; imageId?: string }> = React.memo(({
  src,
  alt = '通缉犯照片',
  className = '',
  imageId
}) => {
  const [imageSrc, setImageSrc] = useState<string>('');
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    let mounted = true;

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
        const response = await fetch(src, {
          signal: abortControllerRef.current.signal
        });

        if (response.ok) {
          const blob = await response.blob();
          const objectUrl = URL.createObjectURL(blob);

          if (mounted) {
            setImageSrc(objectUrl);
            setLoading(false);

            if (imageId) {
              imageCacheService.set(imageId, src, blob);
            }
          }
        } else {
          if (mounted) {
            setError(true);
            setLoading(false);
          }
        }
      } catch (err) {
        if (mounted && !abortControllerRef.current?.signal.aborted) {
          setError(true);
          setLoading(false);
        }
      }
    };

    loadImage();

    return () => {
      mounted = false;
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      if (imageSrc && imageSrc.startsWith('blob:')) {
        URL.revokeObjectURL(imageSrc);
      }
    };
  }, [src, imageId]);

  if (loading) {
    return (
      <div className={`bg-[#8ECAE6]/10 flex items-center justify-center ${className}`}>
        <FaSpinner className="animate-spin text-[#023047]/30" />
      </div>
    );
  }

  if (error || !imageSrc) {
    return (
      <div className={`bg-[#8ECAE6]/10 flex items-center justify-center ${className}`}>
        <FaUser className="text-[#023047]/30" />
      </div>
    );
  }

  return (
    <img
      src={imageSrc}
      alt={alt}
      className={className}
      onError={() => setError(true)}
    />
  );
});

const FBIWantedPublic: React.FC = () => {
  const [wantedList, setWantedList] = useState<FBIWanted[]>([]);
  const [filteredList, setFilteredList] = useState<FBIWanted[]>([]);
  const [selectedWanted, setSelectedWanted] = useState<FBIWanted | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState('');
  const [dangerFilter, setDangerFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<string>('ACTIVE');
  const [statistics, setStatistics] = useState<FBIStatistics | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [pageSize] = useState(12);
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const [showDisclaimer, setShowDisclaimer] = useState(false);
  const [disclaimerClosed, setDisclaimerClosed] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);

  const fetchWantedList = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fbiAPI.getPublicList({
        page: currentPage,
        limit: 12,
        status: 'ACTIVE',
        ...(dangerFilter !== 'ALL' && { dangerLevel: dangerFilter }),
        ...(searchTerm && { search: searchTerm })
      });

      setWantedList(response.data);
      if (response.pagination) {
        setTotalPages(response.pagination.pages);
      }
    } catch (error) {
      console.error('获取通缉犯列表失败:', error);
      setError('获取通缉犯列表失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  }, [currentPage, dangerFilter, searchTerm]);

  const fetchStatistics = useCallback(async () => {
    try {
      const response = await fbiAPI.getPublicStatistics();
      setStatistics(response.data);
    } catch (error) {
      console.error('获取统计信息失败:', error);
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
    const disclaimerClosedPermanently = localStorage.getItem(disclaimerKey + '_forever');
    const disclaimerClosedToday = localStorage.getItem(disclaimerKey + '_today');
    const today = new Date().toDateString();

    if (!disclaimerClosedPermanently && (!disclaimerClosedToday || disclaimerClosedToday !== today)) {
      const timer = setTimeout(() => {
        setShowDisclaimer(true);
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, []);

  const handleCloseDisclaimer = () => {
    setShowDisclaimer(false);
  };

  const handleCloseDisclaimerToday = () => {
    const disclaimerKey = 'fbi_wanted_disclaimer_closed';
    const today = new Date().toDateString();
    localStorage.setItem(disclaimerKey + '_today', today);
    setShowDisclaimer(false);
  };

  const handleCloseDisclaimerForever = () => {
    const disclaimerKey = 'fbi_wanted_disclaimer_closed';
    localStorage.setItem(disclaimerKey + '_forever', 'true');
    setShowDisclaimer(false);
  };

  const getDangerLevelColor = (level: string) => {
    switch (level) {
      case 'LOW': return 'text-green-600 bg-green-100 border-green-200';
      case 'MEDIUM': return 'text-yellow-600 bg-yellow-100 border-yellow-200';
      case 'HIGH': return 'text-orange-600 bg-orange-100 border-orange-200';
      case 'EXTREME': return 'text-red-600 bg-red-100 border-red-200';
      default: return 'text-[#023047]/50 bg-[#8ECAE6]/10 border-[#8ECAE6]/30';
    }
  };

  const getDangerLevelText = (level: string) => {
    switch (level) {
      case 'LOW': return '低危险';
      case 'MEDIUM': return '中等危险';
      case 'HIGH': return '高危险';
      case 'EXTREME': return '极度危险';
      default: return '未知';
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#8ECAE6]/20 via-white to-[#219EBC]/10 py-8 px-4 rounded-lg">
      <div className="max-w-7xl mx-auto px-4 space-y-8">
        {/* 标题和警告信息部分 */}
        <motion.div
          className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-xl border border-[#8ECAE6]/30 overflow-hidden"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
        >
          <div className="bg-gradient-to-r from-[#023047] to-[#219EBC] text-white p-6">
            <div className="text-center">
              <motion.div
                className="flex items-center justify-center gap-3 mb-4"
                initial={{ scale: 0.9 }}
                animate={{ scale: 1 }}
                transition={{ duration: 0.5, delay: 0.2 }}
              >
                <FaUserSecret className="text-4xl" />
                <h1 className="text-4xl font-bold">FBI通缉犯公示</h1>
              </motion.div>
              <motion.p
                className="text-[#8ECAE6] text-lg"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.5, delay: 0.4 }}
              >
                权威的FBI通缉犯信息公示平台
              </motion.p>
            </div>
          </div>

          <div className="p-6">
            {/* 重要提示 */}
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6">
              <div className="flex items-center gap-2 mb-3">
                <FaExclamationTriangle className="text-red-600" />
                <h3 className="text-red-700 font-semibold">重要提示</h3>
              </div>
              <div className="space-y-2 text-sm text-red-700">
                <p>• 如发现以下通缉犯，请立即报警，切勿私自接触</p>
                <p>• 这些人员可能携带武器，具有极高危险性</p>
                <p>• 提供有效线索可获得相应悬赏奖励</p>
                <p>• 举报电话：110 或 FBI热线：1-800-CALL-FBI</p>
              </div>
            </div>

            {/* 统计信息 */}
            {statistics && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-red-50 border border-red-200 rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <FaExclamationTriangle className="text-red-600" />
                    <h3 className="text-red-700 font-semibold">在逃通缉犯</h3>
                  </div>
                  <p className="text-2xl font-bold text-red-600">{statistics.active}</p>
                </div>

                <div className="bg-green-50 border border-green-200 rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <FaShieldAlt className="text-green-600" />
                    <h3 className="text-green-700 font-semibold">已抓获</h3>
                  </div>
                  <p className="text-2xl font-bold text-green-600">{statistics.captured}</p>
                </div>

                <div className="bg-[#FB8500]/10 border border-[#FB8500]/30 rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <FaExclamationTriangle className="text-[#FB8500]" />
                    <h3 className="text-[#FB8500] font-semibold">极度危险</h3>
                  </div>
                  <p className="text-2xl font-bold text-[#FB8500]">
                    {statistics.dangerLevels.EXTREME || 0}
                  </p>
                </div>

                <div className="bg-[#8ECAE6]/15 border border-[#8ECAE6]/30 rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <FaUserSecret className="text-[#219EBC]" />
                    <h3 className="text-[#219EBC] font-semibold">总计</h3>
                  </div>
                  <p className="text-2xl font-bold text-[#219EBC]">{statistics.total}</p>
                </div>
              </div>
            )}
          </div>
        </motion.div>

        {/* 搜索和过滤部分 */}
        <motion.div
          className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-xl border border-[#8ECAE6]/30 p-6"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.1 }}
        >
          <div className="flex flex-col lg:flex-row gap-4 items-center">
            <div className="relative flex-1">
              <FaSearch className="absolute left-3 top-1/2 transform -translate-y-1/2 text-[#023047]/30" />
              <input
                type="text"
                placeholder="搜索通缉犯姓名、FBI编号或罪名..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-3 border border-[#8ECAE6]/30 rounded-xl focus:ring-2 focus:ring-[#219EBC] focus:border-transparent"
              />
            </div>

            <select
              value={dangerFilter}
              onChange={(e) => setDangerFilter(e.target.value)}
              className="px-4 py-3 border border-[#8ECAE6]/30 rounded-xl focus:ring-2 focus:ring-[#219EBC] focus:border-transparent"
            >
              <option value="ALL">所有危险等级</option>
              <option value="EXTREME">极度危险</option>
              <option value="HIGH">高危险</option>
              <option value="MEDIUM">中等危险</option>
              <option value="LOW">低危险</option>
            </select>
          </div>
        </motion.div>

        {/* 通缉犯卡片网格 */}
        <motion.div
          className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-xl border border-[#8ECAE6]/30 overflow-hidden"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
        >
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <FaSpinner className="animate-spin text-4xl text-[#FFB703]" />
              <span className="ml-3 text-lg text-[#023047]/70">加载中...</span>
            </div>
          ) : (
            <>
              <div className="p-6">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                  {wantedList.map((wanted) => (
                    <motion.div
                      key={wanted._id}
                      className="bg-white rounded-xl shadow-lg border border-[#8ECAE6]/30 overflow-hidden hover:shadow-xl transition-all duration-300 cursor-pointer"
                      whileHover={{ scale: 1.02 }}
                      onClick={() => {
                        setSelectedWanted(wanted);
                        setShowDetailModal(true);
                      }}
                    >
                      <div className="relative">
                        <CachedImage
                          src={wanted.photoUrl}
                          alt={wanted.name}
                          className="w-full h-48 object-cover"
                          imageId={wanted._id}
                        />
                        <div className="absolute top-2 right-2">
                          <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full border ${getDangerLevelColor(wanted.dangerLevel)}`}>
                            {getDangerLevelText(wanted.dangerLevel)}
                          </span>
                        </div>
                      </div>

                      <div className="p-4">
                        <h3 className="text-lg font-bold text-[#023047] mb-2">{wanted.name}</h3>
                        <p className="text-sm text-[#023047]/70 mb-2">FBI: {wanted.fbiNumber}</p>

                        <div className="space-y-1 text-sm text-[#023047]/70 mb-3">
                          <p>年龄: {wanted.age}岁</p>
                          <p>身高: {wanted.height}</p>
                          <p>体重: {wanted.weight}</p>
                        </div>

                        <div className="mb-3">
                          <p className="text-sm font-semibold text-[#023047] mb-1">主要罪名:</p>
                          <div className="flex flex-wrap gap-1">
                            {wanted.charges.slice(0, 2).map((charge, index) => (
                              <span key={index} className="inline-block px-2 py-1 bg-[#8ECAE6]/15 text-xs rounded-full">
                                {charge}
                              </span>
                            ))}
                            {wanted.charges.length > 2 && (
                              <span className="inline-block px-2 py-1 bg-[#8ECAE6]/15 text-xs rounded-full">
                                +{wanted.charges.length - 2}
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center justify-between">
                          <div className="text-lg font-bold text-green-600">
                            悬赏: ${wanted.reward.toLocaleString()}
                          </div>
                          <button className="flex items-center gap-1 text-[#FFB703] hover:text-[#FB8500] transition-colors">
                            <FaEye />
                            <span className="text-sm">详情</span>
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </div>

              {/* 分页 */}
              {totalPages > 1 && (
                <div className="px-6 py-4 bg-[#8ECAE6]/10 border-t border-[#8ECAE6]/30">
                  <div className="flex items-center justify-between">
                    <div className="text-sm text-[#023047]/70">
                      第 {currentPage} 页，共 {totalPages} 页
                    </div>
                    <div className="flex space-x-2">
                      <button
                        onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                        disabled={currentPage === 1}
                        className="px-4 py-2 border border-[#8ECAE6]/30 rounded-lg text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-[#8ECAE6]/20 transition-colors"
                      >
                        上一页
                      </button>
                      <button
                        onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                        disabled={currentPage === totalPages}
                        className="px-4 py-2 border border-[#8ECAE6]/30 rounded-lg text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-[#8ECAE6]/20 transition-colors"
                      >
                        下一页
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </motion.div>

        {/* 联系信息 */}
        <motion.div
          className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-xl border border-[#8ECAE6]/30 p-6"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.3 }}
        >
          <div className="text-center">
            <h2 className="text-2xl font-bold text-[#023047] mb-4">发现线索？立即举报</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="flex items-center justify-center gap-2 p-4 bg-red-50 rounded-xl">
                <FaPhone className="text-red-600" />
                <div>
                  <p className="font-semibold text-red-700">紧急报警</p>
                  <p className="text-red-600">110</p>
                </div>
              </div>

              <div className="flex items-center justify-center gap-2 p-4 bg-[#8ECAE6]/15 rounded-xl">
                <FaPhone className="text-[#219EBC]" />
                <div>
                  <p className="font-semibold text-[#023047]">FBI热线</p>
                  <p className="text-[#219EBC]">1-800-CALL-FBI</p>
                </div>
              </div>

              <div className="flex items-center justify-center gap-2 p-4 bg-green-50 rounded-xl">
                <FaEnvelope className="text-green-600" />
                <div>
                  <p className="font-semibold text-green-700">在线举报</p>
                  <p className="text-green-600">tips.fbi.gov</p>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      </div>

      {/* 详情模态框 */}
      <AnimatePresence>
        {showDetailModal && selectedWanted && (
          <motion.div
            className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setShowDetailModal(false)}
          >
            <motion.div
              className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto"
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="sticky top-0 bg-gradient-to-r from-[#023047] to-[#219EBC] text-white p-6 rounded-t-2xl">
                <div className="flex items-center justify-between">
                  <h2 className="text-2xl font-bold">通缉犯详细信息</h2>
                  <button
                    onClick={() => setShowDetailModal(false)}
                    className="text-white hover:text-[#8ECAE6] transition-colors"
                  >
                    <FaTimes className="text-xl" />
                  </button>
                </div>
              </div>

              <div className="p-6">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* 左侧：照片和基本信息 */}
                  <div>
                    <div className="mb-6">
                      {selectedWanted.photoUrl ? (
                        <img
                          src={selectedWanted.photoUrl}
                          alt={selectedWanted.name}
                          className="w-full max-w-sm mx-auto rounded-xl shadow-lg"
                        />
                      ) : (
                        <div className="w-full max-w-sm mx-auto h-64 bg-[#8ECAE6]/15 rounded-xl flex items-center justify-center">
                          <FaUserSecret className="text-6xl text-[#023047]/50" />
                        </div>
                      )}
                    </div>

                    <div className="space-y-4">
                      <div>
                        <h3 className="text-lg font-semibold text-[#023047] mb-2">基本信息</h3>
                        <div className="space-y-2 text-sm">
                          <p><span className="font-medium">姓名:</span> {selectedWanted.name}</p>
                          <p><span className="font-medium">别名:</span> {selectedWanted.aliases.join(', ') || '无'}</p>
                          <p><span className="font-medium">年龄:</span> {selectedWanted.age}岁</p>
                          <p><span className="font-medium">身高:</span> {selectedWanted.height}</p>
                          <p><span className="font-medium">体重:</span> {selectedWanted.weight}</p>
                          <p><span className="font-medium">眼睛:</span> {selectedWanted.eyes}</p>
                          <p><span className="font-medium">头发:</span> {selectedWanted.hair}</p>
                          <p><span className="font-medium">种族:</span> {selectedWanted.race}</p>
                          <p><span className="font-medium">国籍:</span> {selectedWanted.nationality}</p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* 右侧：详细信息 */}
                  <div className="space-y-6">
                    <div>
                      <h3 className="text-lg font-semibold text-[#023047] mb-2">案件信息</h3>
                      <div className="space-y-2 text-sm">
                        <p><span className="font-medium">FBI编号:</span> {selectedWanted.fbiNumber}</p>
                        <p><span className="font-medium">NCIC编号:</span> {selectedWanted.ncicNumber || '无'}</p>
                        <div>
                          <span className="font-medium">危险等级:</span>
                          <span className={`ml-2 inline-flex px-2 py-1 text-xs font-semibold rounded-full border ${getDangerLevelColor(selectedWanted.dangerLevel)}`}>
                            {getDangerLevelText(selectedWanted.dangerLevel)}
                          </span>
                        </div>
                        <p><span className="font-medium">悬赏金额:</span> <span className="text-green-600 font-bold">${selectedWanted.reward.toLocaleString()}</span></p>
                      </div>
                    </div>

                    <div>
                      <h3 className="text-lg font-semibold text-[#023047] mb-2">罪名</h3>
                      <div className="flex flex-wrap gap-2">
                        {selectedWanted.charges.map((charge, index) => (
                          <span key={index} className="inline-block px-3 py-1 bg-red-100 text-red-700 text-sm rounded-full border border-red-200">
                            {charge}
                          </span>
                        ))}
                      </div>
                    </div>

                    <div>
                      <h3 className="text-lg font-semibold text-[#023047] mb-2">案件描述</h3>
                      <p className="text-sm text-[#023047]/70 leading-relaxed">{selectedWanted.description}</p>
                    </div>

                    {selectedWanted.lastKnownLocation && (
                      <div>
                        <h3 className="text-lg font-semibold text-[#023047] mb-2">最后已知位置</h3>
                        <p className="text-sm text-[#023047]/70">{selectedWanted.lastKnownLocation}</p>
                      </div>
                    )}

                    {selectedWanted.caution && (
                      <div className="bg-red-50 border border-red-200 rounded-xl p-4">
                        <h3 className="text-lg font-semibold text-red-700 mb-2 flex items-center gap-2">
                          <FaExclamationTriangle />
                          警告
                        </h3>
                        <p className="text-sm text-red-700">{selectedWanted.caution}</p>
                      </div>
                    )}

                    {selectedWanted.scarsAndMarks.length > 0 && (
                      <div>
                        <h3 className="text-lg font-semibold text-[#023047] mb-2">疤痕和标记</h3>
                        <ul className="text-sm text-[#023047]/70 space-y-1">
                          {selectedWanted.scarsAndMarks.map((mark, index) => (
                            <li key={index}>• {mark}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </div>

                {/* 举报提示 */}
                <div className="mt-8 bg-[#8ECAE6]/15 border border-[#8ECAE6]/30 rounded-xl p-6">
                  <div className="text-center">
                    <h3 className="text-xl font-bold text-[#023047] mb-4">发现此人？立即举报！</h3>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="flex items-center justify-center gap-2 p-3 bg-red-100 rounded-lg">
                        <FaPhone className="text-red-600" />
                        <div>
                          <p className="font-semibold text-red-700">紧急报警</p>
                          <p className="text-red-600">110</p>
                        </div>
                      </div>

                      <div className="flex items-center justify-center gap-2 p-3 bg-[#8ECAE6]/20 rounded-lg">
                        <FaPhone className="text-[#219EBC]" />
                        <div>
                          <p className="font-semibold text-[#023047]">FBI热线</p>
                          <p className="text-[#219EBC]">1-800-CALL-FBI</p>
                        </div>
                      </div>

                      <div className="flex items-center justify-center gap-2 p-3 bg-green-100 rounded-lg">
                        <FaEnvelope className="text-green-600" />
                        <div>
                          <p className="font-semibold text-green-700">在线举报</p>
                          <p className="text-green-600">tips.fbi.gov</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 免责声明弹窗 */}
      <AnimatePresence>
        {showDisclaimer && (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            onClick={handleCloseDisclaimer}
          >
            <motion.div
              className="bg-white rounded-2xl shadow-2xl w-full max-w-xs sm:max-w-sm md:max-w-md lg:max-w-lg xl:max-w-xl mx-4 p-4 sm:p-6 md:p-8 relative max-h-[90vh] overflow-y-auto"
              initial={{ scale: 0.95, y: 40, opacity: 0 }}
              animate={{ scale: 1, y: 0, opacity: 1 }}
              exit={{ scale: 0.95, y: 40, opacity: 0 }}
              transition={{ duration: 0.25 }}
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center mb-3 sm:mb-4">
                <FaBullhorn className="text-2xl sm:text-3xl mr-2 text-red-600" />
                <h2 className="text-lg sm:text-xl font-bold text-[#023047]">重要免责声明</h2>
              </div>

              <div className="prose max-w-none mb-4 sm:mb-6">
                <div className="bg-red-50 border border-red-200 rounded-xl p-3 sm:p-4 mb-3 sm:mb-4">
                  <div className="flex items-center gap-2 mb-2 sm:mb-3">
                    <FaExclamationTriangle className="text-red-600 text-sm sm:text-base" />
                    <h3 className="text-red-700 font-semibold text-sm sm:text-base">法律免责声明</h3>
                  </div>
                  <div className="space-y-1 sm:space-y-2 text-xs sm:text-sm text-red-700">
                    <p><strong>本网站不负责关于以下页面任何法律责任，仅娱乐为主。</strong></p>
                    <p>• 本页面展示的FBI通缉犯信息仅供参考和娱乐目的</p>
                    <p>• 所有信息来源于公开渠道，本站不保证信息的准确性和时效性</p>
                    <p>• 如需官方权威信息，请访问FBI官方网站</p>
                    <p>• 发现可疑人员请联系当地执法部门，切勿私自行动</p>
                  </div>
                </div>

                <div className="bg-[#8ECAE6]/15 border border-[#8ECAE6]/30 rounded-xl p-3 sm:p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <FaInfoCircle className="text-[#219EBC] text-sm sm:text-base" />
                    <h3 className="text-[#023047] font-semibold text-sm sm:text-base">使用须知</h3>
                  </div>
                  <div className="space-y-1 text-xs sm:text-sm text-[#023047]/70">
                    <p>• 继续使用本页面即表示您已阅读并同意本免责声明</p>
                    <p>• 本站仅提供信息展示服务，不承担任何法律责任</p>
                  </div>
                </div>
              </div>

              <div className="flex flex-col xs:flex-row gap-2 sm:gap-3 mt-4 sm:mt-6">
                <button
                  className="flex-1 px-3 sm:px-4 py-2 bg-[#FB8500] text-white rounded-lg font-semibold shadow hover:bg-[#FFB703] transition text-sm sm:text-base"
                  onClick={handleCloseDisclaimerToday}
                >
                  <span className="hidden sm:inline">我已了解，今日不再提示</span>
                  <span className="sm:hidden">今日不再提示</span>
                </button>
                <button
                  className="flex-1 px-3 sm:px-4 py-2 bg-[#8ECAE6]/15 text-[#023047]/70 rounded-lg font-semibold shadow hover:bg-[#8ECAE6]/25 transition text-sm sm:text-base"
                  onClick={handleCloseDisclaimer}
                >
                  关闭
                </button>
                <button
                  className="flex-1 px-3 sm:px-4 py-2 bg-[#8ECAE6]/30 text-[#023047]/70 rounded-lg font-semibold shadow hover:bg-[#8ECAE6]/40 transition text-sm sm:text-base"
                  onClick={handleCloseDisclaimerForever}
                >
                  <span className="hidden sm:inline">永久不再提示</span>
                  <span className="sm:hidden">永不提示</span>
                </button>
              </div>

              <button
                className="absolute top-4 right-4 text-[#023047]/30 hover:text-[#023047]/70"
                onClick={handleCloseDisclaimer}
                aria-label="关闭免责声明"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default FBIWantedPublic;
