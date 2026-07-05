import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNotification } from './Notification';
import { getApiBaseUrl } from '../api/api';
import DOMPurify from 'dompurify';
import CryptoJS from 'crypto-js';
import { imageDataApi } from '../api/imageData';
import { openDB, deleteDB } from 'idb';
import { TurnstileWidget } from './TurnstileWidget';
import { useTurnstileConfig } from '../hooks/useTurnstileConfig';
import {
  FaImage,
  FaUpload,
  FaFolder,
  FaDatabase,
  FaDownload,
  FaUpload as FaImport,
  FaTrash,
  FaCheck,
  FaCopy,
  FaEye,
  FaLink
} from 'react-icons/fa';

const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_TYPES = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/bmp',
];
const ACCEPT_ATTR = ALLOWED_TYPES.join(',');
const SAFE_IMAGE_URL_PROTOCOLS = new Set(['blob:', 'http:', 'https:']);

function sanitizeDisplayText(value: unknown, fallback = ''): string {
  const sanitized = DOMPurify.sanitize(String(value ?? ''), {
    ALLOWED_TAGS: [],
    ALLOWED_ATTR: [],
  }).trim();

  return sanitized || fallback;
}

function sanitizeImageUrl(value: unknown): string | undefined {
  const sanitized = sanitizeDisplayText(value);

  if (!sanitized) {
    return undefined;
  }

  try {
    const parsed = new URL(sanitized, window.location.origin);
    return SAFE_IMAGE_URL_PROTOCOLS.has(parsed.protocol) ? sanitized : undefined;
  } catch {
    return undefined;
  }
}

// 1. 新增本地存储相关常量和工具函数
const STORAGE_KEY = 'happy_images';

// IndexedDB 配置
const IMAGE_DB = 'image-store';
const IMAGE_STORE = 'images';

// IndexedDB 数据库操作
async function getImageDB() {
  return await openDB(IMAGE_DB, 2, {
    upgrade(db, oldVersion, newVersion) {
      console.log(`[图片存储] 数据库升级: v${oldVersion} -> v${newVersion}`);

      if (oldVersion < 1) {
        // 初始版本：创建存储对象
        if (!db.objectStoreNames.contains(IMAGE_STORE)) {
          db.createObjectStore(IMAGE_STORE, { keyPath: 'imageId' });
        }
      }

      if (oldVersion < 2) {
        // 版本2：确保使用 imageId 作为 keyPath
        if (db.objectStoreNames.contains(IMAGE_STORE)) {
          db.deleteObjectStore(IMAGE_STORE);
        }
        db.createObjectStore(IMAGE_STORE, { keyPath: 'imageId' });
      }
    },
  });
}

// 获取存储的图片
async function getStoredImages(): Promise<any[]> {
  try {
    const db = await getImageDB();
    const images = await db.getAll(IMAGE_STORE);
    return images || [];
  } catch (error) {
    console.error('[图片存储] 获取图片失败:', error);
    return [];
  }
}

// 保存图片到IndexedDB
async function saveImageToStorage(imageData: any): Promise<void> {
  try {
    const db = await getImageDB();
    // 直接使用 put 方法，如果已存在则更新，不存在则添加
    await db.put(IMAGE_STORE, imageData);
    console.log('[图片存储] 保存成功，imageId:', imageData.imageId);
  } catch (error) {
    console.error('[图片存储] 保存失败:', error);
  }
}

// 从IndexedDB删除图片
async function deleteImageFromStorage(index: number): Promise<void> {
  try {
    const db = await getImageDB();
    const images = await db.getAll(IMAGE_STORE);
    if (images[index]) {
      await db.delete(IMAGE_STORE, images[index].imageId);
      console.log('[图片存储] 删除成功，imageId:', images[index].imageId);
    }
  } catch (error) {
    console.error('[图片存储] 删除失败:', error);
  }
}

// 清空所有图片
async function clearAllImages(): Promise<void> {
  try {
    const db = await getImageDB();
    await db.clear(IMAGE_STORE);
    console.log('[图片存储] 清空成功');
  } catch (error) {
    console.error('[图片存储] 清空失败:', error);
  }
}

// 导出时从IndexedDB获取数据
async function exportImagesFromDB(): Promise<any[]> {
  try {
    const db = await getImageDB();
    const images = await db.getAll(IMAGE_STORE);
    return images || [];
  } catch (error) {
    console.error('[图片存储] 导出获取失败:', error);
    return [];
  }
}

// 导入时保存到IndexedDB
async function importImagesToDB(images: any[]): Promise<void> {
  try {
    const db = await getImageDB();
    // 清空现有数据
    await db.clear(IMAGE_STORE);
    // 添加新数据
    for (const img of images) {
      await db.put(IMAGE_STORE, img);
    }
    console.log('[图片存储] 导入成功，图片数量:', images.length);
  } catch (error) {
    console.error('[图片存储] 导入失败:', error);
  }
}

// 重置数据库（用于处理数据库结构问题）
async function resetImageDB(): Promise<void> {
  try {
    const db = await getImageDB();
    await db.clear(IMAGE_STORE);
    console.log('[图片存储] 数据库重置成功');
  } catch (error) {
    console.error('[图片存储] 数据库重置失败:', error);
    // 如果重置失败，尝试删除并重新创建数据库
    try {
      await deleteDB(IMAGE_DB);
      console.log('[图片存储] 数据库删除成功，将在下次访问时重新创建');
    } catch (deleteError) {
      console.error('[图片存储] 数据库删除失败:', deleteError);
    }
  }
}

// 检查并修复数据库
async function checkAndFixDB(): Promise<void> {
  try {
    const db = await getImageDB();
    // 尝试获取一条记录来测试数据库是否正常工作
    await db.getAll(IMAGE_STORE);
    console.log('[图片存储] 数据库检查通过');
  } catch (error) {
    console.error('[图片存储] 数据库检查失败，尝试重置:', error);
    await resetImageDB();
  }
}

function formatFileSize(bytes: number) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}
function formatDate(dateString: string) {
  const date = new Date(dateString);
  return date.toLocaleDateString('zh-CN') + ' ' + date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
}

