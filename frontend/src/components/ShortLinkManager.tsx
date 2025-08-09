import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FaTrash, FaCopy, FaSearch, FaSync, FaDice, FaLink, FaPlus, FaInfoCircle, FaExclamationTriangle, FaCheckCircle, FaArrowLeft, FaList, FaToggleOn, FaToggleOff, FaChevronLeft, FaChevronRight, FaAngleDoubleLeft, FaAngleDoubleRight } from 'react-icons/fa';
import { Link } from 'react-router-dom';
import { useNotification } from './Notification';
import getApiBaseUrl from '../api';
import { useAuth } from '../hooks/useAuth';
import CryptoJS from 'crypto-js';

interface ShortLink {
  _id: string;
  code: string;
  target: string;
  createdAt: string;
  userId?: string;
  username?: string;
}

const PAGE_SIZE = 10;

// AES-256解密函数
function decryptAES256(encryptedData: string, iv: string, key: string): string {
  try {
    console.log('   开始AES-256解密...');
    console.log('   密钥长度:', key.length);
    console.log('   加密数据长度:', encryptedData.length);
    console.log('   IV长度:', iv.length);
    
    const keyBytes = CryptoJS.SHA256(key);
    const ivBytes = CryptoJS.enc.Hex.parse(iv);
    const encryptedBytes = CryptoJS.enc.Hex.parse(encryptedData);
    
    console.log('   密钥哈希完成，开始解密...');
    
    const decrypted = CryptoJS.AES.decrypt(
      { ciphertext: encryptedBytes },
      keyBytes,
      {
        iv: ivBytes,
        mode: CryptoJS.mode.CBC,
        padding: CryptoJS.pad.Pkcs7
      }
    );
    
    const result = decrypted.toString(CryptoJS.enc.Utf8);
    console.log('   解密完成，结果长度:', result.length);
    
    return result;
  } catch (error) {
    console.error('❌ AES-256解密失败:', error);
    throw new Error('解密失败');
  }
}

