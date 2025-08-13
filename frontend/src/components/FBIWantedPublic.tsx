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
import getApiBaseUrl from '../api';
import { openDB } from 'idb';

// 通缉犯接口定义
interface FBIWanted {
  _id: string;
  name: string;
  aliases: string[];
  age: number;
  height: string;
  weight: string;
  eyes: string;
  hair: string;
  race: string;
  nationality: string;
  dateOfBirth: string;
  placeOfBirth: string;
  charges: string[];
  description: string;
  reward: number;
  photoUrl: string;
  fingerprints: string[];
  lastKnownLocation: string;
  dangerLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'EXTREME';
  status: 'ACTIVE' | 'CAPTURED' | 'DECEASED' | 'REMOVED';
  dateAdded: string;
  lastUpdated: string;
  fbiNumber: string;
  ncicNumber: string;
  occupation: string;
  scarsAndMarks: string[];
  languages: string[];
  caution: string;
  remarks: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

// 统计信息接口
interface Statistics {
  total: number;
  active: number;
  captured: number;
  deceased: number;
  dangerLevels: Record<string, number>;
  recentAdded: Array<{
    name: string;
    fbiNumber: string;
    dateAdded: string;
    dangerLevel: string;
  }>;
}

// 图片缓存相关函数
const getCachedImage = async (imageId: string, imageHash: string): Promise<string | null> => {
  try {
    const db = await openDB('FBIWantedImageCache', 1, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('images')) {
          db.createObjectStore('images', { keyPath: 'id' });
        }
      },
    });

    const cached = await db.get('images', imageId);
    if (cached && cached.hash === imageHash && cached.blob) {
      return URL.createObjectURL(cached.blob);
    }
    return null;
  } catch (error) {
    console.warn('获取缓存图片失败:', error);
    return null;
  }
};

const setCachedImage = async (imageId: string, imageHash: string, blob: Blob): Promise<void> => {
  try {
    const db = await openDB('FBIWantedImageCache', 1);
    await db.put('images', {
      id: imageId,
      hash: imageHash,
      blob: blob,
      timestamp: Date.now()
    });
  } catch (error) {
    console.warn('缓存图片失败:', error);
  }
};