// AES-256加密
function encryptAES256(data: string, key: string): { iv: string, data: string } {
  const iv = CryptoJS.lib.WordArray.random(16);
  const keyBytes = CryptoJS.SHA256(key);
  const encrypted = CryptoJS.AES.encrypt(data, keyBytes, {
    iv,
    mode: CryptoJS.mode.CBC,
    padding: CryptoJS.pad.Pkcs7,
  });
  return {
    iv: iv.toString(CryptoJS.enc.Hex),
    data: encrypted.ciphertext.toString(CryptoJS.enc.Hex),
  };
}
// AES-256解密
function decryptAES256(encryptedData: string, iv: string, key: string): string {
  const keyBytes = CryptoJS.SHA256(key);
  const ivBytes = CryptoJS.enc.Hex.parse(iv);
  const encryptedBytes = CryptoJS.enc.Hex.parse(encryptedData);
  const decrypted = CryptoJS.AES.decrypt({ ciphertext: encryptedBytes }, keyBytes, {
    iv: ivBytes,
    mode: CryptoJS.mode.CBC,
    padding: CryptoJS.pad.Pkcs7,
  });
  return decrypted.toString(CryptoJS.enc.Utf8);
}

// 生成图片ID - 兼容性更好的UUID生成方法
function generateImageId(): string {
  // 优先使用 crypto.randomUUID，如果不支持则使用兼容方法
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    try {
      return crypto.randomUUID();
    } catch (error) {
      console.warn('[UUID生成] crypto.randomUUID 失败，使用兼容方法:', error);
    }
  }

  // 兼容性UUID生成方法
  const pattern = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx';
  return pattern.replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
// 生成文件Hash
async function generateFileHash(fileContent: ArrayBuffer): Promise<string> {
  try {
    // 检查 Web Crypto API 是否可用
    if (typeof crypto !== 'undefined' && crypto.subtle && crypto.subtle.digest) {
      const hashBuffer = await crypto.subtle.digest('SHA-256', fileContent);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    } else {
      // 降级方案：使用 CryptoJS 生成 SHA-256
      console.warn('[Hash生成] Web Crypto API 不可用，使用 CryptoJS 降级方案');
      const wordArray = CryptoJS.lib.WordArray.create(fileContent);
      return CryptoJS.SHA256(wordArray).toString();
    }
  } catch (error) {
    console.error('[Hash生成] SHA-256 生成失败，使用简单哈希降级方案:', error);
    // 最后的降级方案：生成简单的哈希
    return generateSimpleHash(fileContent);
  }
}

// 简单的哈希生成方法（降级方案）
function generateSimpleHash(fileContent: ArrayBuffer): string {
  const bytes = new Uint8Array(fileContent);
  let hash = 0;
  for (let i = 0; i < bytes.length; i++) {
    hash = ((hash << 5) - hash) + bytes[i];
    hash = hash & hash; // 转换为32位整数
  }
  return Math.abs(hash).toString(16).padStart(8, '0') +
    Date.now().toString(16) +
    Math.random().toString(16).substring(2, 10);
}
// 生成MD5 Hash (使用CryptoJS，因为Web Crypto API不支持MD5)
function generateMD5Hash(fileContent: ArrayBuffer): string {
  try {
    const wordArray = CryptoJS.lib.WordArray.create(fileContent);
    return CryptoJS.MD5(wordArray).toString();
  } catch (error) {
    console.error('[MD5生成] MD5 生成失败:', error);
    // 返回一个默认的MD5值，避免功能中断
    return '00000000000000000000000000000000';
  }
}

// 工具函数：替换旧域名为新域名
function fixIpfsDomain(url: string) {
  return url.replace(/ipfs\.crossbell\.io/gi, 'ipfs.chloemlla.com');
}