const ShortLinkManager: React.FC = () => {
  const { user } = useAuth();
  const [links, setLinks] = useState<ShortLink[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [refreshing, setRefreshing] = useState(false);
  const [createTarget, setCreateTarget] = useState('');
  const [customCode, setCustomCode] = useState('');
  const [creating, setCreating] = useState(false);
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const [codeValidation, setCodeValidation] = useState<{ isValid: boolean; message: string } | null>(null);
  const { setNotification } = useNotification();

  // 虚拟滚动相关状态
  const [containerHeight, setContainerHeight] = useState(600);
  const [scrollTop, setScrollTop] = useState(0);
  const itemHeight = 120; // 每个短链项目的预估高度
  const overscan = 5; // 额外渲染的项目数量，确保平滑滚动

  // 批量选择相关状态
  const [selectedLinks, setSelectedLinks] = useState<Set<string>>(new Set());
  const [isSelectMode, setIsSelectMode] = useState(false);
  const [batchDeleting, setBatchDeleting] = useState(false);

  const fetchLinks = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${getApiBaseUrl()}/api/admin/shortlinks?search=${encodeURIComponent(search)}&page=${page}&pageSize=${PAGE_SIZE}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      
      // 检查是否为加密数据
      if (data.data && data.iv && typeof data.data === 'string' && typeof data.iv === 'string') {
        try {
          console.log('🔐 开始解密短链列表数据...');
          console.log('   加密数据长度:', data.data.length);
          console.log('   IV:', data.iv);
          console.log('   使用Token进行解密，Token长度:', token?.length || 0);
          
          // 解密数据
          const decryptedJson = decryptAES256(data.data, data.iv, token || '');
          const decryptedData = JSON.parse(decryptedJson);
          
          if (decryptedData.items && Array.isArray(decryptedData.items)) {
            console.log('✅ 解密成功，获取到', decryptedData.items.length, '个短链');
            setLinks(decryptedData.items);
            setTotal(decryptedData.total || decryptedData.items.length);
            setTotalPages(Math.ceil((decryptedData.total || decryptedData.items.length) / PAGE_SIZE));
          } else {
            console.error('解密数据格式错误:', decryptedData);
            setLinks([]);
            setTotal(0);
            setTotalPages(1);
          }
        } catch (decryptError) {
          console.error('❌ 解密失败:', decryptError);
          setLinks([]);
          setTotal(0);
          setNotification({ 
            message: '数据解密失败，请重试', 
            type: 'error' 
          });
        }
      } else {
        // 兼容旧的未加密格式
        console.log('📝 使用未加密格式数据');
        setLinks(data.items || []);
        setTotal(data.total || 0);
      }
    } catch (error) {
      console.error('获取短链列表失败:', error);
      setLinks([]);
      setTotal(0);
      setNotification({ 
        message: '获取短链列表失败，请重试', 
        type: 'error' 
      });
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchLinks();
    // eslint-disable-next-line
  }, [search, page]);

  const handleDelete = async (id: string) => {
    if (!window.confirm('确定要删除该短链吗？')) return;
    
    // 添加删除前的视觉反馈
    setHighlightedId(id);
    
    const token = localStorage.getItem('token');
    await fetch(`${getApiBaseUrl()}/api/admin/shortlinks/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` }
    });
    
    // 删除成功后的动效
    setTimeout(() => setHighlightedId(null), 800);
    fetchLinks();
    setNotification({ message: '删除成功', type: 'success' });
  };

  const handleCopy = (code: string) => {
    const url = `${getApiBaseUrl()}/s/${code}`;
    navigator.clipboard.writeText(url);
    setNotification({ message: '短链已复制到剪贴板', type: 'info' });
    
    // 添加复制成功的视觉反馈
    const button = document.querySelector(`[data-copy-code="${code}"]`);
    if (button) {
      button.classList.add('bg-green-100', 'text-green-700');
      setTimeout(() => {
        button.classList.remove('bg-green-100', 'text-green-700');
      }, 500);
    }
  };

  const handleRefresh = () => {
    setRefreshing(true);
    fetchLinks().then(() => {
      setRefreshing(false);
      setNotification({ 
        message: '短链列表已刷新', 
        type: 'success' 
      });
    }).catch(() => {
      setRefreshing(false);
    });
  };

  // 生成随机短链接码
  const generateRandomCode = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < 6; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    
    // 添加生成动画效果
    setCustomCode('');
    setTimeout(() => {
      setCustomCode(result);
    }, 100);
  };

  // 清除自定义短链接码
  const clearCustomCode = () => {
    setCustomCode('');
    setCodeValidation(null);
  };

  // 验证自定义短链接码
  const validateCustomCode = (code: string) => {
    if (!code.trim()) {
      setCodeValidation(null);
      return;
    }
    
    const trimmedCode = code.trim();
    if (trimmedCode.length < 1 || trimmedCode.length > 200) {
      setCodeValidation({ isValid: false, message: '长度必须在1-200个字符之间' });
      return;
    }
    
    if (!/^[a-zA-Z0-9_-]+$/.test(trimmedCode)) {
      setCodeValidation({ isValid: false, message: '只能包含字母、数字、连字符和下划线' });
      return;
    }
    
    setCodeValidation({ isValid: true, message: '格式正确' });
  };

  const handleCreate = async () => {
    if (!createTarget.trim()) {
      setNotification({ message: '请输入目标地址', type: 'warning' });
      return;
    }
    
    // 验证自定义短链接码格式
    if (customCode.trim()) {
      const trimmedCode = customCode.trim();
      if (trimmedCode.length < 1 || trimmedCode.length > 200) {
        setNotification({ message: '自定义短链接码长度必须在1-200个字符之间', type: 'warning' });
        return;
      }
      if (!/^[a-zA-Z0-9_-]+$/.test(trimmedCode)) {
        setNotification({ message: '自定义短链接码只能包含字母、数字、连字符和下划线', type: 'warning' });
        return;
      }
    }
    
    setCreating(true);
    try {
      const token = localStorage.getItem('token');
      const requestBody: any = { target: createTarget.trim() };
      if (customCode.trim()) {
        requestBody.customCode = customCode.trim();
      }
      
      const res = await fetch(`${getApiBaseUrl()}/api/admin/shortlinks`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(requestBody)
      });
      const data = await res.json();
      if (data.success) {
        setNotification({ message: '短链创建成功', type: 'success' });
        setCreateTarget('');
        setCustomCode('');
        setHighlightedId(data.doc?._id);
        setTimeout(() => setHighlightedId(null), 800);
        fetchLinks();
      } else {
        setNotification({ message: data.error || '创建失败', type: 'error' });
      }
    } catch {
      setNotification({ message: '创建失败', type: 'error' });
    }
    setCreating(false);
  };

  // 虚拟滚动计算
  const totalItems = links.length;
  const visibleCount = Math.ceil(containerHeight / itemHeight);
  const startIndex = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan);
  const endIndex = Math.min(totalItems, startIndex + visibleCount + overscan * 2);
  const visibleItems = links.slice(startIndex, endIndex);
  const offsetY = startIndex * itemHeight;

  // 性能优化：当列表项较少时，不使用虚拟滚动
  const useVirtualScrolling = totalItems > 20;

  // 监听容器大小变化
  const containerRef = React.useRef<HTMLDivElement>(null);
  const mobileContainerRef = React.useRef<HTMLDivElement>(null);
  
  React.useEffect(() => {
    const updateContainerHeight = () => {
      const ref = window.innerWidth >= 768 ? containerRef.current : mobileContainerRef.current;
      if (ref) {
        const rect = ref.getBoundingClientRect();
        setContainerHeight(Math.max(400, window.innerHeight - rect.top - 100));
      }
    };

    updateContainerHeight();
    window.addEventListener('resize', updateContainerHeight);
    return () => window.removeEventListener('resize', updateContainerHeight);
  }, []);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    setScrollTop(e.currentTarget.scrollTop);
  };

  // 批量选择相关函数
  const toggleSelectMode = () => {
    setIsSelectMode(!isSelectMode);
    if (isSelectMode) {
      setSelectedLinks(new Set());
    }
  };

  const toggleSelectLink = (linkId: string) => {
    const newSelected = new Set(selectedLinks);
    if (newSelected.has(linkId)) {
      newSelected.delete(linkId);
    } else {
      newSelected.add(linkId);
    }
    setSelectedLinks(newSelected);
  };

  const selectAllLinks = () => {
    setSelectedLinks(new Set(links.map(link => link._id)));
  };

  const clearSelection = () => {
    setSelectedLinks(new Set());
  };

  const handleBatchDelete = async () => {
    if (selectedLinks.size === 0) {
      setNotification({ 
        message: '请选择要删除的短链', 
        type: 'warning' 
      });
      return;
    }

    const selectedArray = Array.from(selectedLinks);
    const selectedLinkObjects = links.filter(link => selectedArray.includes(link._id));
    const linkCodes = selectedLinkObjects.map(link => link.code).join(', ');
    
    if (window.confirm(`确定要删除以下${selectedLinks.size}个短链吗？\n${linkCodes}\n\n此操作不可撤销。`)) {
      setBatchDeleting(true);
      try {
        const token = localStorage.getItem('token');
        const response = await fetch(`${getApiBaseUrl()}/api/admin/shortlinks/batch-delete`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({ ids: selectedArray })
        });

        const data = await response.json();
        
        if (!response.ok) {
          throw new Error(data.error || '批量删除失败');
        }
        
        setNotification({ 
          message: `批量删除成功！删除了 ${data.data?.deletedCount || selectedLinks.size} 个短链`, 
          type: 'success' 
        });
        
        // 清空选择并退出选择模式
        setSelectedLinks(new Set());
        setIsSelectMode(false);
        
        // 重新获取短链列表
        fetchLinks();
      } catch (error) {
        console.error('批量删除短链失败:', error);
        setNotification({ 
          message: `批量删除失败：${error instanceof Error ? error.message : '请重试'}`, 
          type: 'error' 
        });
      } finally {
        setBatchDeleting(false);
      }
    }
  };

  // 分页控制函数
  const handlePageChange = (newPage: number) => {
    if (newPage >= 1 && newPage <= totalPages && newPage !== page) {
      setPage(newPage);
    }
  };

  const handleFirstPage = () => handlePageChange(1);
  const handlePrevPage = () => handlePageChange(page - 1);
  const handleNextPage = () => handlePageChange(page + 1);
  const handleLastPage = () => handlePageChange(totalPages);

  // 生成页码按钮数组
  const generatePageNumbers = () => {
    const pages = [];
    const maxVisiblePages = 5;
    let startPage = Math.max(1, page - Math.floor(maxVisiblePages / 2));
    let endPage = Math.min(totalPages, startPage + maxVisiblePages - 1);
    
    // 调整起始页，确保显示足够的页码
    if (endPage - startPage + 1 < maxVisiblePages) {
      startPage = Math.max(1, endPage - maxVisiblePages + 1);
    }
    
    for (let i = startPage; i <= endPage; i++) {
      pages.push(i);
    }
    
    return pages;
  };

  if (!user || user.role !== 'admin') {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
        <span style={{ fontSize: 120, lineHeight: 1 }}>🤡</span>
        <div className="text-3xl font-bold mt-6 mb-2 text-rose-600 drop-shadow-lg">你不是管理员，禁止访问！</div>
        <div className="text-lg text-gray-500 mb-8">请用管理员账号登录后再来玩哦~<br/><span className="text-rose-400">（小丑竟是你自己）</span></div>
        <div className="text-base text-gray-400 italic mt-4">仅限管理员使用，恶搞界面仅供娱乐。</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 标题和说明 */}
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl p-6 border border-blue-100">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-2xl font-bold text-blue-700 flex items-center gap-2">
            <FaLink className="w-6 h-6" />
            短链管理
          </h2>
          <Link 
            to="/"
            className="px-3 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition text-sm font-medium flex items-center gap-2"
          >
            <FaArrowLeft className="w-4 h-4" />
            返回主页
          </Link>
        </div>
        <div className="text-gray-600 space-y-2">
          <p>此功能用于管理短链接，支持创建、搜索、复制和删除短链，提供完整的短链生命周期管理。</p>
          <div className="flex items-start gap-2 text-sm">
            <FaInfoCircle className="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0" />
            <div>
              <p className="font-semibold text-blue-700">功能说明：</p>
              <ul className="list-disc list-inside space-y-1 mt-1">
                <li>支持创建自定义或随机短链</li>
                <li>实时搜索和筛选短链</li>
                <li>一键复制短链到剪贴板</li>
                <li>安全的删除确认机制</li>
                <li>批量选择和删除多个短链</li>
              </ul>
            </div>
          </div>
        </div>
      </div>

      {/* 搜索和刷新 */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white rounded-xl p-6 shadow-sm border border-gray-200"
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
            <FaSearch className="w-5 h-5 text-blue-500" />
            搜索和刷新
          </h3>
          <motion.button
            onClick={handleRefresh}
            disabled={refreshing}
            className="px-3 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition disabled:opacity-50 text-sm font-medium flex items-center gap-2"
            whileTap={{ scale: 0.95 }}
          >
            <FaSync className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            刷新
          </motion.button>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <input
            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200"
            placeholder="搜索短链码或目标地址"
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
          />
        </div>
      </motion.div>

      {/* 创建短链 */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white rounded-xl p-6 shadow-sm border border-gray-200"
      >
        <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
          <FaPlus className="w-5 h-5 text-green-500" />
          创建短链
        </h3>

        <div className="flex items-center justify-between mb-4">
          <div></div>
          <div className="flex items-center gap-3">
            {/* 批量操作按钮 */}
            <motion.button
              onClick={toggleSelectMode}
              className={`px-4 py-2 rounded-lg transition-all duration-200 font-medium flex items-center gap-2 ${
                isSelectMode 
                  ? 'bg-orange-500 text-white hover:bg-orange-600' 
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              {isSelectMode ? <FaToggleOn className="w-4 h-4" /> : <FaToggleOff className="w-4 h-4" />}
              {isSelectMode ? '退出选择' : '批量选择'}
            </motion.button>
          </div>
        </div>

        {/* 批量操作控制栏 */}
        <AnimatePresence>
          {isSelectMode && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="mb-4 pt-4 border-t border-gray-200"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-sm text-gray-600">
                    已选择 {selectedLinks.size} 个短链
                  </span>
                  <div className="flex items-center gap-2">
                    <motion.button
                      onClick={selectAllLinks}
                      className="px-3 py-1 text-sm bg-blue-100 text-blue-700 rounded hover:bg-blue-200 transition"
                      whileTap={{ scale: 0.95 }}
                    >
                      全选
                    </motion.button>
                    <motion.button
                      onClick={clearSelection}
                      className="px-3 py-1 text-sm bg-gray-100 text-gray-700 rounded hover:bg-gray-200 transition"
                      whileTap={{ scale: 0.95 }}
                    >
                      清空选择
                    </motion.button>
                  </div>
                </div>
                
                {selectedLinks.size > 0 && (
                  <motion.button
                    onClick={handleBatchDelete}
                    disabled={batchDeleting}
                    className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition disabled:opacity-50 font-medium flex items-center gap-2"
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    <FaTrash className="w-4 h-4" />
                    {batchDeleting ? '删除中...' : `删除 ${selectedLinks.size} 个`}
                  </motion.button>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* 目标地址输入 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              目标地址 *
            </label>
            <input
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-all duration-200"
              placeholder="请输入要生成短链的目标地址（如 https://...）"
              value={createTarget}
              onChange={e => setCreateTarget(e.target.value)}
              disabled={creating}
            />
          </div>

          {/* 自定义码输入 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              自定义短链码（可选）
            </label>
            <div className="flex items-center space-x-2">
              <input
                className="flex-1 px-3 py-2 border border-gray-300 rounded-l-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 transition-all duration-200"
                placeholder="自定义短链接码"
                value={customCode}
                onChange={e => {
                  setCustomCode(e.target.value);
                  validateCustomCode(e.target.value);
                }}
                disabled={creating}
              />
              <motion.button
                className="px-3 py-2 bg-orange-500 text-white rounded-r-lg hover:bg-orange-600 transition disabled:opacity-50 flex items-center gap-2"
                onClick={generateRandomCode}
                disabled={creating}
                title="生成随机短链接码"
                whileTap={{ scale: 0.95 }}
              >
                <FaDice className="w-4 h-4" />
              </motion.button>
            </div>
          </div>
        </div>

        {/* 验证提示 */}
        <AnimatePresence>
          {customCode.trim() && (
            <motion.div 
              className="mt-3 flex items-center justify-between text-sm text-gray-600 bg-yellow-50 p-3 rounded-lg border border-yellow-200"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
            >
              <span className="flex items-center gap-2">
                <FaInfoCircle className="text-blue-500" />
                自定义短链接码提示：只能包含字母、数字、连字符(-)和下划线(_)，长度1-200个字符。留空则自动生成随机短链接码。
              </span>
              <button
                className="text-orange-600 hover:text-orange-800 text-xs underline"
                onClick={clearCustomCode}
              >
                清除
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* 验证状态 */}
        <AnimatePresence>
          {codeValidation && (
            <motion.div 
              className={`mt-3 flex items-center gap-2 text-sm p-3 rounded-lg border ${
                codeValidation.isValid 
                  ? 'bg-green-50 text-green-700 border-green-200' 
                  : 'bg-red-50 text-red-700 border-red-200'
              }`}
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
            >
              {codeValidation.isValid ? (
                <FaCheckCircle className="w-4 h-4 text-green-500" />
              ) : (
                <FaExclamationTriangle className="w-4 h-4 text-red-500" />
              )}
              <span>{codeValidation.message}</span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* 创建按钮 */}
        <div className="mt-4">
          <motion.button
            onClick={handleCreate}
            disabled={creating}
            className={`w-full py-3 px-6 rounded-lg font-semibold text-white transition-all duration-200 ${
              creating
                ? 'bg-gray-400 cursor-not-allowed'
                : 'bg-gradient-to-r from-green-500 to-blue-600 hover:from-green-600 hover:to-blue-700 shadow-lg hover:shadow-xl'
            }`}
            whileHover={!creating ? { scale: 1.02 } : {}}
            whileTap={!creating ? { scale: 0.98 } : {}}
          >
            {creating ? (
              <div className="flex items-center justify-center space-x-2">
                <FaSync className="animate-spin w-5 h-5" />
                <span>创建中...</span>
              </div>
            ) : (
              <div className="flex items-center justify-center space-x-2">
                <FaPlus className="w-5 h-5" />
                <span>创建短链</span>
              </div>
            )}
          </motion.button>
        </div>
      </motion.div>
      {/* 短链列表 */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white rounded-xl p-6 shadow-sm border border-gray-200"
      >
        <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
          <FaLink className="w-5 h-5 text-indigo-500" />
          短链列表
          {totalItems > 0 && (
            <span className="text-sm text-gray-500 bg-gray-100 px-2 py-1 rounded-full">
              共 {totalItems} 个
              {search && ` (筛选后)`}
            </span>
          )}
        </h3>

        {/* 桌面端表格视图 */}
        <div className="hidden md:block">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm text-gray-700">
              <thead className="sticky top-0 z-10 bg-white">
                <tr className="bg-gray-50 border-b border-gray-200">
                  {/* 批量选择复选框列 */}
                  {isSelectMode && (
                    <th className="py-3 px-3 text-center font-semibold text-gray-700 w-12">
                      <input
                        type="checkbox"
                        checked={links.length > 0 && links.every(link => selectedLinks.has(link._id))}
                        onChange={(e) => {
                          if (e.target.checked) {
                            selectAllLinks();
                          } else {
                            clearSelection();
                          }
                        }}
                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                    </th>
                  )}
                  <th className="py-3 px-3 text-left font-semibold text-gray-700">短链码</th>
                  <th className="py-3 px-3 text-left font-semibold text-gray-700">目标地址</th>
                  <th className="py-3 px-3 text-left font-semibold text-gray-700">创建时间</th>
                  <th className="py-3 px-3 text-left font-semibold text-gray-700">用户</th>
                  <th className="py-3 px-3 text-left font-semibold text-gray-700">用户ID</th>
                  <th className="py-3 px-3 text-center font-semibold text-gray-700">操作</th>
                </tr>
              </thead>
            </table>
          </div>
          
          {/* 虚拟滚动容器 */}
          <div 
            ref={containerRef}
            className="overflow-auto border border-gray-200 rounded-b-lg"
            style={{ height: useVirtualScrolling ? `${containerHeight}px` : 'auto', maxHeight: `${containerHeight}px` }}
            onScroll={useVirtualScrolling ? handleScroll : undefined}
          >
            <div style={{ height: useVirtualScrolling ? `${totalItems * itemHeight}px` : 'auto', position: 'relative' }}>
              <div style={{ transform: useVirtualScrolling ? `translateY(${offsetY}px)` : 'none' }}>
                <table className="min-w-full text-sm text-gray-700">
                  <tbody>
                    {loading ? (
                      <tr>
                        <td colSpan={6} className="text-center py-12">
                          <div className="flex items-center justify-center gap-2">
                            <FaSync className="animate-spin w-5 h-5 text-blue-500" />
                            <span className="text-lg font-medium text-gray-600">加载中…</span>
                          </div>
                        </td>
                      </tr>
                    ) : totalItems === 0 ? (
                      <tr>
                        <td colSpan={isSelectMode ? 7 : 6} className="text-center py-12 text-gray-400">
                          <div className="flex flex-col items-center gap-2">
                            <FaList className="text-3xl text-gray-300" />
                            <div className="text-lg font-medium text-gray-500">暂无短链</div>
                            <div className="text-sm text-gray-400">快去生成吧！</div>
                          </div>
                        </td>
                      </tr>
                    ) : (useVirtualScrolling ? visibleItems : links).map((link, index) => (
                      <tr
                        key={link._id}
                        className={`border-b border-gray-100 hover:bg-gray-50 ${highlightedId === link._id ? 'bg-green-100' : ''}`}
                        style={{ height: `${itemHeight}px` }}
                      >
                        {/* 批量选择复选框 */}
                        {isSelectMode && (
                          <td className="whitespace-nowrap px-6 py-4 text-center">
                            <input
                              type="checkbox"
                              checked={selectedLinks.has(link._id)}
                              onChange={() => toggleSelectLink(link._id)}
                              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                            />
                          </td>
                        )}
                        <td 
                          className="py-3 px-3 font-mono text-blue-600 break-all max-w-[120px] cursor-pointer hover:text-blue-800 transition font-semibold"
                          onClick={() => window.open(`${getApiBaseUrl()}/s/${link.code}`, '_blank')}
                        >
                          {link.code}
                        </td>
                        <td className="py-3 px-3 break-all max-w-[180px] text-gray-700">{link.target}</td>
                        <td className="py-3 px-3 whitespace-nowrap text-gray-600">{new Date(link.createdAt).toLocaleString()}</td>
                        <td className="py-3 px-3 break-all max-w-[80px] text-gray-700 font-medium">{link.username || 'admin'}</td>
                        <td className="py-3 px-3 break-all max-w-[80px] text-gray-500 text-xs">{link.userId || 'admin'}</td>
                        <td className="py-3 px-3 text-center">
                          <div className="flex gap-2 justify-center">
                            <motion.button
                              className="flex items-center justify-center bg-blue-100 hover:bg-blue-200 text-blue-700 rounded-lg px-2 py-1 shadow-sm hover:shadow-md transition-all duration-150"
                              title="复制短链"
                              onClick={() => handleCopy(link.code)}
                              data-copy-code={link.code}
                              whileHover={{ scale: 1.1 }}
                              whileTap={{ scale: 0.9 }}
                            >
                              <FaCopy className="w-4 h-4" />
                            </motion.button>
                            <motion.button
                              className="flex items-center justify-center bg-red-100 hover:bg-red-200 text-red-600 rounded-lg px-2 py-1 shadow-sm hover:shadow-md transition-all duration-150"
                              title="删除"
                              onClick={() => handleDelete(link._id)}
                              whileHover={{ scale: 1.1 }}
                              whileTap={{ scale: 0.9 }}
                            >
                              <FaTrash className="w-4 h-4" />
                            </motion.button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>

              {/* 移动端卡片列表视图 */}
        <div className="md:hidden">
          <div 
            ref={mobileContainerRef}
            className="overflow-auto"
            style={{ height: useVirtualScrolling ? `${containerHeight}px` : 'auto', maxHeight: `${containerHeight}px` }}
            onScroll={useVirtualScrolling ? handleScroll : undefined}
          >
            <div style={{ height: useVirtualScrolling ? `${totalItems * itemHeight}px` : 'auto', position: 'relative' }}>
              <div style={{ transform: useVirtualScrolling ? `translateY(${offsetY}px)` : 'none' }} className="space-y-3">
                {loading ? (
                  <div className="bg-white rounded-lg shadow p-6 text-center">
                    <div className="flex items-center justify-center gap-2">
                      <FaSync className="animate-spin w-5 h-5 text-blue-500" />
                      <span className="text-lg font-medium text-gray-600">加载中…</span>
                    </div>
                  </div>
                ) : totalItems === 0 ? (
                  <div className="bg-white rounded-lg shadow p-6 text-center">
                    <div className="flex flex-col items-center gap-2">
                      <FaList className="text-3xl text-gray-300" />
                      <div className="text-lg font-medium text-gray-500">暂无短链</div>
                      <div className="text-sm text-gray-400">快去生成吧！</div>
                    </div>
                  </div>
                ) : (useVirtualScrolling ? visibleItems : links).map((link, index) => (
                  <div
                    key={link._id}
                    className={`bg-white rounded-lg shadow-sm border border-gray-100 p-4 ${highlightedId === link._id ? 'ring-2 ring-green-200 bg-green-50' : ''}`}
                    style={{ minHeight: `${itemHeight}px` }}
                  >
                    {/* 短链码区域 */}
                    <div className="flex items-center justify-between mb-3 gap-2">
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        {/* 批量选择复选框 */}
                        {isSelectMode && (
                          <input
                            type="checkbox"
                            checked={selectedLinks.has(link._id)}
                            onChange={() => toggleSelectLink(link._id)}
                            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 mr-2 flex-shrink-0"
                          />
                        )}
                        <div
                          className="font-mono text-lg font-bold text-blue-600 cursor-pointer truncate"
                          onClick={() => window.open(`${getApiBaseUrl()}/s/${link.code}`, '_blank')}
                        >
                          {link.code}
                        </div>
                      </div>
                      <div className="flex gap-1 flex-shrink-0">
                        <motion.button
                          className="flex items-center justify-center bg-blue-100 hover:bg-blue-200 text-blue-700 rounded-lg p-2 shadow-sm hover:shadow-md transition-all duration-150"
                          title="复制短链"
                          onClick={() => handleCopy(link.code)}
                          data-copy-code={link.code}
                          whileHover={{ scale: 1.1 }}
                          whileTap={{ scale: 0.9 }}
                        >
                          <FaCopy className="w-4 h-4" />
                        </motion.button>
                        <motion.button
                          className="flex items-center justify-center bg-red-100 hover:bg-red-200 text-red-600 rounded-lg p-2 shadow-sm hover:shadow-md transition-all duration-150"
                          title="删除"
                          onClick={() => handleDelete(link._id)}
                          whileHover={{ scale: 1.1 }}
                          whileTap={{ scale: 0.9 }}
                        >
                          <FaTrash className="w-4 h-4" />
                        </motion.button>
                      </div>
                    </div>

                    {/* 目标地址 */}
                    <div className="mb-3">
                      <div className="text-xs text-gray-500 mb-1">目标地址</div>
                      <div className="text-sm text-gray-700 break-all">{link.target}</div>
                    </div>

                    {/* 底部信息 */}
                    <div className="flex flex-col gap-2 text-xs text-gray-500">
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-1">
                          <span className="text-gray-400">用户:</span>
                          <span className="text-gray-700">{link.username || 'admin'}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <span className="text-gray-400">时间:</span>
                          <span className="text-gray-700">{new Date(link.createdAt).toLocaleDateString()}</span>
                        </div>
                      </div>
                      <div className="text-gray-400">
                        {new Date(link.createdAt).toLocaleTimeString()}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </motion.div>

      {/* 分页控件 */}
      {totalPages > 1 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-xl p-6 shadow-sm border border-gray-200"
        >
          <div className="flex items-center justify-center gap-2">
            <div className="flex items-center gap-1">
              {/* 首页按钮 */}
              <motion.button
                onClick={handleFirstPage}
                disabled={page === 1}
                className={`p-2 rounded-lg transition-all duration-200 ${
                  page === 1
                    ? 'text-gray-400 cursor-not-allowed'
                    : 'text-gray-600 hover:bg-gray-100 hover:text-blue-600'
                }`}
                whileHover={page !== 1 ? { scale: 1.05 } : {}}
                whileTap={page !== 1 ? { scale: 0.95 } : {}}
              >
                <FaAngleDoubleLeft className="w-4 h-4" />
              </motion.button>

              {/* 上一页按钮 */}
              <motion.button
                onClick={handlePrevPage}
                disabled={page === 1}
                className={`p-2 rounded-lg transition-all duration-200 ${
                  page === 1
                    ? 'text-gray-400 cursor-not-allowed'
                    : 'text-gray-600 hover:bg-gray-100 hover:text-blue-600'
                }`}
                whileHover={page !== 1 ? { scale: 1.05 } : {}}
                whileTap={page !== 1 ? { scale: 0.95 } : {}}
              >
                <FaChevronLeft className="w-4 h-4" />
              </motion.button>

              {/* 页码按钮 */}
              <div className="flex items-center gap-1 mx-2">
                {generatePageNumbers().map((pageNum) => (
                  <motion.button
                    key={pageNum}
                    onClick={() => handlePageChange(pageNum)}
                    className={`px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                      pageNum === page
                        ? 'bg-blue-500 text-white shadow-md'
                        : 'text-gray-600 hover:bg-gray-100 hover:text-blue-600'
                    }`}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                  >
                    {pageNum}
                  </motion.button>
                ))}
              </div>

              {/* 下一页按钮 */}
              <motion.button
                onClick={handleNextPage}
                disabled={page === totalPages}
                className={`p-2 rounded-lg transition-all duration-200 ${
                  page === totalPages
                    ? 'text-gray-400 cursor-not-allowed'
                    : 'text-gray-600 hover:bg-gray-100 hover:text-blue-600'
                }`}
                whileHover={page !== totalPages ? { scale: 1.05 } : {}}
                whileTap={page !== totalPages ? { scale: 0.95 } : {}}
              >
                <FaChevronRight className="w-4 h-4" />
              </motion.button>

              {/* 末页按钮 */}
              <motion.button
                onClick={handleLastPage}
                disabled={page === totalPages}
                className={`p-2 rounded-lg transition-all duration-200 ${
                  page === totalPages
                    ? 'text-gray-400 cursor-not-allowed'
                    : 'text-gray-600 hover:bg-gray-100 hover:text-blue-600'
                }`}
                whileHover={page !== totalPages ? { scale: 1.05 } : {}}
                whileTap={page !== totalPages ? { scale: 0.95 } : {}}
              >
                <FaAngleDoubleRight className="w-4 h-4" />
              </motion.button>
            </div>

            {/* 页面信息 */}
            <div className="ml-4 text-sm text-gray-600 bg-gray-50 px-3 py-2 rounded-lg">
              第 {page} / {totalPages} 页，共 {total} 条记录
            </div>
          </div>
        </motion.div>
      )}
    </div>
  );
};

export default ShortLinkManager; 