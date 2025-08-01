import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence, HTMLMotionProps } from 'framer-motion';
import { useNotification } from './Notification';
import getApiBaseUrl, { getApiBaseUrl as namedGetApiBaseUrl } from '../api';
import { useAuth } from '../hooks/useAuth';
import CryptoJS from 'crypto-js';
import { 
  FaList, 
  FaPlus, 
  FaEdit, 
  FaTrash, 
  FaSave, 
  FaDownload,
  FaUpload,
  FaCopy,
  FaCheck,
  FaTimes,
  FaExclamationTriangle
} from 'react-icons/fa';

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

// Mod 类型扩展
interface Mod {
  id: string;
  name: string;
  hash?: string;
  md5?: string;
}

const fetchMods = async (withHash = false, withMd5 = false) => {
  try {
  let url = getApiBaseUrl() + '/api/modlist';
  const params = [];
  if (withHash) params.push('withHash=1');
  if (withMd5) params.push('withMd5=1');
  if (params.length) url += '?' + params.join('&');
    
    const token = localStorage.getItem('token');
    const res = await fetch(url, {
      headers: {
        'Content-Type': 'application/json',
        ...(token && { 'Authorization': `Bearer ${token}` }),
      },
    });
    
    if (!res.ok) {
      console.error('API请求失败:', res.status, res.statusText);
      return [];
    }
    
    const data = await res.json();
    
    // 检查是否为加密数据
    if (data.data && data.iv && typeof data.data === 'string' && typeof data.iv === 'string') {
      try {
        console.log('🔐 开始解密MOD列表数据...');
        console.log('   加密数据长度:', data.data.length);
        console.log('   IV:', data.iv);
        console.log('   使用Token进行解密，Token长度:', token?.length || 0);
        
        // 解密数据
        const decryptedJson = decryptAES256(data.data, data.iv, token || '');
        const decryptedData = JSON.parse(decryptedJson);
        
        if (decryptedData.mods && Array.isArray(decryptedData.mods)) {
          console.log('✅ 解密成功，获取到', decryptedData.mods.length, '个MOD');
          return decryptedData.mods as Mod[];
        } else {
          console.error('❌ 解密数据格式错误，期望包含mods数组');
          return [];
        }
      } catch (decryptError) {
        console.error('❌ 解密失败:', decryptError);
        return [];
      }
    } else {
      // 兼容未加密格式（普通用户或未登录用户）
      console.log('📝 使用未加密格式数据');
      if (data.mods && Array.isArray(data.mods)) {
        return data.mods as Mod[];
      } else {
        console.error('❌ 响应数据格式错误，期望包含mods数组');
        return [];
      }
    }
  } catch (error) {
    console.error('获取MOD列表失败:', error);
    return [];
  }
};

const fetchModsJson = async (withHash = false, withMd5 = false) => {
  try {
  let url = getApiBaseUrl() + '/api/modlist/json';
  const params = [];
  if (withHash) params.push('withHash=1');
  if (withMd5) params.push('withMd5=1');
  if (params.length) url += '?' + params.join('&');
    
    const token = localStorage.getItem('token');
    const res = await fetch(url, {
      headers: {
        'Content-Type': 'application/json',
        ...(token && { 'Authorization': `Bearer ${token}` }),
      },
    });
    
    if (!res.ok) {
      console.error('API请求失败:', res.status, res.statusText);
      return [];
    }
    
    const data = await res.json();
    
    // 检查是否为加密数据
    if (data.data && data.iv && typeof data.data === 'string' && typeof data.iv === 'string') {
      try {
        console.log('🔐 开始解密MOD JSON数据...');
        console.log('   加密数据长度:', data.data.length);
        console.log('   IV:', data.iv);
        console.log('   使用Token进行解密，Token长度:', token?.length || 0);
        
        // 解密数据
        const decryptedJson = decryptAES256(data.data, data.iv, token || '');
        const decryptedData = JSON.parse(decryptedJson);
        
        console.log('✅ 解密成功，获取到MOD JSON数据');
        return decryptedData;
      } catch (decryptError) {
        console.error('❌ 解密失败:', decryptError);
        return [];
      }
    } else {
      // 兼容未加密格式（普通用户或未登录用户）
      console.log('📝 使用未加密格式JSON数据');
      return data;
    }
  } catch (error) {
    console.error('获取MOD JSON数据失败:', error);
    return [];
  }
};

