import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNotification } from './Notification';
import { Button } from './ui/Button';
import { Card } from './ui/Card';
import { getApiBaseUrl } from '../api/api';

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
        setNotification({ message: '上传成功', type: 'success' });
        console.log('[图片上传] 上传成功，web2url:', result.data.web2url);
      } else if (result?.error) {
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
        className="mb-8 p-6 rounded-xl bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-100 shadow-sm"
        initial={{ opacity: 0, x: -30 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.6, delay: 0.4 }}
        whileHover={{ scale: 1.01, y: -2 }}
      >
        <input
          type="file"
          accept="image/*"
          ref={fileInputRef}
          className="mb-4"
          onChange={handleFileChange}
          disabled={uploading}
        />
        {file && previewUrl && (
          <div className="mb-4 flex flex-col items-center">
            <img src={previewUrl} alt="预览" className="w-48 h-48 object-contain rounded-xl border border-gray-200 shadow" />
            <div className="text-sm text-gray-600 mt-2">{String(file.name)} ({(file.size / 1024).toFixed(1)} KB)</div>
            <Button className="mt-2" variant="outline" onClick={handleRemove} disabled={uploading}>移除</Button>
          </div>
        )}
        <Button
          className="w-full mt-2"
          onClick={handleUpload}
          disabled={!file || uploading}
        >
          {uploading ? '上传中...' : '上传图片'}
        </Button>
        {error && <div className="mt-2 text-red-500 text-sm">{error}</div>}
      </motion.div>
      <AnimatePresence>
        {uploadedUrl && (
          <motion.div
            className="mt-6 p-4 bg-green-50 border border-green-200 rounded-xl text-green-700 text-center"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            transition={{ duration: 0.4, type: 'spring', stiffness: 100 }}
          >
            上传成功，图片链接：<a href={uploadedUrl} className="underline break-all" target="_blank" rel="noopener noreferrer">{uploadedUrl}</a>
            <div className="mt-4 flex justify-center">
              <img src={uploadedUrl} alt="已上传图片" className="max-w-xs max-h-64 rounded shadow border border-gray-200" />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

export default ImageUploadPage; 