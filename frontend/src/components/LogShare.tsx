import React, { useState, useRef, useEffect } from 'react';
import ReactDOM from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import axios from 'axios';
import { useNotification } from './Notification';
import getApiBaseUrl from '../api';
import { useAuth } from '../hooks/useAuth';
import { useLocation } from 'react-router-dom';
import CryptoJS from 'crypto-js';
import {
  FaClipboard,
  FaUpload,
  FaDownload,
  FaLink,
  FaCopy,
  FaEye,
  FaEyeSlash,
  FaSync,
  FaArchive,
  FaCloud,
  FaCompress,
  FaTrash,
  FaSearch,
  FaHistory,
  FaFileImport,
  FaFileExport,
  FaLock,
  FaTimes,
  FaCheck,
  FaEdit,
} from 'react-icons/fa';
import { getAuthToken } from '../utils/authSession';
import {
  getStoredHistory,
  saveHistoryToStorage,
  deleteHistoryFromStorage,
  clearAllHistory,
  exportHistoryData,
  importHistoryData,
  checkAndFixLogShareDB,
  generateHistoryId,
  LogShareHistory
} from '../utils/logShareStorage';

// 优化性能：将工具函数移到组件外部，避免每次渲染时重新创建
const isTextExt = (ext: string) => ['.txt', '.log', '.json', '.md'].includes(ext);

type EncryptedLogSharePayload = {
  data: string;
  iv: string;
  version?: number;
  algorithm?: string;
  kdf?: string;
  iterations?: number;
  salt?: string;
  tag?: string;
};

type LogShareQueryResult = { content: string; ext: string; encoding?: string };
type LogShareListItem = { id: string; ext: string; uploadTime: string; size: number };
type LogShareExportType = 'plain' | 'base64' | 'aes256';
type CryptoJsWordArrayLike = {
  toString(encoder?: typeof CryptoJS.enc.Utf8): string;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const isEncryptedLogSharePayload = (value: unknown): value is EncryptedLogSharePayload =>
  isRecord(value) && typeof value.data === 'string' && typeof value.iv === 'string';

const isLogShareExportType = (value: string): value is LogShareExportType =>
  value === 'plain' || value === 'base64' || value === 'aes256';

const normalizeQueryResult = (value: unknown): LogShareQueryResult => {
  if (!isRecord(value)) {
    throw new Error('日志数据格式无效');
  }

  return {
    content: typeof value.content === 'string' ? value.content : '',
    ext: typeof value.ext === 'string' && value.ext.trim() ? value.ext : 'unknown',
    encoding: typeof value.encoding === 'string' ? value.encoding : undefined,
  };
};

const normalizeLogList = (value: unknown): LogShareListItem[] => {
  if (!isRecord(value) || !Array.isArray(value.logs)) return [];

  return value.logs
    .filter(isRecord)
    .map((log) => ({
      id: typeof log.id === 'string' ? log.id : '',
      ext: typeof log.ext === 'string' ? log.ext : 'unknown',
      uploadTime: typeof log.uploadTime === 'string' ? log.uploadTime : '',
      size: Number.isFinite(Number(log.size)) ? Number(log.size) : 0,
    }))
    .filter((log) => log.id);
};

const hexToBytes = (hex: string): Uint8Array => {
  if (!/^[0-9a-f]*$/i.test(hex) || hex.length % 2 !== 0) {
    throw new Error('加密数据格式无效');
  }
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i += 1) {
    bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
};

const toBufferSource = (bytes: Uint8Array): Uint8Array<ArrayBuffer> => {
  const buffer = new ArrayBuffer(bytes.byteLength);
  const view = new Uint8Array(buffer);
  view.set(bytes);
  return view;
};

const decryptLogSharePayload = async (payload: EncryptedLogSharePayload, key: string): Promise<unknown> => {
  if (payload.version === 2 && payload.algorithm === 'aes-256-gcm' && payload.salt && payload.tag) {
    const keyBytes = toBufferSource(new TextEncoder().encode(key));
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      keyBytes,
      { name: 'PBKDF2' },
      false,
      ['deriveKey'],
    );
    const derivedKey = await crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: toBufferSource(hexToBytes(payload.salt)),
        iterations: payload.iterations || 120000,
        hash: 'SHA-512',
      },
      keyMaterial,
      { name: 'AES-GCM', length: 256 },
      false,
      ['decrypt'],
    );
    const encrypted = hexToBytes(payload.data);
    const tag = hexToBytes(payload.tag);
    const sealed = new Uint8Array(encrypted.length + tag.length);
    sealed.set(encrypted);
    sealed.set(tag, encrypted.length);
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: toBufferSource(hexToBytes(payload.iv)) },
      derivedKey,
      toBufferSource(sealed),
    );
    return JSON.parse(new TextDecoder().decode(decrypted));
  }

  const keyHash = CryptoJS.PBKDF2(key, 'logshare-salt', {
    keySize: 256 / 32,
    iterations: 10000,
    hasher: CryptoJS.algo.SHA512,
  }).toString(CryptoJS.enc.Hex);
  const legacyKey = CryptoJS.enc.Hex.parse(keyHash);
  const iv = CryptoJS.enc.Hex.parse(payload.iv);
  const encryptedData = CryptoJS.enc.Hex.parse(payload.data);
  const decrypted = CryptoJS.AES.decrypt(
    { ciphertext: encryptedData },
    legacyKey,
    { iv, mode: CryptoJS.mode.CBC, padding: CryptoJS.pad.Pkcs7 },
  );
  return safeDecode(decrypted);
};

// 安全的解码函数，支持多种编码格式
const safeDecode = (decrypted: CryptoJsWordArrayLike): unknown => {
  const utf8String = decrypted.toString(CryptoJS.enc.Utf8);
  if (!utf8String) {
    throw new Error('解密结果为空');
  }
  return JSON.parse(utf8String);
};

const inputClass =
  'w-full rounded-2xl border border-slate-200 bg-white/80 px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 transition focus:border-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-300';

const primaryButtonClass =
  'inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2';

const secondaryButtonClass =
  'inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white/80 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:text-slate-900';

const dangerButtonClass =
  'inline-flex items-center gap-2 rounded-2xl border border-rose-200 bg-rose-50/80 px-4 py-2.5 text-sm font-semibold text-rose-700 transition hover:border-rose-300 hover:bg-rose-100';