const ImageUploadPage: React.FC = () => {
  const { setNotification } = useNotification();
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadedUrl, setUploadedUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploadedShortUrl, setUploadedShortUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 批量上传相关状态
  const [batchFiles, setBatchFiles] = useState<File[]>([]);
  const [batchUploading, setBatchUploading] = useState(false);
  const [batchProgress, setBatchProgress] = useState<{ [key: string]: { status: 'pending' | 'uploading' | 'success' | 'error', progress?: number, error?: string, shortUrl?: string } }>({});
  const [showBatchList, setShowBatchList] = useState(false);
  const [batchUploadResults, setBatchUploadResults] = useState<{ [key: string]: { web2url: string, shortUrl?: string } }>({});
  const batchFileInputRef = useRef<HTMLInputElement>(null);

  // 新增闪烁效果状态
  const [flashingImages, setFlashingImages] = useState<Set<string>>(new Set());

  // 2. 新增本地图片管理相关state
  const [storedImages, setStoredImages] = useState<any[]>([]);
  const [dragActive, setDragActive] = useState(false);

  // Turnstile 相关状态
  const { config: turnstileConfig, loading: turnstileConfigLoading } = useTurnstileConfig();
  const [turnstileToken, setTurnstileToken] = useState<string>('');
  const [turnstileVerified, setTurnstileVerified] = useState(false);
  const [turnstileError, setTurnstileError] = useState(false);
  const [turnstileKey, setTurnstileKey] = useState(0);

  // 加载本地图片
  React.useEffect(() => {
    const loadImages = async () => {
      try {
        // 先检查并修复数据库
        await checkAndFixDB();
        const images = await getStoredImages();
        setStoredImages(images);
      } catch (error) {
        console.error('[图片存储] 加载图片失败:', error);
        setStoredImages([]);
      }
    };
    loadImages();
  }, []);

  // 刷新本地图片
  const reloadImages = async () => {
    const images = await getStoredImages();
    setStoredImages(images);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    console.log('[图片上传] 选择文件:', f);
    if (!f) return;
    if (!ALLOWED_TYPES.includes(f.type)) {
      console.warn('[图片上传] 类型校验失败:', f.type);
      setNotification({ message: '仅支持图片格式：JPEG, PNG, GIF, WebP, BMP, SVG', type: 'error' });
      return;
    }
    if (f.size > MAX_IMAGE_SIZE) {
      console.warn('[图片上传] 大小校验失败:', f.size);
      setNotification({ message: '图片大小不能超过5MB', type: 'error' });
      return;
    }
    setFile(f);
    setUploadedUrl(null);
    setError(null);

    // 重置Turnstile状态
    setTurnstileToken('');
    setTurnstileVerified(false);
    setTurnstileKey(k => k + 1);

    const url = URL.createObjectURL(f);
    setPreviewUrl(url);
    console.log('[图片上传] 预览URL:', url);
  };

  // 批量文件选择处理
  const handleBatchFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    console.log('[批量上传] 选择文件数量:', files.length);

    if (files.length === 0) return;

    // 验证文件
    const validFiles: File[] = [];
    const invalidFiles: string[] = [];

    files.forEach(file => {
      const displayFileName = sanitizeDisplayText(file.name);
      if (!ALLOWED_TYPES.includes(file.type)) {
        invalidFiles.push(`${displayFileName} (格式不支持)`);
      } else if (file.size > MAX_IMAGE_SIZE) {
        invalidFiles.push(`${displayFileName} (超过5MB)`);
      } else {
        validFiles.push(file);
      }
    });

    if (invalidFiles.length > 0) {
      setNotification({
        message: `以下文件不符合要求：${invalidFiles.slice(0, 3).join(', ')}${invalidFiles.length > 3 ? '...' : ''}`,
        type: 'warning'
      });
    }

    if (validFiles.length > 0) {
      setBatchFiles(prev => [...prev, ...validFiles]);

      // 初始化进度状态
      const newProgress: { [key: string]: { status: 'pending' | 'uploading' | 'success' | 'error', progress?: number, error?: string } } = {};
      validFiles.forEach(file => {
        newProgress[file.name] = { status: 'pending' };
      });
      setBatchProgress(prev => ({ ...prev, ...newProgress }));

      setShowBatchList(true);
      setNotification({
        message: `已添加 ${validFiles.length} 个文件到批量上传队列`,
        type: 'success'
      });
    }

    // 清空文件输入框
    if (batchFileInputRef.current) {
      batchFileInputRef.current.value = '';
    }
  };

  const handleRemove = () => {
    console.log('[图片上传] 移除文件:', file);
    setFile(null);
    setPreviewUrl(null);
    setUploadedUrl(null);
    setError(null);

    // 重置Turnstile状态
    setTurnstileToken('');
    setTurnstileVerified(false);
    setTurnstileKey(k => k + 1);

    // 清空文件输入框
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // 批量文件管理函数
  const removeBatchFile = (fileName: string) => {
    setBatchFiles(prev => prev.filter(f => f.name !== fileName));
    setBatchProgress(prev => {
      const newProgress = { ...prev };
      delete newProgress[fileName];
      return newProgress;
    });

    if (batchFiles.length <= 1) {
      setShowBatchList(false);
    }
  };

  const clearBatchFiles = () => {
    setBatchFiles([]);
    setBatchProgress({});
    setShowBatchList(false);
    setNotification({ message: '已清空批量上传队列', type: 'success' });
  };

  // Turnstile 验证处理函数
  const handleTurnstileVerify = (token: string) => {
    setTurnstileToken(token);
    setTurnstileVerified(true);
    setTurnstileError(false);
  };

  const handleTurnstileExpire = () => {
    setTurnstileToken('');
    setTurnstileVerified(false);
    setTurnstileError(false);
  };

  const handleTurnstileError = () => {
    setTurnstileToken('');
    setTurnstileVerified(false);
    setTurnstileError(true);
  };

  const handleUpload = async () => {
    if (!file) return;

    // 检查Turnstile验证
    if (!!turnstileConfig.siteKey && (!turnstileVerified || !turnstileToken)) {
      setError('请先完成人机验证');
      setNotification({ message: '请先完成人机验证', type: 'warning' });
      return;
    }

    setUploading(true);
    setError(null);
    setUploadedUrl(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('source', 'imgupload'); // 标记来源
      if (!!turnstileConfig.siteKey && turnstileToken) {
        formData.append('cfToken', turnstileToken);
      }
      const token = localStorage.getItem('token');
      const authenticated = Boolean(token);
      const uploadUrl = getApiBaseUrl() + '/api/ipfs/upload';
      console.log('[图片上传] 开始上传:', { uploadUrl, fileName: file.name, fileSize: file.size, authenticated });
      const res = await fetch(uploadUrl, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        body: formData,
      });
      console.log('[图片上传] 响应状态:', res.status);
      const result = await res.json();
      console.log('[图片上传] 响应内容:', result);
      setUploading(false);
      if (result?.data?.web2url) {
        setUploadedUrl(result.data.web2url);
        setUploadedShortUrl(result.data.shortUrl || null);
        setNotification({ message: '上传成功', type: 'success' });

        // 重置Turnstile状态
        setTurnstileToken('');
        setTurnstileVerified(false);
        setTurnstileKey(k => k + 1);

        // 生成图片数据验证信息
        let imageId: string;
        let fileHash: string;
        let md5Hash: string;

        try {
          imageId = generateImageId();
          const fileArrayBuffer = await file.arrayBuffer();
          fileHash = await generateFileHash(fileArrayBuffer);
          md5Hash = generateMD5Hash(fileArrayBuffer);
        } catch (error) {
          console.error('[图片上传] 哈希生成失败:', error);
          // 使用默认值，确保功能不中断
          imageId = generateImageId();
          fileHash = 'hash-generation-failed';
          md5Hash = 'md5-generation-failed';
        }

        // 保存到本地存储
        const imageData = {
          imageId,
          cid: result.data.cid || '',
          url: result.data.url || '',
          web2url: result.data.web2url,
          fileSize: file.size,
          fileName: file.name,
          uploadTime: new Date().toISOString(),
          fileHash,
          md5Hash
        };
        saveImageToStorage(imageData).then(() => {
          // 记录到后端数据库
          imageDataApi.recordImageData({
            imageId,
            fileName: file.name,
            fileSize: file.size,
            fileHash,
            md5Hash,
            web2url: result.data.web2url,
            cid: result.data.cid || '',
            uploadTime: new Date().toISOString()
          }).then(() => {
            console.log('[图片上传] 数据已记录到后端');
          }).catch((error) => {
            console.error('[图片上传] 记录到后端失败:', error);
            setNotification({ message: '图片上传成功，但数据记录失败', type: 'warning' });
          });

          reloadImages().then(() => {
            console.log('[图片上传] 上传成功，web2url:', result.data.web2url);
            // 清空文件输入框，避免重复选择
            if (fileInputRef.current) {
              fileInputRef.current.value = '';
            }
          });
        });
      } else if (result?.error) {
        setUploadedShortUrl(null);
        setError(result.error);
        setNotification({ message: result.error, type: 'error' });
        console.error('[图片上传] 上传失败，错误:', result.error);
      } else {
        setError('上传失败');
        setNotification({ message: '上传失败', type: 'error' });
        console.error('[图片上传] 上传失败，未知响应:', result);
      }
    } catch (e: any) {
      setUploading(false);
      setError(e?.message || '上传失败');
      setNotification({ message: e?.message || '上传失败', type: 'error' });
      console.error('[图片上传] 异常:', e);
    }
  };

  // 批量上传处理
  const handleBatchUpload = async () => {
    if (batchFiles.length === 0) return;

    // 检查Turnstile验证（批量上传只需要验证一次）
    if (!!turnstileConfig.siteKey && (!turnstileVerified || !turnstileToken)) {
      setNotification({ message: '请先完成人机验证', type: 'warning' });
      return;
    }

    setBatchUploading(true);
    const token = localStorage.getItem('token');
    const uploadUrl = getApiBaseUrl() + '/api/ipfs/upload';

    console.log('[批量上传] 开始上传，文件数量:', batchFiles.length);

    // 逐个上传文件
    for (let i = 0; i < batchFiles.length; i++) {
      const file = batchFiles[i];
      const fileName = file.name;

      try {
        // 更新进度状态
        setBatchProgress(prev => ({
          ...prev,
          [fileName]: { status: 'uploading', progress: 0 }
        }));

        const formData = new FormData();
        formData.append('file', file);
        formData.append('source', 'batch-imgupload'); // 标记批量上传来源

        // 只在第一个文件时添加 Turnstile token
        if (!!turnstileConfig.siteKey && turnstileToken && i === 0) {
          formData.append('cfToken', turnstileToken);
        }

        console.log(`[批量上传] 上传文件 ${i + 1}/${batchFiles.length}:`, fileName);

        const res = await fetch(uploadUrl, {
          method: 'POST',
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
          body: formData,
        });

        const result = await res.json();

        if (result?.data?.web2url) {
          // 上传成功
          const shortUrl = result.data.shortUrl || null;
          setBatchProgress(prev => ({
            ...prev,
            [fileName]: { status: 'success', progress: 100, shortUrl }
          }));

          // 保存上传结果
          setBatchUploadResults(prev => ({
            ...prev,
            [fileName]: {
              web2url: result.data.web2url,
              shortUrl: shortUrl || undefined
            }
          }));

          // 生成图片数据验证信息
          let imageId: string;
          let fileHash: string;
          let md5Hash: string;

          try {
            imageId = generateImageId();
            const fileArrayBuffer = await file.arrayBuffer();
            fileHash = await generateFileHash(fileArrayBuffer);
            md5Hash = generateMD5Hash(fileArrayBuffer);
          } catch (error) {
            console.error('[批量上传] 哈希生成失败:', error);
            imageId = generateImageId();
            fileHash = 'hash-generation-failed';
            md5Hash = 'md5-generation-failed';
          }

          // 保存到本地存储
          const imageData = {
            imageId,
            cid: result.data.cid || '',
            url: result.data.url || '',
            web2url: result.data.web2url,
            fileSize: file.size,
            fileName: file.name,
            uploadTime: new Date().toISOString(),
            fileHash,
            md5Hash
          };

          try {
            await saveImageToStorage(imageData);
            console.log(`[批量上传] 文件 ${fileName} 已保存到本地存储`);
          } catch (error) {
            console.error('[批量上传] 保存到本地存储失败:', error);
          }

          // 记录到后端数据库
          try {
            await imageDataApi.recordImageData({
              imageId,
              fileName: file.name,
              fileSize: file.size,
              fileHash,
              md5Hash,
              web2url: result.data.web2url,
              cid: result.data.cid || '',
              uploadTime: new Date().toISOString()
            });
            console.log(`[批量上传] 文件 ${fileName} 已记录到后端数据库`);
          } catch (error) {
            console.error('[批量上传] 记录到后端失败:', error);
          }

          console.log(`[批量上传] 文件 ${fileName} 上传成功`);
        } else {
          // 上传失败
          const errorMsg = result?.error || '上传失败';
          setBatchProgress(prev => ({
            ...prev,
            [fileName]: { status: 'error', error: errorMsg }
          }));
          console.error(`[批量上传] 文件 ${fileName} 上传失败:`, errorMsg);
        }
      } catch (error: any) {
        // 异常处理
        const errorMsg = error?.message || '上传异常';
        setBatchProgress(prev => ({
          ...prev,
          [fileName]: { status: 'error', error: errorMsg }
        }));
        console.error(`[批量上传] 文件 ${fileName} 上传异常:`, error);
      }

      // 添加延迟，避免请求过于频繁
      if (i < batchFiles.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    setBatchUploading(false);

    // 重新加载图片列表，确保显示所有成功上传的文件
    try {
      await reloadImages();
      console.log('[批量上传] 本地图片列表已重新加载');

      // 为成功上传的图片添加闪烁效果
      const successfulFiles = batchFiles.filter(file => {
        const progress = batchProgress[file.name];
        return progress && progress.status === 'success';
      });

      if (successfulFiles.length > 0) {
        // 获取新上传的图片ID用于闪烁效果
        const newImageIds = new Set<string>();

        // 延迟一点时间确保图片列表已经更新
        setTimeout(() => {
          for (const file of successfulFiles) {
            const result = batchUploadResults[file.name];
            if (result) {
              // 通过文件名和web2url来匹配新上传的图片
              const newImage = storedImages.find(img =>
                img.fileName === file.name && img.web2url === result.web2url
              );
              if (newImage) {
                newImageIds.add(newImage.imageId);
              }
            }
          }

          // 设置闪烁效果
          setFlashingImages(newImageIds);

          // 3秒后清除闪烁效果
          setTimeout(() => {
            setFlashingImages(new Set());
          }, 3000);
        }, 100);
      }
    } catch (error) {
      console.error('[批量上传] 重新加载图片列表失败:', error);
    }

    // 统计上传结果
    const successCount = Object.values(batchProgress).filter(p => p.status === 'success').length;
    const errorCount = Object.values(batchProgress).filter(p => p.status === 'error').length;

    if (successCount > 0) {
      // 获取成功上传的文件列表
      const successfulFiles = batchFiles.filter(file => {
        const progress = batchProgress[file.name];
        return progress && progress.status === 'success';
      });

      // 显示成功上传的文件列表
      const successfulFileNames = successfulFiles.map(file => sanitizeDisplayText(file.name)).join(', ');

      // 根据上传结果显示不同的通知
      if (successCount === batchFiles.length) {
        // 全部成功
        setNotification({
          message: `批量上传完成！所有 ${successCount} 个文件上传成功。相关信息请在页面下方的"本地存储管理"区域查看。`,
          type: 'success'
        });
      } else if (successCount > 0) {
        // 部分成功
        setNotification({
          message: `批量上传完成！成功 ${successCount} 个，失败 ${errorCount} 个。成功上传的文件信息请在页面下方的"本地存储管理"区域查看。`,
          type: 'warning'
        });
      } else {
        // 全部失败
        setNotification({
          message: `批量上传失败！所有 ${errorCount} 个文件上传失败，请检查网络连接或文件格式后重试。`,
          type: 'error'
        });
      }

      // 更新批量文件列表，只保留成功的文件
      setBatchFiles(successfulFiles);

      // 更新进度状态，只保留成功的文件
      const successfulProgress: { [key: string]: { status: 'pending' | 'uploading' | 'success' | 'error', progress?: number, error?: string } } = {};
      successfulFiles.forEach(file => {
        const progress = batchProgress[file.name];
        if (progress && progress.status === 'success') {
          successfulProgress[file.name] = progress;
        }
      });
      setBatchProgress(successfulProgress);

      // 如果所有文件都上传成功，隐藏批量上传列表
      if (successCount === batchFiles.length) {
        setShowBatchList(false);
      }

      // 显示成功上传的文件已添加到本地历史记录
      console.log(`[批量上传] 成功上传的文件已添加到本地历史记录：`, successfulFileNames);
    }

    // 重置 Turnstile 状态
    setTurnstileToken('');
    setTurnstileVerified(false);
    setTurnstileKey(k => k + 1);
  };

  // 3. 拖拽上传相关事件
  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragActive(true);
  };
  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragActive(false);
  };
  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragActive(false);
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      // 检查是否包含图片文件
      const imageFiles = Array.from(files).filter(file => file.type.startsWith('image/'));
      if (imageFiles.length > 0) {
        if (imageFiles.length === 1) {
          // 单文件上传
          handleFileChange({ target: { files: imageFiles }, preventDefault: () => { } } as any);
        } else {
          // 多文件批量上传
          handleBatchFileChange({ target: { files: imageFiles }, preventDefault: () => { } } as any);
        }
      }
    }
  };

  // 4. 复制短链到剪贴板
  const handleCopy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setNotification({ message: '已复制到剪贴板', type: 'success' });
    } catch {
      setNotification({ message: '复制失败', type: 'error' });
    }
  };

  // 5. 导出、导入、清空等操作
  const [exportType, setExportType] = useState<'plain' | 'base64' | 'aes256'>('plain');
  const [showExportMenu, setShowExportMenu] = useState(false);

  // 点击外部关闭导出菜单
  React.useEffect(() => {
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

  const handleExport = async () => {
    const images = await exportImagesFromDB();
    if (images.length === 0) {
      setNotification({ message: '没有数据可以导出', type: 'error' });
      return;
    }
    let exportObj: any;
    if (exportType === 'plain') {
      exportObj = { mode: 'plain', data: images };
    } else if (exportType === 'base64') {
      exportObj = { mode: 'base64', data: btoa(unescape(encodeURIComponent(JSON.stringify(images)))) };
    } else if (exportType === 'aes256') {
      const raw = JSON.stringify(images);
      const encrypted = encryptAES256(raw, STORAGE_KEY);
      exportObj = { mode: 'aes256', ...encrypted };
    }
    const dataStr = JSON.stringify(exportObj, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `happy-images-${new Date().toISOString().split('T')[0]}.json`;
    link.click();
    URL.revokeObjectURL(url);
    setShowExportMenu(false);
  };

  // 导入时验证数据完整性
  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function (ev) {
      try {
        const importedObj = JSON.parse(ev.target?.result as string);
        let importedData: any[] = [];
        if (Array.isArray(importedObj)) {
          // 兼容老格式
          importedData = importedObj;
        } else if (importedObj.mode === 'plain') {
          importedData = importedObj.data;
        } else if (importedObj.mode === 'base64') {
          importedData = JSON.parse(decodeURIComponent(escape(atob(importedObj.data))));
        } else if (importedObj.mode === 'aes256') {
          // AES-256解密，密码为STORAGE_KEY
          const decrypted = decryptAES256(importedObj.data, importedObj.iv, STORAGE_KEY);
          importedData = JSON.parse(decrypted);
        } else {
          throw new Error('未知的数据格式');
        }

        // 验证数据完整性
        const validateImportData = async () => {
          try {
            const validationList = importedData
              .filter((item: any) => item.imageId && item.fileHash && item.md5Hash)
              .map((item: any) => ({
                imageId: item.imageId,
                fileHash: item.fileHash,
                md5Hash: item.md5Hash
              }));

            if (validationList.length > 0) {
              const validationResults = await imageDataApi.validateBatchImageData(validationList);
              const invalidItems = validationResults.filter(result => !result.isValid);

              if (invalidItems.length > 0) {
                const invalidCount = invalidItems.length;
                const totalCount = validationList.length;
                setNotification({
                  message: `导入完成，但发现 ${invalidCount}/${totalCount} 个数据验证失败`,
                  type: 'warning'
                });
                console.warn('[图片导入] 数据验证失败:', invalidItems);
              } else {
                setNotification({ message: '数据验证通过', type: 'success' });
              }
            }
          } catch (error) {
            console.error('[图片导入] 数据验证失败:', error);
            setNotification({ message: '数据验证失败，但导入继续', type: 'warning' });
          }
        };

        const validData = importedData.filter((item: any) => item.cid && item.web2url && item.fileName);
        if (validData.length === 0) throw new Error('没有找到有效的图片数据');

        // 从IndexedDB获取现有图片
        getStoredImages().then(async (existingImages) => {
          const existingCids = new Set(existingImages.map((img: any) => img.cid));
          const newImages = validData.filter((img: any) => !existingCids.has(img.cid));
          const mergedImages = [...existingImages, ...newImages];

          // 保存到IndexedDB
          await importImagesToDB(mergedImages);
          await reloadImages();

          // 执行数据验证
          validateImportData();

          setNotification({ message: `导入成功！新增 ${newImages.length} 张图片记录`, type: 'success' });
        });
      } catch (error: any) {
        setNotification({ message: `导入失败: ${error.message}`, type: 'error' });
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };
  const handleClear = async () => {
    if (window.confirm('确定要清空所有数据吗？此操作不可恢复！')) {
      await clearAllImages();
      await reloadImages();
      setNotification({ message: '数据已清空', type: 'success' });
    }
  };

  const handleDelete = async (index: number) => {
    if (window.confirm('确定要删除这张图片的记录吗？')) {
      await deleteImageFromStorage(index);
      await reloadImages();
      setNotification({ message: '已删除', type: 'success' });
    }
  };

  const safeUploadedUrl = sanitizeImageUrl(uploadedShortUrl || uploadedUrl);

  return (
    <section className="mx-auto max-w-6xl px-4 py-10 sm:py-12">
      {/* 主面板：上传图片 */}
      <motion.div
        className="relative overflow-hidden rounded-[34px] border border-white/70 bg-white/88 p-6 shadow-[0_28px_110px_rgba(15,23,42,0.1)] backdrop-blur-xl sm:p-10"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <div className="pointer-events-none absolute -right-16 top-0 h-48 w-48 rounded-full bg-[radial-gradient(circle,_rgba(59,130,246,0.22),_transparent_68%)]" />
        <div className="pointer-events-none absolute -left-10 bottom-0 h-40 w-40 rounded-full bg-[radial-gradient(circle,_rgba(14,165,233,0.16),_transparent_70%)]" />

        <div className="relative">
          <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">
            <FaImage className="text-[10px]" /> IMAGE UPLOAD
          </div>
          <h1 className="mt-5 text-3xl font-semibold leading-tight text-slate-900 sm:text-4xl">图片上传</h1>
          <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-600 sm:text-base">
            支持 JPEG、PNG、GIF、WebP、BMP、SVG 格式，最大 5MB。上传后将返回可直接访问的图片链接，并自动生成 IPFS 记录。
          </p>

          <div className="mt-7 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.26em] text-slate-500">
              <FaUpload className="text-slate-500" /> Upload
            </div>
            <div className="flex items-center gap-2">
              {/* 批量上传按钮 */}
              <div className="relative">
                <input
                  type="file"
                  accept={ACCEPT_ATTR}
                  multiple
                  ref={batchFileInputRef}
                  className="hidden"
                  onChange={handleBatchFileChange}
                  disabled={batchUploading}
                />
                <motion.button
                  className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white/80 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-60"
                  whileTap={{ scale: 0.97 }}
                  onClick={() => !batchUploading && batchFileInputRef.current?.click()}
                  disabled={batchUploading}
                >
                  <FaUpload className="text-[13px]" />
                  批量上传
                </motion.button>
              </div>
            </div>
          </div>

          <motion.div
            className={`mt-5 rounded-[26px] border-2 border-dashed bg-slate-50/60 px-6 py-10 transition ${
              dragActive ? 'border-slate-400 bg-slate-100/70 ring-2 ring-slate-300' : 'border-slate-300 hover:border-slate-400 hover:bg-slate-50'
            }`}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            <input
              type="file"
              accept={ACCEPT_ATTR}
              ref={fileInputRef}
              className="hidden"
              onChange={handleFileChange}
              disabled={uploading}
            />
            <div
              className="flex flex-col items-center justify-center text-center select-none"
              onClick={() => !uploading && !file && fileInputRef.current?.click()}
              style={{ cursor: (uploading || file) ? 'not-allowed' : 'pointer' }}
            >
              <FaFolder className="mb-3 text-2xl text-slate-400" />
              <div className="text-sm text-slate-700">
                {uploading ? '上传中…' : file ? '已选择文件' : '点击选择图片或拖拽图片到此处'}
              </div>
              <div className="mt-1 text-xs text-slate-400">支持 JPG、PNG、GIF 等格式，可拖拽多个文件进行批量上传</div>
            </div>

            {file && previewUrl && (
              <motion.div
                className="mt-5 flex flex-col items-center rounded-[22px] border border-slate-200 bg-white/80 p-4"
                initial={{ opacity: 0, scale: 0.97 }}
                animate={{ opacity: 1, scale: 1 }}
              >
                <img src={sanitizeImageUrl(previewUrl)} alt="预览" className="h-32 w-32 rounded-2xl border border-slate-200 object-contain sm:h-48 sm:w-48" />
                <div className="mt-3 text-center text-xs text-slate-600 sm:text-sm">
                  {sanitizeDisplayText(file.name)} ({(file.size / 1024).toFixed(1)} KB)
                </div>
                <motion.button
                  className="mt-3 inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white/80 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:text-slate-900 disabled:opacity-50"
                  onClick={handleRemove}
                  disabled={uploading}
                  whileTap={{ scale: 0.97 }}
                >移除</motion.button>
              </motion.div>
            )}

            {/* Turnstile 人机验证 */}
            {!turnstileConfigLoading && turnstileConfig.siteKey && typeof turnstileConfig.siteKey === 'string' && (
              <motion.div
                className="mt-5 rounded-[22px] border border-slate-200 bg-white/70 p-4"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4 }}
              >
                <div className="mb-3 text-center text-sm text-slate-700">
                  人机验证
                  {turnstileVerified && (
                    <span className="ml-2 font-medium text-emerald-600">✓ 验证通过</span>
                  )}
                </div>

                <TurnstileWidget
                  key={turnstileKey}
                  siteKey={turnstileConfig.siteKey}
                  onVerify={handleTurnstileVerify}
                  onExpire={handleTurnstileExpire}
                  onError={handleTurnstileError}
                  theme="light"
                  size="normal"
                />

                {turnstileError && (
                  <div className="mt-2 text-center text-sm text-rose-600">
                    验证失败，请重新验证
                  </div>
                )}
              </motion.div>
            )}

            {/* 批量上传列表 */}
            {showBatchList && batchFiles.length > 0 && (
              <motion.div
                className="mt-5 rounded-[22px] border border-slate-200 bg-white/70 p-4"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4 }}
              >
                <div className="mb-3 flex items-center justify-between">
                  <h4 className="text-sm font-semibold text-slate-800">
                    批量上传队列 ({batchFiles.length})
                  </h4>
                  <motion.button
                    className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white/80 px-3 py-1.5 text-xs font-semibold text-slate-500 transition hover:border-rose-200 hover:text-rose-600"
                    onClick={clearBatchFiles}
                    whileTap={{ scale: 0.96 }}
                  >
                    清空队列
                  </motion.button>
                </div>

                <div className="max-h-44 space-y-2 overflow-y-auto pr-1">
                  {batchFiles.map((file) => {
                    const progress = batchProgress[file.name];
                    const displayFileName = sanitizeDisplayText(file.name);
                    const safeShortUrl = sanitizeImageUrl(progress?.shortUrl);
                    return (
                      <div key={file.name} className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white/80 p-3">
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-medium text-slate-800">
                            {displayFileName}
                          </div>
                          <div className="text-xs text-slate-500">
                            {formatFileSize(file.size)}
                          </div>
                          {progress && (
                            <div className="mt-1">
                              {progress.status === 'pending' && (
                                <div className="text-xs text-slate-500">等待上传</div>
                              )}
                              {progress.status === 'uploading' && (
                                <div className="text-xs text-slate-600">上传中…</div>
                              )}
                              {progress.status === 'success' && (
                                <div className="text-xs text-emerald-600">
                                  ✓ 上传成功
                                  {safeShortUrl && (
                                    <div className="mt-1">
                                      <div className="truncate text-xs text-slate-600" title={safeShortUrl}>
                                        短链: {safeShortUrl}
                                      </div>
                                      <motion.button
                                        className="text-xs font-semibold text-slate-700 underline-offset-2 hover:text-slate-900 hover:underline"
                                        onClick={() => handleCopy(safeShortUrl)}
                                        whileTap={{ scale: 0.96 }}
                                      >
                                        复制
                                      </motion.button>
                                    </div>
                                  )}
                                </div>
                              )}
                              {progress.status === 'error' && (
                                <div className="text-xs text-rose-600">✗ {sanitizeDisplayText(progress.error, '上传失败')}</div>
                              )}
                            </div>
                          )}
                        </div>
                        <div className="ml-3 flex items-center gap-2">
                          {progress?.status === 'uploading' && (
                            <div className="h-4 w-4 animate-spin rounded-full border-2 border-slate-400 border-t-transparent"></div>
                          )}
                          {progress?.status === 'success' && (
                            <FaCheck className="h-4 w-4 text-emerald-500" />
                          )}
                          {progress?.status === 'error' && (
                            <FaTrash className="h-4 w-4 cursor-pointer text-rose-500" onClick={() => removeBatchFile(file.name)} />
                          )}
                          {progress?.status === 'pending' && (
                            <FaTrash className="h-4 w-4 cursor-pointer text-slate-400 hover:text-rose-500" onClick={() => removeBatchFile(file.name)} />
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                <motion.button
                  className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2"
                  onClick={handleBatchUpload}
                  disabled={batchUploading || batchFiles.length === 0 || (!!turnstileConfig.siteKey && !turnstileVerified)}
                  whileTap={{ scale: 0.98 }}
                >
                  {batchUploading ? '批量上传中…' : `开始批量上传 (${batchFiles.length} 个文件)`}
                </motion.button>
              </motion.div>
            )}

            <motion.button
              className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2"
              onClick={handleUpload}
              disabled={!file || uploading || (!!turnstileConfig.siteKey && !turnstileVerified)}
              whileTap={{ scale: 0.98 }}
            >
              {uploading ? '上传中…' : '上传图片'}
            </motion.button>
            {error && (
              <div className="mt-3 rounded-[22px] border border-rose-200/70 bg-rose-50/80 px-5 py-3 text-center text-sm leading-7 text-rose-700">
                {sanitizeDisplayText(error, '上传失败')}
              </div>
            )}
          </motion.div>

          <AnimatePresence>
            {uploadedUrl && safeUploadedUrl && (
              <motion.div
                className="mt-5 rounded-[22px] border border-emerald-200/70 bg-emerald-50/80 px-5 py-4"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
                transition={{ duration: 0.35 }}
              >
                <div className="mb-2 flex items-center justify-center gap-2 text-sm font-semibold text-emerald-700">
                  <span>上传成功</span>
                  <FaCheck className="h-4 w-4 text-emerald-500" />
                </div>
                <div className="mb-2 text-center text-xs text-slate-600">图片链接：</div>
                <div className="flex flex-col items-center justify-center gap-2 sm:flex-row">
                  <a
                    href={safeUploadedUrl}
                    className="break-all text-sm text-slate-700 underline-offset-2 hover:text-slate-900 hover:underline"
                    target="_blank"
                    rel="noopener noreferrer"
                  >{safeUploadedUrl}</a>
                  <motion.button
                    className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white/80 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-slate-300 hover:text-slate-900"
                    onClick={() => handleCopy(safeUploadedUrl)}
                    whileTap={{ scale: 0.96 }}
                  >
                    <FaCopy className="text-[11px]" /> 复制
                  </motion.button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>

      {/* 本地存储管理分区 */}
      <motion.div
        className="relative mt-6 overflow-hidden rounded-[28px] border border-white/70 bg-white/88 p-6 shadow-[0_18px_60px_rgba(15,23,42,0.06)] backdrop-blur-xl sm:p-8"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.1 }}
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.26em] text-slate-500">
            <FaDatabase className="text-slate-500" /> Local Storage
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {/* 导入按钮 */}
            <div className="relative">
              <input
                type="file"
                accept=".json"
                onChange={handleImport}
                className="hidden"
                id="image-import-file-input"
              />
              <motion.button
                className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white/80 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:text-slate-900"
                whileTap={{ scale: 0.97 }}
                onClick={() => document.getElementById('image-import-file-input')?.click()}
              >
                <FaImport className="text-[13px]" />
                导入
              </motion.button>
            </div>

            {/* 导出菜单 */}
            <div className="export-menu-container relative">
              <motion.button
                onClick={() => setShowExportMenu(!showExportMenu)}
                className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white/80 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:text-slate-900"
                whileTap={{ scale: 0.97 }}
              >
                <FaDownload className="text-[13px]" />
                导出
              </motion.button>

              <AnimatePresence>
                {showExportMenu && (
                  <motion.div
                    className="absolute right-0 top-full z-10 mt-2 min-w-[220px] rounded-2xl border border-slate-200 bg-white/95 p-2 shadow-[0_18px_60px_rgba(15,23,42,0.12)] backdrop-blur-xl"
                    initial={{ opacity: 0, y: -8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                  >
                    <label className="flex cursor-pointer items-center gap-2 rounded-xl p-2 text-sm text-slate-700 hover:bg-slate-50">
                      <input
                        type="radio"
                        value="plain"
                        checked={exportType === 'plain'}
                        onChange={(e) => setExportType(e.target.value as any)}
                        className="accent-slate-700"
                      />
                      <span>明文导出</span>
                    </label>
                    <label className="flex cursor-pointer items-center gap-2 rounded-xl p-2 text-sm text-slate-700 hover:bg-slate-50">
                      <input
                        type="radio"
                        value="base64"
                        checked={exportType === 'base64'}
                        onChange={(e) => setExportType(e.target.value as any)}
                        className="accent-slate-700"
                      />
                      <span>Base64 编码</span>
                    </label>
                    <label className="flex cursor-pointer items-center gap-2 rounded-xl p-2 text-sm text-slate-700 hover:bg-slate-50">
                      <input
                        type="radio"
                        value="aes256"
                        checked={exportType === 'aes256'}
                        onChange={(e) => setExportType(e.target.value as any)}
                        className="accent-slate-700"
                      />
                      <span>AES-256 加密</span>
                    </label>
                    <button
                      onClick={handleExport}
                      className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
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
              className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white/80 px-4 py-2.5 text-sm font-semibold text-slate-500 transition hover:border-rose-200 hover:text-rose-600"
              whileTap={{ scale: 0.97 }}
            >
              <FaTrash className="text-[13px]" />
              清除
            </motion.button>
          </div>
        </div>

        <motion.div
          className="mt-5 flex items-center justify-center gap-2 rounded-[22px] border border-slate-200 bg-slate-50/70 px-4 py-4 text-center"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          <span className="text-2xl font-semibold text-slate-900">{storedImages.length}</span>
          <span className="text-sm text-slate-600">已保存图片</span>
        </motion.div>

        <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
          {storedImages.length === 0 ? (
            <motion.div
              className="col-span-full py-10 text-center text-sm text-slate-400"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4 }}
            >
              暂无上传的图片
            </motion.div>
          ) : (
            storedImages.map((img, idx) => {
              const safeWeb2Url = sanitizeImageUrl(fixIpfsDomain(img.web2url));
              const displayFileName = sanitizeDisplayText(img.fileName, '未命名图片');
              const displayCid = sanitizeDisplayText(img.cid);

              return (
                <motion.div
                  key={img.cid}
                  className={`relative flex flex-col overflow-hidden rounded-[22px] border bg-white/82 p-3 shadow-[0_18px_60px_rgba(15,23,42,0.06)] backdrop-blur-xl transition ${
                    flashingImages.has(img.imageId)
                      ? 'border-emerald-300 shadow-[0_18px_60px_rgba(16,185,129,0.25)] animate-pulse'
                      : 'border-white/70'
                  }`}
                  initial={{ opacity: 0, scale: 0.97 }}
                  animate={{
                    opacity: 1,
                    scale: flashingImages.has(img.imageId) ? 1.03 : 1,
                  }}
                  transition={{
                    duration: flashingImages.has(img.imageId) ? 0.6 : 0.3,
                    delay: idx * 0.05,
                    repeat: flashingImages.has(img.imageId) ? 3 : 0,
                    repeatType: 'reverse',
                  }}
                  whileHover={{ y: -2 }}
                >
                <img
                  src={safeWeb2Url}
                  alt={displayFileName}
                  className="mb-2 h-32 w-full rounded-2xl border border-slate-200 object-cover sm:h-40"
                  loading="lazy"
                />
                <div className="mb-1 break-all text-[11px] text-slate-500">CID: {displayCid}</div>
                <div className="mb-1 truncate text-sm text-slate-800">{displayFileName}</div>
                <div className="mb-3 text-xs text-slate-400">{formatFileSize(img.fileSize)} • {formatDate(img.uploadTime)}</div>
                <div className="mt-auto flex flex-col gap-1 sm:flex-row">
                  <motion.button
                    className="flex flex-1 items-center justify-center gap-1 rounded-2xl border border-slate-200 bg-white/80 px-2 py-2 text-xs font-semibold text-slate-700 transition hover:border-slate-300 hover:text-slate-900"
                    onClick={() => safeWeb2Url && handleCopy(safeWeb2Url)}
                    disabled={!safeWeb2Url}
                    whileTap={{ scale: 0.96 }}
                  >
                    <FaCopy className="text-[11px]" />
                    复制链接
                  </motion.button>
                  {/* 预览按钮始终使用后端返回的 web2url，确保域名和路径与后端一致 */}
                  <motion.a
                    className="flex flex-1 items-center justify-center gap-1 rounded-2xl border border-slate-200 bg-white/80 px-2 py-2 text-center text-xs font-semibold text-slate-700 transition hover:border-slate-300 hover:text-slate-900"
                    href={safeWeb2Url || '#'}
                    target="_blank"
                    rel="noopener noreferrer"
                    whileTap={{ scale: 0.96 }}
                  >
                    <FaEye className="text-[11px]" />
                    预览
                  </motion.a>
                  <motion.button
                    className="flex flex-1 items-center justify-center gap-1 rounded-2xl border border-slate-200 bg-white/80 px-2 py-2 text-xs font-semibold text-slate-500 transition hover:border-rose-200 hover:text-rose-600"
                    onClick={() => handleDelete(idx)}
                    whileTap={{ scale: 0.96 }}
                  >
                    <FaTrash className="text-[11px]" />
                    删除
                  </motion.button>
                </div>
                </motion.div>
              );
            })
          )}
        </div>
      </motion.div>
    </section>
  );
};

export default ImageUploadPage;