const addMod = async (name: string, code: string, hash?: string, md5?: string) => {
  const res = await fetch(getApiBaseUrl() + '/api/modlist', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, code, hash, md5 })
  });
  return await res.json();
};

const updateMod = async (id: string, name: string, code: string) => {
  const res = await fetch(getApiBaseUrl() + `/api/modlist/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, code })
  });
  return await res.json();
};

const deleteMod = async (id: string) => {
  const res = await fetch(getApiBaseUrl() + `/api/modlist/${id}`, { method: 'DELETE' });
  return await res.json();
};

const batchAddMods = async (mods: Mod[]) => {
  const res = await fetch(getApiBaseUrl() + '/api/modlist/batch-add', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(mods)
  });
  return await res.json();
};

const batchDeleteMods = async (ids: string[]) => {
  const res = await fetch(getApiBaseUrl() + '/api/modlist/batch-delete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(ids)
  });
  return await res.json();
};

// 批量添加示例JSON
const batchAddExample = `[
  { "name": "mod1", "hash": "abc123", "md5": "d41d8cd98f00b204e9800998ecf8427e" },
  { "name": "mod2", "hash": "def456" }
]
// id 可省略，系统自动生成
`;

const ModListEditor: React.FC = () => {
  const { user } = useAuth();
  const [mods, setMods] = useState<Mod[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [addName, setAddName] = useState('');
  const [addCode, setAddCode] = useState('');
  const [addHash, setAddHash] = useState('');
  const [addMd5, setAddMd5] = useState('');
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editCode, setEditCode] = useState('');
  const [jsonMode, setJsonMode] = useState(false);
  const [jsonValue, setJsonValue] = useState('');
  const [jsonEdit, setJsonEdit] = useState(false);
  const [showExample, setShowExample] = useState(false);
  const [showBatchCode, setShowBatchCode] = useState(false);
  const [batchCode, setBatchCode] = useState('');
  const [pendingBatchAction, setPendingBatchAction] = useState<'add' | 'delete' | null>(null);
  const [pendingBatchData, setPendingBatchData] = useState<any>(null);
  const { setNotification } = useNotification();
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleteCode, setDeleteCode] = useState('');

  const loadMods = async () => {
    try {
    if (jsonMode) {
      const data = await fetchModsJson();
      setJsonValue(JSON.stringify(data, null, 2));
    } else {
        const modsData = await fetchMods();
        setMods(Array.isArray(modsData) ? modsData : []);
      }
    } catch (error) {
      console.error('加载MOD列表失败:', error);
      setMods([]);
      setJsonValue('[]');
    }
  };

  useEffect(() => {
    loadMods();
    // eslint-disable-next-line
  }, [jsonMode]);

  const handleAdd = async () => {
    if (!addName || !addCode || !addHash) {
      setNotification({ message: '请填写MOD名、修改码和Hash', type: 'error' });
      return;
    }
    const res = await addMod(addName, addCode, addHash, addMd5 || undefined);
    if (res.success) {
      setNotification({ message: '添加成功', type: 'success' });
      setShowAdd(false);
      setAddName('');
      setAddCode('');
      setAddHash('');
      setAddMd5('');
      loadMods();
    } else {
      setNotification({ message: res.error || '添加失败', type: 'error' });
    }
  };

  const handleEdit = async () => {
    if (!editId || !editName || !editCode) {
      setNotification({ message: '请填写完整', type: 'error' });
      return;
    }
    const res = await updateMod(editId, editName, editCode);
    if (res.success) {
      setNotification({ message: '修改成功', type: 'success' });
      setEditId(null);
      setEditName('');
      setEditCode('');
      loadMods();
    } else {
      setNotification({ message: res.error || '修改失败', type: 'error' });
    }
  };

  const handleJsonSave = async () => {
    setNotification({ message: '请通过UI方式修改，JSON仅供查看。', type: 'info' });
  };

  // 批量添加保存按钮点击
  const handleBatchAddClick = () => {
    setPendingBatchAction('add');
    setPendingBatchData(jsonValue);
    setShowBatchCode(true);
  };

  // 批量添加真正提交
  const handleBatchAddSubmit = async () => {
    let mods: Mod[] = [];
    try {
      mods = JSON.parse(pendingBatchData);
      if (!Array.isArray(mods)) throw new Error('格式错误');
    } catch {
      setNotification({ message: 'JSON格式错误', type: 'error' });
      setShowBatchCode(false);
      return;
    }
    // 给每个mod加code
    const modsWithCode = mods.map(m => ({ ...m, code: batchCode }));
    const res = await batchAddMods(modsWithCode);
    if (res.success) {
      setNotification({ message: '批量添加成功', type: 'success' });
      setShowBatchCode(false);
      setBatchCode('');
      setJsonEdit(false);
      loadMods();
    } else {
      setNotification({ message: res.error || '批量添加失败', type: 'error' });
      setShowBatchCode(false);
      setBatchCode('');
    }
  };

  if (!user || user.role !== 'admin') {
    return (
      <motion.div 
        className="space-y-6"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
      >
        <motion.div 
          className="bg-gradient-to-r from-red-50 to-pink-50 rounded-xl p-6 border border-red-100"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
        >
          <h2 className="text-2xl font-bold text-red-700 mb-3 flex items-center gap-2">
            🔒
            访问被拒绝
          </h2>
          <div className="text-gray-600 space-y-2">
            <p>你不是管理员，禁止访问！请用管理员账号登录后再来。</p>
            <div className="text-sm text-red-500 italic">
              MOD列表管理仅限管理员使用
            </div>
          </div>
        </motion.div>
      </motion.div>
    );
  }

  return (
    <motion.div 
      className="space-y-6"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6 }}
    >
      {/* 标题和说明 */}
      <motion.div 
        className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl p-6 border border-blue-100"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
      >
        <h2 className="text-2xl font-bold text-blue-700 mb-3 flex items-center gap-2">
          🎮
          MOD列表管理
        </h2>
        <div className="text-gray-600 space-y-2">
          <p>管理系统MOD列表，支持添加、编辑、删除和批量操作。</p>
          <div className="flex items-start gap-2 text-sm">
            <div>
              <p className="font-semibold text-blue-700">功能说明：</p>
              <ul className="list-disc list-inside space-y-1 mt-1">
                <li>添加和编辑MOD信息</li>
                <li>支持Hash和MD5验证</li>
                <li>批量添加和删除操作</li>
                <li>JSON模式查看和编辑</li>
                <li>数据加密传输保护</li>
              </ul>
            </div>
          </div>
        </div>
      </motion.div>

      {/* 主要功能区域 */}
      <motion.div 
        className="bg-white rounded-xl p-6 shadow-sm border border-gray-200"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
            <FaList className="text-lg text-blue-500" />
            MOD列表
          </h3>
          <div className="flex items-center gap-3">
            <label className="flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={jsonMode}
                onChange={(e) => setJsonMode(e.target.checked)}
                className="mr-2 text-blue-500"
              />
              <span className="text-sm font-medium text-gray-700">JSON模式</span>
            </label>
          </div>
        </div>

        {!jsonMode ? (
          <div className="space-y-4">
            <div className="flex gap-3">
              <motion.button
                onClick={() => setShowAdd(true)}
                className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition font-medium flex items-center gap-2"
                whileTap={{ scale: 0.95 }}
              >
                <FaPlus className="w-4 h-4" />
                添加MOD
              </motion.button>
              <motion.button
                onClick={() => setShowExample(true)}
                className="px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition font-medium"
                whileTap={{ scale: 0.95 }}
              >
                批量添加示例
              </motion.button>
            </div>

            <div className="space-y-2">
              {(mods || []).map((mod, idx) => (
                <motion.div 
                  key={mod.id} 
                  className="flex items-center justify-between p-3 border-2 border-gray-200 rounded-lg bg-gray-50"
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.3, delay: idx * 0.05 }}
                  whileHover={{ backgroundColor: '#f0f9ff' }}
                >
                  <span className="font-medium text-gray-800">{mod.name}</span>
                  <div className="flex gap-2">
                    <motion.button
                      onClick={() => { setEditId(mod.id); setEditName(mod.name); setEditCode(''); }}
                      className="px-3 py-1 bg-yellow-500 text-white rounded text-sm hover:bg-yellow-600 transition font-medium"
                      whileTap={{ scale: 0.95 }}
                    >
                      修改
                    </motion.button>
                    <motion.button
                      onClick={() => {
                        setDeleteId(mod.id);
                        setDeleteCode('');
                      }}
                      className="px-3 py-1 bg-red-500 text-white rounded text-sm hover:bg-red-600 transition font-medium"
                      whileTap={{ scale: 0.95 }}
                    >
                      删除
                    </motion.button>
                  </div>
                </motion.div>
              ))}
              
              {mods.length === 0 && (
                <div className="text-center py-8 text-gray-500">
                  <FaList className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                  暂无MOD数据
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <textarea
              value={jsonValue}
              onChange={e => setJsonValue(e.target.value)}
              rows={12}
              readOnly={!jsonEdit}
              className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 transition-all font-mono text-sm"
              style={{ minHeight: '180px' }}
            />
            <div className="flex gap-3">
              <motion.button
                onClick={handleBatchAddClick}
                disabled={!jsonEdit}
                className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition font-medium disabled:opacity-50"
                whileTap={{ scale: 0.95 }}
              >
                保存
              </motion.button>
              <motion.button
                onClick={() => setJsonEdit(e => !e)}
                className={`px-4 py-2 rounded-lg transition font-medium ${
                  jsonEdit 
                    ? 'bg-gray-500 text-white hover:bg-gray-600' 
                    : 'bg-blue-500 text-white hover:bg-blue-600'
                }`}
                whileTap={{ scale: 0.95 }}
              >
                {jsonEdit ? '取消编辑' : '编辑JSON'}
              </motion.button>
            </div>
          </div>
        )}
      </motion.div>

      {/* 添加MOD弹窗 */}
      <AnimatePresence>
        {showAdd && (
          <motion.div
            className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-60 z-[99999]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.1 }}
            onClick={() => setShowAdd(false)}
          >
            <motion.div
              className="bg-white rounded-2xl shadow-[0_25px_50px_-12px_rgba(0,0,0,0.25)] p-8 w-full max-w-md mx-4 relative z-[100000] border border-gray-100"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.1 }}
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-xl font-bold text-gray-900 mb-6">添加MOD</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">MOD名</label>
                  <input
                    type="text"
                    placeholder="请输入MOD名"
                    value={addName}
                    onChange={e => setAddName(e.target.value)}
                    className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 transition-all"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">修改码</label>
                  <input
                    type="password"
                    placeholder="请输入修改码"
                    value={addCode}
                    onChange={e => setAddCode(e.target.value)}
                    className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 transition-all"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Hash (必填)</label>
                  <input
                    type="text"
                    placeholder="请输入Hash"
                    value={addHash}
                    onChange={e => setAddHash(e.target.value)}
                    className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 transition-all"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">MD5 (可选)</label>
                  <input
                    type="text"
                    placeholder="请输入MD5"
                    value={addMd5}
                    onChange={e => setAddMd5(e.target.value)}
                    className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 transition-all"
                  />
                </div>
              </div>
              <div className="flex gap-3 mt-6">
                <motion.button
                  onClick={() => setShowAdd(false)}
                  className="flex-1 px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition font-medium"
                  whileTap={{ scale: 0.95 }}
                >
                  取消
                </motion.button>
                <motion.button
                  onClick={handleAdd}
                  className="flex-1 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition font-medium"
                  whileTap={{ scale: 0.95 }}
                >
                  确定
                </motion.button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 修改MOD弹窗 */}
      <AnimatePresence>
        {editId && (
          <motion.div
            className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-60 z-[99999]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.1 }}
            onClick={() => setEditId(null)}
          >
            <motion.div
              className="bg-white rounded-2xl shadow-[0_25px_50px_-12px_rgba(0,0,0,0.25)] p-8 w-full max-w-md mx-4 relative z-[100000] border border-gray-100"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.1 }}
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-xl font-bold text-gray-900 mb-6">修改MOD名</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">新MOD名</label>
                  <input
                    type="text"
                    placeholder="请输入新MOD名"
                    value={editName}
                    onChange={e => setEditName(e.target.value)}
                    className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 transition-all"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">修改码</label>
                  <input
                    type="password"
                    placeholder="请输入修改码"
                    value={editCode}
                    onChange={e => setEditCode(e.target.value)}
                    className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 transition-all"
                  />
                </div>
              </div>
              <div className="flex gap-3 mt-6">
                <motion.button
                  onClick={() => setEditId(null)}
                  className="flex-1 px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition font-medium"
                  whileTap={{ scale: 0.95 }}
                >
                  取消
                </motion.button>
                <motion.button
                  onClick={handleEdit}
                  className="flex-1 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition font-medium"
                  whileTap={{ scale: 0.95 }}
                >
                  确定
                </motion.button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 批量添加示例弹窗 */}
      <AnimatePresence>
        {showExample && (
          <motion.div
            className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-60 z-[99999]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.1 }}
            onClick={() => setShowExample(false)}
          >
            <motion.div
              className="bg-white rounded-2xl shadow-[0_25px_50px_-12px_rgba(0,0,0,0.25)] p-8 w-full max-w-2xl mx-4 relative z-[100000] border border-gray-100"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.1 }}
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-xl font-bold text-gray-900 mb-6">批量添加示例</h3>
              <div className="space-y-4">
                <div className="font-medium text-gray-700">JSON格式：</div>
                <pre className="bg-gray-50 p-4 rounded-lg border border-gray-200 text-sm font-mono overflow-x-auto">
                  {batchAddExample}
                </pre>
                <div className="text-sm text-gray-600">
                  说明：<span className="text-blue-500">id 可省略，系统自动生成。</span>
                </div>
              </div>
              <div className="mt-6 text-right">
                <motion.button
                  onClick={() => setShowExample(false)}
                  className="px-6 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition font-medium"
                  whileTap={{ scale: 0.95 }}
                >
                  确定
                </motion.button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 批量操作修改码弹窗 */}
      <AnimatePresence>
        {showBatchCode && (
          <motion.div
            className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-60 z-[99999]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.1 }}
            onClick={() => setShowBatchCode(false)}
          >
            <motion.div
              className="bg-white rounded-2xl shadow-[0_25px_50px_-12px_rgba(0,0,0,0.25)] p-8 w-full max-w-md mx-4 relative z-[100000] border border-gray-100"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.1 }}
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-xl font-bold text-gray-900 mb-6">请输入修改码</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">修改码</label>
                  <input
                    type="password"
                    placeholder="请输入修改码"
                    value={batchCode}
                    onChange={e => setBatchCode(e.target.value)}
                    className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 transition-all"
                  />
                </div>
              </div>
              <div className="flex gap-3 mt-6">
                <motion.button
                  onClick={() => setShowBatchCode(false)}
                  className="flex-1 px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition font-medium"
                  whileTap={{ scale: 0.95 }}
                >
                  取消
                </motion.button>
                <motion.button
                  onClick={handleBatchAddSubmit}
                  className="flex-1 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition font-medium"
                  whileTap={{ scale: 0.95 }}
                >
                  确定
                </motion.button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 删除MOD弹窗 */}
      <AnimatePresence>
        {deleteId && (
          <motion.div
            className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-60 z-[99999]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.1 }}
            onClick={() => setDeleteId(null)}
          >
            <motion.div
              className="bg-white rounded-2xl shadow-[0_25px_50px_-12px_rgba(0,0,0,0.25)] p-8 w-full max-w-md mx-4 relative z-[100000] border border-gray-100"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.1 }}
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-xl font-bold text-gray-900 mb-6">删除MOD</h3>
              <div className="space-y-4">
                <p className="text-gray-600">请输入该MOD的修改码以确认删除：</p>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">修改码</label>
                  <input
                    type="password"
                    placeholder="请输入修改码"
                    value={deleteCode}
                    onChange={e => setDeleteCode(e.target.value)}
                    className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 transition-all"
                  />
                </div>
              </div>
              <div className="flex gap-3 mt-6">
                <motion.button
                  onClick={() => setDeleteId(null)}
                  className="flex-1 px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition font-medium"
                  whileTap={{ scale: 0.95 }}
                >
                  取消
                </motion.button>
                <motion.button
                  onClick={async () => {
                    if (!deleteCode) {
                      setNotification({ message: '请输入修改码', type: 'error' });
                      return;
                    }
                    // 调用后端删除接口，带上修改码
                    const res = await fetch(getApiBaseUrl() + `/api/modlist/${deleteId}`, {
                      method: 'DELETE',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ code: deleteCode })
                    }).then(r => r.json());
                    if (res.success) {
                      setNotification({ message: '删除成功', type: 'success' });
                      setDeleteId(null);
                      setDeleteCode('');
                      loadMods();
                    } else {
                      setNotification({ message: res.error || '删除失败', type: 'error' });
                    }
                  }}
                  className="flex-1 px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition font-medium"
                  whileTap={{ scale: 0.95 }}
                >
                  确定删除
                </motion.button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

export default ModListEditor; 