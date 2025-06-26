import React, { useState, useRef } from 'react';
import axios from 'axios';

const isTextExt = (ext: string) => ['.txt', '.log', '.json', '.md'].includes(ext);

const LogShare: React.FC = () => {
  const [adminPassword, setAdminPassword] = useState('');
  const [logContent, setLogContent] = useState('');
  const [uploadResult, setUploadResult] = useState<{ link: string, ext: string } | null>(null);
  const [queryId, setQueryId] = useState('');
  const [queryResult, setQueryResult] = useState<{ content: string, ext: string, encoding?: string } | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 上传日志/文件
  const handleUpload = async () => {
    setError('');
    setSuccess('');
    setUploadResult(null);
    setLoading(true);
    try {
      let res;
      if (file) {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('adminPassword', adminPassword);
        res = await axios.post('/api/sharelog', formData, {
          headers: { 'Content-Type': 'multipart/form-data' }
        });
      } else {
        // 兼容纯文本上传
        const blob = new Blob([logContent], { type: 'text/plain' });
        const formData = new FormData();
        formData.append('file', blob, 'log.txt');
        formData.append('adminPassword', adminPassword);
        res = await axios.post('/api/sharelog', formData, {
          headers: { 'Content-Type': 'multipart/form-data' }
        });
      }
      if (res.data.link) {
        setUploadResult({ link: res.data.link, ext: res.data.ext });
        setSuccess('上传成功！');
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
      const res = await axios.get(`/api/sharelog/${queryId}`, {
        params: { adminPassword }
      });
      setQueryResult(res.data);
      setSuccess('查询成功！');
    } catch (e: any) {
      setError(e.response?.data?.error || '查询失败');
    } finally {
      setLoading(false);
    }
  };

  // 下载文件
  const handleDownload = () => {
    if (!queryResult) return;
    const { content, ext, encoding } = queryResult;
    let blob;
    if (encoding === 'base64') {
      const byteString = atob(content);
      const ab = new ArrayBuffer(byteString.length);
      const ia = new Uint8Array(ab);
      for (let i = 0; i < byteString.length; i++) {
        ia[i] = byteString.charCodeAt(i);
      }
      blob = new Blob([ab]);
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

  return (
    <div className="max-w-2xl mx-auto bg-white rounded-3xl shadow-2xl p-10 mt-12 border border-blue-100">
      <h2 className="text-3xl font-extrabold mb-2 text-blue-700 flex items-center gap-2">
        <i className="fas fa-clipboard-list text-blue-500 text-2xl" /> 日志/文件剪贴板上传 & 查询
      </h2>
      <p className="text-gray-500 mb-8">支持文本、日志、json、压缩包等类型，单文件最大25KB。仅管理员可操作。</p>
      {/* 上传区块 */}
      <div className="mb-10 p-6 rounded-xl bg-blue-50/60 border border-blue-100 shadow-sm">
        <div className="mb-4 text-lg font-semibold text-blue-800 flex items-center gap-2">
          <i className="fas fa-upload" /> 上传日志/文件
        </div>
        <label className="block mb-2 font-semibold">管理员密码</label>
        <input type="password" className="w-full border-2 border-blue-200 rounded px-3 py-2 mb-4 focus:outline-none focus:ring-2 focus:ring-blue-400 transition" value={adminPassword} onChange={e => setAdminPassword(e.target.value)} autoComplete="off" />
        <label className="block mb-2 font-semibold">日志内容（粘贴或输入）或选择文件</label>
        <textarea className="w-full border-2 border-blue-200 rounded px-3 py-2 mb-2 focus:outline-none focus:ring-2 focus:ring-blue-400 transition" rows={6} value={logContent} onChange={e => setLogContent(e.target.value)} disabled={!!file} placeholder="可直接粘贴日志内容，或选择文件上传" />
        <input type="file" ref={fileInputRef} className="mb-2" onChange={e => setFile(e.target.files?.[0] || null)} />
        <div className="text-xs text-gray-400 mb-2">支持 .txt .log .json .md .zip .tar.gz 等，最大25KB</div>
        {file && <div className="text-sm text-gray-600 mb-2">已选择文件: {file.name} <button className="ml-2 text-red-500 hover:underline" onClick={() => { setFile(null); if (fileInputRef.current) fileInputRef.current.value = ''; }}>移除</button></div>}
        <button className={`mt-2 bg-gradient-to-r from-blue-500 to-blue-400 text-white px-6 py-2 rounded-lg shadow hover:from-blue-600 hover:to-blue-500 transition-all font-bold flex items-center gap-2 ${loading ? 'opacity-60 cursor-not-allowed' : ''}`} onClick={handleUpload} disabled={loading || !adminPassword || (!logContent && !file)}>
          {loading ? <span className="animate-spin mr-2"><i className="fas fa-spinner" /></span> : <i className="fas fa-cloud-upload-alt" />} 上传日志/文件
        </button>
        {uploadResult && <div className="mt-3 text-green-600 font-semibold">上传成功，访问链接：<a href={uploadResult.link} className="underline" target="_blank" rel="noopener noreferrer">{uploadResult.link}</a> <span className="text-gray-500">({uploadResult.ext})</span></div>}
      </div>
      {/* 查询区块 */}
      <div className="mb-6 p-6 rounded-xl bg-green-50/60 border border-green-100 shadow-sm">
        <div className="mb-4 text-lg font-semibold text-green-800 flex items-center gap-2">
          <i className="fas fa-search" /> 查询日志/文件内容
        </div>
        <label className="block mb-2 font-semibold">日志/文件ID</label>
        <input className="w-full border-2 border-green-200 rounded px-3 py-2 mb-4 focus:outline-none focus:ring-2 focus:ring-green-400 transition" value={queryId} onChange={e => setQueryId(e.target.value)} placeholder="请输入上传后返回的ID" />
        <label className="block mb-2 font-semibold">管理员密码</label>
        <input type="password" className="w-full border-2 border-green-200 rounded px-3 py-2 mb-4 focus:outline-none focus:ring-2 focus:ring-green-400 transition" value={adminPassword} onChange={e => setAdminPassword(e.target.value)} autoComplete="off" />
        <button className={`bg-gradient-to-r from-green-500 to-green-400 text-white px-6 py-2 rounded-lg shadow hover:from-green-600 hover:to-green-500 transition-all font-bold flex items-center gap-2 ${loading ? 'opacity-60 cursor-not-allowed' : ''}`} onClick={handleQuery} disabled={loading || !adminPassword || !queryId}>
          {loading ? <span className="animate-spin mr-2"><i className="fas fa-spinner" /></span> : <i className="fas fa-search" />} 查询日志/文件
        </button>
        {queryResult && (
          <div className="mt-4">
            <div className="mb-2 text-gray-600">类型: {queryResult.ext} {queryResult.encoding && <span>({queryResult.encoding})</span>}</div>
            {isTextExt(queryResult.ext) ? (
              <pre className="bg-gray-100 p-2 rounded text-sm whitespace-pre-wrap max-h-64 overflow-auto border border-gray-200">{queryResult.content}</pre>
            ) : (
              <>
                <div className="mb-2 text-yellow-700">二进制/非文本文件，点击下载：</div>
                <button className="bg-yellow-600 text-white px-4 py-2 rounded hover:bg-yellow-700" onClick={handleDownload}><i className="fas fa-download mr-2" />下载文件</button>
              </>
            )}
          </div>
        )}
      </div>
      {/* 全局提示 */}
      {error && <div className="text-red-600 font-bold text-center mb-2 animate-pulse"><i className="fas fa-exclamation-circle mr-2" />{error}</div>}
      {success && <div className="text-green-600 font-bold text-center mb-2 animate-fade-in"><i className="fas fa-check-circle mr-2" />{success}</div>}
    </div>
  );
};

export default LogShare;
