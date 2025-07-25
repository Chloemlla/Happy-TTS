import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNotification } from './Notification';
import { getApiBaseUrl } from '../api/api';
import { escapeHtml } from '../utils/escapeHtml';

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

const ImageUploadPage: React.FC = () => {
  const { setNotification } = useNotification();
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadedUrl, setUploadedUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploadedShortUrl, setUploadedShortUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
    if (fileInputRef.current) fileInputRef.current.value = '';
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
        console.log('[图片上传] 上传成功，web2url:', result.data.web2url);
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

  // 复制短链到剪贴板
  const handleCopy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setNotification({ message: '已复制到剪贴板', type: 'success' });
    } catch {
      setNotification({ message: '复制失败', type: 'error' });
    }
  };

  return (
    <motion.div
      className="max-w-lg mx-auto bg-white rounded-3xl shadow-2xl p-10 mt-12 border border-blue-100"
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: 'easeOut' }}
    >
      <motion.h2
        className="text-3xl font-extrabold mb-2 text-blue-700 flex items-center gap-2"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.1 }}
      >
        <motion.i
          className="fas fa-image text-blue-500 text-2xl"
          initial={{ scale: 0, rotate: -180 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ duration: 0.6, delay: 0.2, type: 'spring', stiffness: 200 }}
          whileHover={{ scale: 1.1, rotate: 5 }}
        />
        图片上传
      </motion.h2>
      <motion.p
        className="text-gray-500 mb-8"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.3 }}
      >
        支持 JPEG, PNG, GIF, WebP, BMP, SVG 格式，最大5MB。上传后将返回可直接访问的图片链接。
      </motion.p>
      <motion.div
        className="mb-8 p-6 rounded-2xl bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-100 shadow-lg"
        initial={{ opacity: 0, x: -30 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.6, delay: 0.4 }}
        whileHover={{ scale: 1.01, y: -2, boxShadow: '0 8px 32px 0 rgba(99,102,241,0.10)' }}
      >
        <input
          type="file"
          accept="image/*"
          ref={fileInputRef}
          className="mb-4 block w-full text-sm text-gray-700 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 transition"
          onChange={handleFileChange}
          disabled={uploading}
        />
        {file && previewUrl && (
          <motion.div
            className="mb-4 flex flex-col items-center border-2 border-dashed border-blue-200 rounded-2xl bg-white/80 shadow-md p-4"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            whileHover={{ scale: 1.03, boxShadow: '0 8px 32px 0 rgba(99,102,241,0.12)' }}
          >
            <img src={previewUrl} alt="预览" className="w-48 h-48 object-contain rounded-xl border border-gray-200 shadow" />
            <div className="text-sm text-gray-600 mt-2">{file.name} ({(file.size / 1024).toFixed(1)} KB)</div>
            <motion.button
              className="mt-2 px-4 py-2 border border-gray-300 rounded-lg bg-white text-gray-700 hover:bg-gray-100 transition disabled:opacity-50 font-semibold"
              onClick={handleRemove}
              disabled={uploading}
              whileTap={{ scale: 0.97 }}
            >移除</motion.button>
          </motion.div>
        )}
        <motion.button
          className="w-full mt-2 px-4 py-2 rounded-lg bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-bold shadow hover:from-blue-700 hover:to-indigo-700 transition disabled:opacity-50 text-lg tracking-wide"
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
            className="mt-6 p-6 bg-green-50 border border-green-200 rounded-2xl text-green-700 text-center shadow-lg"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            transition={{ duration: 0.4, type: 'spring', stiffness: 100 }}
          >
            <div className="mb-2 text-lg font-bold flex items-center justify-center gap-2">
              <span>上传成功</span>
              <motion.svg className="w-6 h-6 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 300, delay: 0.2 }}>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </motion.svg>
            </div>
            <div className="mb-2 text-gray-700 text-sm">图片链接：</div>
            <div className="flex items-center justify-center gap-2">
              <a
                href={uploadedShortUrl || uploadedUrl}
                className="underline break-all text-blue-700 hover:text-blue-900"
                target="_blank"
                rel="noopener noreferrer"
              >{uploadedShortUrl || uploadedUrl}</a>
              <motion.button
                className="ml-2 px-2 py-1 bg-indigo-100 text-indigo-700 rounded hover:bg-indigo-200 text-xs font-semibold"
                onClick={() => handleCopy(uploadedShortUrl || uploadedUrl || '')}
                whileTap={{ scale: 0.95 }}
              >复制</motion.button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

export default ImageUploadPage; 