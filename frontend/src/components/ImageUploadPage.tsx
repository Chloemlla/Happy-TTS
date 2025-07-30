import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNotification } from './Notification';
import { getApiBaseUrl } from '../api/api';
import { escapeHtml } from '../utils/escapeHtml';
import CryptoJS from 'crypto-js';
import { imageDataApi } from '../api/imageData';
import { openDB, deleteDB } from 'idb';

const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_TYPES = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/bmp',
  'image/svg+xml',
];

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
  return pattern.replace(/[xy]/g, function(c) {
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
  return url.replace(/ipfs\.crossbell\.io/gi, 'ipfs.hapxs.com');
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

  // 2. 新增本地图片管理相关state
  const [storedImages, setStoredImages] = useState<any[]>([]);
  const [dragActive, setDragActive] = useState(false);

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
    const url = URL.createObjectURL(f);
    setPreviewUrl(url);
    console.log('[图片上传] 预览URL:', url);
  };

  const handleRemove = () => {
    console.log('[图片上传] 移除文件:', file);
    setFile(null);
    setPreviewUrl(null);
    setUploadedUrl(null);
    setError(null);
    // 清空文件输入框
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleUpload = async () => {
    if (!file) return;
    setUploading(true);
    setError(null);
    setUploadedUrl(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('source', 'imgupload'); // 标记来源
      const token = localStorage.getItem('token');
      const uploadUrl = getApiBaseUrl() + '/api/ipfs/upload';
      console.log('[图片上传] 开始上传:', { uploadUrl, file, token });
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
    if (files.length > 0 && files[0].type.startsWith('image/')) {
      handleFileChange({ target: { files }, preventDefault: () => {} } as any);
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
  const [exportType, setExportType] = useState<'plain'|'base64'|'aes256'>('plain');
  const [showExportMenu, setShowExportMenu] = useState(false);

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

  return (
    <div className="space-y-4 sm:space-y-8" data-page="image-upload">
      {/* 上传图片分区 */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white rounded-xl p-4 sm:p-8 shadow-sm border border-blue-100"
      >
        <h2 className="text-xl sm:text-2xl font-bold text-blue-700 mb-3 sm:mb-4 flex items-center gap-2">
          <svg className="w-6 h-6 sm:w-8 sm:h-8 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
          </svg>
          图片上传
        </h2>
        <div className="text-sm sm:text-base text-gray-500 mb-4 sm:mb-6">支持 JPEG, PNG, GIF, WebP, BMP, SVG 格式，最大5MB。上传后将返回可直接访问的图片链接。</div>
        <motion.div
          className={`mb-6 sm:mb-8 p-4 sm:p-6 rounded-xl bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-100 shadow ${dragActive ? 'ring-4 ring-indigo-200' : ''}`}
          initial={{ opacity: 0, x: -30 }}
          animate={{ opacity: 1, x: 0 }}
          whileHover={{ scale: 1.01, y: -2, boxShadow: '0 8px 32px 0 rgba(99,102,241,0.10)' }}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          style={{ cursor: 'pointer' }}
          title="点击或拖拽图片上传"
        >
          <input
            type="file"
            accept="image/*"
            ref={fileInputRef}
            className="hidden"
            onChange={handleFileChange}
            disabled={uploading}
          />
          <div 
            className="flex flex-col items-center justify-center select-none"
            onClick={() => !uploading && !file && fileInputRef.current?.click()}
            style={{ cursor: (uploading || file) ? 'not-allowed' : 'pointer' }}
          >
            <div className="text-3xl sm:text-4xl mb-3 sm:mb-4">📁</div>
            <div className="text-sm sm:text-base text-gray-600 mb-2 sm:mb-3 text-center">
              {uploading ? '上传中...' : file ? '已选择文件' : '点击选择图片或拖拽图片到此处'}
            </div>
            <div className="text-xs text-gray-400 text-center">支持 JPG、PNG、GIF 等格式</div>
          </div>
          {file && previewUrl && (
            <motion.div
              className="mb-4 flex flex-col items-center border-2 border-dashed border-blue-200 rounded-xl bg-white/80 shadow p-3 sm:p-4"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              whileHover={{ scale: 1.03, boxShadow: '0 8px 32px 0 rgba(99,102,241,0.12)' }}
            >
              <img src={previewUrl} alt="预览" className="w-32 h-32 sm:w-48 sm:h-48 object-contain rounded-lg border border-gray-200 shadow" />
              <div className="text-xs sm:text-sm text-gray-600 mt-2 text-center">{escapeHtml(file.name)} ({(file.size / 1024).toFixed(1)} KB)</div>
              <motion.button
                className="mt-2 px-3 py-2 sm:px-4 sm:py-2 border border-gray-300 rounded-lg bg-white text-gray-700 hover:bg-gray-100 transition disabled:opacity-50 font-semibold text-sm sm:text-base min-h-[44px]"
                onClick={handleRemove}
                disabled={uploading}
                whileTap={{ scale: 0.97 }}
              >移除</motion.button>
            </motion.div>
          )}
          <motion.button
            className="w-full mt-2 px-4 py-3 sm:py-2 rounded-lg bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-bold shadow hover:from-blue-700 hover:to-indigo-700 transition disabled:opacity-50 text-base sm:text-lg tracking-wide min-h-[48px] sm:min-h-[44px]"
            onClick={handleUpload}
            disabled={!file || uploading}
            whileTap={{ scale: 0.98 }}
          >
            {uploading ? '上传中...' : '上传图片'}
          </motion.button>
          {error && <div className="mt-2 text-red-500 text-sm text-center">{error}</div>}
        </motion.div>
        <AnimatePresence>
          {uploadedUrl && (
            <motion.div
              className="mt-4 sm:mt-6 p-4 sm:p-6 bg-green-50 border border-green-200 rounded-xl text-green-700 text-center shadow"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              transition={{ duration: 0.4, type: 'spring', stiffness: 100 }}
            >
              <div className="mb-2 text-base sm:text-lg font-bold flex items-center justify-center gap-2">
                <span>上传成功</span>
                <motion.svg className="w-5 h-5 sm:w-6 sm:h-6 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 300, delay: 0.2 }}>
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </motion.svg>
              </div>
              <div className="mb-2 text-gray-700 text-xs sm:text-sm">图片链接：</div>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-2">
                <a
                  href={uploadedShortUrl || uploadedUrl}
                  className="underline break-all text-blue-700 hover:text-blue-900 text-xs sm:text-sm"
                  target="_blank"
                  rel="noopener noreferrer"
                >{uploadedShortUrl || uploadedUrl}</a>
                <motion.button
                  className="mt-2 sm:mt-0 sm:ml-2 px-3 py-2 bg-indigo-100 text-indigo-700 rounded hover:bg-indigo-200 text-xs font-semibold min-h-[36px]"
                  onClick={() => handleCopy(uploadedShortUrl || uploadedUrl || '')}
                  whileTap={{ scale: 0.95 }}
                >复制</motion.button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      {/* 本地存储管理分区 */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white rounded-xl p-4 sm:p-8 shadow-sm border border-blue-100"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-4 gap-3">
          <h3 className="text-lg sm:text-xl font-semibold text-blue-700 flex items-center gap-2">
            <svg className="w-5 h-5 sm:w-6 sm:h-6 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
            本地存储管理
          </h3>
          <div className="flex flex-wrap gap-2">
            <div className="relative">
              <button className="px-3 py-2 sm:px-4 sm:py-2 bg-gradient-to-r from-blue-500 to-cyan-600 text-white rounded-lg hover:from-blue-600 hover:to-cyan-700 transition-all duration-200 text-xs sm:text-sm font-medium shadow-md hover:shadow-lg min-h-[36px]" onClick={() => setShowExportMenu(v => !v)}>
                📤 导出数据
              </button>
              {showExportMenu && (
                <div className="absolute z-10 mt-2 w-32 sm:w-36 bg-white border border-gray-200 rounded shadow-lg">
                  <button className={`block w-full text-left px-3 py-2 sm:px-4 sm:py-2 hover:bg-blue-50 text-xs sm:text-sm ${exportType==='plain'?'font-bold text-blue-700':''}`} onClick={() => {setExportType('plain'); handleExport();}}>明文导出</button>
                  <button className={`block w-full text-left px-3 py-2 sm:px-4 sm:py-2 hover:bg-blue-50 text-xs sm:text-sm ${exportType==='base64'?'font-bold text-blue-700':''}`} onClick={() => {setExportType('base64'); handleExport();}}>Base64导出</button>
                  <button className={`block w-full text-left px-3 py-2 sm:px-4 sm:py-2 hover:bg-blue-50 text-xs sm:text-sm ${exportType==='aes256'?'font-bold text-blue-700':''}`} onClick={() => {setExportType('aes256'); handleExport();}}>AES-256加密导出</button>
                </div>
              )}
            </div>
            <label className="px-3 py-2 sm:px-4 sm:py-2 bg-gray-400 text-white rounded-lg shadow hover:bg-gray-500 transition cursor-pointer text-xs sm:text-sm font-medium min-h-[36px] flex items-center">
              📥 导入数据
              <input type="file" accept=".json" style={{ display: 'none' }} onChange={handleImport} />
            </label>
            <button className="px-3 py-2 sm:px-4 sm:py-2 bg-gradient-to-r from-red-500 to-pink-600 text-white rounded-lg hover:from-red-600 hover:to-pink-700 transition-all duration-200 text-xs sm:text-sm font-medium shadow-md hover:shadow-lg min-h-[36px] flex items-center" onClick={handleClear}>🗑️ 清空数据</button>
          </div>
        </div>
        <div className="bg-blue-50 rounded-lg p-3 sm:p-4 mb-4 text-center">
          <span className="text-xl sm:text-2xl font-bold text-blue-700">{storedImages.length}</span>
          <span className="ml-2 text-sm sm:text-base text-gray-600">已保存图片</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 sm:gap-6">
          {storedImages.length === 0 ? (
            <div className="col-span-full text-gray-400 text-center py-8 sm:py-10 text-sm sm:text-base">暂无上传的图片</div>
          ) : (
            storedImages.map((img, idx) => (
              <div key={img.cid} className="bg-white rounded-lg shadow p-3 flex flex-col border border-gray-100">
                <img src={img.web2url} alt={img.fileName} className="w-full h-32 sm:h-40 object-cover rounded mb-2 border" loading="lazy" />
                <div className="text-xs text-gray-500 break-all mb-1">CID: {img.cid}</div>
                <div className="text-xs sm:text-sm text-gray-800 mb-1 truncate">{img.fileName}</div>
                <div className="text-xs text-gray-400 mb-2">{formatFileSize(img.fileSize)} • {formatDate(img.uploadTime)}</div>
                <div className="flex flex-col sm:flex-row gap-1 mt-auto">
                  <button className="flex-1 px-2 py-2 rounded bg-green-100 text-green-700 text-xs font-semibold hover:bg-green-200 min-h-[36px]" onClick={() => handleCopy(fixIpfsDomain(img.web2url))}>复制链接</button>
                  {/* 预览按钮始终使用后端返回的 web2url，确保域名和路径与后端一致 */}
                  <a className="flex-1 px-2 py-2 rounded bg-blue-100 text-blue-700 text-xs font-semibold hover:bg-blue-200 text-center min-h-[36px] flex items-center justify-center" href={fixIpfsDomain(img.web2url)} target="_blank" rel="noopener noreferrer">预览</a>
                  <button className="flex-1 px-2 py-2 rounded bg-red-100 text-red-700 text-xs font-semibold hover:bg-red-200 min-h-[36px]" onClick={() => handleDelete(idx)}>删除</button>
                </div>
              </div>
            ))
          )}
        </div>
      </motion.div>
    </div>
  );
};

export default ImageUploadPage; 