// 图片组件，支持缓存和错误处理
const CachedImage: React.FC<{ src?: string; alt?: string; className?: string; imageId?: string }> = ({
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

      // 如果是HTTP/HTTPS URL，直接使用
      if (/^https?:\/\//.test(src)) {
        setImageSrc(src);
        setLoading(false);
        return;
      }

      // 尝试从缓存加载
      if (imageId) {
        const cached = await getCachedImage(imageId, src);
        if (cached && mounted) {
          setImageSrc(cached);
          setLoading(false);
          return;
        }
      }

      // 从服务器加载并缓存
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

            // 缓存图片
            if (imageId) {
              setCachedImage(imageId, src, blob);
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
      <div className={`bg-gray-100 flex items-center justify-center ${className}`}>
        <FaSpinner className="animate-spin text-gray-400" />
      </div>
    );
  }

  if (error || !imageSrc) {
    return (
      <div className={`bg-gray-100 flex items-center justify-center ${className}`}>
        <FaUser className="text-gray-400" />
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
};

const FBIWantedPublic: React.FC = () => {
  const [wantedList, setWantedList] = useState<FBIWanted[]>([]);
  const [filteredList, setFilteredList] = useState<FBIWanted[]>([]);
  const [selectedWanted, setSelectedWanted] = useState<FBIWanted | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState('');
  const [dangerFilter, setDangerFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<string>('ACTIVE');
  const [statistics, setStatistics] = useState<Statistics | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [pageSize] = useState(12);
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // 免责声明弹窗状态
  const [showDisclaimer, setShowDisclaimer] = useState(false);
  const [disclaimerClosed, setDisclaimerClosed] = useState(false);

  // 详情模态框状态
  const [showDetailModal, setShowDetailModal] = useState(false);

  // 获取通缉犯列表（公开接口）
  const fetchWantedList = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({
        page: currentPage.toString(),
        limit: '12',
        status: 'ACTIVE', // 只显示在逃的通缉犯
        ...(dangerFilter !== 'ALL' && { dangerLevel: dangerFilter }),
        ...(searchTerm && { search: searchTerm })
      });
      const url = `${getApiBaseUrl()}/public/fbi-wanted?${params}`;
      const response = await fetch(url, {
        // 明确不携带任何凭证或鉴权头
        credentials: 'omit',
        headers: {
          Accept: 'application/json'
        }
      });

      if (!response.ok) {
        // 详细日志便于定位 401/其它错误
        const text = await response.text().catch(() => '');
        console.error(`获取通缉犯列表失败: ${response.status} ${response.statusText}`, { url, body: text });
        return;
      }

      const data = await response.json();
      setWantedList(data.data);
      setTotalPages(data.pagination.pages);
    } catch (error) {
      console.error('获取通缉犯列表失败:', error);
    } finally {
      setLoading(false);
    }
  }, [currentPage, dangerFilter, searchTerm]);

  // 获取统计信息（公开接口）
  const fetchStatistics = useCallback(async () => {
    try {
      const url = `${getApiBaseUrl()}/public/fbi-wanted/statistics`;
      const response = await fetch(url, {
        credentials: 'omit',
        headers: { Accept: 'application/json' }
      });

      if (!response.ok) {
        const text = await response.text().catch(() => '');
        console.error(`获取统计信息失败: ${response.status} ${response.statusText}`, { url, body: text });
        return;
      }

      const data = await response.json();
      setStatistics(data.data);
    } catch (error) {
      console.error('获取统计信息失败:', error);
    }
  }, []);

  // 当筛选条件或搜索变化时，重置为第1页，避免页码溢出导致空数据或误判错误
  useEffect(() => {
    setCurrentPage(1);
  }, [dangerFilter, searchTerm]);

  useEffect(() => {
    fetchWantedList();
    fetchStatistics();
  }, [fetchWantedList, fetchStatistics]);

  // 免责声明弹窗逻辑
  useEffect(() => {
    const disclaimerKey = 'fbi_wanted_disclaimer_closed';
    const disclaimerClosedPermanently = localStorage.getItem(disclaimerKey + '_forever');
    const disclaimerClosedToday = localStorage.getItem(disclaimerKey + '_today');
    const today = new Date().toDateString();

    if (!disclaimerClosedPermanently && (!disclaimerClosedToday || disclaimerClosedToday !== today)) {
      // 延迟1秒显示免责声明，让页面先加载
      const timer = setTimeout(() => {
        setShowDisclaimer(true);
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, []);

  // 免责声明弹窗处理函数
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

  // 危险等级颜色映射
  const getDangerLevelColor = (level: string) => {
    switch (level) {
      case 'LOW': return 'text-green-600 bg-green-100 border-green-200';
      case 'MEDIUM': return 'text-yellow-600 bg-yellow-100 border-yellow-200';
      case 'HIGH': return 'text-orange-600 bg-orange-100 border-orange-200';
      case 'EXTREME': return 'text-red-600 bg-red-100 border-red-200';
      default: return 'text-gray-600 bg-gray-100 border-gray-200';
    }
  };

  // 危险等级中文映射
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
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 py-8 px-4 rounded-lg">
      <div className="max-w-7xl mx-auto px-4 space-y-8">
        {/* 标题和警告信息部分 */}
        <motion.div
          className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-xl border border-white/20 overflow-hidden"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
        >
          <div className="bg-gradient-to-r from-blue-600 to-purple-600 text-white p-6">
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
                className="text-blue-100 text-lg"
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

                <div className="bg-purple-50 border border-purple-200 rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <FaExclamationTriangle className="text-purple-600" />
                    <h3 className="text-purple-700 font-semibold">极度危险</h3>
                  </div>
                  <p className="text-2xl font-bold text-purple-600">
                    {statistics.dangerLevels.EXTREME || 0}
                  </p>
                </div>

                <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <FaUserSecret className="text-blue-600" />
                    <h3 className="text-blue-700 font-semibold">总计</h3>
                  </div>
                  <p className="text-2xl font-bold text-blue-600">{statistics.total}</p>
                </div>
              </div>
            )}
          </div>
        </motion.div>

        {/* 搜索和过滤部分 */}
        <motion.div
          className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-xl border border-white/20 p-6"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.1 }}
        >
          <div className="flex flex-col lg:flex-row gap-4 items-center">
            <div className="relative flex-1">
              <FaSearch className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="搜索通缉犯姓名、FBI编号或罪名..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            <select
              value={dangerFilter}
              onChange={(e) => setDangerFilter(e.target.value)}
              className="px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent"
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
          className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-xl border border-white/20 overflow-hidden"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
        >
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <FaSpinner className="animate-spin text-4xl text-blue-600" />
              <span className="ml-3 text-lg text-gray-600">加载中...</span>
            </div>
          ) : (
            <>
              <div className="p-6">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                  {wantedList.map((wanted) => (
                    <motion.div
                      key={wanted._id}
                      className="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden hover:shadow-xl transition-all duration-300 cursor-pointer"
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
                        <h3 className="text-lg font-bold text-gray-900 mb-2">{wanted.name}</h3>
                        <p className="text-sm text-gray-600 mb-2">FBI: {wanted.fbiNumber}</p>

                        <div className="space-y-1 text-sm text-gray-600 mb-3">
                          <p>年龄: {wanted.age}岁</p>
                          <p>身高: {wanted.height}</p>
                          <p>体重: {wanted.weight}</p>
                        </div>

                        <div className="mb-3">
                          <p className="text-sm font-semibold text-gray-700 mb-1">主要罪名:</p>
                          <div className="flex flex-wrap gap-1">
                            {wanted.charges.slice(0, 2).map((charge, index) => (
                              <span key={index} className="inline-block px-2 py-1 bg-gray-100 text-xs rounded-full">
                                {charge}
                              </span>
                            ))}
                            {wanted.charges.length > 2 && (
                              <span className="inline-block px-2 py-1 bg-gray-100 text-xs rounded-full">
                                +{wanted.charges.length - 2}
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center justify-between">
                          <div className="text-lg font-bold text-green-600">
                            悬赏: ${wanted.reward.toLocaleString()}
                          </div>
                          <button className="flex items-center gap-1 text-blue-600 hover:text-blue-800 transition-colors">
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
                <div className="px-6 py-4 bg-gray-50 border-t border-gray-200">
                  <div className="flex items-center justify-between">
                    <div className="text-sm text-gray-700">
                      第 {currentPage} 页，共 {totalPages} 页
                    </div>
                    <div className="flex space-x-2">
                      <button
                        onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                        disabled={currentPage === 1}
                        className="px-4 py-2 border border-gray-300 rounded-lg text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-100 transition-colors"
                      >
                        上一页
                      </button>
                      <button
                        onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                        disabled={currentPage === totalPages}
                        className="px-4 py-2 border border-gray-300 rounded-lg text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-100 transition-colors"
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
          className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-xl border border-white/20 p-6"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.3 }}
        >
          <div className="text-center">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">发现线索？立即举报</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="flex items-center justify-center gap-2 p-4 bg-red-50 rounded-xl">
                <FaPhone className="text-red-600" />
                <div>
                  <p className="font-semibold text-red-700">紧急报警</p>
                  <p className="text-red-600">110</p>
                </div>
              </div>

              <div className="flex items-center justify-center gap-2 p-4 bg-blue-50 rounded-xl">
                <FaPhone className="text-blue-600" />
                <div>
                  <p className="font-semibold text-blue-700">FBI热线</p>
                  <p className="text-blue-600">1-800-CALL-FBI</p>
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
              <div className="sticky top-0 bg-gradient-to-r from-blue-600 to-purple-600 text-white p-6 rounded-t-2xl">
                <div className="flex items-center justify-between">
                  <h2 className="text-2xl font-bold">通缉犯详细信息</h2>
                  <button
                    onClick={() => setShowDetailModal(false)}
                    className="text-white hover:text-gray-200 transition-colors"
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
                        <div className="w-full max-w-sm mx-auto h-64 bg-gray-300 rounded-xl flex items-center justify-center">
                          <FaUserSecret className="text-6xl text-gray-600" />
                        </div>
                      )}
                    </div>

                    <div className="space-y-4">
                      <div>
                        <h3 className="text-lg font-semibold text-gray-900 mb-2">基本信息</h3>
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
                      <h3 className="text-lg font-semibold text-gray-900 mb-2">案件信息</h3>
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
                      <h3 className="text-lg font-semibold text-gray-900 mb-2">罪名</h3>
                      <div className="flex flex-wrap gap-2">
                        {selectedWanted.charges.map((charge, index) => (
                          <span key={index} className="inline-block px-3 py-1 bg-red-100 text-red-700 text-sm rounded-full border border-red-200">
                            {charge}
                          </span>
                        ))}
                      </div>
                    </div>

                    <div>
                      <h3 className="text-lg font-semibold text-gray-900 mb-2">案件描述</h3>
                      <p className="text-sm text-gray-700 leading-relaxed">{selectedWanted.description}</p>
                    </div>

                    {selectedWanted.lastKnownLocation && (
                      <div>
                        <h3 className="text-lg font-semibold text-gray-900 mb-2">最后已知位置</h3>
                        <p className="text-sm text-gray-700">{selectedWanted.lastKnownLocation}</p>
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
                        <h3 className="text-lg font-semibold text-gray-900 mb-2">疤痕和标记</h3>
                        <ul className="text-sm text-gray-700 space-y-1">
                          {selectedWanted.scarsAndMarks.map((mark, index) => (
                            <li key={index}>• {mark}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </div>

                {/* 举报提示 */}
                <div className="mt-8 bg-blue-50 border border-blue-200 rounded-xl p-6">
                  <div className="text-center">
                    <h3 className="text-xl font-bold text-blue-700 mb-4">发现此人？立即举报！</h3>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="flex items-center justify-center gap-2 p-3 bg-red-100 rounded-lg">
                        <FaPhone className="text-red-600" />
                        <div>
                          <p className="font-semibold text-red-700">紧急报警</p>
                          <p className="text-red-600">110</p>
                        </div>
                      </div>

                      <div className="flex items-center justify-center gap-2 p-3 bg-blue-100 rounded-lg">
                        <FaPhone className="text-blue-600" />
                        <div>
                          <p className="font-semibold text-blue-700">FBI热线</p>
                          <p className="text-blue-600">1-800-CALL-FBI</p>
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
                <h2 className="text-lg sm:text-xl font-bold text-gray-900">重要免责声明</h2>
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

                <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 sm:p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <FaInfoCircle className="text-blue-600 text-sm sm:text-base" />
                    <h3 className="text-blue-700 font-semibold text-sm sm:text-base">使用须知</h3>
                  </div>
                  <div className="space-y-1 text-xs sm:text-sm text-blue-700">
                    <p>• 继续使用本页面即表示您已阅读并同意本免责声明</p>
                    <p>• 本站仅提供信息展示服务，不承担任何法律责任</p>
                  </div>
                </div>
              </div>

              <div className="flex flex-col xs:flex-row gap-2 sm:gap-3 mt-4 sm:mt-6">
                <button
                  className="flex-1 px-3 sm:px-4 py-2 bg-red-600 text-white rounded-lg font-semibold shadow hover:bg-red-700 transition text-sm sm:text-base"
                  onClick={handleCloseDisclaimerToday}
                >
                  <span className="hidden sm:inline">我已了解，今日不再提示</span>
                  <span className="sm:hidden">今日不再提示</span>
                </button>
                <button
                  className="flex-1 px-3 sm:px-4 py-2 bg-gray-100 text-gray-700 rounded-lg font-semibold shadow hover:bg-gray-200 transition text-sm sm:text-base"
                  onClick={handleCloseDisclaimer}
                >
                  关闭
                </button>
                <button
                  className="flex-1 px-3 sm:px-4 py-2 bg-gray-300 text-gray-700 rounded-lg font-semibold shadow hover:bg-gray-400 transition text-sm sm:text-base"
                  onClick={handleCloseDisclaimerForever}
                >
                  <span className="hidden sm:inline">永久不再提示</span>
                  <span className="sm:hidden">永不提示</span>
                </button>
              </div>

              <button
                className="absolute top-4 right-4 text-gray-400 hover:text-gray-600"
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