const LogShare: React.FC = React.memo(() => {
  const { user } = useAuth();
  const location = useLocation();
  const [adminPassword, setAdminPassword] = useState('');
  const [logContent, setLogContent] = useState('');
  const [uploadResult, setUploadResult] = useState<{ link: string, ext: string } | null>(null);
  const [queryId, setQueryId] = useState('');
  const [queryResult, setQueryResult] = useState<LogShareQueryResult | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [copied, setCopied] = useState(false);
  const [uploadHistory, setUploadHistory] = useState<{ link: string, ext: string, time: string }[]>([]);
  const [queryHistory, setQueryHistory] = useState<{ id: string, ext: string, time: string }[]>([]);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [exportType, setExportType] = useState<LogShareExportType>('plain');
  const { setNotification } = useNotification();
  const [showPwdModal, setShowPwdModal] = useState(false);
  const [autoQueryId, setAutoQueryId] = useState<string | null>(null);
  const [allLogs, setAllLogs] = useState<LogShareListItem[]>([]);
  const [isLoadingAllLogs, setIsLoadingAllLogs] = useState(false);
  const [selectedLogIndex, setSelectedLogIndex] = useState<number | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [editingLog, setEditingLog] = useState<{ id: string, fileName?: string, note?: string } | null>(null);
  const [editFileName, setEditFileName] = useState('');
  const [editNote, setEditNote] = useState('');

  // Archive related state
  const [archives, setArchives] = useState<any[]>([]);
  const [isLoadingArchives, setIsLoadingArchives] = useState(false);
  const [archiveLoading, setArchiveLoading] = useState(false);
  const [archiveName, setArchiveName] = useState('');
  const [includePattern, setIncludePattern] = useState('');
  const [excludePattern, setExcludePattern] = useState('');
  const [showArchiveModal, setShowArchiveModal] = useState(false);

  // 加载历史记录
  const loadHistory = async () => {
    try {
      await checkAndFixLogShareDB();
      const history = await getStoredHistory();

      const uploadItems = history
        .filter(item => item.type === 'upload' && item.data.link && item.data.ext)
        .map(item => ({
          link: item.data.link!,
          ext: item.data.ext!,
          time: item.data.time
        }))
        .slice(0, 10);

      const queryItems = history
        .filter(item => item.type === 'query' && item.data.queryId)
        .map(item => ({
          id: item.data.queryId!,
          ext: item.data.ext || '',
          time: item.data.time
        }))
        .slice(0, 10);

      setUploadHistory(uploadItems);
      setQueryHistory(queryItems);
    } catch (error) {
      console.error('加载历史记录失败:', error);
    }
  };

  // 选择相关
  const toggleSelect = (id: string) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };
  const selectAll = () => {
    if (selectedIds.length === allLogs.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(allLogs.map(l => l.id));
    }
  };

  // 删除单个
  const handleDeleteOne = async (id: string) => {
    try {
      await axios.delete(getApiBaseUrl() + `/api/sharelog/${id}`, {
        headers: { 'Authorization': `Bearer ${getAuthToken()}` }
      });
      setNotification({ message: '删除成功', type: 'success' });
      await loadAllLogs();
    } catch (e: any) {
      setNotification({ message: e.response?.data?.error || '删除失败', type: 'error' });
    }
  };

  // 批量删除
  const handleBatchDelete = async () => {
    if (selectedIds.length === 0) {
      setNotification({ message: '请先选择要删除的日志', type: 'warning' });
      return;
    }
    try {
      await axios.post(getApiBaseUrl() + '/api/sharelog/delete-batch', { ids: selectedIds }, {
        headers: { 'Authorization': `Bearer ${getAuthToken()}` }
      });
      setNotification({ message: '批量删除成功', type: 'success' });
      await loadAllLogs();
    } catch (e: any) {
      setNotification({ message: e.response?.data?.error || '批量删除失败', type: 'error' });
    }
  };

  // 全部删除
  const handleDeleteAll = async () => {
    if (allLogs.length === 0) {
      setNotification({ message: '暂无可删除日志', type: 'info' });
      return;
    }
    if (!confirm('确定要删除所有日志吗？该操作不可恢复')) return;
    try {
      await axios.delete(getApiBaseUrl() + '/api/sharelog/all', {
        headers: { 'Authorization': `Bearer ${getAuthToken()}` }
      });
      setNotification({ message: '已清空所有日志', type: 'success' });
      await loadAllLogs();
    } catch (e: any) {
      setNotification({ message: e.response?.data?.error || '清空失败', type: 'error' });
    }
  };

  // Archive related functions
  const loadArchives = async () => {
    setIsLoadingArchives(true);
    try {
      const res = await axios.get(getApiBaseUrl() + '/api/logs/archives', {
        headers: {
          'Authorization': `Bearer ${getAuthToken()}`
        }
      });
      setArchives(res.data.archives || []);
      setNotification({ message: '归档列表加载成功', type: 'success' });
    } catch (e: any) {
      setNotification({ message: e.response?.data?.error || '加载归档列表失败', type: 'error' });
    } finally {
      setIsLoadingArchives(false);
    }
  };

  const handleCreateArchive = async () => {
    if (!adminPassword) {
      setNotification({ message: '请先输入管理员密码', type: 'warning' });
      return;
    }

    setArchiveLoading(true);
    try {
      const res = await axios.post(getApiBaseUrl() + '/api/logs/archive', {
        archiveName: archiveName || undefined,
        includePattern: includePattern || undefined,
        excludePattern: excludePattern || undefined
      }, {
        headers: {
          'Authorization': `Bearer ${getAuthToken()}`
        }
      });

      setNotification({
        message: `归档创建成功！已归档 ${res.data.archivedFiles} 个文件，压缩率 ${res.data.overallCompressionRatio}，IPFS上传 ${res.data.ipfsUpload.uploadedFiles} 个文件`,
        type: 'success'
      });

      setShowArchiveModal(false);
      setArchiveName('');
      setIncludePattern('');
      setExcludePattern('');
      await loadArchives();
    } catch (e: any) {
      setNotification({ message: e.response?.data?.error || '创建归档失败', type: 'error' });
    } finally {
      setArchiveLoading(false);
    }
  };

  const handleDeleteArchive = async (archiveName: string) => {
    if (!confirm(`确定要删除归档 "${archiveName}" 吗？此操作不可恢复！`)) {
      return;
    }

    try {
      await axios.delete(getApiBaseUrl() + `/api/logs/archives/${archiveName}`, {
        headers: {
          'Authorization': `Bearer ${getAuthToken()}`
        }
      });

      setNotification({ message: '归档删除成功', type: 'success' });
      await loadArchives();
    } catch (e: any) {
      setNotification({ message: e.response?.data?.error || '删除归档失败', type: 'error' });
    }
  };

  // 编辑元数据
  const openEdit = (log: { id: string }) => {
    const existing = allLogs.find(l => l.id === log.id);
    setEditingLog({ id: log.id });
    setEditFileName('');
    setEditNote('');
  };
  const handleEditSave = async () => {
    if (!editingLog) return;
    if (!editFileName && !editNote) {
      setNotification({ message: '请至少填写一个可修改字段', type: 'warning' });
      return;
    }
    try {
      await axios.put(getApiBaseUrl() + `/api/sharelog/${editingLog.id}`, {
        fileName: editFileName || undefined,
        note: editNote || undefined,
      }, {
        headers: { 'Authorization': `Bearer ${getAuthToken()}` }
      });
      setNotification({ message: '保存成功', type: 'success' });
      setEditingLog(null);
      setEditFileName('');
      setEditNote('');
      await loadAllLogs();
    } catch (e: any) {
      setNotification({ message: e.response?.data?.error || '保存失败', type: 'error' });
    }
  };

  // 初始化时加载历史记录
  useEffect(() => {
    loadHistory();
  }, []);

  // 点击外部关闭导出菜单
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Element;
      if (!target.closest('.export-menu-container')) {
        setShowExportMenu(false);
      }
    };

    if (showExportMenu) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showExportMenu]);

  // 检查URL参数
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const id = params.get('id');
    if (id) {
      setQueryId(id);
      setAutoQueryId(id);
    }
  }, [location.search]);

  // 管理员校验后自动弹窗输入密码
  useEffect(() => {
    if (user && user.role === 'admin' && autoQueryId) {
      setShowPwdModal(true);
    }
  }, [user, autoQueryId]);

  // 自动查询
  const handleAutoQuery = async () => {
    setShowPwdModal(false);
    if (adminPassword && autoQueryId) {
      setQueryId(autoQueryId);
      await handleQuery();
      setAutoQueryId(null);
    }
  };

  useEffect(() => {
    if (uploadResult && uploadResult.link) {
      // 安全地复制到剪贴板，处理焦点问题
      navigator.clipboard.writeText(uploadResult.link).then(() => {
        setNotification({ message: '上传成功，链接已复制', type: 'success' });
      }).catch((error) => {
        console.log('剪贴板复制失败:', error);
        setNotification({ message: '上传成功，但链接复制失败', type: 'success' });
      });
    }
  }, [uploadResult, setNotification]);

  // 计算文本大小（UTF-8字节数）
  const getTextSizeInBytes = (text: string): number => {
    return new Blob([text]).size;
  };

  // 格式化文件大小显示
  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes}B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
    return `${(bytes / 1024 / 1024).toFixed(2)}MB`;
  };

  // 获取当前文本大小
  const currentTextSize = logContent ? getTextSizeInBytes(logContent) : 0;
  const maxSize = 10 * 1024 * 1024; // 10MB
  const isTextTooLarge = currentTextSize > maxSize;

  // 上传日志/文件
  const handleUpload = async () => {
    setError('');
    setSuccess('');
    setUploadResult(null);

    // 客户端文件大小验证
    if (file && file.size > 10 * 1024 * 1024) {
      setError(`文件过大！当前文件大小：${(file.size / 1024 / 1024).toFixed(2)}MB，最大支持10MB`);
      return;
    }

    // 客户端文本大小验证
    if (!file && logContent && isTextTooLarge) {
      setError(`文本内容过大！当前大小：${formatFileSize(currentTextSize)}，最大支持10MB`);
      return;
    }

    setLoading(true);
    try {
      let res;
      if (file) {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('adminPassword', adminPassword);
        res = await axios.post(getApiBaseUrl() + '/api/sharelog', formData, {
          headers: { 'Content-Type': 'multipart/form-data' }
        });
      } else {
        // 兼容纯文本上传
        const blob = new Blob([logContent], { type: 'text/plain' });
        const formData = new FormData();
        formData.append('file', blob, 'log.txt');
        formData.append('adminPassword', adminPassword);
        res = await axios.post(getApiBaseUrl() + '/api/sharelog', formData, {
          headers: { 'Content-Type': 'multipart/form-data' }
        });
      }
      if (res.data.link) {
        setUploadResult({ link: res.data.link, ext: res.data.ext });
        setSuccess('上传成功！');

        // 保存到 IndexedDB
        const historyItem: LogShareHistory = {
          id: generateHistoryId(),
          type: 'upload',
          data: {
            link: res.data.link,
            ext: res.data.ext,
            time: new Date().toLocaleString()
          },
          createdAt: new Date().toISOString()
        };

        await saveHistoryToStorage(historyItem);
        await loadHistory(); // 重新加载历史记录
      } else {
        setError('上传失败');
      }
    } catch (e: any) {
      setError(e.response?.data?.error || '上传失败');
    } finally {
      setLoading(false);
    }
  };

  // 查询日志/文件
  const handleQuery = async () => {
    setError('');
    setSuccess('');
    setQueryResult(null);
    setLoading(true);

    try {
      const res = await axios.post(getApiBaseUrl() + `/api/sharelog/${queryId}`, {
        adminPassword,
        id: queryId
      });

      let resolvedResult: LogShareQueryResult;
      // 检查是否为加密数据
      if (isEncryptedLogSharePayload(res.data)) {
        if (!adminPassword) {
          throw new Error('管理员密码不存在，无法解密');
        }

        try {
          resolvedResult = normalizeQueryResult(await decryptLogSharePayload(res.data, adminPassword));
          setQueryResult(resolvedResult);
        } catch (decryptError: any) {
          console.error('🔓 [LogShare] 解密失败:', decryptError);
          setError('数据解密失败: ' + (decryptError?.message || '未知错误'));
          return;
        }
      } else {
        // 未加密数据
        resolvedResult = normalizeQueryResult(res.data);
        setQueryResult(resolvedResult);
      }

      setSuccess('查询成功！');

      // 保存到 IndexedDB
      const ext = resolvedResult?.ext || 'unknown';

      const historyItem: LogShareHistory = {
        id: generateHistoryId(),
        type: 'query',
        data: {
          queryId: queryId,
          ext: ext,
          time: new Date().toLocaleString()
        },
        createdAt: new Date().toISOString()
      };

      await saveHistoryToStorage(historyItem);
      await loadHistory(); // 重新加载历史记录
    } catch (e: any) {
      setError(e.response?.data?.error || '查询失败');
    } finally {
      setLoading(false);
    }
  };

  // 获取所有日志列表
  const loadAllLogs = async () => {
    setIsLoadingAllLogs(true);
    try {
      const res = await axios.get(getApiBaseUrl() + '/api/sharelog/all', {
        headers: {
          'Authorization': `Bearer ${getAuthToken()}`
        }
      });

      // 检查是否为加密数据
      if (isEncryptedLogSharePayload(res.data)) {
        const token = getAuthToken();
        if (!token) {
          throw new Error('Token不存在，无法解密');
        }

        try {
          setAllLogs(normalizeLogList(await decryptLogSharePayload(res.data, token)));
        } catch (decryptError: any) {
          console.error('🔓 [LogShare] 解密失败:', decryptError);
          setNotification({ message: '数据解密失败: ' + (decryptError?.message || '未知错误'), type: 'error' });
          return;
        }
      } else {
        // 未加密数据
        setAllLogs(normalizeLogList(res.data));
      }

      // 刷新列表后清空选择
      setSelectedIds([]);
      setNotification({ message: '日志列表加载成功', type: 'success' });
    } catch (e: any) {
      setNotification({ message: e.response?.data?.error || '加载日志列表失败', type: 'error' });
    } finally {
      setIsLoadingAllLogs(false);
    }
  };

  // 查看指定日志
  const viewLog = async (logId: string) => {
    setLoading(true);
    try {
      const res = await axios.post(getApiBaseUrl() + `/api/sharelog/${logId}`, {
        adminPassword,
        id: logId
      });

      // 检查是否为加密数据
      if (isEncryptedLogSharePayload(res.data)) {
        if (!adminPassword) {
          throw new Error('管理员密码不存在，无法解密');
        }

        try {
          setQueryResult(normalizeQueryResult(await decryptLogSharePayload(res.data, adminPassword)));
        } catch (decryptError: any) {
          console.error('🔓 [LogShare] 解密失败:', decryptError);
          setNotification({ message: '数据解密失败: ' + (decryptError?.message || '未知错误'), type: 'error' });
          return;
        }
      } else {
        // 未加密数据
        setQueryResult(normalizeQueryResult(res.data));
      }

      setQueryId(logId);
      setSuccess('查看成功！');
    } catch (e: any) {
      setNotification({ message: e.response?.data?.error || '查看日志失败', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  // 导出历史记录
  const handleExport = async () => {
    try {
      await exportHistoryData(exportType);
      setNotification({ message: '导出成功', type: 'success' });
      setShowExportMenu(false);
    } catch (error: any) {
      setNotification({ message: error.message, type: 'error' });
    }
  };

  // 导入历史记录
  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const newCount = await importHistoryData(file);
      await loadHistory();
      setNotification({ message: `导入成功！新增 ${newCount} 条记录`, type: 'success' });
    } catch (error: any) {
      setNotification({ message: error.message, type: 'error' });
    }

    e.target.value = '';
  };

  // 清除所有历史记录
  const handleClear = async () => {
    if (window.confirm('确定要清空所有历史记录吗？此操作不可恢复！')) {
      try {
        await clearAllHistory();
        setUploadHistory([]);
        setQueryHistory([]);
        setNotification({ message: '历史记录已清空', type: 'success' });
      } catch (error: any) {
        setNotification({ message: '清空失败: ' + error.message, type: 'error' });
      }
    }
  };

  // 下载文件
  const handleDownload = () => {
    if (!queryResult) return;
    const { content, ext, encoding } = queryResult;
    let blob;
    if (encoding === 'base64') {
      // 修正：base64转Uint8Array再转Blob，避免undefined
      const binaryString = atob(content);
      const len = binaryString.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      blob = new Blob([bytes]);
    } else {
      blob = new Blob([content], { type: 'text/plain' });
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sharelog${ext || ''}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  useEffect(() => {
    if (error) {
      setNotification({ message: error, type: 'error' });
      setError('');
    }
  }, [error, setNotification]);

  useEffect(() => {
    if (success) {
      setNotification({ message: success, type: 'success' });
      setSuccess('');
    }
  }, [success, setNotification]);

  // 管理员校验
  if (!user || user.role !== 'admin') {
    return (
      <section className="mx-auto max-w-6xl px-4 py-10 sm:py-12">
        <motion.div
          className="relative overflow-hidden rounded-[34px] border border-white/70 bg-white/88 p-6 shadow-[0_28px_110px_rgba(15,23,42,0.1)] backdrop-blur-xl sm:p-10"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          <div className="pointer-events-none absolute -right-16 top-0 h-48 w-48 rounded-full bg-[radial-gradient(circle,_rgba(244,63,94,0.18),_transparent_68%)]" />
          <div className="pointer-events-none absolute -left-10 bottom-0 h-40 w-40 rounded-full bg-[radial-gradient(circle,_rgba(244,63,94,0.12),_transparent_70%)]" />
          <div className="relative">
            <div className="inline-flex items-center gap-2 rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.28em] text-rose-500">
              <FaLock className="text-[10px]" /> ACCESS DENIED
            </div>
            <h1 className="mt-5 text-3xl font-semibold leading-tight text-slate-900 sm:text-4xl">访问被拒绝</h1>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-600 sm:text-base">
              你不是管理员，禁止访问！请用管理员账号登录后再来。
            </p>
            <div className="mt-3 text-sm italic text-rose-500">LogShare 仅限管理员使用</div>
          </div>
        </motion.div>
      </section>
    );
  }

  return (
    <>
      {/* 全屏密码弹窗 — Portal 到 body */}
      {ReactDOM.createPortal(
      <AnimatePresence>
        {showPwdModal && (
          <motion.div
            className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <motion.div
              className="relative w-full max-w-sm overflow-hidden rounded-[28px] border border-white/70 bg-white/95 p-8 shadow-[0_28px_110px_rgba(15,23,42,0.18)] backdrop-blur-xl"
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              transition={{ duration: 0.25 }}
            >
              <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">
                <FaLock className="text-[10px]" /> AUTH
              </div>
              <h3 className="mt-4 text-lg font-semibold text-slate-900">请输入管理员密码</h3>
              <input
                type="password"
                className={`mt-4 ${inputClass}`}
                value={adminPassword}
                onChange={e => setAdminPassword(e.target.value)}
                autoFocus
                placeholder="管理员密码"
                onKeyDown={e => { if (e.key === 'Enter') handleAutoQuery(); }}
              />
              <div className="mt-5 flex gap-2">
                <button
                  className={`${primaryButtonClass} flex-1`}
                  onClick={handleAutoQuery}
                  disabled={!adminPassword}
                >查询日志</button>
                <button
                  className={`${secondaryButtonClass} flex-1 justify-center`}
                  onClick={() => setShowPwdModal(false)}
                >取消</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      , document.body)}

      {/* 主体内容 */}
      <section className="mx-auto max-w-6xl px-4 py-10 sm:py-12">
        <motion.div
          className="space-y-6"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          {/* 标题和说明 */}
          <motion.div
            className="relative overflow-hidden rounded-[34px] border border-white/70 bg-white/88 p-6 shadow-[0_28px_110px_rgba(15,23,42,0.1)] backdrop-blur-xl sm:p-10"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
          >
            <div className="pointer-events-none absolute -right-16 top-0 h-48 w-48 rounded-full bg-[radial-gradient(circle,_rgba(59,130,246,0.22),_transparent_68%)]" />
            <div className="pointer-events-none absolute -left-10 bottom-0 h-40 w-40 rounded-full bg-[radial-gradient(circle,_rgba(14,165,233,0.16),_transparent_70%)]" />
            <div className="relative">
              <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">
                <FaClipboard className="text-[10px]" /> LOG SHARE
              </div>
              <h1 className="mt-5 text-3xl font-semibold leading-tight text-slate-900 sm:text-4xl">日志/文件剪贴板上传 &amp; 查询</h1>
              <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-600 sm:text-base">
                支持文本、日志、json 等类型，单文件最大 10MB。仅管理员可操作。
              </p>
              <div className="mt-5 grid gap-2 text-sm leading-7 text-slate-600 sm:grid-cols-2">
                <div className="flex items-start gap-2">
                  <FaCheck className="mt-1.5 flex-shrink-0 text-[10px] text-slate-400" />
                  <span>支持文件上传和文本粘贴</span>
                </div>
                <div className="flex items-start gap-2">
                  <FaCheck className="mt-1.5 flex-shrink-0 text-[10px] text-slate-400" />
                  <span>自动生成分享链接</span>
                </div>
                <div className="flex items-start gap-2">
                  <FaCheck className="mt-1.5 flex-shrink-0 text-[10px] text-slate-400" />
                  <span>支持加密存储和查询</span>
                </div>
                <div className="flex items-start gap-2">
                  <FaCheck className="mt-1.5 flex-shrink-0 text-[10px] text-slate-400" />
                  <span>提供历史记录管理</span>
                </div>
              </div>
            </div>
          </motion.div>

          {/* 上传区块 */}
          <motion.div
            className="relative overflow-hidden rounded-[26px] border border-white/70 bg-white/82 p-5 shadow-[0_18px_60px_rgba(15,23,42,0.06)] backdrop-blur-xl sm:p-7"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.05 }}
          >
            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.26em] text-slate-500">
              <FaUpload className="text-slate-500" /> Upload
            </div>
            <h3 className="mt-2 text-xl font-semibold text-slate-900">上传日志 / 文件</h3>

            <div className="mt-5 space-y-4">
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">管理员密码</label>
                <input
                  type="password"
                  className={inputClass}
                  value={adminPassword}
                  onChange={e => setAdminPassword(e.target.value)}
                  autoComplete="off"
                />
              </div>

              <div>
                <div className="mb-2 flex items-center justify-between">
                  <label className="text-sm font-medium text-slate-700">
                    日志内容（粘贴或输入）或选择文件
                  </label>
                  {logContent && (
                    <div className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${isTextTooLarge
                      ? 'border-rose-200 bg-rose-50/80 text-rose-700'
                      : currentTextSize > maxSize * 0.8
                        ? 'border-amber-200 bg-amber-50/80 text-amber-700'
                        : 'border-emerald-200 bg-emerald-50/80 text-emerald-700'
                      }`}>
                      {formatFileSize(currentTextSize)} / 10MB
                    </div>
                  )}
                </div>
                <textarea
                  className={`w-full rounded-2xl border bg-white/80 px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 transition focus:outline-none focus:ring-2 ${isTextTooLarge
                    ? 'border-rose-300 focus:border-rose-400 focus:ring-rose-200'
                    : currentTextSize > maxSize * 0.8
                      ? 'border-amber-300 focus:border-amber-400 focus:ring-amber-200'
                      : 'border-slate-200 focus:border-slate-400 focus:ring-slate-300'
                    }`}
                  rows={6}
                  value={logContent}
                  onChange={e => setLogContent(e.target.value)}
                  disabled={!!file}
                  placeholder="可直接粘贴日志内容，或选择文件上传"
                />
                {isTextTooLarge && (
                  <div className="mt-2 rounded-[22px] border border-rose-200/70 bg-rose-50/80 px-4 py-3 text-sm leading-6 text-rose-700">
                    文本内容超出 10MB 限制，请删减内容或使用文件上传
                  </div>
                )}
                {!isTextTooLarge && currentTextSize > maxSize * 0.8 && (
                  <div className="mt-2 rounded-[22px] border border-amber-200/70 bg-amber-50/80 px-4 py-3 text-sm leading-6 text-amber-700">
                    文本内容接近 10MB 限制，建议考虑使用文件上传
                  </div>
                )}
              </div>

              <div>
                <input
                  type="file"
                  ref={fileInputRef}
                  className="mb-2 block w-full text-sm text-slate-600 file:mr-4 file:rounded-2xl file:border-0 file:bg-slate-900 file:px-4 file:py-2.5 file:text-sm file:font-semibold file:text-white hover:file:bg-slate-800"
                  onChange={e => setFile(e.target.files?.[0] || null)}
                />
                <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4 text-sm leading-6 text-slate-600">
                  <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">文件上传说明</div>
                  <div className="space-y-1 text-xs text-slate-600">
                    <div>• <strong className="text-slate-700">支持格式：</strong>.txt, .log, .json, .md, .xml, .csv</div>
                    <div>• <strong className="text-slate-700">文件大小：</strong>最大支持 10MB</div>
                    <div>• <strong className="text-slate-700">上传方式：</strong>可直接拖拽文件或点击选择</div>
                  </div>
                </div>
              </div>

              <AnimatePresence>
                {file && (
                  <motion.div
                    className="flex items-center gap-2 text-sm text-slate-600"
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    transition={{ duration: 0.2 }}
                  >
                    <span>已选择文件: <span className="font-medium text-slate-900">{file.name}</span></span>
                    <button
                      className="text-rose-500 hover:text-rose-700"
                      onClick={() => { setFile(null); if (fileInputRef.current) fileInputRef.current.value = ''; }}
                    >
                      移除
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>

              <motion.button
                className={primaryButtonClass}
                onClick={handleUpload}
                disabled={loading || !adminPassword || (!logContent && !file)}
                whileTap={{ scale: 0.97 }}
              >
                {loading ? (
                  <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                ) : (
                  <FaUpload className="text-xs" />
                )}
                {loading ? '上传中...' : '上传日志/文件'}
              </motion.button>

              <AnimatePresence>
                {uploadResult && uploadResult.link && (
                  <motion.div
                    className="rounded-[22px] border border-emerald-200/70 bg-emerald-50/80 px-5 py-4 text-sm leading-6 text-emerald-800"
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    transition={{ duration: 0.25 }}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <FaCheck className="text-[10px]" />
                      <span className="font-semibold">上传成功，访问链接：</span>
                      <a href={uploadResult.link} className="underline" target="_blank" rel="noopener noreferrer">
                        {uploadResult.link}
                      </a>
                      <span className="text-emerald-600">({uploadResult.ext})</span>
                      <AnimatePresence>
                        {copied && (
                          <motion.span
                            className="ml-1 text-xs text-emerald-600"
                            initial={{ opacity: 0, scale: 0.8 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.8 }}
                            transition={{ duration: 0.2 }}
                          >
                            已自动复制
                          </motion.span>
                        )}
                      </AnimatePresence>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>

          {/* 查询区块 */}
          <motion.div
            className="relative overflow-hidden rounded-[26px] border border-white/70 bg-white/82 p-5 shadow-[0_18px_60px_rgba(15,23,42,0.06)] backdrop-blur-xl sm:p-7"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.1 }}
          >
            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.26em] text-slate-500">
              <FaSearch className="text-slate-500" /> Query
            </div>
            <h3 className="mt-2 text-xl font-semibold text-slate-900">查询日志 / 文件内容</h3>

            <div className="mt-5 space-y-4">
              <div className="flex flex-wrap gap-2">
                <motion.button
                  onClick={loadAllLogs}
                  disabled={isLoadingAllLogs}
                  className={primaryButtonClass}
                  whileTap={{ scale: 0.97 }}
                >
                  {isLoadingAllLogs ? (
                    <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                  ) : (
                    <FaSync className="text-xs" />
                  )}
                  {isLoadingAllLogs ? '加载中...' : '查看所有日志'}
                </motion.button>

                {allLogs.length > 0 && (
                  <>
                    <motion.button
                      onClick={handleBatchDelete}
                      className={dangerButtonClass}
                      whileTap={{ scale: 0.97 }}
                    >
                      <FaTrash className="text-xs" />
                      批量删除
                    </motion.button>
                    <motion.button
                      onClick={handleDeleteAll}
                      className={secondaryButtonClass}
                      whileTap={{ scale: 0.97 }}
                    >
                      清空所有
                    </motion.button>
                  </>
                )}
              </div>

              {/* 所有日志列表 */}
              {allLogs.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="overflow-hidden rounded-[26px] border border-slate-200 bg-white/80 backdrop-blur-xl"
                >
                  <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/60 px-4 py-3">
                    <label className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-400"
                        checked={selectedIds.length === allLogs.length && allLogs.length > 0}
                        onChange={selectAll}
                      />
                      全选（已选 {selectedIds.length}）
                    </label>
                    <span className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">{allLogs.length} 条</span>
                  </div>
                  <div className="max-h-[60vh] overflow-y-auto">
                    {allLogs.map((log, index) => (
                      <motion.div
                        key={log.id}
                        initial={{ opacity: 0, y: 4 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: Math.min(index * 0.03, 0.2) }}
                        className={`border-b border-slate-100/70 px-4 py-3 transition hover:bg-slate-50/50 ${selectedLogIndex === index ? 'bg-slate-50' : ''}`}
                      >
                        <div className="flex items-start gap-3">
                          <input
                            type="checkbox"
                            className="mt-1.5 h-4 w-4 shrink-0 rounded border-slate-300 text-slate-900 focus:ring-slate-400"
                            checked={selectedIds.includes(log.id)}
                            onChange={() => toggleSelect(log.id)}
                          />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <div
                                className="max-w-[60vw] cursor-pointer truncate text-sm font-medium text-slate-900 sm:max-w-none"
                                onClick={() => { setSelectedLogIndex(index); viewLog(log.id); }}
                              >
                                {log.id}
                              </div>
                              <span className="inline-block rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600">
                                {log.ext || '未知'}
                              </span>
                            </div>
                            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500">
                              <span>{new Date(log.uploadTime).toLocaleString()}</span>
                              <span>{(log.size / 1024).toFixed(1)}KB</span>
                            </div>
                            <div className="mt-2 grid grid-cols-3 gap-2 sm:flex sm:items-center sm:gap-2">
                              <button
                                className="rounded-xl border border-slate-200 bg-white/80 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-slate-300 hover:text-slate-900"
                                onClick={() => viewLog(log.id)}
                                aria-label="查看"
                              >
                                查看
                              </button>
                              <button
                                className="rounded-xl border border-slate-200 bg-white/80 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-slate-300 hover:text-slate-900"
                                onClick={() => openEdit(log)}
                                aria-label="编辑"
                              >
                                编辑
                              </button>
                              <button
                                className="rounded-xl border border-rose-200 bg-rose-50/80 px-3 py-1.5 text-xs font-semibold text-rose-700 transition hover:border-rose-300 hover:bg-rose-100"
                                onClick={() => handleDeleteOne(log.id)}
                                aria-label="删除"
                              >
                                删除
                              </button>
                            </div>
                          </div>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                </motion.div>
              )}

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">日志 / 文件 ID</label>
                <input
                  className={inputClass}
                  value={queryId}
                  onChange={e => setQueryId(e.target.value)}
                  placeholder="请输入上传后返回的ID"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">管理员密码</label>
                <input
                  type="password"
                  className={inputClass}
                  value={adminPassword}
                  onChange={e => setAdminPassword(e.target.value)}
                  autoComplete="off"
                />
              </div>

              <motion.button
                className={primaryButtonClass}
                onClick={handleQuery}
                disabled={loading || !adminPassword || !queryId}
                whileTap={{ scale: 0.97 }}
              >
                {loading ? (
                  <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                ) : (
                  <FaSearch className="text-xs" />
                )}
                {loading ? '查询中...' : '查询日志/文件'}
              </motion.button>

              <AnimatePresence>
                {queryResult && (
                  <motion.div
                    className="mt-2 space-y-3"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 8 }}
                    transition={{ duration: 0.25 }}
                  >
                    <div className="text-sm text-slate-600">
                      类型: <span className="font-medium text-slate-900">{queryResult.ext ? queryResult.ext : '未知'}</span>
                      {queryResult.encoding && <span className="ml-1 text-slate-500">({queryResult.encoding})</span>}
                    </div>
                    {isTextExt(queryResult.ext) ? (
                      <div className="space-y-3">
                        <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">文本文件预览</div>
                        <pre className="max-h-64 overflow-auto rounded-2xl border border-slate-200 bg-slate-900 p-4 font-mono text-xs leading-6 text-slate-100 whitespace-pre-wrap">
                          {queryResult.content}
                        </pre>
                        <motion.button
                          className={secondaryButtonClass}
                          onClick={handleDownload}
                          whileTap={{ scale: 0.97 }}
                        >
                          <FaDownload className="text-xs" />
                          下载文本文件
                        </motion.button>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <div className="rounded-[22px] border border-amber-200/70 bg-amber-50/80 px-5 py-4 text-sm leading-6 text-amber-700">
                          二进制 / 非文本文件，点击下载：
                        </div>
                        <motion.button
                          className={secondaryButtonClass}
                          onClick={handleDownload}
                          whileTap={{ scale: 0.97 }}
                        >
                          <FaDownload className="text-xs" />
                          下载文件
                        </motion.button>
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>

          {/* 历史记录 */}
          <motion.div
            className="relative overflow-hidden rounded-[26px] border border-white/70 bg-white/82 p-5 shadow-[0_18px_60px_rgba(15,23,42,0.06)] backdrop-blur-xl sm:p-7"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.15 }}
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.26em] text-slate-500">
                  <FaHistory className="text-slate-500" /> History
                </div>
                <h3 className="mt-2 text-xl font-semibold text-slate-900">历史记录</h3>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {/* 导入按钮 */}
                <div className="relative">
                  <input
                    type="file"
                    accept=".json"
                    onChange={handleImport}
                    className="hidden"
                    id="import-file-input"
                  />
                  <motion.button
                    className={secondaryButtonClass}
                    whileTap={{ scale: 0.97 }}
                    onClick={() => document.getElementById('import-file-input')?.click()}
                  >
                    <FaFileImport className="text-xs" />
                    导入
                  </motion.button>
                </div>

                {/* 导出菜单 */}
                <div className="export-menu-container relative">
                  <motion.button
                    onClick={() => setShowExportMenu(!showExportMenu)}
                    className={secondaryButtonClass}
                    whileTap={{ scale: 0.97 }}
                  >
                    <FaFileExport className="text-xs" />
                    导出
                  </motion.button>

                  <AnimatePresence>
                    {showExportMenu && (
                      <motion.div
                        className="absolute right-0 top-full z-10 mt-2 min-w-[220px] rounded-2xl border border-slate-200 bg-white/95 p-2 shadow-[0_18px_60px_rgba(15,23,42,0.12)] backdrop-blur-xl"
                        initial={{ opacity: 0, y: -6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -6 }}
                      >
                        <label className="flex cursor-pointer items-center gap-2 rounded-xl p-2 hover:bg-slate-50">
                          <input
                            type="radio"
                            value="plain"
                            checked={exportType === 'plain'}
                            onChange={(e) => {
                              if (isLogShareExportType(e.target.value)) setExportType(e.target.value);
                            }}
                            className="text-slate-900 focus:ring-slate-400"
                          />
                          <span className="text-sm text-slate-700">明文导出</span>
                        </label>
                        <label className="flex cursor-pointer items-center gap-2 rounded-xl p-2 hover:bg-slate-50">
                          <input
                            type="radio"
                            value="base64"
                            checked={exportType === 'base64'}
                            onChange={(e) => {
                              if (isLogShareExportType(e.target.value)) setExportType(e.target.value);
                            }}
                            className="text-slate-900 focus:ring-slate-400"
                          />
                          <span className="text-sm text-slate-700">Base64 编码</span>
                        </label>
                        <label className="flex cursor-pointer items-center gap-2 rounded-xl p-2 hover:bg-slate-50">
                          <input
                            type="radio"
                            value="aes256"
                            checked={exportType === 'aes256'}
                            onChange={(e) => {
                              if (isLogShareExportType(e.target.value)) setExportType(e.target.value);
                            }}
                            className="text-slate-900 focus:ring-slate-400"
                          />
                          <span className="text-sm text-slate-700">AES-256 加密</span>
                        </label>
                        <button
                          onClick={handleExport}
                          className="mt-2 w-full rounded-xl bg-slate-900 px-3 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
                        >
                          确认导出
                        </button>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {/* 清除按钮 */}
                <motion.button
                  onClick={handleClear}
                  className={dangerButtonClass}
                  whileTap={{ scale: 0.97 }}
                >
                  <FaTrash className="text-xs" />
                  清除
                </motion.button>
              </div>
            </div>

            <div className="mt-5 grid grid-cols-1 gap-5 md:grid-cols-2">
              {/* 上传历史 */}
              <div className="rounded-2xl border border-slate-200 bg-white/80 p-4">
                <div className="mb-3 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">
                  <FaUpload className="text-slate-500" /> Uploads
                </div>
                <div className="space-y-2">
                  {uploadHistory.length === 0 && (
                    <div className="text-sm text-slate-400">暂无上传记录</div>
                  )}
                  {uploadHistory.map((item, idx) => (
                    <motion.div
                      key={idx}
                      className="flex items-center gap-2 rounded-xl px-2 py-2 text-sm hover:bg-slate-50"
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.2, delay: 0.04 * idx }}
                    >
                      <a
                        href={item.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-1 truncate text-slate-700 underline-offset-2 hover:text-slate-900 hover:underline"
                      >
                        {item.link}
                      </a>
                      <span className="text-xs text-slate-500">({item.ext})</span>
                      <span className="text-xs text-slate-400">{item.time}</span>
                    </motion.div>
                  ))}
                </div>
              </div>

              {/* 查询历史 */}
              <div className="rounded-2xl border border-slate-200 bg-white/80 p-4">
                <div className="mb-3 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">
                  <FaSearch className="text-slate-500" /> Queries
                </div>
                <div className="space-y-2">
                  {queryHistory.length === 0 && (
                    <div className="text-sm text-slate-400">暂无查询记录</div>
                  )}
                  {queryHistory.map((item, idx) => (
                    <motion.div
                      key={idx}
                      className="flex items-center gap-2 rounded-xl px-2 py-2 text-sm hover:bg-slate-50"
                      initial={{ opacity: 0, x: 8 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.2, delay: 0.04 * idx }}
                    >
                      <button
                        className="flex-1 truncate text-left text-slate-700 underline-offset-2 hover:text-slate-900 hover:underline"
                        onClick={() => { setQueryId(item.id); setQueryResult(null); setSuccess(''); setError(''); }}
                      >
                        {item.id}
                      </button>
                      <span className="text-xs text-slate-500">{item.ext ? `(${item.ext})` : ''}</span>
                      <span className="text-xs text-slate-400">{item.time}</span>
                    </motion.div>
                  ))}
                </div>
              </div>
            </div>
          </motion.div>

          {/* 日志归档管理区块 */}
          <motion.div
            className="relative overflow-hidden rounded-[26px] border border-white/70 bg-white/82 p-5 shadow-[0_18px_60px_rgba(15,23,42,0.06)] backdrop-blur-xl sm:p-7"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.2 }}
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.26em] text-slate-500">
                  <FaArchive className="text-slate-500" /> Archive
                </div>
                <h3 className="mt-2 text-xl font-semibold text-slate-900">日志归档管理</h3>
              </div>
              <input
                type="password"
                className={`${inputClass} w-44`}
                value={adminPassword}
                onChange={e => setAdminPassword(e.target.value)}
                placeholder="管理员密码"
                autoComplete="off"
              />
            </div>

            <div className="mt-5 flex flex-wrap gap-2">
              <motion.button
                onClick={() => setShowArchiveModal(true)}
                className={primaryButtonClass}
                whileTap={{ scale: 0.97 }}
                disabled={!adminPassword}
              >
                <FaCompress className="text-xs" />
                创建归档
              </motion.button>
              <motion.button
                onClick={loadArchives}
                className={secondaryButtonClass}
                whileTap={{ scale: 0.97 }}
                disabled={isLoadingArchives}
              >
                <FaSync className={`text-xs ${isLoadingArchives ? 'animate-spin' : ''}`} />
                刷新列表
              </motion.button>
            </div>

            <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50/60 p-4 text-sm leading-6 text-slate-600">
              <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">归档功能说明</div>
              <div className="space-y-1 text-xs text-slate-600">
                <div>• <strong className="text-slate-700">压缩存储：</strong>自动使用 gzip 压缩，节省存储空间</div>
                <div>• <strong className="text-slate-700">IPFS 上传：</strong>压缩文件自动上传到 IPFS 分布式存储</div>
                <div>• <strong className="text-slate-700">本地清理：</strong>上传成功后自动删除本地压缩文件</div>
                <div>• <strong className="text-slate-700">模式匹配：</strong>支持正则表达式过滤文件</div>
              </div>
            </div>

            {/* 归档列表 */}
            <div className="mt-5 space-y-3">
              {isLoadingArchives ? (
                <div className="flex items-center justify-center gap-2 py-6 text-sm text-slate-500">
                  <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  加载归档列表中...
                </div>
              ) : archives.length === 0 ? (
                <div className="py-6 text-center text-sm text-slate-400">暂无归档记录</div>
              ) : (
                archives.map((archive, idx) => (
                  <motion.div
                    key={archive.archiveName}
                    className="rounded-2xl border border-slate-200 bg-white/80 p-4 backdrop-blur-xl"
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.2, delay: 0.04 * idx }}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1">
                        <div className="mb-2 flex flex-wrap items-center gap-2">
                          <FaArchive className="text-slate-500" />
                          <span className="font-semibold text-slate-900">{archive.archiveName}</span>
                          {archive.ipfsUpload?.enabled && (
                            <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200/70 bg-emerald-50/80 px-2 py-0.5 text-[10px] font-medium text-emerald-700">
                              <FaCloud className="text-[10px]" />
                              IPFS 已上传
                            </span>
                          )}
                        </div>
                        <div className="space-y-1.5 text-sm">
                          <div className="flex items-center justify-between">
                            <span className="text-slate-500">创建时间</span>
                            <span className="text-slate-700">{new Date(archive.createdAt).toLocaleString()}</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-slate-500">创建者</span>
                            <span className="text-slate-700">{archive.createdBy}</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-slate-500">文件数量</span>
                            <span className="text-slate-700">{archive.totalFiles}</span>
                          </div>
                          {archive.databaseLogsIncluded !== undefined && (
                            <div className="flex items-center justify-between">
                              <span className="text-slate-500">数据库日志</span>
                              <span className="text-slate-700">{archive.databaseLogsIncluded}</span>
                            </div>
                          )}
                          {archive.fileSystemLogsIncluded !== undefined && (
                            <div className="flex items-center justify-between">
                              <span className="text-slate-500">文件系统日志</span>
                              <span className="text-slate-700">{archive.fileSystemLogsIncluded}</span>
                            </div>
                          )}
                          <div className="flex items-center justify-between">
                            <span className="text-slate-500">原始大小</span>
                            <span className="text-slate-700">{formatFileSize(archive.originalTotalSize)}</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-slate-500">压缩后大小</span>
                            <span className="text-slate-700">{formatFileSize(archive.compressedTotalSize)}</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-slate-500">压缩率</span>
                            <span className="font-medium text-emerald-600">{archive.overallCompressionRatio}</span>
                          </div>
                          {archive.ipfsUpload && (
                            <>
                              <div className="flex items-center justify-between">
                                <span className="text-slate-500">IPFS 上传</span>
                                <span className={`font-medium ${archive.ipfsUpload.uploadedFiles > 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                                  {archive.ipfsUpload.uploadedFiles}/{archive.ipfsUpload.totalFiles}
                                </span>
                              </div>
                              {archive.ipfsUpload.uploadResults && archive.ipfsUpload.uploadResults.length > 0 && archive.ipfsUpload.uploadResults[0].uploadSuccess && (
                                <div className="mt-2 border-t border-slate-100 pt-2">
                                  <div className="mb-1 flex items-center justify-between">
                                    <span className="text-slate-500">IPFS CID</span>
                                    <button
                                      onClick={() => navigator.clipboard.writeText(archive.ipfsUpload.uploadResults[0].ipfsCid)}
                                      className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 font-mono text-xs text-slate-700 transition hover:border-slate-300 hover:text-slate-900"
                                      title="点击复制CID"
                                    >
                                      {archive.ipfsUpload.uploadResults[0].ipfsCid?.substring(0, 20)}...
                                    </button>
                                  </div>
                                  <div className="flex flex-col gap-1">
                                    <a
                                      href={archive.ipfsUpload.uploadResults[0].web2Url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="inline-flex items-center gap-1 text-xs text-slate-700 underline-offset-2 hover:text-slate-900 hover:underline"
                                    >
                                      <FaCloud className="h-3 w-3" />
                                      Web2 下载链接
                                    </a>
                                    <a
                                      href={archive.ipfsUpload.uploadResults[0].ipfsUrl}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="inline-flex items-center gap-1 text-xs text-slate-700 underline-offset-2 hover:text-slate-900 hover:underline"
                                    >
                                      <FaLink className="h-3 w-3" />
                                      IPFS 协议链接
                                    </a>
                                  </div>
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                      <motion.button
                        onClick={() => handleDeleteArchive(archive.archiveName)}
                        className="inline-flex items-center justify-center rounded-xl border border-rose-200 bg-rose-50/80 px-2.5 py-2 text-rose-700 transition hover:border-rose-300 hover:bg-rose-100"
                        whileTap={{ scale: 0.95 }}
                        aria-label="删除归档"
                      >
                        <FaTrash className="text-xs" />
                      </motion.button>
                    </div>
                  </motion.div>
                ))
              )}
            </div>
          </motion.div>

          {/* 创建归档弹窗 — Portal 到 body */}
          {ReactDOM.createPortal(
          <AnimatePresence>
            {showArchiveModal && (
              <motion.div
                className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                <motion.div
                  className="relative w-full max-w-lg overflow-hidden rounded-[28px] border border-white/70 bg-white/95 p-6 shadow-[0_28px_110px_rgba(15,23,42,0.18)] backdrop-blur-xl sm:p-8"
                  initial={{ scale: 0.95, y: 20, opacity: 0 }}
                  animate={{ scale: 1, y: 0, opacity: 1 }}
                  exit={{ scale: 0.95, y: 20, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">
                        <FaArchive className="text-[10px]" /> ARCHIVE
                      </div>
                      <h3 className="mt-3 text-xl font-semibold text-slate-900">创建日志归档</h3>
                    </div>
                    <button
                      className="rounded-xl border border-slate-200 bg-white/80 p-2 text-slate-500 transition hover:border-slate-300 hover:text-slate-900"
                      onClick={() => setShowArchiveModal(false)}
                      aria-label="关闭"
                    >
                      <FaTimes className="text-xs" />
                    </button>
                  </div>

                  <div className="mt-5 space-y-4">
                    <div>
                      <label className="mb-1 block text-sm font-medium text-slate-700">归档名称（可选）</label>
                      <input
                        className={inputClass}
                        placeholder="留空将自动生成时间戳名称"
                        value={archiveName}
                        onChange={(e) => setArchiveName(e.target.value)}
                      />
                    </div>

                    <div>
                      <label className="mb-1 block text-sm font-medium text-slate-700">包含模式（正则表达式，可选）</label>
                      <input
                        className={inputClass}
                        placeholder="例如: \.log$ 只包含.log文件"
                        value={includePattern}
                        onChange={(e) => setIncludePattern(e.target.value)}
                      />
                    </div>

                    <div>
                      <label className="mb-1 block text-sm font-medium text-slate-700">排除模式（正则表达式，可选）</label>
                      <input
                        className={inputClass}
                        placeholder="例如: temp 排除包含temp的文件"
                        value={excludePattern}
                        onChange={(e) => setExcludePattern(e.target.value)}
                      />
                    </div>

                    <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4 text-sm leading-6 text-slate-600">
                      <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">归档流程</div>
                      <div className="space-y-1 text-xs text-slate-600">
                        <div>1. 扫描日志目录中的文件</div>
                        <div>2. 根据模式过滤文件</div>
                        <div>3. 使用 gzip 压缩文件</div>
                        <div>4. 上传压缩文件到 IPFS</div>
                        <div>5. 删除本地压缩文件</div>
                        <div>6. 保存归档元数据</div>
                      </div>
                    </div>
                  </div>

                  <div className="mt-6 flex items-center justify-end gap-2">
                    <button
                      className={secondaryButtonClass}
                      onClick={() => setShowArchiveModal(false)}
                      disabled={archiveLoading}
                    >
                      取消
                    </button>
                    <button
                      className={primaryButtonClass}
                      onClick={handleCreateArchive}
                      disabled={archiveLoading || !adminPassword}
                    >
                      {archiveLoading ? (
                        <>
                          <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                          </svg>
                          创建中...
                        </>
                      ) : (
                        <>
                          <FaCompress className="text-xs" />
                          创建归档
                        </>
                      )}
                    </button>
                  </div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>
          , document.body)}

          {/* 编辑元数据弹窗 — Portal 到 body */}
          {ReactDOM.createPortal(
          <AnimatePresence>
            {editingLog && (
              <motion.div
                className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                <motion.div
                  className="relative w-full max-w-lg overflow-hidden rounded-[28px] border border-white/70 bg-white/95 p-6 shadow-[0_28px_110px_rgba(15,23,42,0.18)] backdrop-blur-xl sm:p-8"
                  initial={{ scale: 0.95, y: 20, opacity: 0 }}
                  animate={{ scale: 1, y: 0, opacity: 1 }}
                  exit={{ scale: 0.95, y: 20, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">
                        <FaEdit className="text-[10px]" /> EDIT
                      </div>
                      <h3 className="mt-3 text-xl font-semibold text-slate-900">编辑日志元数据</h3>
                    </div>
                    <button
                      className="rounded-xl border border-slate-200 bg-white/80 p-2 text-slate-500 transition hover:border-slate-300 hover:text-slate-900"
                      onClick={() => { setEditingLog(null); setEditFileName(''); setEditNote(''); }}
                      aria-label="关闭"
                    >
                      <FaTimes className="text-xs" />
                    </button>
                  </div>
                  <div className="mt-5 space-y-4">
                    <div>
                      <label className="mb-1 block text-sm font-medium text-slate-700">文件名（可选）</label>
                      <input
                        className={inputClass}
                        placeholder="例如：error-2025-08-10.txt"
                        value={editFileName}
                        onChange={(e) => setEditFileName(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-medium text-slate-700">备注（可选）</label>
                      <textarea
                        className={`${inputClass} min-h-[100px]`}
                        placeholder="补充说明、标签等"
                        value={editNote}
                        onChange={(e) => setEditNote(e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="mt-6 flex items-center justify-end gap-2">
                    <button
                      className={secondaryButtonClass}
                      onClick={() => { setEditingLog(null); setEditFileName(''); setEditNote(''); }}
                    >
                      取消
                    </button>
                    <button
                      className={primaryButtonClass}
                      onClick={handleEditSave}
                    >
                      保存
                    </button>
                  </div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>
          , document.body)}

          {/* 全局提示 */}
          {/* 所有提示已用 setNotification 全局弹窗替换 */}
        </motion.div>
      </section>
    </>
  );
});

export default LogShare;
