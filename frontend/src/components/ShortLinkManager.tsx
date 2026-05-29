import React, { useEffect, useState, startTransition } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { FaTrash, FaCopy, FaSearch, FaSync, FaDice, FaLink, FaPlus, FaInfoCircle, FaExclamationTriangle, FaCheckCircle, FaArrowLeft, FaList, FaToggleOn, FaToggleOff, FaChevronLeft, FaChevronRight, FaAngleDoubleLeft, FaAngleDoubleRight, FaDownload, FaFileAlt, FaUpload } from 'react-icons/fa';
import { Link } from 'react-router-dom';
import { useNotification } from './Notification';
import getApiBaseUrl from '../api';
import { useAuth } from '../hooks/useAuth';
import { signedFetch } from '../utils/requestSigner';
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

  // 优化动画：根据系统"减少动态"偏好降级，并用辅助函数避免重复创建对象
  const prefersReducedMotion = useReducedMotion();
  const hoverScale = React.useCallback((scale: number, enabled: boolean = true) => (
    enabled && !prefersReducedMotion ? { scale } : undefined
  ), [prefersReducedMotion]);
  const tapScale = React.useCallback((scale: number, enabled: boolean = true) => (
    enabled && !prefersReducedMotion ? { scale } : undefined
  ), [prefersReducedMotion]);

  // 虚拟滚动相关状态
  const [containerHeight, setContainerHeight] = useState(600);
  const [scrollTop, setScrollTop] = useState(0);
  const itemHeight = 120;
  const overscan = 5;

  // 批量选择相关状态
  const [selectedLinks, setSelectedLinks] = useState<Set<string>>(new Set());
  const [isSelectMode, setIsSelectMode] = useState(false);
  const [batchDeleting, setBatchDeleting] = useState(false);

  // 导出相关状态
  const [exportingAll, setExportingAll] = useState(false);

  // 导入相关状态
  const [importingData, setImportingData] = useState(false);
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [importContent, setImportContent] = useState('');

  // 删除全部相关状态
  const [deletingAll, setDeletingAll] = useState(false);

  const fetchLinks = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${getApiBaseUrl()}/api/admin/shortlinks?search=${encodeURIComponent(search)}&page=${page}&pageSize=${PAGE_SIZE}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();

      if (data.data && data.iv && typeof data.data === 'string' && typeof data.iv === 'string') {
        try {
          console.log('🔐 开始解密短链列表数据...');
          console.log('   加密数据长度:', data.data.length);
          console.log('   IV:', data.iv);
          console.log('   使用Token进行解密，Token长度:', token?.length || 0);

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
          setNotification({ message: '数据解密失败，请重试', type: 'error' });
        }
      } else {
        console.log('📝 使用未加密格式数据');
        setLinks(data.items || []);
        setTotal(data.total || 0);
      }
    } catch (error) {
      console.error('获取短链列表失败:', error);
      setLinks([]);
      setTotal(0);
      setNotification({ message: '获取短链列表失败，请重试', type: 'error' });
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchLinks();
    // eslint-disable-next-line
  }, [search, page]);

  const handleDelete = async (id: string) => {
    if (!window.confirm('确定要删除该短链吗？')) return;
    setHighlightedId(id);
    const token = localStorage.getItem('token');
    await fetch(`${getApiBaseUrl()}/api/admin/shortlinks/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` }
    });
    setTimeout(() => setHighlightedId(null), 800);
    fetchLinks();
    setNotification({ message: '删除成功', type: 'success' });
  };

  const handleCopy = (code: string) => {
    const url = `${getApiBaseUrl()}/s/${code}`;
    navigator.clipboard.writeText(url);
    setNotification({ message: '短链已复制到剪贴板', type: 'info' });
    const button = document.querySelector(`[data-copy-code="${code}"]`);
    if (button) {
      button.classList.add('bg-[#8ECAE6]/30', 'text-[#219EBC]');
      setTimeout(() => {
        button.classList.remove('bg-[#8ECAE6]/30', 'text-[#219EBC]');
      }, 500);
    }
  };

  const handleRefresh = () => {
    setRefreshing(true);
    fetchLinks().then(() => {
      setRefreshing(false);
      setNotification({ message: '短链列表已刷新', type: 'success' });
    }).catch(() => {
      setRefreshing(false);
    });
  };

  const generateRandomCode = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < 6; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    startTransition(() => setCustomCode(''));
    if (typeof window !== 'undefined' && 'requestAnimationFrame' in window) {
      requestAnimationFrame(() => {
        startTransition(() => setCustomCode(result));
      });
    } else {
      startTransition(() => setCustomCode(result));
    }
  };

  const clearCustomCode = () => {
    setCustomCode('');
    setCodeValidation(null);
  };

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
      const res = await signedFetch(`${getApiBaseUrl()}/api/admin/shortlinks`, {
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
  const useVirtualScrolling = totalItems > 20;

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
      setNotification({ message: '请选择要删除的短链', type: 'warning' });
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
        setSelectedLinks(new Set());
        setIsSelectMode(false);
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

  const handlePageChange = (newPage: number) => {
    if (newPage >= 1 && newPage <= totalPages && newPage !== page) {
      setPage(newPage);
    }
  };

  const handleFirstPage = () => handlePageChange(1);
  const handlePrevPage = () => handlePageChange(page - 1);
  const handleNextPage = () => handlePageChange(page + 1);
  const handleLastPage = () => handlePageChange(totalPages);

  // 导出所有短链数据（后端导出）
  const handleExportAll = async () => {
    setExportingAll(true);
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${getApiBaseUrl()}/api/shorturl/admin/export`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      if (!response.ok) {
        if (response.status === 404) {
          setNotification({ message: '没有短链数据可以导出', type: 'warning' });
          return;
        } else if (response.status === 403) {
          setNotification({ message: '权限不足，只有管理员可以导出短链数据', type: 'error' });
          return;
        }
        throw new Error(`导出失败: ${response.status}`);
      }
      const textContent = await response.text();
      const contentDisposition = response.headers.get('Content-Disposition');
      let filename = `短链数据_${new Date().toISOString().split('T')[0]}.txt`;
      if (contentDisposition) {
        const filenameMatch = contentDisposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
        if (filenameMatch) {
          filename = decodeURIComponent(filenameMatch[1].replace(/['"]/g, ''));
        }
      }
      const isEncrypted = textContent.startsWith('# ShortUrl Export (Encrypted)') || /Algorithm:\s*AES-256-CBC/.test(textContent) || filename.endsWith('.enc.txt');
      if (!contentDisposition && isEncrypted) {
        filename = `短链数据_${new Date().toISOString().split('T')[0]}.enc.txt`;
      }
      const blob = new Blob([textContent], { type: 'text/plain; charset=utf-8' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      if (isEncrypted) {
        setNotification({ message: '已导出加密短链数据文件，请使用 AES_KEY 离线解密', type: 'success' });
      } else {
        const countMatch = textContent.match(/总数量:\s*(\d+)\s*个短链/);
        const exportCount = countMatch ? parseInt(countMatch[1]) : '未知数量';
        setNotification({ message: `成功导出 ${exportCount} 个短链数据`, type: 'success' });
      }
    } catch (error) {
      console.error('导出短链数据失败:', error);
      setNotification({ message: '导出短链数据失败，请重试', type: 'error' });
    } finally {
      setExportingAll(false);
      fetchLinks();
    }
  };

  const handleDeleteAll = async () => {
    if (links.length === 0) {
      setNotification({ message: '没有短链数据可以删除', type: 'warning' });
      return;
    }
    const confirmMessage = `确定要删除所有 ${links.length} 个短链吗？\n\n此操作不可撤销！`;
    if (!window.confirm(confirmMessage)) return;
    setDeletingAll(true);
    try {
      const token = localStorage.getItem('token');
      const response = await signedFetch(`${getApiBaseUrl()}/api/shorturl/admin/deleteall`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      if (!response.ok) {
        if (response.status === 403) {
          setNotification({ message: '权限不足，只有管理员可以删除所有短链数据', type: 'error' });
          return;
        }
        throw new Error(`删除失败: ${response.status}`);
      }
      const data = await response.json();
      setNotification({ message: `成功删除 ${data.deletedCount} 个短链数据`, type: 'success' });
      fetchLinks();
    } catch (error) {
      console.error('删除所有短链数据失败:', error);
      setNotification({ message: '删除所有短链数据失败，请重试', type: 'error' });
    } finally {
      setDeletingAll(false);
    }
  };

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.name.endsWith('.txt')) {
      setNotification({ message: '请选择 .txt 格式的文件', type: 'warning' });
      event.target.value = '';
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setNotification({ message: '文件大小不能超过10MB', type: 'warning' });
      event.target.value = '';
      return;
    }
    setImportingData(true);
    try {
      const fileContent = await file.text();
      const token = localStorage.getItem('token');
      const response = await signedFetch(`${getApiBaseUrl()}/api/shorturl/admin/import`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ content: fileContent })
      });
      if (!response.ok) {
        if (response.status === 403) {
          setNotification({ message: '权限不足，只有管理员可以导入短链数据', type: 'error' });
          return;
        }
        throw new Error(`导入失败: ${response.status}`);
      }
      const data = await response.json();
      let message = `导入完成！成功导入 ${data.importedCount} 个短链`;
      if (data.errorCount > 0) {
        message += `，跳过 ${data.errorCount} 个错误项`;
      }
      setNotification({ message, type: 'success' });
      fetchLinks();
    } catch (error) {
      console.error('导入短链数据失败:', error);
      setNotification({ message: '导入短链数据失败，请重试', type: 'error' });
    } finally {
      setImportingData(false);
      event.target.value = '';
    }
  };

  const handleImportData = async (content: string) => {
    if (!content.trim()) {
      setNotification({ message: '请输入要导入的数据', type: 'warning' });
      return;
    }
    setImportingData(true);
    try {
      const token = localStorage.getItem('token');
      const response = await signedFetch(`${getApiBaseUrl()}/api/shorturl/admin/import`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ content: content.trim() })
      });
      if (!response.ok) {
        if (response.status === 403) {
          setNotification({ message: '权限不足，只有管理员可以导入短链数据', type: 'error' });
          return;
        }
        throw new Error(`导入失败: ${response.status}`);
      }
      const data = await response.json();
      let message = `导入完成！成功导入 ${data.importedCount} 个短链`;
      if (data.errorCount > 0) {
        message += `，跳过 ${data.errorCount} 个错误项`;
      }
      setNotification({ message, type: 'success' });
      setImportContent('');
      setShowImportDialog(false);
      fetchLinks();
    } catch (error) {
      console.error('导入短链数据失败:', error);
      setNotification({ message: '导入短链数据失败，请重试', type: 'error' });
    } finally {
      setImportingData(false);
    }
  };

  const generatePageNumbers = () => {
    const pages = [];
    const maxVisiblePages = 5;
    let startPage = Math.max(1, page - Math.floor(maxVisiblePages / 2));
    let endPage = Math.min(totalPages, startPage + maxVisiblePages - 1);
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
        <div className="text-lg text-[#023047]/50 mb-8">请用管理员账号登录后再来玩哦~<br /><span className="text-rose-400">（小丑竟是你自己）</span></div>
        <div className="text-base text-[#023047]/30 italic mt-4">仅限管理员使用，恶搞界面仅供娱乐。</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 标题和说明 — 头部横幅：纯色 bg-[#023047] */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-xl border border-[#8ECAE6]/30 overflow-hidden"
      >
        <div className="bg-[#023047] px-6 py-5">
          <div className="flex items-center justify-between mb-2">
            <motion.h2
              initial={{ scale: 0.9 }}
              animate={{ scale: 1 }}
              transition={{ duration: 0.5, delay: 0.2 }}
              className="text-2xl font-bold text-white flex items-center gap-2 font-songti"
            >
              <FaLink className="w-6 h-6 text-[#FFB703]" />
              短链管理
            </motion.h2>
            <Link
              to="/"
              className="w-full sm:w-auto px-2 sm:px-3 py-1 sm:py-2 text-xs sm:text-sm bg-[#FFB703] text-[#023047] rounded-lg hover:bg-[#FB8500] transition font-medium flex items-center justify-center gap-1 sm:gap-2"
            >
              <FaArrowLeft className="w-3 h-3 sm:w-4 sm:h-4" />
              <span className="hidden sm:inline">返回主页</span>
              <span className="sm:hidden">返回</span>
            </Link>
          </div>
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.4 }}
            className="text-[#8ECAE6]"
          >
            此功能用于管理短链接，支持创建、搜索、复制和删除短链，提供完整的短链生命周期管理。
          </motion.p>
        </div>
        <div className="bg-[#8ECAE6]/10 px-6 py-4">
          <div className="flex items-start gap-2 text-sm">
            <FaInfoCircle className="w-4 h-4 text-[#219EBC] mt-0.5 flex-shrink-0" />
            <div>
              <p className="font-semibold text-[#023047] font-songti">功能说明：</p>
              <ul className="list-disc list-inside space-y-1 mt-1 text-[#023047]/70">
                <li>支持创建自定义或随机短链</li>
                <li>实时搜索和筛选短链</li>
                <li>一键复制短链到剪贴板</li>
                <li>安全的删除确认机制</li>
                <li>批量选择和删除多个短链</li>
                <li>一键导出所有短链数据到txt文件</li>
              </ul>
            </div>
          </div>
        </div>
      </motion.div>

      {/* 搜索和刷新 */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white/80 backdrop-blur-sm rounded-2xl p-6 shadow-xl border border-[#8ECAE6]/30"
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-[#023047] flex items-center gap-2 font-songti">
            <FaSearch className="w-5 h-5 text-[#219EBC]" />
            搜索和刷新
          </h3>
          <motion.button
            onClick={handleRefresh}
            disabled={refreshing}
            className="px-3 py-2 bg-[#FFB703] text-[#023047] rounded-lg hover:bg-[#FB8500] transition disabled:opacity-50 text-sm font-medium flex items-center gap-2"
            whileTap={tapScale(0.95)}
          >
            <FaSync className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            刷新
          </motion.button>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <input
            className="flex-1 px-3 py-2 border border-[#8ECAE6]/30 rounded-lg focus:ring-2 focus:ring-[#FFB703] focus:border-[#FFB703] transition-all duration-200 text-[#023047] placeholder-[#023047]/30"
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
        className="bg-white/80 backdrop-blur-sm rounded-2xl p-6 shadow-xl border border-[#8ECAE6]/30"
      >
        <h3 className="text-lg font-semibold text-[#023047] mb-4 flex items-center gap-2 font-songti">
          <FaPlus className="w-5 h-5 text-[#FFB703]" />
          创建短链
        </h3>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 sm:gap-0 mb-4">
          <div className="hidden sm:block"></div>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full sm:w-auto">
            {/* 导出按钮 */}
            <motion.button
              onClick={handleExportAll}
              disabled={exportingAll || links.length === 0}
              className="w-full sm:w-auto px-3 sm:px-4 py-2 sm:py-2 text-sm sm:text-base bg-[#219EBC] text-white rounded-lg hover:bg-[#219EBC]/80 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 font-medium flex items-center justify-center gap-2"
              whileHover={hoverScale(1.02, !exportingAll && links.length > 0)}
              whileTap={tapScale(0.98, !exportingAll && links.length > 0)}
            >
              {exportingAll ? (
                <>
                  <FaSync className="animate-spin w-3 h-3 sm:w-4 sm:h-4" />
                  <span className="hidden sm:inline">导出中...</span>
                  <span className="sm:hidden">导出中</span>
                </>
              ) : (
                <>
                  <FaDownload className="w-3 h-3 sm:w-4 sm:h-4" />
                  <span className="hidden sm:inline">导出短链</span>
                  <span className="sm:hidden">导出</span>
                </>
              )}
            </motion.button>

            {/* 导入按钮 */}
            <div className="relative">
              <input
                type="file"
                accept=".txt"
                onChange={handleFileSelect}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                disabled={importingData}
              />
              <motion.button
                disabled={importingData}
                className="w-full sm:w-auto px-3 sm:px-4 py-2 sm:py-2 text-sm sm:text-base bg-[#8ECAE6]/15 text-[#023047] border border-[#8ECAE6]/30 rounded-lg hover:bg-[#8ECAE6]/20 hover:border-[#219EBC] disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 font-medium flex items-center justify-center gap-2"
                whileHover={hoverScale(1.02, !importingData)}
                whileTap={tapScale(0.98, !importingData)}
              >
                {importingData ? (
                  <>
                    <FaSync className="animate-spin w-3 h-3 sm:w-4 sm:h-4" />
                    <span className="hidden sm:inline">导入中...</span>
                    <span className="sm:hidden">导入中</span>
                  </>
                ) : (
                  <>
                    <FaUpload className="w-3 h-3 sm:w-4 sm:h-4" />
                    <span className="hidden sm:inline">导入短链</span>
                    <span className="sm:hidden">导入</span>
                  </>
                )}
              </motion.button>
            </div>

            {/* 删除全部按钮 */}
            <motion.button
              onClick={handleDeleteAll}
              disabled={deletingAll || links.length === 0}
              className="w-full sm:w-auto px-3 sm:px-4 py-2 sm:py-2 text-sm sm:text-base bg-red-500 text-white rounded-lg hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 font-medium flex items-center justify-center gap-2"
              whileHover={hoverScale(1.02, !deletingAll && links.length > 0)}
              whileTap={tapScale(0.98, !deletingAll && links.length > 0)}
            >
              {deletingAll ? (
                <>
                  <FaSync className="animate-spin w-3 h-3 sm:w-4 sm:h-4" />
                  <span className="hidden sm:inline">删除中...</span>
                  <span className="sm:hidden">删除中</span>
                </>
              ) : (
                <>
                  <FaTrash className="w-3 h-3 sm:w-4 sm:h-4" />
                  <span className="hidden sm:inline">删除全部</span>
                  <span className="sm:hidden">删除全部</span>
                </>
              )}
            </motion.button>

            {/* 批量操作按钮 */}
            <motion.button
              onClick={toggleSelectMode}
              className={`w-full sm:w-auto px-3 sm:px-4 py-2 sm:py-2 text-sm sm:text-base rounded-lg transition-all duration-200 font-medium flex items-center justify-center gap-2 ${isSelectMode
                ? 'bg-[#FB8500] text-white hover:bg-[#FB8500]/80'
                : 'bg-[#8ECAE6]/10 text-[#023047]/70 border border-[#8ECAE6]/30 hover:bg-[#8ECAE6]/20 hover:text-[#023047] hover:border-[#219EBC]'
                }`}
              whileHover={hoverScale(1.02)}
              whileTap={tapScale(0.98)}
            >
              {isSelectMode ? <FaToggleOn className="w-3 h-3 sm:w-4 sm:h-4" /> : <FaToggleOff className="w-3 h-3 sm:w-4 sm:h-4" />}
              <span className="hidden sm:inline">{isSelectMode ? '退出选择' : '批量选择'}</span>
              <span className="sm:hidden">{isSelectMode ? '退出' : '批量'}</span>
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
              className="mb-4 pt-4 border-t border-[#8ECAE6]/30"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-sm text-[#023047]/70">
                    已选择 {selectedLinks.size} 个短链
                  </span>
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                    <motion.button
                      onClick={selectAllLinks}
                      className="w-full sm:w-auto px-2 sm:px-3 py-1 text-xs sm:text-sm bg-[#8ECAE6]/15 text-[#023047] rounded hover:bg-[#8ECAE6]/25 transition border border-[#8ECAE6]/30"
                      whileTap={tapScale(0.95)}
                    >
                      全选
                    </motion.button>
                    <motion.button
                      onClick={clearSelection}
                      className="w-full sm:w-auto px-2 sm:px-3 py-1 text-xs sm:text-sm bg-[#8ECAE6]/10 text-[#023047]/70 rounded hover:bg-[#8ECAE6]/20 transition border border-[#8ECAE6]/30"
                      whileTap={tapScale(0.95)}
                    >
                      清空选择
                    </motion.button>
                  </div>
                </div>

                {selectedLinks.size > 0 && (
                  <motion.button
                    onClick={handleBatchDelete}
                    disabled={batchDeleting}
                    className="w-full sm:w-auto px-3 sm:px-4 py-2 text-sm sm:text-base bg-red-500 text-white rounded-lg hover:bg-red-600 transition disabled:opacity-50 font-medium flex items-center justify-center gap-2"
                    whileHover={hoverScale(1.02)}
                    whileTap={tapScale(0.98)}
                  >
                    <FaTrash className="w-3 h-3 sm:w-4 sm:h-4" />
                    <span className="hidden sm:inline">{batchDeleting ? '删除中...' : `删除 ${selectedLinks.size} 个`}</span>
                    <span className="sm:hidden">{batchDeleting ? '删除中' : `删除${selectedLinks.size}个`}</span>
                  </motion.button>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* 目标地址输入 */}
          <div>
            <label className="block text-sm font-medium text-[#023047] mb-2">
              目标地址 *
            </label>
            <input
              className="w-full px-3 py-2 border border-[#8ECAE6]/30 rounded-lg focus:ring-2 focus:ring-[#FFB703] focus:border-[#FFB703] transition-all duration-200 text-[#023047] placeholder-[#023047]/30"
              placeholder="请输入要生成短链的目标地址（如 https://...）"
              value={createTarget}
              onChange={e => setCreateTarget(e.target.value)}
              disabled={creating}
            />
          </div>

          {/* 自定义码输入 */}
          <div>
            <label className="block text-sm font-medium text-[#023047] mb-2">
              自定义短链码（可选）
            </label>
            <div className="flex items-center space-x-2">
              <input
                className="flex-1 px-3 py-2 border border-[#8ECAE6]/30 rounded-l-lg focus:ring-2 focus:ring-[#FFB703] focus:border-[#FFB703] transition-all duration-200 text-[#023047] placeholder-[#023047]/30"
                placeholder="自定义短链接码"
                value={customCode}
                onChange={e => {
                  setCustomCode(e.target.value);
                  validateCustomCode(e.target.value);
                }}
                disabled={creating}
              />
              <motion.button
                className="px-3 py-2 bg-[#FB8500] text-white rounded-r-lg hover:bg-[#FB8500]/80 transition disabled:opacity-50 flex items-center gap-2 transform-gpu will-change-transform touch-manipulation select-none"
                onClick={generateRandomCode}
                disabled={creating}
                title="生成随机短链接码"
                whileTap={tapScale(0.95)}
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
              className="mt-3 flex items-center justify-between text-sm text-[#023047]/70 bg-[#8ECAE6]/10 p-3 rounded-lg border border-[#8ECAE6]/30"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
            >
              <span className="flex items-center gap-2">
                <FaInfoCircle className="text-[#219EBC]" />
                自定义短链接码提示：只能包含字母、数字、连字符(-)和下划线(_)，长度1-200个字符。留空则自动生成随机短链接码。
              </span>
              <button
                className="w-full sm:w-auto px-2 sm:px-3 py-1 text-xs sm:text-sm bg-[#8ECAE6]/15 text-[#023047]/70 rounded hover:bg-[#8ECAE6]/25 transition flex items-center justify-center gap-1 border border-[#8ECAE6]/30"
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
              className={`mt-3 flex items-center gap-2 text-sm p-3 rounded-lg border ${codeValidation.isValid
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

        {/* 创建按钮 — CTA: bg-[#FFB703] hover:bg-[#FB8500] */}
        <div className="mt-4">
          <motion.button
            onClick={handleCreate}
            disabled={creating}
            className={`w-full py-2 sm:py-3 px-4 sm:px-6 text-sm sm:text-base rounded-lg font-semibold transition-all duration-200 ${creating
              ? 'bg-[#023047]/20 text-[#023047]/50 cursor-not-allowed'
              : 'bg-[#FFB703] text-[#023047] hover:bg-[#FB8500] shadow-lg shadow-[#FFB703]/20 hover:shadow-xl'
              }`}
            whileHover={hoverScale(1.02, !creating)}
            whileTap={tapScale(0.98, !creating)}
          >
            {creating ? (
              <div className="flex items-center justify-center space-x-2">
                <div className="w-4 h-4 sm:w-5 sm:h-5 border-b-2 border-[#FFB703] rounded-full animate-spin" />
                <span className="hidden sm:inline">创建中...</span>
                <span className="sm:hidden">创建中</span>
              </div>
            ) : (
              <div className="flex items-center justify-center space-x-2">
                <FaPlus className="w-4 h-4 sm:w-5 sm:h-5" />
                <span className="hidden sm:inline">创建短链</span>
                <span className="sm:hidden">创建</span>
              </div>
            )}
          </motion.button>
        </div>
      </motion.div>

      {/* 短链列表 */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white/80 backdrop-blur-sm rounded-2xl p-6 shadow-xl border border-[#8ECAE6]/30"
      >
        <h3 className="text-lg font-semibold text-[#023047] mb-4 flex items-center gap-2 font-songti">
          <FaLink className="w-5 h-5 text-[#FFB703]" />
          短链列表
          {totalItems > 0 && (
            <span className="text-sm text-[#023047]/50 bg-[#8ECAE6]/15 px-2 py-1 rounded-full border border-[#8ECAE6]/30">
              共 {totalItems} 个
              {search && ` (筛选后)`}
            </span>
          )}
        </h3>

        {/* 桌面端表格视图 */}
        <div className="hidden md:block">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm text-[#023047]">
              <thead className="sticky top-0 z-10 bg-white">
                <tr className="bg-[#8ECAE6]/10 border-b border-[#8ECAE6]/30">
                  {isSelectMode && (
                    <th className="py-3 px-3 text-center font-semibold text-[#023047] w-12">
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
                        className="rounded border-[#8ECAE6]/30 text-[#FFB703] focus:ring-[#FFB703]"
                      />
                    </th>
                  )}
                  <th className="py-3 px-3 text-left font-semibold text-[#023047] font-songti">短链码</th>
                  <th className="py-3 px-3 text-left font-semibold text-[#023047] font-songti">目标地址</th>
                  <th className="py-3 px-3 text-left font-semibold text-[#023047] font-songti">创建时间</th>
                  <th className="py-3 px-3 text-left font-semibold text-[#023047] font-songti">用户</th>
                  <th className="py-3 px-3 text-left font-semibold text-[#023047] font-songti">用户ID</th>
                  <th className="py-3 px-3 text-center font-semibold text-[#023047] font-songti">操作</th>
                </tr>
              </thead>
            </table>
          </div>

          {/* 虚拟滚动容器 */}
          <div
            ref={containerRef}
            className="overflow-auto border border-[#8ECAE6]/30 rounded-b-lg"
            style={{ height: useVirtualScrolling ? `${containerHeight}px` : 'auto', maxHeight: `${containerHeight}px` }}
            onScroll={useVirtualScrolling ? handleScroll : undefined}
          >
            <div style={{ height: useVirtualScrolling ? `${totalItems * itemHeight}px` : 'auto', position: 'relative' }}>
              <div style={{ transform: useVirtualScrolling ? `translateY(${offsetY}px)` : 'none' }}>
                <table className="min-w-full text-sm text-[#023047]">
                  <tbody>
                    {loading ? (
                      <tr>
                        <td colSpan={6} className="text-center py-12">
                          <div className="flex items-center justify-center gap-2">
                            <div className="w-5 h-5 border-b-2 border-[#FFB703] rounded-full animate-spin" />
                            <span className="text-lg font-medium text-[#023047]/70">加载中…</span>
                          </div>
                        </td>
                      </tr>
                    ) : totalItems === 0 ? (
                      <tr>
                        <td colSpan={isSelectMode ? 7 : 6} className="text-center py-12 text-[#023047]/30">
                          <div className="flex flex-col items-center gap-2">
                            <FaList className="text-3xl text-[#8ECAE6]/50" />
                            <div className="text-lg font-medium text-[#023047]/50">暂无短链</div>
                            <div className="text-sm text-[#023047]/30">快去生成吧！</div>
                          </div>
                        </td>
                      </tr>
                    ) : (useVirtualScrolling ? visibleItems : links).map((link) => (
                      <tr
                        key={link._id}
                        className={`border-b border-[#8ECAE6]/20 hover:bg-[#8ECAE6]/10 ${highlightedId === link._id ? 'bg-[#FFB703]/10' : ''}`}
                        style={{ height: `${itemHeight}px` }}
                      >
                        {isSelectMode && (
                          <td className="whitespace-nowrap px-6 py-4 text-center">
                            <input
                              type="checkbox"
                              checked={selectedLinks.has(link._id)}
                              onChange={() => toggleSelectLink(link._id)}
                              className="rounded border-[#8ECAE6]/30 text-[#FFB703] focus:ring-[#FFB703]"
                            />
                          </td>
                        )}
                        <td
                          className="py-3 px-3 font-mono text-[#219EBC] break-all max-w-[120px] cursor-pointer hover:text-[#023047] transition font-semibold"
                          onClick={() => window.open(`${getApiBaseUrl()}/s/${link.code}`, '_blank')}
                        >
                          {link.code}
                        </td>
                        <td className="py-3 px-3 break-all max-w-[180px] text-[#023047]">{link.target}</td>
                        <td className="py-3 px-3 whitespace-nowrap text-[#023047]/70">{new Date(link.createdAt).toLocaleString()}</td>
                        <td className="py-3 px-3 break-all max-w-[80px] text-[#023047] font-medium">{link.username || 'admin'}</td>
                        <td className="py-3 px-3 break-all max-w-[80px] text-[#023047]/50 text-xs">{link.userId || 'admin'}</td>
                        <td className="py-3 px-3 text-center">
                          <div className="flex gap-2 justify-center">
                            <motion.button
                              className="flex items-center justify-center bg-[#8ECAE6]/15 hover:bg-[#8ECAE6]/25 text-[#219EBC] rounded-lg px-2 py-1 shadow-sm hover:shadow-md transition-all duration-150 border border-[#8ECAE6]/30"
                              title="复制短链"
                              onClick={() => handleCopy(link.code)}
                              data-copy-code={link.code}
                              whileHover={hoverScale(1.1)}
                              whileTap={tapScale(0.9)}
                            >
                              <FaCopy className="w-4 h-4" />
                            </motion.button>
                            <motion.button
                              className="flex items-center justify-center bg-red-50 hover:bg-red-100 text-red-500 rounded-lg px-2 py-1 shadow-sm hover:shadow-md transition-all duration-150 border border-red-200"
                              title="删除"
                              onClick={() => handleDelete(link._id)}
                              whileHover={hoverScale(1.1)}
                              whileTap={tapScale(0.9)}
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
                  <div className="bg-white/80 rounded-lg shadow p-6 text-center border border-[#8ECAE6]/30">
                    <div className="flex items-center justify-center gap-2">
                      <div className="w-5 h-5 border-b-2 border-[#FFB703] rounded-full animate-spin" />
                      <span className="text-lg font-medium text-[#023047]/70">加载中…</span>
                    </div>
                  </div>
                ) : totalItems === 0 ? (
                  <div className="bg-white/80 rounded-lg shadow p-6 text-center border border-[#8ECAE6]/30">
                    <div className="flex flex-col items-center gap-2">
                      <FaList className="text-3xl text-[#8ECAE6]/50" />
                      <div className="text-lg font-medium text-[#023047]/50">暂无短链</div>
                      <div className="text-sm text-[#023047]/30">快去生成吧！</div>
                    </div>
                  </div>
                ) : (useVirtualScrolling ? visibleItems : links).map((link) => (
                  <div
                    key={link._id}
                    className={`bg-white/80 rounded-lg shadow-sm border border-[#8ECAE6]/30 p-4 ${highlightedId === link._id ? 'ring-2 ring-[#FFB703]/30 bg-[#FFB703]/5' : ''}`}
                    style={{ minHeight: `${itemHeight}px` }}
                  >
                    {/* 短链码区域 */}
                    <div className="flex items-center justify-between mb-3 gap-2">
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        {isSelectMode && (
                          <input
                            type="checkbox"
                            checked={selectedLinks.has(link._id)}
                            onChange={() => toggleSelectLink(link._id)}
                            className="rounded border-[#8ECAE6]/30 text-[#FFB703] focus:ring-[#FFB703] mr-2 flex-shrink-0"
                          />
                        )}
                        <div
                          className="font-mono text-lg font-bold text-[#219EBC] cursor-pointer truncate"
                          onClick={() => window.open(`${getApiBaseUrl()}/s/${link.code}`, '_blank')}
                        >
                          {link.code}
                        </div>
                      </div>
                      <div className="flex gap-1 flex-shrink-0">
                        <motion.button
                          className="flex items-center justify-center bg-[#8ECAE6]/15 hover:bg-[#8ECAE6]/25 text-[#219EBC] rounded-lg p-1.5 sm:p-2 shadow-sm hover:shadow-md transition-all duration-150 border border-[#8ECAE6]/30"
                          title="复制短链"
                          onClick={() => handleCopy(link.code)}
                          data-copy-code={link.code}
                          whileHover={hoverScale(1.1)}
                          whileTap={tapScale(0.9)}
                        >
                          <FaCopy className="w-3 h-3 sm:w-4 sm:h-4" />
                        </motion.button>
                        <motion.button
                          className="flex items-center justify-center bg-red-50 hover:bg-red-100 text-red-500 rounded-lg p-1.5 sm:p-2 shadow-sm hover:shadow-md transition-all duration-150 border border-red-200"
                          title="删除"
                          onClick={() => handleDelete(link._id)}
                          whileHover={hoverScale(1.1)}
                          whileTap={tapScale(0.9)}
                        >
                          <FaTrash className="w-3 h-3 sm:w-4 sm:h-4" />
                        </motion.button>
                      </div>
                    </div>

                    {/* 目标地址 */}
                    <div className="mb-3">
                      <div className="text-xs text-[#023047]/50 mb-1">目标地址</div>
                      <div className="text-sm text-[#023047] break-all">{link.target}</div>
                    </div>

                    {/* 底部信息 */}
                    <div className="flex flex-col gap-2 text-xs text-[#023047]/50">
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-1">
                          <span className="text-[#023047]/30">用户:</span>
                          <span className="text-[#023047]">{link.username || 'admin'}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <span className="text-[#023047]/30">时间:</span>
                          <span className="text-[#023047]">{new Date(link.createdAt).toLocaleDateString()}</span>
                        </div>
                      </div>
                      <div className="text-[#023047]/30">
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
          className="bg-white/80 backdrop-blur-sm rounded-2xl p-6 shadow-xl border border-[#8ECAE6]/30"
        >
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-2">
            <div className="flex items-center gap-1">
              {/* 首页按钮 */}
              <motion.button
                onClick={handleFirstPage}
                disabled={page === 1}
                className={`p-1.5 sm:p-2 rounded-lg transition-all duration-200 ${page === 1
                  ? 'text-[#023047]/30 cursor-not-allowed'
                  : 'text-[#023047]/70 hover:bg-[#8ECAE6]/20 hover:text-[#023047]'
                  }`}
                whileHover={hoverScale(1.05, page !== 1)}
                whileTap={tapScale(0.95, page !== 1)}
              >
                <FaAngleDoubleLeft className="w-3 h-3 sm:w-4 sm:h-4" />
              </motion.button>

              {/* 上一页按钮 */}
              <motion.button
                onClick={handlePrevPage}
                disabled={page === 1}
                className={`p-1.5 sm:p-2 rounded-lg transition-all duration-200 ${page === 1
                  ? 'text-[#023047]/30 cursor-not-allowed'
                  : 'text-[#023047]/70 hover:bg-[#8ECAE6]/20 hover:text-[#023047]'
                  }`}
                whileHover={hoverScale(1.05, page !== 1)}
                whileTap={tapScale(0.95, page !== 1)}
              >
                <FaChevronLeft className="w-3 h-3 sm:w-4 sm:h-4" />
              </motion.button>

              {/* 页码按钮 */}
              <div className="flex items-center gap-1 mx-1 sm:mx-2">
                {generatePageNumbers().map((pageNum) => (
                  <motion.button
                    key={pageNum}
                    onClick={() => handlePageChange(pageNum)}
                    className={`px-2 sm:px-3 py-1 sm:py-2 rounded-lg text-xs sm:text-sm font-medium transition-all duration-200 ${pageNum === page
                      ? 'bg-[#FFB703] text-[#023047] shadow-lg shadow-[#FFB703]/20'
                      : 'text-[#023047]/70 hover:bg-[#8ECAE6]/20 hover:text-[#023047]'
                      }`}
                    whileHover={hoverScale(1.05)}
                    whileTap={tapScale(0.95)}
                  >
                    {pageNum}
                  </motion.button>
                ))}
              </div>

              {/* 下一页按钮 */}
              <motion.button
                onClick={handleNextPage}
                disabled={page === totalPages}
                className={`p-1.5 sm:p-2 rounded-lg transition-all duration-200 ${page === totalPages
                  ? 'text-[#023047]/30 cursor-not-allowed'
                  : 'text-[#023047]/70 hover:bg-[#8ECAE6]/20 hover:text-[#023047]'
                  }`}
                whileHover={hoverScale(1.05, page !== totalPages)}
                whileTap={tapScale(0.95, page !== totalPages)}
              >
                <FaChevronRight className="w-3 h-3 sm:w-4 sm:h-4" />
              </motion.button>

              {/* 末页按钮 */}
              <motion.button
                onClick={handleLastPage}
                disabled={page === totalPages}
                className={`p-1.5 sm:p-2 rounded-lg transition-all duration-200 ${page === totalPages
                  ? 'text-[#023047]/30 cursor-not-allowed'
                  : 'text-[#023047]/70 hover:bg-[#8ECAE6]/20 hover:text-[#023047]'
                  }`}
                whileHover={hoverScale(1.05, page !== totalPages)}
                whileTap={tapScale(0.95, page !== totalPages)}
              >
                <FaAngleDoubleRight className="w-3 h-3 sm:w-4 sm:h-4" />
              </motion.button>
            </div>

            {/* 页面信息 */}
            <div className="text-xs sm:text-sm text-[#023047]/70 bg-[#8ECAE6]/10 px-2 sm:px-3 py-1 sm:py-2 rounded-lg border border-[#8ECAE6]/30">
              <span className="hidden sm:inline">第 {page} / {totalPages} 页，共 {total} 条记录</span>
              <span className="sm:hidden">{page}/{totalPages} ({total}条)</span>
            </div>
          </div>
        </motion.div>
      )}
    </div>
  );
};

export default ShortLinkManager;
